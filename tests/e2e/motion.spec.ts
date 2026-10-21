import { expect, test, type Page } from "@playwright/test";
import { addExercise, startWorkout } from "./helpers";

// T8.34: page view transitions and micro-animations are progressive enhancements (design.md §3.5). They must be
// off under reduced motion, and the app must work the same where View Transitions don't exist (Safari < 18).

const nav = (page: Page) => page.getByRole("navigation", { name: "Primary" });

/** Counts calls to document.startViewTransition and records the direction each one ran with. */
const recordTransitions = (page: Page) =>
  page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { vtCalls: string[] }).vtCalls = calls;
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    document.startViewTransition = ((update: ViewTransitionUpdateCallback) => {
      calls.push(document.documentElement.dataset.nav ?? "");
      return original(update);
    }) as typeof document.startViewTransition;
  });
const transitions = (page: Page) => page.evaluate(() => (window as unknown as { vtCalls: string[] }).vtCalls);

/** Visits a tab, a nested page and its parent; the shell and headings must follow each step. */
async function walk(page: Page) {
  await page.goto("/");
  await nav(page).getByRole("link", { name: "Exercises" }).click();
  await expect(page.getByRole("heading", { name: "Exercises", level: 1 })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Exercises" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("main").getByRole("link", { name: /Back Squat/ }).first().click();
  await expect(page.getByRole("heading", { name: "Back Squat", level: 1 })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Back to exercises" }).click();
  await expect(page.getByRole("heading", { name: "Exercises", level: 1 })).toBeVisible();
  await nav(page).getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
}

test("navigation runs view transitions where supported, with direction, and cleans up", async ({ page }) => {
  await recordTransitions(page);
  await walk(page);
  const supported = await page.evaluate(() => typeof document.startViewTransition === "function");
  test.skip(!supported, "this browser has no View Transitions; covered by the fallback test");
  expect(await transitions(page)).toEqual(["fade", "forward", "back", "fade"]);
  await expect(page.locator("html")).not.toHaveAttribute("data-nav");
});

test("navigation works without the View Transitions API (Safari 17 fallback)", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error -- simulate a browser without the API
    delete Document.prototype.startViewTransition;
  });
  await walk(page);
  expect(await page.evaluate(() => "startViewTransition" in document)).toBe(false);
  await expect(page.locator("html")).not.toHaveAttribute("data-nav");
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("starts no view transitions and no check-mark pop", async ({ page }) => {
    await recordTransitions(page);
    await walk(page);
    expect(await transitions(page)).toEqual([]);

    await startWorkout(page);
    await addExercise(page, "barbell bench press", /Barbell Bench Press/);
    await page.getByLabel("Set 1 weight, kg").fill("50");
    await page.getByLabel("Set 1 reps").fill("10");
    await page.getByRole("button", { name: "Complete set 1" }).click();
    const done = page.getByRole("button", { name: "Set 1 completed, undo" });
    await expect(done).toBeVisible();
    // The check mark appears without the pop.
    await expect(done.locator(".mark")).toHaveCSS("animation-name", "none");
  });
});
