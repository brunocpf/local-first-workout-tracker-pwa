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
