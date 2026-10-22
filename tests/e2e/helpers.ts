import { expect, type Page } from "@playwright/test";

type StoredSet = { weight?: number; reps?: number; completedAt?: string };
export type StoredSession = {
  status: string;
  exercises: { exerciseNameSnapshot: string; sets: StoredSet[] }[];
  restTimer?: unknown;
};

// Playwright gives every test a fresh browser context, so IndexedDB, caches and service workers start empty.

/** Reads the sessions straight from IndexedDB, i.e. what survives a reload (the UI updates before the write lands). */
export const storedSessions = (page: Page) =>
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

/** Sets of the stored active session (a reload can abort a write still in flight, so tests wait for it). */
export const storedSets = async (page: Page) =>
  (await storedSessions(page))
    .find((s) => s.status === "active")
    ?.exercises.flatMap((e) => e.sets) ?? [];

/** Resolves once the service worker is active and controls this page. */
export const waitForServiceWorkerControl = (page: Page) =>
  page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
    }
  });

export const finishButton = (page: Page) =>
  page.getByRole("button", { name: "Finish", exact: true });

export async function startWorkout(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(finishButton(page)).toBeVisible();
}

export async function addExercise(page: Page, query: string, name: RegExp) {
  await page.getByRole("button", { name: "Add exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill(query);
  await picker.getByRole("button", { name }).first().click();
  await picker.getByRole("button", { name: "Add 1 exercise" }).click();
  await expect(picker).toBeHidden(); // WebKit: typing during the close animation goes nowhere
}
