import { expect, test } from "@playwright/test";
import {
  addExercise,
  finishButton,
  startWorkout,
  storedSessions,
  storedSets,
  waitForServiceWorkerControl,
} from "./helpers";

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

test("blank workout with two exercises: log sets, finish, see it in History list and detail", async ({
  page,
}) => {
  await startWorkout(page);
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);
  await addExercise(page, "back squat", /Back Squat/);
  await expect(page.locator("article h2")).toHaveCount(2);

  const [bench, squat] = await page.locator("article").all();
  await bench.getByLabel("Set 1 weight, kg").fill("60");
  await bench.getByLabel("Set 1 reps").fill("10");
  await bench.getByRole("button", { name: "Complete set 1" }).click();
  await squat.getByLabel("Set 1 weight, kg").fill("100");
  await squat.getByLabel("Set 1 reps").fill("5");
  await squat.getByRole("button", { name: "Complete set 1" }).click();
  await expect
    .poll(
      async () => (await storedSets(page)).filter((s) => s.completedAt).length,
    )
    .toBe(2);

  await finishButton(page).click();
  const summary = page.getByRole("dialog", { name: "Workout complete" });
  await expect(summary).toContainText("1,100 kg"); // 60×10 + 100×5
  await summary.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/history$/);

  const row = page.getByRole("link", {
    name: /2 exercises · 2 sets · 1,100 kg/,
  });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/history\/.+/);
  await expect(
    page.getByRole("heading", { level: 2, name: "Barbell Bench Press" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Back Squat" }),
  ).toBeVisible();
  await expect(page.getByText("1,100 kg")).toBeVisible();
});

test("reload mid-workout restores sets and the running rest timer", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-03-01T10:00:00Z") });
  await startWorkout(page);
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);
  await page.getByLabel("Set 1 weight, kg").fill("80");
  await page.getByLabel("Set 1 reps").fill("8");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  const timer = page.getByRole("timer", { name: "Rest remaining" });
  await expect(timer).toHaveText("1:30");
  await expect
    .poll(
      async () =>
        (await storedSessions(page)).find((s) => s.status === "active")
          ?.restTimer !== undefined,
    )
    .toBe(true);
  await page.clock.fastForward(20_000);
  await expect(timer).toHaveText("1:10");

  await page.reload();
  await expect(page.getByLabel("Set 1 weight, kg")).toHaveValue("80");
  await expect(page.getByLabel("Set 1 reps")).toHaveValue("8");
  await expect(
    page.getByRole("button", { name: "Set 1 completed, undo" }),
  ).toBeVisible();
  // The stored endsAt keeps counting down: still running (not "Rest done") and below the 1:30 start.
  await expect(timer).toHaveText(/^(0:\d\d|1:[0-2]\d)$/);
});

test("offline reload during an active workout keeps the session and keeps logging", async ({
  page,
  context,
}) => {
  await startWorkout(page);
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);
  await waitForServiceWorkerControl(page);

  await context.setOffline(true);
  await page.reload();
  await expect(finishButton(page)).toBeVisible();
  await expect(page.locator("article h2")).toHaveText("Barbell Bench Press");

  await page.getByLabel("Set 1 weight, kg").fill("70");
  await page.getByLabel("Set 1 reps").fill("6");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await expect
    .poll(async () => (await storedSets(page))[0])
    .toMatchObject({ weight: 70, reps: 6, completedAt: expect.any(String) });
  await context.setOffline(false);
});

test("discard removes the session and leaves History empty", async ({
  page,
}) => {
  await startWorkout(page);
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);
  await page.getByRole("button", { name: "Workout options" }).click();
  await page.getByRole("button", { name: "Discard workout…" }).click();
  await page
    .getByRole("button", { name: "Discard workout", exact: true })
    .click();
  await expect(page.getByText("Workout discarded")).toBeVisible();
  await expect.poll(async () => (await storedSessions(page)).length).toBe(0);

  await page.goto("/history");
  await expect(page.getByText("No workouts yet")).toBeVisible();
});

test("superset: labels A1/A2, rest starts only after the last member's set, unlink restores per-set rest", async ({
  page,
}) => {
  await startWorkout(page);
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);
  await addExercise(page, "barbell row", /Barbell Row/);
  const cards = page.getByRole("article");
  const timer = page.getByRole("timer", { name: "Rest remaining" });

  await cards.first().getByRole("button", { name: /Exercise options for/ }).click();
  await page.getByRole("button", { name: "Superset with next" }).click();
  await expect(cards.nth(0).getByText("A1")).toBeVisible();
  await expect(cards.nth(1).getByText("A2")).toBeVisible();

  await cards.nth(0).getByLabel("Set 1 weight, kg").fill("80");
  await cards.nth(0).getByLabel("Set 1 reps").fill("8");
  await cards.nth(0).getByRole("button", { name: "Complete set 1" }).click();
  await expect(page.getByRole("button", { name: "Start rest" })).toBeVisible();

  await cards.nth(1).getByLabel("Set 1 weight, kg").fill("60");
  await cards.nth(1).getByLabel("Set 1 reps").fill("10");
  await cards.nth(1).getByRole("button", { name: "Complete set 1" }).click();
  await expect(timer).toHaveText("1:30");

  await page.reload();
  await expect(cards.nth(0).getByText("A1")).toBeVisible();

  await cards.nth(1).getByRole("button", { name: /Exercise options for/ }).click();
  await page.getByRole("button", { name: "Remove from superset" }).click();
  await expect(page.getByText("A1")).toHaveCount(0);
  await expect(page.getByText("A2")).toHaveCount(0);
});

test("replace an exercise: completed sets stay with the original, the rest move", async ({
  page,
}) => {
  await startWorkout(page);
  await addExercise(page, "barbell bench press", /Barbell Bench Press/);
  const card = page.getByRole("article").first();
  await card.getByLabel("Set 1 weight, kg").fill("80");
  await card.getByLabel("Set 1 reps").fill("8");
  await card.getByRole("button", { name: "Complete set 1" }).click();
  await card.getByRole("button", { name: "Add set" }).click();

  await card.getByRole("button", { name: /Exercise options for/ }).click();
  await page.getByRole("button", { name: "Replace exercise" }).click();
  await page.getByRole("button", { name: "Browse all exercises" }).click();
  const picker = page.getByRole("dialog", { name: "Replace exercise" });
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill("back squat");
  await picker.getByRole("button", { name: /Back Squat/ }).first().click();
  await page.getByRole("button", { name: "Replace exercise", exact: true }).click();

  const names = () => page.locator("article h2").allTextContents();
  await expect.poll(names).toEqual(["Barbell Bench Press", "Back Squat"]);
  await expect
    .poll(async () =>
      (await storedSessions(page)).find((x) => x.status === "active")?.exercises.map((e) => [
        e.exerciseNameSnapshot,
        e.sets.length,
      ]),
    )
    .toEqual([
      ["Barbell Bench Press", 1],
      ["Back Squat", 1],
    ]);
  await page.reload();
  await expect.poll(names).toEqual(["Barbell Bench Press", "Back Squat"]);
});
