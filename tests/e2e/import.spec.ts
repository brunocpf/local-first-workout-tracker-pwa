import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { finishButton, storedSets } from "./helpers";

test("malformed JSON shows an error", async ({ page }) => {
  await page.goto("/routines/import");
  await page.getByLabel("Plan JSON").fill("{ not json");
  await page.getByRole("button", { name: "Check plan" }).click();
  await expect(page.getByRole("alert")).toContainText("Malformed JSON");
});

test("unsupported version shows an error", async ({ page }) => {
  await page.goto("/routines/import");
  await page.getByLabel("Plan JSON").fill('{"schemaVersion": 2}');
  await page.getByRole("button", { name: "Check plan" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Unsupported schemaVersion: 2",
  );
});

test("oversize file is rejected before reading", async ({ page }) => {
  await page.goto("/routines/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "big.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1_000_001, "a"),
  });
  await expect(page.getByRole("alert")).toContainText("Input too large");
});

test("invalid schema lists paths", async ({ page }) => {
  await page.goto("/routines/import");
  await page
    .getByLabel("Plan JSON")
    .fill('{"schemaVersion": 1, "program": {}}');
  await page.getByRole("button", { name: "Check plan" }).click();
  await expect(page.getByRole("alert")).toContainText("program.");
});

const plan = (exercises: unknown[]) =>
  JSON.stringify({
    schemaVersion: 1,
    program: {
      name: "Test Plan",
      routines: [{ id: "a", name: "Day A", exercises }],
    },
  });
const press = {
  exercise: { name: "Barbell Bench Press" },
  sets: 3,
  repRange: [6, 10],
  targetWeight: 80,
};
const custom = {
  exercise: { name: "Zzyzx Machine Thing" },
  sets: 2,
  repRange: [10, 12],
};

async function check(page: import("@playwright/test").Page, json: string) {
  await page.goto("/routines/import");
  await page.getByLabel("Plan JSON").fill(json);
  await page.getByRole("button", { name: "Check plan" }).click();
}

test("unresolved exercise blocks confirm until created, then imports", async ({
  page,
}) => {
  await check(page, plan([press, custom]));
  await expect(page.getByText("3 × 6–10 @ 80 kg")).toBeVisible();
  const confirm = page.getByRole("button", { name: "Confirm import" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("button", { name: "Create custom" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page).toHaveURL(/\/routines$/);
  await expect(page.getByText("Imported 1 routine")).toBeVisible();
  await page.goto("/exercises");
  await page.getByRole("searchbox", { name: "Search exercises" }).fill("Zzyzx");
  await expect(page.getByText("Zzyzx Machine Thing")).toHaveCount(1);
});

test("cancel writes nothing", async ({ page }) => {
  await check(page, plan([press]));
  await expect(
    page.getByRole("button", { name: "Confirm import" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Day A")).toHaveCount(0);
  const counts = await page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const names = ["programs", "routines"].filter((n) =>
            db.objectStoreNames.contains(n),
          );
          const tx = db.transaction(names);
          const out: number[] = [];
          for (const n of names)
            tx.objectStore(n).count().onsuccess = (e) =>
              out.push((e.target as IDBRequest<number>).result);
          tx.oncomplete = () => resolve(out);
        };
      }),
  );
  expect(counts.every((c) => c === 0)).toBe(true);
});

test("preview edits (rename, reorder) are what gets saved", async ({
  page,
}) => {
  const squat = {
    exercise: { name: "Barbell Back Squat" },
    sets: 3,
    repRange: [5, 5],
  };
  await check(page, plan([press, squat]));
  await page.getByRole("button", { name: "Use Back Squat" }).click();
  await page.getByLabel("Routine name").fill("Edited Day");
  await page
    .getByRole("button", { name: "Move Barbell Bench Press down" })
    .click();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page).toHaveURL(/\/routines$/);
  await page.getByText("Edited Day").click();
  await expect(
    page.getByRole("heading", { level: 2 }).filter({ hasText: /Squat|Bench/ }),
  ).toHaveText(["Back Squat", "Barbell Bench Press"]);
});

const fixture = readFileSync(
  new URL("../fixtures/program-valid.json", import.meta.url),
  "utf8",
);

const countRoutines = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result
            .transaction("routines")
            .objectStore("routines")
            .count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
  );

test("a failed import creates nothing", async ({ page }) => {
  await check(page, "{ not json");
  await expect(page.getByRole("alert")).toContainText("Malformed JSON");
  await page.goto("/routines");
  await expect(page.getByText("No routines yet")).toBeVisible();
  expect(await countRoutines(page)).toBe(0);
});

test("a cancelled import creates nothing", async ({ page }) => {
  await check(page, fixture);
  await expect(
    page.getByRole("button", { name: "Confirm import" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.goto("/routines");
  await expect(page.getByText("No routines yet")).toBeVisible();
  expect(await countRoutines(page)).toBe(0);
});

test("import → quick-start → targets → log → finish → history; deleting the routine keeps the session", async ({
  page,
}) => {
  await check(page, fixture);
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page).toHaveURL(/\/routines$/);
  await expect(page.getByText("Imported 2 routines")).toBeVisible();
  await expect(page.getByRole("link", { name: /Upper A/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Lower A/ })).toBeVisible();

  await page.goto("/");
  const quick = page.getByRole("region", { name: "Quick start" });
  await quick
    .getByRole("listitem")
    .filter({ hasText: "Upper A" })
    .getByRole("button", { name: /Start/ })
    .click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(finishButton(page)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Barbell Bench Press" }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Sets" }).getByRole("listitem"),
  ).toHaveCount(3);
  await expect(page.getByText("6–10").first()).toBeVisible();

  await page.getByLabel("Set 1 weight, kg").fill("70");
  await page.getByLabel("Set 1 reps").fill("8");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await expect
    .poll(
      async () => (await storedSets(page)).filter((s) => s.completedAt).length,
    )
    .toBe(1);

  await finishButton(page).click();
  await page
    .getByRole("dialog", { name: "Finish with incomplete sets?" })
    .getByRole("button", { name: "Finish workout" })
    .click();
  await page
    .getByRole("dialog", { name: "Workout complete" })
    .getByRole("button", { name: "Done" })
    .click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("link", { name: /1 exercise/ })).toBeVisible();

  await page.goto("/routines");
  await page.getByRole("button", { name: "Options for Upper A" }).click();
  await page.getByRole("button", { name: "Delete…" }).dispatchEvent("click");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete routine" })
    .click();
  await expect(page.getByRole("link", { name: /Upper A/ })).toHaveCount(0);

  await page.goto("/history");
  await page.getByRole("link", { name: /1 exercise/ }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Barbell Bench Press" }),
  ).toBeVisible();
});
