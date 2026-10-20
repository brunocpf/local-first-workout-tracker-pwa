import { expect, test, type Page } from "@playwright/test";

type StoredSet = { weight?: number; reps?: number; completedAt?: string };
type StoredSession = {
  status: string;
  exercises: { exerciseNameSnapshot: string; sets: StoredSet[] }[];
};

/** Reads the sessions straight from IndexedDB, i.e. what survives a reload (the UI updates before the write lands). */
const storedSessions = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<StoredSession[]>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result
            .transaction("sessions")
            .objectStore("sessions")
            .getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
  );

test("start → reload → resume → discard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(
    page.getByRole("button", { name: "Finish", exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(
    page.getByRole("button", { name: "Finish", exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByText("Workout in progress")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume workout" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Resume workout" }).click();
  await expect(page).toHaveURL(/\/workout$/);

  await page.getByRole("button", { name: "Workout options" }).click();
  await page.getByRole("button", { name: "Discard workout…" }).click();
  await page
    .getByRole("button", { name: "Discard workout", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/workout/);
  await expect(page.getByText("Workout discarded")).toBeVisible();
  await expect(page.getByText("Workout in progress")).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Start workout" }),
  ).toBeVisible();
});

test("a second tab adopts the active session instead of creating another", async ({
  context,
}) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/");
  await b.goto("/");
  await a.getByRole("button", { name: "Start workout" }).click();
  await expect(a).toHaveURL(/\/workout$/);
  // Tab b either still shows "Start workout" (its start loses to a's and must adopt) or already saw a's
  // session on load and shows "Resume workout"; which one depends on timing, and both must end up on a's session.
  await b.getByRole("button", { name: /^(Start|Resume) workout$/ }).click();
  await expect(b).toHaveURL(/\/workout$/);
  await expect(
    b.getByRole("button", { name: "Finish", exact: true }),
  ).toBeVisible();
  expect(
    (await storedSessions(b)).filter((x) => x.status === "active"),
  ).toHaveLength(1);
});

test("add, reorder, remove + undo exercises; all survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByText("No exercises yet")).toBeVisible();

  await page.getByRole("button", { name: "Add exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker
    .getByRole("searchbox", { name: "Search exercises" })
    .fill("barbell bench press");
  await picker
    .getByRole("button", { name: /Barbell Bench Press/ })
    .first()
    .click();
  await picker
    .getByRole("searchbox", { name: "Search exercises" })
    .fill("back squat");
  await picker
    .getByRole("button", { name: /Back Squat/ })
    .first()
    .click();
  await picker.getByRole("button", { name: "Add 2 exercises" }).click();

  const names = () => page.locator("article h2").allTextContents();
  // Wait for the write-through before reloading; the UI is optimistic and reload doesn't flush.
  const stored = async () =>
    (await storedSessions(page))
      .find((x) => x.status === "active")
      ?.exercises.map((e) => e.exerciseNameSnapshot);
  await expect(page.locator("article h2")).toHaveCount(2);
  const before = await names();
  expect(before).toHaveLength(2);
  await expect(page.getByRole("list", { name: "Sets" })).toHaveCount(2);

  await page
    .getByRole("button", { name: `Exercise options for ${before[1]}` })
    .click();
  await page.getByRole("button", { name: "Move up" }).click();
  await expect.poll(names).toEqual([before[1], before[0]]);
  await expect.poll(stored).toEqual([before[1], before[0]]);

  await page.reload();
  await expect.poll(names).toEqual([before[1], before[0]]);

  await page
    .getByRole("button", { name: `Exercise options for ${before[1]}` })
    .click();
  await page.getByRole("button", { name: "Remove exercise" }).click();
  await expect.poll(names).toEqual([before[0]]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(names).toEqual([before[1], before[0]]);
  await expect(page.getByRole("list", { name: "Sets" })).toHaveCount(2);
  await expect.poll(stored).toEqual([before[1], before[0]]);

  await page.reload();
  await expect.poll(names).toEqual([before[1], before[0]]);
});

/** Sets of the stored active session (a reload can abort a write still in flight, so tests wait for it). */
const storedSets = async (page: Page) =>
  (await storedSessions(page))
    .find((s) => s.status === "active")
    ?.exercises.flatMap((e) => e.sets) ?? [];

async function addExercise(page: Page, query: string, name: RegExp) {
  await page.getByRole("button", { name: "Add exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill(query);
  await picker.getByRole("button", { name }).first().click();
  await picker.getByRole("button", { name: "Add 1 exercise" }).click();
  await expect(picker).toBeHidden(); // WebKit: typing during the close animation goes nowhere
}

test("log a set, finish; next workout prefills it and completes in one tap; survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);

  const weight = page.getByLabel("Set 1 weight, kg");
  const reps = page.getByLabel("Set 1 reps");
  await weight.fill("80");
  await weight.press("Enter"); // "next" → reps
  await expect(reps).toBeFocused();
  await reps.fill("8");
  await reps.press("Enter"); // "done" closes the keyboard and keeps the value
  await expect(reps).not.toBeFocused();
  await expect(
    page.getByRole("button", { name: "Complete set 1" }),
  ).toHaveAttribute("aria-pressed", "false"); // editing never completes
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await expect(
    page.getByRole("button", { name: "Set 1 completed, undo" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Workout complete" })
    .getByRole("button", { name: "Done" })
    .click();
  await expect(page).toHaveURL(/\/history$/);

  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);
  await expect(page.getByLabel("Set 1 weight, kg")).toHaveAttribute(
    "placeholder",
    "80",
  );
  await expect(page.getByLabel("Set 1 reps")).toHaveAttribute(
    "placeholder",
    "8",
  );
  await expect(page.getByLabel("Set 1 weight, kg")).toHaveValue("");

  // One tap, then reload straight away: the write is not deferred.
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await expect(
    page.getByRole("button", { name: "Set 1 completed, undo" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await storedSets(page))[0])
    .toMatchObject({ weight: 80, reps: 8, completedAt: expect.any(String) });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Set 1 completed, undo" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Set 1 weight, kg")).toHaveValue("80");
  await expect(page.getByLabel("Set 1 reps")).toHaveValue("8");

  // Tapping again un-completes; the values stay.
  await page.getByRole("button", { name: "Set 1 completed, undo" }).click();
  await expect(
    page.getByRole("button", { name: "Complete set 1" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Set 1 weight, kg")).toHaveValue("80");
});

test("135 lb round-trips through reload; add, delete + undo sets", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "lb" }).check({ force: true });
  await page.getByRole("link", { name: "Home" }).click(); // client-side: no reload racing the settings write
  await page.getByRole("button", { name: "Start workout" }).click();
  await addExercise(page, "back squat", /Back Squat/);

  await page.getByLabel("Set 1 weight, lb").fill("135");
  await page.getByLabel("Set 1 reps").fill("5");
  await page.getByLabel("Set 1 reps").blur();
  await page.getByRole("button", { name: "Add set" }).click();
  await expect(page.getByLabel("Set 2 weight, lb")).toHaveValue("135");
  await expect.poll(async () => (await storedSets(page)).length).toBe(2);
  await page.reload();
  await expect(page.getByLabel("Set 1 weight, lb")).toHaveValue("135");
  await expect(page.getByLabel("Set 2 weight, lb")).toHaveValue("135");

  await page.getByRole("button", { name: "Set 2 options" }).click();
  await page.getByRole("button", { name: "Delete set" }).click();
  await expect(page.getByLabel("Set 2 weight, lb")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Set 2 weight, lb")).toHaveValue("135");
  await expect.poll(async () => (await storedSets(page)).length).toBe(2);
  await page.reload();
  await expect(page.getByLabel("Set 2 reps")).toHaveValue("5");
});

test("rest timer: auto-starts, survives reload by timestamp, alerts once, per-exercise override", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { vibrations: number };
    w.vibrations = 0;
    Object.defineProperty(navigator, "vibrate", {
      value: () => (w.vibrations++, true),
      configurable: true,
    });
  });
  await page.clock.install({ time: new Date("2026-03-01T10:00:00Z") });
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);

  const timer = page.getByRole("timer", { name: "Rest remaining" });
  await expect(page.getByRole("button", { name: "Start rest" })).toBeVisible();
  await page.getByLabel("Set 1 weight, kg").fill("80");
  await page.getByLabel("Set 1 reps").fill("8");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await expect(timer).toHaveText("1:30");

  await page.getByRole("button", { name: "Got it" }).click();
  await page.getByRole("button", { name: "Add 15 seconds" }).click();
  await expect(timer).toHaveText("1:45");
  await page.getByRole("button", { name: "Pause rest" }).click();
  await expect(
    page.getByRole("button", { name: "Resume rest" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Resume rest" }).click();

  await page.clock.fastForward(30_000);
  await expect(timer).toHaveText("1:15");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((r) => {
            const open = indexedDB.open("workout-tracker");
            open.onsuccess = () => {
              const req = open.result
                .transaction("sessions")
                .objectStore("sessions")
                .getAll();
              req.onsuccess = () => r(!!req.result[0]?.restTimer);
            };
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(timer).toHaveText(/^1:1[45]$/);

  await page.clock.fastForward(120_000);
  await expect(page.getByText("Rest done")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Rest done")).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { vibrations: number }).vibrations,
    ),
  ).toBe(0); // reload never alerts

  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("button", { name: "Start rest" })).toBeVisible();

  await page.getByRole("button", { name: /Exercise options for/ }).click();
  await page.getByRole("button", { name: "Rest time" }).click();
  await page.getByLabel("Rest after each set").selectOption("60");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Add set" }).click();
  await page.getByLabel("Set 2 weight, kg").fill("80");
  await page.getByLabel("Set 2 reps").fill("8");
  await page.getByRole("button", { name: "Complete set 2" }).click();
  await expect(timer).toHaveText("1:00");
});

test("rest timer alerts exactly once when it finishes while open", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { vibrations: number };
    w.vibrations = 0;
    Object.defineProperty(navigator, "vibrate", {
      value: () => (w.vibrations++, true),
      configurable: true,
    });
  });
  await page.clock.install({ time: new Date("2026-03-01T10:00:00Z") });
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByRole("button", { name: "Start rest" }).click();
  await page.clock.runFor(91_000);
  await expect(page.getByText("Rest done")).toBeVisible();
  await page.clock.runFor(5_000);
  expect(
    await page.evaluate(
      () => (window as unknown as { vibrations: number }).vibrations,
    ),
  ).toBe(1);
});

test("finish warns about incomplete sets, shows a summary and lands in History", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);
  await page.getByLabel("Set 1 weight, kg").fill("50");
  await page.getByLabel("Set 1 reps").fill("10");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await page.getByRole("button", { name: "Add set" }).click();

  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Finish with incomplete sets?",
  });
  await expect(confirmation).toContainText("1 set isn't completed");
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/workout$/);
  expect((await storedSessions(page)).some((s) => s.status === "active")).toBe(
    true,
  );

  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Finish with incomplete sets?" })
    .getByRole("button", { name: "Finish workout" })
    .click();
  const summary = page.getByRole("dialog", { name: "Workout complete" });
  await expect(summary).toContainText("500 kg");
  await summary.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/history$/);
  expect(
    (await storedSessions(page)).filter((s) => s.status === "completed"),
  ).toHaveLength(1);
});
