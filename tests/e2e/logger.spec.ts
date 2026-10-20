import { expect, test, type Page } from "@playwright/test";

type StoredSession = { status: string; exercises: { exerciseNameSnapshot: string }[] };

/** Reads the sessions straight from IndexedDB, i.e. what survives a reload (the UI updates before the write lands). */
const storedSessions = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<StoredSession[]>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("sessions").objectStore("sessions").getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
  );

test("start → reload → resume → discard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByText("Workout in progress")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume workout" })).toBeVisible();

  await page.getByRole("button", { name: "Resume workout" }).click();
  await expect(page).toHaveURL(/\/workout$/);

  await page.getByRole("button", { name: "Workout options" }).click();
  await page.getByRole("button", { name: "Discard workout…" }).click();
  await page.getByRole("button", { name: "Discard workout", exact: true }).click();
  await expect(page).not.toHaveURL(/\/workout/);
  await expect(page.getByText("Workout discarded")).toBeVisible();
  await expect(page.getByText("Workout in progress")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
});

test("a second tab adopts the active session instead of creating another", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/");
  await b.goto("/");
  await a.getByRole("button", { name: "Start workout" }).click();
  await expect(a).toHaveURL(/\/workout$/);
  // Tab b either still shows "Start workout" (its start loses to a's and must adopt) or already saw a's
  // session on load and shows "Resume workout"; which one depends on timing, and both must end up on a's session.
  await b.getByRole("button", { name: /^(Start|Resume) workout$/ }).click();
  await expect(b).toHaveURL(/\/workout$/);
  await expect(b.getByRole("button", { name: "Finish" })).toBeVisible();
  expect((await storedSessions(b)).filter((x) => x.status === "active")).toHaveLength(1);
});

test("add, reorder, remove + undo exercises; all survive reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByText("No exercises yet")).toBeVisible();

  await page.getByRole("button", { name: "Add exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill("barbell bench press");
  await picker.getByRole("button", { name: /Barbell Bench Press/ }).first().click();
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill("back squat");
  await picker.getByRole("button", { name: /Back Squat/ }).first().click();
  await picker.getByRole("button", { name: "Add 2 exercises" }).click();

  const names = () => page.locator("article h2").allTextContents();
  // Wait for the write-through before reloading; the UI is optimistic and reload doesn't flush.
  const stored = async () => (await storedSessions(page)).find((x) => x.status === "active")?.exercises.map((e) => e.exerciseNameSnapshot);
  await expect(page.locator("article h2")).toHaveCount(2);
  const before = await names();
  expect(before).toHaveLength(2);
  await expect(page.getByRole("list", { name: "Sets" })).toHaveCount(2);

  await page.getByRole("button", { name: `Exercise options for ${before[1]}` }).click();
  await page.getByRole("button", { name: "Move up" }).click();
  await expect.poll(names).toEqual([before[1], before[0]]);
  await expect.poll(stored).toEqual([before[1], before[0]]);

  await page.reload();
  await expect.poll(names).toEqual([before[1], before[0]]);

  await page.getByRole("button", { name: `Exercise options for ${before[1]}` }).click();
  await page.getByRole("button", { name: "Remove exercise" }).click();
  await expect.poll(names).toEqual([before[0]]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(names).toEqual([before[1], before[0]]);
  await expect(page.getByRole("list", { name: "Sets" })).toHaveCount(2);
  await expect.poll(stored).toEqual([before[1], before[0]]);

  await page.reload();
  await expect.poll(names).toEqual([before[1], before[0]]);
});
