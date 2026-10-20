import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page) => page.getByRole("navigation", { name: "Primary" });

test("app loads and tab navigation works", async ({ page }) => {
  await page.goto("/");
  await expect(nav(page).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

  await nav(page).getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "History" })).toHaveAttribute("aria-current", "page");
});

test("loads without console errors or CSP violations", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto("/");
  await nav(page).getByRole("link", { name: "Progress" }).click();
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("deep link reload renders the route", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
});

test("shell renders offline after first load", async ({ page, context }) => {
  await page.goto("/");
  // Wait until the service worker has installed, activated and taken control of this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
      );
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(nav(page)).toBeVisible();

  // A deep link that was never visited also gets the shell, and the router renders the route.
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
});
