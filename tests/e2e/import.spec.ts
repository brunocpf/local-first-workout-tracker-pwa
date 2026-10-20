import { expect, test } from "@playwright/test";

test("malformed JSON shows an error", async ({ page }) => {
  await page.goto("/routines/import");
  await page.getByLabel("Plan JSON").fill("{ not json");
  await page.getByRole("button", { name: "Check plan" }).click();
  await expect(page.getByRole("alert")).toContainText("Malformed JSON");
});

test("unsupported version shows an error", async ({ page }) => {
  await page.goto("/routines/import");
  await page.getByLabel("Plan JSON").fill('{"schemaVersion": 2}');
  await page.getByRole("button", { name: "Check plan" }).click();
  await expect(page.getByRole("alert")).toContainText("Unsupported schemaVersion: 2");
});

test("oversize file is rejected before reading", async ({ page }) => {
  await page.goto("/routines/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "big.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1_000_001, "a"),
  });
  await expect(page.getByRole("alert")).toContainText("Input too large");
});

test("invalid schema lists paths", async ({ page }) => {
  await page.goto("/routines/import");
  await page.getByLabel("Plan JSON").fill('{"schemaVersion": 1, "program": {}}');
  await page.getByRole("button", { name: "Check plan" }).click();
  await expect(page.getByRole("alert")).toContainText("program.");
});
