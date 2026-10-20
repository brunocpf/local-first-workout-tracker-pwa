import { expect, test } from "@playwright/test";

test("history shows an empty state with a Start workout action", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByText("No workouts yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start workout" })).toBeVisible();
});

test("unknown session id shows a not-found state", async ({ page }) => {
  await page.goto("/history/does-not-exist");
  await expect(page.getByText("Session not found")).toBeVisible();
});

test("editing an unknown session shows a not-found state", async ({ page }) => {
  await page.goto("/history/does-not-exist/edit");
  await expect(page.getByText("Session not found")).toBeVisible();
});

/** Logs and finishes a one-set workout through the UI; returns the stored session id. */
async function completedWorkout(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill("barbell bench press");
  await picker.getByRole("button", { name: /Barbell Bench Press/ }).first().click();
  await picker.getByRole("button", { name: "Add 1 exercise" }).click();
  await expect(picker).toBeHidden();
  await page.getByLabel("Set 1 weight, kg").fill("50");
  await page.getByLabel("Set 1 reps").fill("10");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("dialog", { name: "Workout complete" }).getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/history$/);
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("sessions").objectStore("sessions").getAll();
          req.onsuccess = () => resolve(req.result[0].id);
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

/** Client-side navigation from the History list (a full load of a nested URL isn't what's under test here). */
async function openDetail(page: import("@playwright/test").Page, id: string) {
  await page.locator(`a[href$="/history/${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/history/${id}$`));
}

test("edit → save lands on the detail page without a discard prompt", async ({ page }) => {
  const id = await completedWorkout(page);
  await openDetail(page, id);
  await page.getByRole("link", { name: "Edit session" }).click();
  await expect(page).toHaveURL(new RegExp(`/history/${id}/edit$`));
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Edited workout");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog", { name: "Save changes?" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/history/${id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Edited workout" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Discard changes?" })).toHaveCount(0);
});

test("edit → Cancel asks once, and Discard leaves the session unchanged", async ({ page }) => {
  const id = await completedWorkout(page);
  await openDetail(page, id);
  await page.getByRole("link", { name: "Edit session" }).click();
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  const original = await name.inputValue();
  await name.fill("Never saved");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const discard = page.getByRole("dialog", { name: "Discard changes?" });
  await expect(discard).toHaveCount(1);
  await discard.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/history/${id}$`));
  await expect(page.getByRole("heading", { level: 1, name: original })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Discard changes?" })).toHaveCount(0);
});

/** Fills and submits the "Log past workout" dialog; `start` is a datetime-local value. */
async function logPast(page: import("@playwright/test").Page, start: string, minutes: string) {
  await page.getByRole("button", { name: "Log past workout" }).click();
  const dialog = page.getByRole("dialog", { name: "Log past workout" });
  await dialog.getByLabel("Time zone").selectOption("Europe/London");
  await dialog.getByLabel("Start").fill(start);
  await dialog.getByLabel("Duration").fill(minutes);
  await dialog.getByRole("button", { name: "Create workout" }).click();
}

test("log past workout → edit screen → add a set → saved at the chosen date in History", async ({ page }) => {
  await page.goto("/history");
  await logPast(page, "2026-01-04T08:00", "45");
  await expect(page).toHaveURL(/\/history\/[^/]+\/edit\?new=1$/);
  await page.getByRole("button", { name: "Add exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill("barbell bench press");
  await picker.getByRole("button", { name: /Barbell Bench Press/ }).first().click();
  await picker.getByRole("button", { name: "Add 1 exercise" }).click();
  await expect(picker).toBeHidden();
  await page.getByLabel("Set 1 weight, kg").fill("60");
  await page.getByLabel("Set 1 reps").fill("8");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog", { name: "Save changes?" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/history\/[^/]+$/);
  await page.goto("/history");
  await expect(page.getByText("Week of Dec 29")).toBeVisible();
  await expect(page.getByRole("link", { name: /Sun, Jan 4/ })).toBeVisible();
  await expect(page.getByText("No workouts yet")).toHaveCount(0);
});

test("cancelling a just-created workout with no sets offers to delete it", async ({ page }) => {
  await page.goto("/history");
  await logPast(page, "2026-01-04T08:00", "30");
  await expect(page).toHaveURL(/\/edit\?new=1$/);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const ask = page.getByRole("dialog", { name: "Delete this workout?" });
  await ask.getByRole("button", { name: "Delete workout" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("No workouts yet")).toBeVisible();
});

test("keeping a just-created workout on cancel opens its detail page", async ({ page }) => {
  await page.goto("/history");
  await logPast(page, "2026-01-04T08:00", "30");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog", { name: "Delete this workout?" }).getByRole("button", { name: "Keep workout" }).click();
  await expect(page).toHaveURL(/\/history\/[^/]+$/);
});
