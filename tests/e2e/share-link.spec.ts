import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";

const link = (json: string) => `/routines/import#p=${deflateRawSync(Buffer.from(json)).toString("base64url")}`;
const plan = JSON.stringify({
  schemaVersion: 1,
  program: { name: "Linked Plan", routines: [{ id: "a", name: "Day A", exercises: [{ exercise: { name: "Barbell Bench Press" }, sets: 3, repRange: [6, 10] }] }] },
});

test("a shared link opens the import preview and saves nothing until confirmed", async ({ page }) => {
  await page.goto(link(plan));
  await expect(page.getByText("3 × 6–10")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm import" })).toBeEnabled();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page).toHaveURL(/\/routines$/);
  await expect(page.getByText("Linked Plan")).toBeVisible();
});

test("a damaged link shows an error and no preview", async ({ page }) => {
  await page.goto("/routines/import#p=not-a-real-payload");
  await expect(page.getByRole("alert")).toContainText("This link is damaged or incomplete.");
  await expect(page.getByRole("button", { name: "Confirm import" })).toHaveCount(0);
});

test("a link with an invalid plan lists the problems", async ({ page }) => {
  await page.goto(link('{"schemaVersion": 1, "program": {}}'));
  await expect(page.getByRole("alert")).toContainText("program.");
  await expect(page.getByRole("button", { name: "Confirm import" })).toHaveCount(0);
});

test("sharing a routine produces a link that imports back", async ({ page, browser }) => {
  await page.goto(link(plan));
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page).toHaveURL(/\/routines$/);
  await page.getByRole("link", { name: /Day A/ }).first().click();
  await page.evaluate(() => {
    (window as unknown as { shared: string }).shared = "";
    navigator.share = async (data) => {
      (window as unknown as { shared: string }).shared = data?.url ?? "";
    };
  });
  await page.getByRole("button", { name: "Share program link" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared: string }).shared)).toContain("/routines/import#p=");
  const url = await page.evaluate(() => (window as unknown as { shared: string }).shared);
  // The recipient is another device: a fresh context has no data and no service worker yet.
  const recipient = await browser.newContext();
  const other = await recipient.newPage();
  await other.goto(url);
  await expect(other.getByText("3 × 6–10")).toBeVisible();
  await expect(other.getByRole("button", { name: "Confirm import" })).toBeEnabled();
  await recipient.close();
});
