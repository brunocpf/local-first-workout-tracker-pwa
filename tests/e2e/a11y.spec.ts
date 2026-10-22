import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addExercise, finishButton, startWorkout } from "./helpers";

// PRD §18: no serious/critical axe violations on any P0 screen, in light and dark.

// These tests do several full-page loads; `vite preview` rewrites the fallback page with relative asset paths, which
// the service worker would then serve (and break) at nested URLs. Accessibility doesn't depend on the worker.
test.use({ serviceWorkers: "block" });

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  const blocking = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => `${n.target.join(" ")} — ${n.failureSummary}`),
    }));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

/** Lets entry animations (sheets, dialogs, route transitions) finish so axe measures settled colors. */
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));

/** Completes a one-set workout and leaves the app on /history. */
async function completeWorkout(page: Page) {
  await startWorkout(page);
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);
  await page.getByLabel("Set 1 weight, kg").fill("50");
  await page.getByLabel("Set 1 reps").fill("10");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await finishButton(page).click();
  await page.getByRole("dialog", { name: "Workout complete" }).getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/history$/);
}

const plan = JSON.stringify({
  schemaVersion: 1,
  program: {
    name: "A11y Plan",
    routines: [
      {
        id: "a",
        name: "Day A",
        exercises: [
          { exercise: { name: "Barbell Bench Press" }, sets: 3, repRange: [6, 10], targetWeight: 80 },
          { exercise: { name: "Zzyzx Machine Thing" }, sets: 2, repRange: [10, 12] },
        ],
      },
    ],
  },
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`axe — ${colorScheme}`, () => {
    test.use({ colorScheme });

    test("Home", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
      await scan(page);
    });

    test("Workout and exercise picker", async ({ page }) => {
      await startWorkout(page);
      await addExercise(page, "barbell bench press", /Barbell Bench Press/);
      await page.getByLabel("Set 1 weight, kg").fill("50");
      await page.getByLabel("Set 1 reps").fill("10");
      await page.getByRole("button", { name: "Complete set 1" }).click();
      await settle(page);
      await scan(page);

      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.getByRole("button", { name: "Add exercise" }).click();
      const picker = page.getByRole("dialog", { name: "Add exercise" });
      await expect(picker.getByRole("searchbox", { name: "Search exercises" })).toBeVisible();
      await settle(page);
      await scan(page);
    });

    test("History list, detail and edit", async ({ page }) => {
      await completeWorkout(page);
      await settle(page);
      await scan(page);

      await page.locator('a[href*="/history/"]').first().click();
      await expect(page).toHaveURL(/\/history\/[^/]+$/);
      await expect(page.getByRole("link", { name: "Edit session" })).toBeVisible();
      await settle(page);
      await scan(page);

      await page.getByRole("link", { name: "Edit session" }).click();
      await expect(page).toHaveURL(/\/history\/[^/]+\/edit$/);
      await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeVisible();
      await settle(page);
      await scan(page);
    });

    test("Routines list and builder", async ({ page }) => {
      await page.goto("/routines");
      await expect(page.getByRole("heading", { name: "Routines" }).first()).toBeVisible();
      await scan(page);

      await page.goto("/routines/new");
      await page.getByRole("textbox", { name: "Name" }).fill("A11y routine");
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // WebKit swallows the first tap while a field is focused
      await page.getByRole("button", { name: "Add exercise" }).first().click();
      const picker = page.getByRole("dialog", { name: "Add exercise" });
      await picker.getByRole("searchbox", { name: "Search exercises" }).fill("barbell bench press");
      await picker.getByRole("button", { name: /Barbell Bench Press/ }).first().click();
      await picker.getByRole("button", { name: "Add 1 exercise" }).click();
      await expect(picker).toBeHidden();
      await expect(page.getByRole("heading", { name: "Barbell Bench Press" })).toBeVisible();
      await settle(page);
      await scan(page);
    });

    test("Import preview", async ({ page }) => {
      await page.goto("/routines/import");
      await page.getByLabel("Plan JSON").fill(plan);
      await page.getByRole("button", { name: "Check plan" }).click();
      await expect(page.getByText("3 × 6–10 @ 80 kg")).toBeVisible();
      await settle(page);
      await scan(page);
    });

    test("Settings", async ({ page }) => {
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Settings" }).first()).toBeVisible();
      await scan(page);
    });
  });
}

// WCAG 1.4.4 / 1.4.10: no horizontal scroll at 320 CSS px, also with the text scaled to 200% (as the OS/browser text size does).
const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** CSSOM writes are allowed by the app's CSP, unlike injected <style> tags. */
const scaleText = (page: Page, fontSize: string) =>
  page.evaluate((size) => document.documentElement.style.setProperty("font-size", size), fontSize);

for (const [label, fontSize] of [["100%", "100%"], ["200% text", "200%"]] as const) {
  test.describe(`reflow at 320 px — ${label}`, () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test("P0 screens do not scroll horizontally", async ({ page }) => {
      const reflows = async (path: string) => {
        await page.goto(path);
        await scaleText(page, fontSize);
        await expect(page.getByRole("heading").first()).toBeVisible();
        expect(await hasHorizontalScroll(page), path).toBe(false);
      };
      for (const path of ["/", "/history", "/routines", "/routines/new", "/routines/import", "/exercises", "/progress", "/progress/body", "/settings"]) {
        await reflows(path);
      }

      await startWorkout(page);
      await addExercise(page, "barbell bench press", /Barbell Bench Press/);
      await page.getByLabel("Set 1 weight, kg").fill("100");
      await scaleText(page, fontSize);
      expect(await hasHorizontalScroll(page), "workout").toBe(false);
    });
  });
}

test("keyboard-only: Tab reaches controls with a visible focus ring", async ({ page }, testInfo) => {
  // Desktop flow; touch devices have no Tab key and WebKit skips buttons in Tab order by default.
  test.skip(testInfo.project.name !== "Desktop Chromium");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
  const seen = new Set<string>();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      return { id: `${el.tagName}:${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20)}`, ring: ring || cs.boxShadow !== "none" };
    });
    expect(focus, `Tab #${i + 1} focused nothing`).not.toBeNull();
    expect(focus!.ring, `no visible focus ring on ${focus!.id}`).toBe(true);
    seen.add(focus!.id);
  }
  expect(seen.size).toBeGreaterThan(3);
});
