import { expect, test } from "@playwright/test";

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
  await b.getByRole("button", { name: "Start workout" }).click();
  await expect(b).toHaveURL(/\/workout$/);
  await expect(b.getByRole("button", { name: "Finish" })).toBeVisible();
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
  await expect(page.locator("article h2")).toHaveCount(2);
  const before = await names();
  expect(before).toHaveLength(2);
  await expect(page.getByRole("list", { name: "Sets" })).toHaveCount(2);

  await page.getByRole("button", { name: `Exercise options for ${before[1]}` }).click();
  await page.getByRole("button", { name: "Move up" }).click();
  await expect.poll(names).toEqual([before[1], before[0]]);

  await page.reload();
  await expect.poll(names).toEqual([before[1], before[0]]);

  await page.getByRole("button", { name: `Exercise options for ${before[1]}` }).click();
  await page.getByRole("button", { name: "Remove exercise" }).click();
  await expect.poll(names).toEqual([before[0]]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(names).toEqual([before[1], before[0]]);
  await expect(page.getByRole("list", { name: "Sets" })).toHaveCount(2);

  await page.reload();
  await expect.poll(names).toEqual([before[1], before[0]]);
});
