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
