import { expect, test, type Page } from "@playwright/test";

// WebKit warns about the progressive-enhancement `interactive-widget` viewport key (design.md §5.5); harmless.
const isIgnorable = (text: string) =>
  text.includes("Viewport argument key") && text.includes("interactive-widget");

const nav = (page: Page) => page.getByRole("navigation", { name: "Primary" });

test("app loads and tab navigation works", async ({ page }) => {
  await page.goto("/");
  await expect(nav(page).getByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await nav(page).getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(
    nav(page).getByRole("link", { name: "History" }),
  ).toHaveAttribute("aria-current", "page");
});

test("Settings entry navigates to /settings", async ({ page }) => {
  await page.goto("/");
  await nav(page).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page).toHaveTitle("Settings · Workouts");
});

test("no horizontal scroll at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await expect(nav(page)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("loads without console errors or CSP violations", async ({ page }) => {
  const problems: string[] = [];
  page.on(
    "console",
    (m) =>
      m.type() === "error" && !isIgnorable(m.text()) && problems.push(m.text()),
  );
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
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
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

test("diagnostics page shows launch count that grows per reload, with no console errors", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on(
    "console",
    (m) =>
      m.type() === "error" && !isIgnorable(m.text()) && problems.push(m.text()),
  );
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto("/settings");
  await page.getByRole("link", { name: /Diagnostics/ }).click();
  await expect(page).toHaveURL(/\/diagnostics$/);
  await expect(page.getByText("Standalone (installed)")).toBeVisible();
  const count = async () =>
    Number(await page.locator("dt:text-is('Launch count') + dd").textContent());
  await expect(page.locator("dt:text-is('Launch count') + dd")).not.toHaveText(
    "unavailable",
  );
  const first = await count();
  await page.reload();
  await expect(page.locator("dt:text-is('Launch count') + dd")).not.toHaveText(
    "unavailable",
  );
  expect(await count()).toBe(first + 1);
  expect(problems).toEqual([]);
});

test("style guide loads without console errors and renders swatches", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on(
    "console",
    (m) =>
      m.type() === "error" && !isIgnorable(m.text()) && problems.push(m.text()),
  );
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto("/dev/ui");
  await expect(
    page.getByRole("heading", { name: "UI style guide" }),
  ).toBeVisible();
  await expect(
    page.getByText("--color-accent", { exact: true }).first(),
  ).toBeVisible();
  expect(problems).toEqual([]);
});
