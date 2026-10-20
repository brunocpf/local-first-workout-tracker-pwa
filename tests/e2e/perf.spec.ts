import { expect, test, type Page } from "@playwright/test";
import { buildBackup, COMPLETED_SESSIONS } from "../../scripts/generate-backup-fixture.mjs";
import { waitForServiceWorkerControl } from "./helpers";

// PRD §21 budgets, measured with a realistic history (~300 completed sessions of 8 exercises × 4 sets and one
// active session) under 4× CPU throttling (roughly a mid-range phone). Thresholds are deliberately generous so CI
// noise doesn't fail the build; they catch order-of-magnitude regressions (unbounded queries, whole-list
// re-renders), not 10% drifts. The measured numbers are logged and attached to the report. Real-device numbers
// are T4.13.

test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling uses the Chrome DevTools protocol");
// Only the phone profile: the budgets are phone budgets, and one run keeps CI time down.
test.skip(({ isMobile }) => !isMobile, "phone budgets are measured on the Pixel project");

const CPU_THROTTLE = Number(process.env.PERF_CPU_THROTTLE ?? 4);
// PRD budgets are 2 s / 100 ms / 100 ms; CI runners are slower and noisier than a phone.
const LIMITS = { coldLaunchMs: 5000, completeSetFeedbackMs: 300, completeSetWriteMs: 1000, searchMs: 300 };

const measurements: Record<string, number> = {};
const report = async (name: string, ms: number) => {
  measurements[name] = Math.round(ms);
  console.log(`[perf] ${name}: ${Math.round(ms)} ms`);
  await test.info().attach("perf-" + name, { body: String(Math.round(ms)), contentType: "text/plain" });
};

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
}

/** Restores the generated backup through the Settings UI (the real import path, validation included). */
async function restoreFixture(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByTestId("restore-input").setInputFiles({
    name: "perf-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(buildBackup())),
  });
  const dialog = page.getByRole("dialog", { name: "Replace all data?" });
  await expect(dialog).toContainText(`${COMPLETED_SESSIONS + 1} workouts`);
  await dialog.getByRole("button", { name: "Replace all data" }).click();
  await expect(page.getByText("Backup restored")).toBeVisible();
}

/**
 * Taps the first "Complete set 1" button in the page. Resolves with the ms until the next frame after the DOM first
 * changes (visible feedback), and until the set shows up as completed in IndexedDB (write-through).
 */
const tapComplete = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ feedback: number; write: number }>((resolve, reject) => {
        const button = document.querySelector<HTMLElement>('[aria-label^="Complete set 1"]');
        const open = indexedDB.open("workout-tracker");
        if (!button) return reject(new Error("no complete button"));
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          let feedback = 0;
          const t0 = performance.now();
          const observer = new MutationObserver(() => {
            observer.disconnect();
            requestAnimationFrame(() => (feedback = performance.now() - t0));
          });
          observer.observe(document.body, { attributes: true, childList: true, subtree: true });
          button.click();
          const poll = () => {
            const req = idb.transaction("sessions").objectStore("sessions").get("perf-active");
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const done = req.result?.exercises.some((e: { sets: { completedAt?: string }[] }) => e.sets.some((s) => s.completedAt));
              if (!done || !feedback) return setTimeout(poll, 5);
              idb.close();
              resolve({ feedback, write: performance.now() - t0 });
            };
          };
          poll();
        };
      }),
  );

test.describe("performance budgets (PRD §21)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForServiceWorkerControl(page);
    await restoreFixture(page);
  });

  test.afterEach(() => {
    console.log(`[perf] ${JSON.stringify(measurements)}`);
  });

  test("cold offline launch → resumed active session visible", async ({ context, page }) => {
    // Caches are warm (first visit controlled by the worker); go offline and open the app in a fresh page.
    await page.goto("/workout");
    await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
    await context.setOffline(true);

    const cold = await context.newPage();
    await throttle(cold);
    const t0 = Date.now();
    await cold.goto("/workout");
    await expect(cold.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
    await expect(cold.getByText("Back Squat").first()).toBeVisible();
    const ms = Date.now() - t0;
    await report("coldOfflineLaunch", ms);
    expect(ms).toBeLessThan(LIMITS.coldLaunchMs);

    // The same through Home's Resume button (what a launch from the icon does).
    const home = await context.newPage();
    await throttle(home);
    const t1 = Date.now();
    await home.goto("/");
    await expect(home.getByRole("button", { name: "Resume workout" })).toBeVisible();
    await report("coldOfflineLaunchHome", Date.now() - t1);
    expect(Date.now() - t1).toBeLessThan(LIMITS.coldLaunchMs);
  });

  test("completing a prefilled set → feedback and write-through", async ({ page }) => {
    await page.goto("/workout");
    await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
    // Previous values load in the background; the prefill is what the one-tap complete stores.
    const first = page.getByRole("button", { name: "Complete set 1" }).first();
    await expect(first).toBeVisible();
    await expect(page.getByLabel("Set 1 weight, kg").first()).toHaveAttribute("placeholder", /\d/);
    await throttle(page);

    const { feedback, write } = await tapComplete(page);
    await report("completeSetFeedback", feedback);
    await report("completeSetWrite", write);
    expect(feedback).toBeLessThan(LIMITS.completeSetFeedbackMs);
    expect(write).toBeLessThan(LIMITS.completeSetWriteMs);
    await expect(page.getByRole("button", { name: /^Set 1 .*completed/ }).first()).toBeVisible();
  });

  test("exercise search → results", async ({ page }) => {
    await page.goto("/workout");
    await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
    await throttle(page);
    await page.getByRole("button", { name: "Add exercise" }).click();
    const picker = page.getByRole("dialog", { name: "Add exercise" });
    const box = picker.getByRole("searchbox", { name: "Search exercises" });
    await expect(picker.getByRole("button").nth(2)).toBeVisible(); // catalog loaded
    await box.focus();

    const ms = await box.evaluate(
      (el: HTMLInputElement) =>
        new Promise<number>((resolve, reject) => {
          const dialog = el.closest("dialog, [role=dialog]");
          if (!dialog) return reject(new Error("no dialog"));
          const t0 = performance.now();
          const observer = new MutationObserver(() => {
            if (!/Overhead Press/.test(dialog.textContent ?? "")) return;
            observer.disconnect();
            requestAnimationFrame(() => resolve(performance.now() - t0));
          });
          observer.observe(dialog, { childList: true, subtree: true, characterData: true });
          el.value = "overhead";
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: "overhead" }));
        }),
    );
    await report("exerciseSearch", ms);
    expect(ms).toBeLessThan(LIMITS.searchMs);
    await expect(picker.getByRole("button", { name: /Overhead Press/ }).first()).toBeVisible();
  });
});
