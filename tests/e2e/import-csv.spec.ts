import { expect, test } from "@playwright/test";
import { storedSessions } from "./helpers";

const CSV = [
  "session_id,session_name,started_at,ended_at,local_date,time_zone,routine_name,exercise_id,exercise_name,exercise_order,set_order,set_type,weight_kg,reps,duration_s,distance_m,rpe,rir,completed,notes",
  "csv-e2e-1,Push day,2026-03-01T10:00:00.000Z,2026-03-01T11:00:00.000Z,2026-03-01,UTC,,barbell_bench_press,Barbell Bench Press,1,1,warmup,40,10,,,,,true,",
  "csv-e2e-1,Push day,2026-03-01T10:00:00.000Z,2026-03-01T11:00:00.000Z,2026-03-01,UTC,,barbell_bench_press,Barbell Bench Press,1,2,normal,82.5,5,,,8,,true,felt good",
  "",
].join("\r\n");

test("imports this app's CSV export through the column-mapping flow", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: /Import from CSV/ }).click();
  await expect(page.getByRole("heading", { name: "Import from CSV" })).toBeVisible();

  await page.getByTestId("csv-file-input").setInputFiles({ name: "history.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await expect(page.getByText("Read 2 rows and 20 columns.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Our own headers are mapped automatically.
  await expect(page.getByLabel("Exercise name")).toHaveText(/exercise_name/);
  await expect(page.getByLabel("Weight", { exact: true })).toHaveText(/weight_kg/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Continue" }).click();

  const summary = page.getByTestId("csv-summary");
  await expect(summary).toContainText("Workouts");
  await expect(summary).toContainText("2");
  await page.getByRole("button", { name: "Continue" }).click(); // exercises: matched by id
  await page.getByRole("button", { name: "Continue" }).click(); // duplicates / review
  await page.getByRole("button", { name: "Import 1 workout" }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await expect.poll(async () => (await storedSessions(page)).length).toBe(1);
  const [s] = await storedSessions(page);
  expect(s).toMatchObject({ status: "completed", id: "csv-e2e-1", name: "Push day" });
  expect(s.exercises[0].sets.map((x) => [x.weight, x.reps])).toEqual([[40, 10], [82.5, 5]]);
});

test("a file without usable columns can't continue past the mapping", async ({ page }) => {
  await page.goto("/settings/import-csv");
  await page.getByTestId("csv-file-input").setInputFiles({ name: "x.csv", mimeType: "text/csv", buffer: Buffer.from("foo,bar\r\n1,2\r\n") });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Choose the column with the exercise name.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});
