import { expect, test, type Page } from "@playwright/test";
import { startWorkout, storedSessions } from "./helpers";

// tests/fixtures/hevy/sample.csv: 29 workouts, 547 set rows, 33 distinct exercises.
const FIXTURE = "tests/fixtures/hevy/sample.csv";
const WORKOUTS = 29;
const TIME_ZONE = "Europe/Lisbon";

const historyRows = (page: Page) => page.locator('a[href^="/history/"]:not([href$="/calendar"])');

/** Runs the wizard from the file step to the review step, creating any exercise the catalog doesn't match. */
async function importSample(page: Page) {
  // Navigate in-app: a full load of this nested URL once the service worker is active 404s its assets (see PR description).
  await page.goto("/settings");
  await page.getByRole("link", { name: /Import from Hevy/ }).click();
  await expect(page).toHaveURL(/\/settings\/import-hevy$/);
  await page.getByTestId("hevy-file-input").setInputFiles(FIXTURE);
  await expect(page.getByText("Read 547 set rows")).toBeVisible();
  await page.getByRole("combobox", { name: /Time zone of your Hevy workouts/ }).selectOption(TIME_ZONE);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("hevy-summary")).toContainText(String(WORKOUTS));
  await page.getByRole("button", { name: "Continue" }).click();

  // Exercises with no catalog match need a decision; on a re-import the remembered mapping covers them all.
  const createAll = page.getByRole("button", { name: "Create all as custom" });
  if (await createAll.isVisible()) await createAll.click();
  await page.getByRole("button", { name: "Continue" }).click();
}

test("import → history lists the workouts → previous values → re-import is all duplicates", async ({ page }) => {
  await importSample(page);
  await page.getByRole("button", { name: `Import ${WORKOUTS} workouts` }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  // Stored: one completed session per Hevy workout.
  await expect.poll(async () => (await storedSessions(page)).length).toBe(WORKOUTS);
  expect((await storedSessions(page)).every((s) => s.status === "completed")).toBe(true);

  // History shows them (paged: 20, then the rest).
  await page.getByRole("link", { name: "View history" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(historyRows(page)).toHaveCount(20);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(historyRows(page)).toHaveCount(WORKOUTS);

  // A new workout with an imported exercise shows the last imported session as "Previous"
  // (Bench Press (Barbell), newest session Oct 5: first working set 30 kg × 12).
  await startWorkout(page);
  await page.getByRole("button", { name: "Add exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill("bench press");
  await picker.getByRole("button", { name: /^Bench Press \(Barbell\)|Barbell Bench Press/ }).first().click();
  await picker.getByRole("button", { name: "Add 1 exercise" }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByText(/Previous:\s*30\s*×\s*12/).first()).toBeVisible();

  // Re-importing the same file: every workout is flagged as already imported and nothing would be written.
  await importSample(page);
  await expect(page.getByTestId("hevy-duplicates")).toContainText(`${WORKOUTS} workouts look like ones already in your history`);
  await expect(page.getByText("Already imported")).toHaveCount(WORKOUTS);
  await expect(page.getByText("Nothing new to import")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 0 workouts" })).toBeDisabled();
  expect(await storedSessions(page)).toHaveLength(WORKOUTS + 1); // + the active session started above
});
