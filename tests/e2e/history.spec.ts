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
