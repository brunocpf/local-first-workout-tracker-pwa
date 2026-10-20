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
