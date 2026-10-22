import { expect, test } from "@playwright/test";

const plan = JSON.stringify({
  schemaVersion: 1,
  program: {
    name: "Split",
    daysPerWeek: 2,
    schedule: {
      type: "weekly",
      days: [
        { day: "monday", routine: "a" },
        { day: "thursday", routine: "b" },
      ],
    },
    routines: [
      {
        id: "a",
        name: "Upper A",
        exercises: [
          {
            exercise: { name: "Barbell Bench Press" },
            sets: 3,
            repRange: [6, 10],
          },
        ],
      },
      {
        id: "b",
        name: "Lower B",
        exercises: [
          { exercise: { name: "Back Squat" }, sets: 3, repRange: [5, 8] },
        ],
      },
    ],
  },
});

test("imported schedule shows on the program page, can be edited, and Home suggests today's routine", async ({
  page,
}) => {
  // Monday 2026-10-19 (local = UTC in the test browser's default zone range for midday).
  await page.clock.setFixedTime(new Date("2026-10-19T12:00:00"));
  await page.goto("/routines/import");
  await page.getByLabel("Plan JSON").fill(plan);
  await page.getByRole("button", { name: "Check plan" }).click();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page).toHaveURL(/\/routines$/);

  await page.goto("/");
  const today = page.getByRole("region", { name: "Scheduled for today" });
  await expect(today).toContainText("Today: Upper A");
  await expect(today.getByRole("button", { name: "Start" })).toBeVisible();

  await page.goto("/routines");
  await page.getByRole("link", { name: /Split/ }).first().click();
  await expect(page.getByRole("combobox", { name: "Monday" })).toHaveValue(
    /.+/,
  );
  await expect(
    page.getByRole("combobox", { name: "Monday" }).locator("option:checked"),
  ).toHaveText("Upper A");
  await expect(
    page.getByRole("combobox", { name: "Thursday" }).locator("option:checked"),
  ).toHaveText("Lower B");
  await expect(
    page.getByRole("combobox", { name: "Tuesday" }).locator("option:checked"),
  ).toHaveText("Rest day");

  // Move Upper A from Monday to Tuesday: Home no longer suggests it on Monday.
  await page
    .getByRole("combobox", { name: "Monday" })
    .selectOption({ label: "Rest day" });
  await page
    .getByRole("combobox", { name: "Tuesday" })
    .selectOption({ label: "Upper A" });
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByText("Schedule saved")).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Quick start" }),
  ).toBeVisible();
  await expect(page.getByText("Today: Upper A")).toHaveCount(0);
});
