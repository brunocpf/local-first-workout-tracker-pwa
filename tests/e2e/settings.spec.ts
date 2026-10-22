import { expect, test } from "@playwright/test";

test("settings persist across reload", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByRole("radio", { name: "lb" }).check({ force: true });
  await page.getByRole("radio", { name: "Dark" }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const rest = page.getByLabel("Default rest");
  await rest.fill("120");
  await rest.blur();

  await page.reload();
  await expect(page.getByRole("radio", { name: "lb" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Default rest")).toHaveValue("120");
});

test("settings links to diagnostics and shows storage status", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByTestId("persisted")).toBeVisible();
  await page.getByRole("link", { name: /Diagnostics/ }).click();
  await expect(page).toHaveURL(/\/diagnostics$/);
  await expect(
    page.getByRole("heading", { name: "Diagnostics" }),
  ).toBeVisible();
});

test("RPE logging: hidden by default, enabled in settings, shown in history", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill("barbell bench press");
  await picker.getByRole("button", { name: /Barbell Bench Press/ }).first().click();
  await picker.getByRole("button", { name: "Add 1 exercise" }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByLabel("Set 1 weight, kg")).toBeVisible();
  await expect(page.getByLabel("Set 1 RPE")).toHaveCount(0);

  await page.goto("/settings");
  await page.getByRole("radio", { name: "RPE" }).check({ force: true });
  await expect(page.getByRole("radio", { name: "RPE" })).toBeChecked();
  await page.goto("/workout");
  await page.getByLabel("Set 1 RPE").selectOption("8.5");
  await page.getByLabel("Set 1 weight, kg").fill("50");
  await page.getByLabel("Set 1 reps").fill("10");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("dialog", { name: "Workout complete" }).getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await page.locator('a[href*="/history/"]').first().click();
  await expect(page.getByText("RPE 8.5")).toBeVisible();
});
