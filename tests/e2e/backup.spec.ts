import { expect, test, type Page } from "@playwright/test";

const NOW = new Date("2026-06-15T12:00:00Z");
const DAY_MS = 86_400_000;
const ago = (days: number) =>
  new Date(NOW.getTime() - days * DAY_MS).toISOString();

type Seed = { lastBackupAt?: string; sessionDaysAgo: number };

/** Sharing is stubbed out so every project takes the download path (mobile projects would otherwise try navigator.share). */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "share", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(Navigator.prototype, "canShare", {
      value: undefined,
      configurable: true,
    });
  });
  await page.clock.install({ time: NOW });
});

/** Writes user data straight into IndexedDB (the app has created the database by the time /settings has rendered). */
async function seed(page: Page, { lastBackupAt, sessionDaysAgo }: Seed) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const startedAt = ago(sessionDaysAgo);
  const endedAt = new Date(Date.parse(startedAt) + 3_600_000).toISOString();
  await page.evaluate(
    ({ startedAt, endedAt, lastBackupAt }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("workout-tracker");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(
            ["exercises", "routines", "sessions", "settings"],
            "readwrite",
          );
          tx.objectStore("exercises").put({
            id: "custom-zzyzx",
            name: "Zzyzx Press",
            aliases: [],
            primaryMuscles: ["chest"],
            secondaryMuscles: [],
            equipment: ["machine"],
            exerciseType: "weighted_reps",
            isCustom: true,
            createdAt: startedAt,
            updatedAt: startedAt,
          });
          tx.objectStore("routines").put({
            id: "routine-1",
            name: "Backup Routine",
            exercises: [
              {
                id: "re-1",
                exerciseId: "custom-zzyzx",
                prescribedSets: [
                  {
                    id: "ps-1",
                    type: "normal",
                    repRange: [8, 10],
                    targetWeight: 50,
                  },
                ],
              },
            ],
            createdAt: startedAt,
            updatedAt: startedAt,
          });
          tx.objectStore("sessions").put({
            id: "session-1",
            name: "Backup Session",
            status: "completed",
            startedAt,
            endedAt,
            timeZone: "UTC",
            exercises: [
              {
                id: "se-1",
                exerciseId: "custom-zzyzx",
                exerciseNameSnapshot: "Zzyzx Press",
                exerciseTypeSnapshot: "weighted_reps",
                sets: [
                  {
                    id: "set-1",
                    type: "normal",
                    weight: 50,
                    reps: 8,
                    completedAt: endedAt,
                  },
                ],
              },
            ],
            exerciseIds: ["custom-zzyzx"],
            createdAt: startedAt,
            updatedAt: endedAt,
          });
          tx.objectStore("settings").put({
            key: "settings",
            weightUnit: "lb",
            defaultRestSeconds: 77,
            autoStartRestTimer: true,
            previousValuesMode: "exercise",
            weekStartsOn: 1,
            theme: "dark",
            ...(lastBackupAt ? { lastBackupAt } : {}),
          });
          tx.oncomplete = () => {
            idb.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { startedAt, endedAt, lastBackupAt },
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

/** Deletes the whole IndexedDB database, like "clear site data". The app closes its connection on versionchange. */
async function clearStorage(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase("workout-tracker");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

async function exportBackup(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^workout-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const path = test.info().outputPath("backup.json");
  await file.saveAs(path);
  return path;
}

test("export → clear storage → restore brings everything back", async ({
  page,
}) => {
  await seed(page, { sessionDaysAgo: 2 });
  const path = await exportBackup(page);
  await expect(page.getByTestId("export-note")).toContainText(
    "workout-backup-",
  );

  await clearStorage(page);
  // Defaults again after the wipe.
  await expect(page.getByRole("radio", { name: "kg" })).toBeChecked();
  await page.goto("/history");
  await expect(page.getByText("Backup Session")).toHaveCount(0);

  await page.goto("/settings");
  await page.getByTestId("restore-input").setInputFiles(path);
  const dialog = page.getByRole("dialog", { name: "Replace all data?" });
  await expect(dialog).toContainText("1 workout,");
  await dialog.getByRole("button", { name: "Replace all data" }).click();
  await expect(page.getByText("Backup restored")).toBeVisible();

  // Survives a reload: sessions, routines, custom exercises and settings.
  await page.reload();
  await expect(page.getByRole("radio", { name: "lb" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(page.getByLabel("Default rest")).toHaveValue("77");
  await page.goto("/history");
  await expect(page.getByText("Backup Session")).toBeVisible();
  await page.goto("/routines");
  await expect(page.getByText("Backup Routine")).toBeVisible();
  await page.goto("/exercises");
  await page.getByRole("searchbox").fill("Zzyzx");
  await expect(page.getByText("Zzyzx Press")).toBeVisible();
});

test("cancelling the confirmation leaves data untouched", async ({ page }) => {
  await seed(page, { sessionDaysAgo: 2 });
  const path = await exportBackup(page);
  await page.getByTestId("restore-input").setInputFiles(path);
  const dialog = page.getByRole("dialog", { name: "Replace all data?" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/history");
  await expect(page.getByText("Backup Session")).toBeVisible();
});

test("an invalid file shows an error and changes nothing", async ({ page }) => {
  await seed(page, { sessionDaysAgo: 2 });
  const restore = page.getByTestId("restore-input");

  await restore.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ not json"),
  });
  await expect(page.getByRole("alert")).toContainText("Nothing was changed");

  await restore.setInputFiles({
    name: "wrong.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ backupVersion: 1, data: {} })),
  });
  await expect(page.getByRole("alert")).toContainText("Nothing was changed");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("radio", { name: "lb" })).toBeChecked();
  await page.goto("/history");
  await expect(page.getByText("Backup Session")).toBeVisible();
});

test("restore is blocked during an active workout", async ({ page }) => {
  await seed(page, { sessionDaysAgo: 2 });
  const path = await exportBackup(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(
    page.getByRole("button", { name: "Finish", exact: true }),
  ).toBeVisible();

  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "Restore from backup…" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Finish or discard your current workout before restoring."),
  ).toBeVisible();

  // Even if a file reaches the (hidden) input, the restore itself refuses.
  await page.getByTestId("restore-input").setInputFiles(path);
  await expect(page.getByRole("alert")).toContainText(
    "A workout is in progress",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("backup reminder", () => {
  test("appears when the last backup is too old, hides on /workout and during a workout", async ({
    page,
  }) => {
    await seed(page, { lastBackupAt: ago(20), sessionDaysAgo: 5 });

    await page.goto("/");
    await expect(page.getByTestId("backup-reminder")).toBeVisible();

    await page.getByRole("button", { name: "Later" }).click();
    await expect(page.getByTestId("backup-reminder")).toBeHidden();

    // A fresh load shows it again; starting a workout hides it everywhere.
    await page.goto("/");
    await expect(page.getByTestId("backup-reminder")).toBeVisible();
    await page.getByRole("button", { name: "Start workout" }).click();
    await expect(page).toHaveURL(/\/workout$/);
    await expect(
      page.getByRole("button", { name: "Finish", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("backup-reminder")).toHaveCount(0);

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page.getByText("Workout in progress")).toBeVisible();
    await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  });

  test("backing up from the banner dismisses it", async ({ page }) => {
    await seed(page, { lastBackupAt: ago(20), sessionDaysAgo: 5 });
    await page.goto("/");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Back up now" }).click();
    await download;
    await expect(page.getByTestId("backup-reminder")).toBeHidden();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Start workout" }),
    ).toBeVisible();
    await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  });

  test("is not shown for a recent backup", async ({ page }) => {
    await seed(page, { lastBackupAt: ago(3), sessionDaysAgo: 1 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Start workout" }),
    ).toBeVisible();
    await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  });

  test("is not shown when both rules are switched off", async ({ page }) => {
    await seed(page, { lastBackupAt: ago(20), sessionDaysAgo: 5 });
    for (const label of ["Remind after (days)", "Remind after (workouts)"]) {
      const field = page.getByLabel(label);
      await field.fill("0");
      await field.blur();
    }
    await page.reload();
    await expect(page.getByLabel("Remind after (days)")).toHaveValue("0");
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Start workout" }),
    ).toBeVisible();
    await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  });
});
