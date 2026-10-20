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

  // Seeded sessions are 2–20 days ago, so stepping back always finds one in the current or previous month.
  const before = await page.locator(".month-name").innerText();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.locator(".month-name")).not.toHaveText(before);
  await expect(page.getByRole("button", { name: "Next month" })).toBeEnabled();
});
