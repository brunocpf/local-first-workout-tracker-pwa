import { expect, test, type Page } from "@playwright/test";

type Stored = { id: string; name: string; exercises: { id: string; exerciseId: string }[] };

const readStore = <T>(page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).getAll();
          req.onsuccess = () => resolve(req.result as T[]);
          req.onerror = () => reject(req.error);
        };
      }),
    store,
  );

async function addExercises(page: Page, ...names: string[]) {
  // WebKit swallows the first tap on a button while a text field is focused; blur like a user dismissing the keyboard.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  for (const n of names) {
    await picker.getByRole("searchbox", { name: "Search exercises" }).fill(n);
    await picker.getByRole("button", { name: new RegExp(n, "i") }).first().click();
  }
  await picker.getByRole("button", { name: /^Add \d+ exercises?$/ }).click();
}

async function createRoutine(page: Page, name: string) {
  await page.goto("/routines/new");
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await addExercises(page, "barbell bench press", "back squat");
  await page.getByRole("button", { name: "Save routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[^/]+$/);
}

test("create a routine, then reorder, remove + undo and edit it", async ({ page }) => {
  await createRoutine(page, "Push day");
  await expect(page.getByRole("heading", { name: "Push day" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Barbell Bench Press" })).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByText("3 sets × 8–12").first()).toBeVisible();
  await page.getByRole("button", { name: "Move Back Squat up" }).click();
  await page.getByRole("button", { name: /Remove Barbell Bench Press/ }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(["Back Squat", "Barbell Bench Press"]);
  await page.getByRole("textbox", { name: "Name" }).fill("Push day v2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Push day v2" })).toBeVisible();

  const [saved] = await readStore<Stored>(page, "routines");
  expect(saved.exercises).toHaveLength(2);
});

test("leaving with unsaved changes asks first; name is required", async ({ page }) => {
  await page.goto("/routines/new");
  await page.getByRole("button", { name: "Save routine" }).click();
  await expect(page.getByText("Name is required.")).toBeVisible();
  expect(await readStore(page, "routines")).toHaveLength(0);

  await page.getByRole("textbox", { name: "Name" }).fill("Draft");
  await page.getByRole("main").getByRole("link", { name: "Routines" }).click();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/routines\/new$/);
  await page.getByRole("main").getByRole("link", { name: "Routines" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(/\/routines$/);
  expect(await readStore(page, "routines")).toHaveLength(0);
});

test("editing a routine never changes past sessions", async ({ page }) => {
  await createRoutine(page, "Legs");
  const [routine] = await readStore<Stored>(page, "routines");
  const now = new Date().toISOString();
  const session = {
    id: "s-hist-1",
    routineId: routine.id,
    routineNameSnapshot: "Legs",
    name: "Legs",
    status: "completed",
    startedAt: now,
    endedAt: now,
    timeZone: "UTC",
    exercises: [
      {
        id: "se1",
        exerciseId: routine.exercises[0].exerciseId,
        exerciseNameSnapshot: "Barbell Bench Press",
        exerciseTypeSnapshot: "weighted_reps",
        sets: [],
      },
    ],
    exerciseIds: [routine.exercises[0].exerciseId],
    createdAt: now,
    updatedAt: now,
  };
  await page.evaluate(
    (s) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("sessions", "readwrite");
          tx.objectStore("sessions").put(s);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    session,
  );
  const before = await readStore(page, "sessions");

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Renamed");
  await page.getByRole("button", { name: /Remove Barbell Bench Press/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Renamed" })).toBeVisible();

  expect(await readStore(page, "sessions")).toEqual(before);
  await page.getByRole("link", { name: "History" }).click();
  await page.getByRole("link", { name: /Legs/ }).click();
  await expect(page.getByText("Barbell Bench Press").first()).toBeVisible();
});

test("prescription editor: sets, reps, rest, notes; 135 lb round-trips", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "lb" }).check({ force: true });
  await page.getByRole("link", { name: "Routines" }).click(); // client-side: no reload racing the settings write
  await page.getByRole("link", { name: "New routine" }).first().click();
  await page.getByRole("textbox", { name: "Name" }).fill("Prescribed");
  await addExercises(page, "barbell bench press", "back squat");
  await page.getByRole("button", { name: "Save routine" }).click();
  await expect(page).toHaveURL(/\/routines\/[^/]+$/);
  await page.getByRole("link", { name: "Edit" }).click();

  await page.getByRole("button", { name: "Edit sets for Barbell Bench Press" }).click();
  const sheet = page.getByRole("dialog", { name: "Barbell Bench Press sets" });
  await sheet.getByLabel("Number of sets").fill("4");
  await sheet.getByLabel("Set 1 max reps").fill("10");
  await sheet.getByLabel("Set 1 weight").fill("135");
  await sheet.getByRole("combobox", { name: "Set 2 type" }).selectOption("warmup");
  await sheet.getByLabel("Rest").fill("90");
  await sheet.getByRole("textbox", { name: "Notes" }).fill("Pause on chest");
  await sheet.getByLabel("Notes").blur();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Prescribed" })).toBeVisible();

  const [saved] = await readStore<{
    exercises: { restSeconds?: number; notes?: string; prescribedSets: { type: string; repRange?: number[]; targetWeight?: number }[] }[];
  }>(page, "routines");
  const bench = saved.exercises[0];
  expect(bench.prescribedSets).toHaveLength(4);
  expect(bench.prescribedSets[0].repRange).toEqual([8, 10]);
  expect(bench.prescribedSets[0].targetWeight).toBeCloseTo(135 * 0.45359237, 6);
  expect(bench.prescribedSets[1].type).toBe("warmup");
  expect(bench.restSeconds).toBe(90);
  expect(bench.notes).toBe("Pause on chest");

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Edit sets for Barbell Bench Press" }).click();
  await expect(page.getByLabel("Set 1 weight")).toHaveValue("135");
});

test("routines page does not scroll horizontally with long names", async ({ page }) => {
  const long = `${"Extremely long routine name ".repeat(4)}${"Supercalifragilisticexpialidocious".repeat(2)}`;
  await createRoutine(page, long);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/routines");
    await expect(page.getByRole("list", { name: "Routines" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
  }
});
