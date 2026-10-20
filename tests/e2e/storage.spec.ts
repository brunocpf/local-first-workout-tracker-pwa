import { expect, test } from "@playwright/test";

const nav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Primary" });

test("missing IndexedDB shows only the storage-unavailable screen, quickly", async ({ page }) => {
  // Some private modes / privacy settings remove IndexedDB entirely.
  await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { configurable: true, get: () => undefined }));
  await page.goto("/");
  await expect(page.getByText("Storage unavailable")).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/Private or incognito/)).toBeVisible();
  // The app isn't rendered behind it: no nav to tab into or read.
  await expect(nav(page)).toHaveCount(0);
  // Reload is the only focusable element (WebKit doesn't Tab to buttons by default, so count instead of tabbing).
  await expect(page.locator("a[href], button, input, select, textarea, [tabindex]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
});

test("an upgrade blocked by an old tab shows the app with a waiting banner, then recovers", async ({ page }) => {
  // An old tab holding a lower schema version that never closes on versionchange.
  await page.addInitScript(() => {
    const req = indexedDB.open("workout-tracker", 1);
    req.onsuccess = () => ((window as unknown as { oldDb: IDBDatabase }).oldDb = req.result);
  });
  await page.goto("/");
  await expect(page.getByText("Waiting for other tabs")).toBeVisible({ timeout: 3000 });
  await expect(nav(page).getByRole("link", { name: "Home" })).toBeVisible();

  await page.evaluate(() => (window as unknown as { oldDb: IDBDatabase }).oldDb.close());
  await expect(page.getByText("Waiting for other tabs")).toHaveCount(0);
  await expect(page.getByText("Storage unavailable")).toHaveCount(0);
});
