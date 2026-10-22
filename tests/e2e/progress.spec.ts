import { expect, test, type Page } from "@playwright/test";

/** Writes completed sessions straight into IndexedDB for the first weighted_reps catalog exercise. */
async function seed(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByRole("heading", { name: "Exercises" })).toBeVisible();
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["exercises", "sessions"], "readwrite");
          const req = tx.objectStore("exercises").getAll();
          req.onsuccess = () => {
            const ex = req.result.find((e: { exerciseType: string }) => e.exerciseType === "weighted_reps");
            const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
            const mk = (id: string, ago: number, sets: [number, number, string?][]) => ({
              id,
              name: id,
              status: "completed",
              startedAt: day(ago),
              endedAt: day(ago),
              timeZone: "UTC",
              exerciseIds: [ex.id],
              exercises: [
                {
                  id: `${id}-e`,
                  exerciseId: ex.id,
                  exerciseNameSnapshot: ex.name,
                  exerciseTypeSnapshot: "weighted_reps",
                  sets: sets.map(([weight, reps, type], i) => ({
                    id: `${id}-s${i}`,
                    type: type ?? "normal",
                    weight,
                    reps,
                    completedAt: day(ago),
                  })),
                },
              ],
              createdAt: day(ago),
              updatedAt: day(ago),
            });
            const sessions = tx.objectStore("sessions");
            sessions.put(mk("p1", 20, [[100, 5], [60, 10, "warmup"]]));
            sessions.put(mk("p2", 10, [[110, 5]]));
            sessions.put(mk("p3", 2, [[120, 3]]));
            tx.oncomplete = () => resolve(ex.name);
            tx.onerror = () => reject(tx.error);
          };
        };
      }),
  );
}

test("progress shows an empty state without history", async ({ page }) => {
  await page.goto("/progress");
  await expect(page.getByText("No data yet")).toBeVisible();
});

test("seeded history shows the chart and personal records", async ({ page }) => {
  const name = await seed(page);
  await page.goto("/progress");
  await expect(page.getByRole("img", { name: new RegExp(`Estimated 1RM for ${name}`) })).toBeVisible();
  await expect(page.getByText("Estimated 1RM is calculated")).toBeVisible();

  const prs = page.getByRole("list", { name: "Personal records" });
  await expect(prs.getByText("Max weight")).toBeVisible();
  await expect(prs.getByText("120 kg").first()).toBeVisible();
  await expect(prs.getByText("5-rep max")).toBeVisible();
  await expect(prs.getByText("60 kg")).toHaveCount(0); // warm-ups never count

  await prs.getByRole("link", { name: /Max weight/ }).click();
  await expect(page).toHaveURL(/\/history\/p3$/);
});

test("exercise detail page shows personal records", async ({ page }) => {
  const name = await seed(page);
  // Reload the list, then navigate client-side: a hard load of /exercises/<id> can be answered by a service
  // worker holding a root-relative shell under `vite preview` (see PR notes), which is unrelated to this feature.
  await page.goto("/exercises");
  await page.getByRole("link", { name: new RegExp(`^${name}`) }).first().click();
  await expect(page).toHaveURL(/\/exercises\/[^/]+$/);
  await expect(page.getByRole("list", { name: "Personal records" })).toContainText("120 kg");
});

test("overview shows weekly muscle sets and monthly stats with month navigation", async ({ page }) => {
  // Pin "now" to mid-month so the session 20 days ago always lands in the previous month, whatever today's date is.
  await page.clock.setFixedTime(new Date("2026-06-15T12:00:00Z"));
  await seed(page);
  await page.goto("/progress");

  await expect(page.getByRole("heading", { name: "Weekly sets per muscle" })).toBeVisible();
  const bars = page.getByRole("list", { name: "Average weekly sets per muscle" });
  await expect(bars.getByRole("listitem").first()).toBeVisible();
  await page.getByText("View as table").click();
  await expect(page.getByRole("table", { name: /Weekly sets per muscle, last 4 weeks/ })).toBeVisible();
  await page.getByLabel("Last 8 weeks").check({ force: true });
  await expect(page.getByRole("table", { name: /last 8 weeks/ })).toBeVisible();

  const tiles = page.getByRole("list", { name: /^Statistics for / });
  await expect(tiles).toContainText("Workouts");
  await expect(tiles).toContainText("Total time");
  await expect(tiles).toContainText("Sets");
  await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled();

  // With "now" on the 15th, the session seeded 20 days ago is in the previous month, so it can be stepped back to.
  const before = await page.locator(".month-name").innerText();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.locator(".month-name")).not.toHaveText(before);
  await expect(page.getByRole("button", { name: "Next month" })).toBeEnabled();
});

type StoredMeasurement = { kind: string; value: number };
const storedMeasurements = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<StoredMeasurement[]>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("measurements").objectStore("measurements").getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
  );

/** Waits for a settings change to be written to IndexedDB (the UI updates first, and a navigation can abort a write in flight). */
const settingStored = (page: Page, key: string, value: string) =>
  expect
    .poll(() =>
      page.evaluate(
        (k) =>
          new Promise((resolve, reject) => {
            const open = indexedDB.open("workout-tracker");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const req = open.result.transaction("settings").objectStore("settings").getAll();
              req.onsuccess = () => resolve(req.result[0]?.[k]);
              req.onerror = () => reject(req.error);
            };
          }),
        key,
      ),
    )
    .toBe(value);

/** Opens the page client-side: a hard load of a nested route can be answered by a service worker holding a root-relative shell under `vite preview` (see the exercise detail test). */
async function openBody(page: Page) {
  await page.goto("/progress");
  await page.getByRole("link", { name: /Body measurements/ }).click();
  await expect(page).toHaveURL(/\/progress\/body$/);
}

test("body measurements: log bodyweight, see it listed and charted, persist, delete", async ({ page }) => {
  await openBody(page);
  await expect(page.getByText("No bodyweight yet")).toBeVisible();

  await page.getByRole("textbox", { name: "Bodyweight" }).fill("82,5");
  await page.getByRole("button", { name: "Log bodyweight" }).click();
  const entries = page.getByRole("list", { name: "Bodyweight entries" });
  await expect(entries).toContainText("82.5 kg");
  await expect(page.getByRole("img", { name: /Bodyweight/ })).toBeVisible();
  expect((await storedMeasurements(page)).map((m) => [m.kind, m.value])).toEqual([["bodyweight", 82.5]]);

  await page.getByRole("textbox", { name: "Bodyweight" }).fill("0");
  await page.getByRole("button", { name: "Log bodyweight" }).click();
  await expect(page.getByText("Enter a value above 0.")).toBeVisible();
  expect(await storedMeasurements(page)).toHaveLength(1);

  await openBody(page);
  await expect(page.getByRole("list", { name: "Bodyweight entries" })).toContainText("82.5 kg");

  await page.getByRole("button", { name: /^Delete bodyweight 82.5 kg/ }).click();
  await page.getByRole("button", { name: "Delete measurement", exact: true }).click();
  await expect(page.getByText("No bodyweight yet")).toBeVisible();
  expect(await storedMeasurements(page)).toHaveLength(0);
});

test("body measurements round-trip in lb and in, stored as kg and cm", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "lb" }).check({ force: true });
  await page.getByRole("radio", { name: "in", exact: true }).check({ force: true });
  await settingStored(page, "weightUnit", "lb");
  await settingStored(page, "lengthUnit", "in");

  await openBody(page);
  await page.getByRole("textbox", { name: "Bodyweight" }).fill("180.5");
  await page.getByRole("button", { name: "Log bodyweight" }).click();
  await expect(page.getByRole("list", { name: "Bodyweight entries" })).toContainText("180.5 lb");
  // The toast sits over the lower form on a phone and would swallow the next click.
  await page.getByRole("region", { name: "Notifications" }).getByRole("button", { name: "Dismiss" }).click();

  await page.getByLabel("Measurement").selectOption("waist");
  await page.getByRole("textbox", { name: "Value" }).fill("32.5");
  await page.getByRole("button", { name: "Add measurement" }).click();
  await expect(page.getByRole("list", { name: "Waist entries" })).toContainText("32.5 in");

  const stored = Object.fromEntries((await storedMeasurements(page)).map((m) => [m.kind, m.value]));
  expect(stored.bodyweight).toBeCloseTo(180.5 * 0.45359237, 6);
  expect(stored.waist).toBeCloseTo(32.5 * 2.54, 6);

  await openBody(page);
  await page.getByLabel("Show").selectOption("waist");
  await expect(page.getByRole("list", { name: "Waist entries" })).toContainText("32.5 in");
  await page.getByLabel("Show").selectOption("bodyweight");
  await expect(page.getByRole("list", { name: "Bodyweight entries" })).toContainText("180.5 lb");

  // Switching the display units re-reads the same stored values.
  await page.goto("/settings");
  await page.getByRole("radio", { name: "kg" }).check({ force: true });
  await page.getByRole("radio", { name: "cm" }).check({ force: true });
  await settingStored(page, "weightUnit", "kg");
  await settingStored(page, "lengthUnit", "cm");
  await openBody(page);
  await expect(page.getByRole("list", { name: "Bodyweight entries" })).toContainText("81.87 kg");
  await page.getByLabel("Show").selectOption("waist");
  await expect(page.getByRole("list", { name: "Waist entries" })).toContainText("82.55 cm");
});

test("body measurements page has no horizontal overflow at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openBody(page);
  await page.getByRole("textbox", { name: "Bodyweight" }).fill("82.5");
  await page.getByRole("button", { name: "Log bodyweight" }).click();
  await expect(page.getByRole("list", { name: "Bodyweight entries" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
