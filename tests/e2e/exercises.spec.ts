import { expect, test } from "@playwright/test";

test("search finds Barbell Bench Press and shows an empty state", async ({
  page,
}) => {
  await page.goto("/exercises");
  const search = page.getByRole("searchbox", { name: "Search exercises" });
  await expect(search).toBeVisible();

  await search.fill("bench");
  const list = page.getByRole("list", { name: "Exercises" });
  await expect(
    list.getByText("Barbell Bench Press", { exact: true }),
  ).toBeVisible();
  await expect(list.getByText("Barbell · bench · chest").first()).toBeVisible();

  await search.fill("zzzzqq");
  await expect(page.getByText("No exercise matches “zzzzqq”")).toBeVisible();
});

test("opens the detail page from the list and toggles favorite", async ({
  page,
}) => {
  await page.goto("/exercises");
  await page
    .getByRole("searchbox", { name: "Search exercises" })
    .fill("barbell bench press");
  await page
    .getByRole("list", { name: "Exercises" })
    .getByRole("link", { name: /Barbell Bench Press/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Barbell Bench Press" }),
  ).toBeVisible();
  await expect(page.getByText("No completed workouts with this exercise yet.")).toBeVisible();
  const fav = page.getByRole("button", { name: "Add to favorites" });
  await fav.click();
  await expect(
    page.getByRole("button", { name: "Remove from favorites" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit exercise" })).toHaveCount(0);
});

test("create a custom exercise, rename it, archive and unarchive it, then delete it", async ({ page }) => {
  await page.goto("/exercises");
  await page.getByRole("link", { name: "New exercise" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Zercher Squat");
  await page.getByRole("textbox", { name: "Aliases" }).fill("zercher");
  // The first tap after typing can only blur the text field on touch emulation, so retry until it sticks.
  const quads = page.getByRole("group", { name: "Primary muscles" }).getByLabel("Quads");
  await expect(async () => {
    if (!(await quads.isChecked())) await quads.click();
    expect(await quads.isChecked()).toBe(true);
  }).toPass();
  await page.getByRole("button", { name: "Create exercise" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zercher Squat" })).toBeVisible();

  // Rename
  await page.getByRole("link", { name: "Edit exercise" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Zercher Squat (Barbell)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zercher Squat (Barbell)" })).toBeVisible();

  // Archive hides it from the list; "Show archived" brings it back
  await page.getByRole("link", { name: "Edit exercise" }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unarchive" })).toBeVisible();
  await page.goto("/exercises");
  const search = page.getByRole("searchbox", { name: "Search exercises" });
  await search.fill("zercher");
  await expect(page.getByText("No exercise matches “zercher”")).toBeVisible();
  await page.getByRole("switch", { name: "Show archived" }).check();
  const row = page.getByRole("list", { name: "Exercises" }).getByRole("link", { name: /Zercher Squat \(Barbell\)/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("Archived")).toBeVisible();

  // Unused custom exercises can be deleted (with confirmation)
  await row.click();
  await page.getByRole("link", { name: "Edit exercise" }).click();
  await page.getByRole("button", { name: "Unarchive" }).click();
  await page.getByRole("button", { name: "Delete exercise" }).click();
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).getByRole("button", { name: "Delete exercise" }).click();
  await expect(page).toHaveURL(/\/exercises\/?$/);
  await page.getByRole("searchbox", { name: "Search exercises" }).fill("zercher");
  await expect(page.getByText("No exercise matches “zercher”")).toBeVisible();
});
