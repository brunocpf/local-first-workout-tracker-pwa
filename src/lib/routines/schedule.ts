import { db as defaultDb, type AppDB } from "#lib/storage/db";
import { currentTimeZone } from "#lib/time";
import type { Program, Routine } from "#lib/types";

/** Weekday names as stored in `Program.schedule` (the import format's lowercase English names), Monday first. */
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const weekdayLabel = (day: Weekday) =>
  day[0].toUpperCase() + day.slice(1);

/** Weekday of an instant on the device's calendar (or in `timeZone`), never UTC. */
export function weekdayOf(
  now: Date | number,
  timeZone: string = currentTimeZone(),
): Weekday {
  let name: string;
  try {
    name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" })
      .format(now)
      .toLowerCase();
  } catch {
    name = new Intl.DateTimeFormat("en-US", { weekday: "long" })
      .format(now)
      .toLowerCase();
  }
  return WEEKDAYS.find((d) => d === name) ?? "monday";
}

export type ScheduledRoutine = {
  program: Program;
  routine: Routine;
  day: Weekday;
};

/**
 * Routines that the programs schedule for the local weekday of `now`. Advisory: nothing is tracked as
 * missed. Entries whose routine is no longer in its program are skipped.
 */
export function todaysRoutines(
  programs: { program: Program; routines: Routine[] }[],
  now: Date | number = new Date(),
  timeZone?: string,
): ScheduledRoutine[] {
  const today = weekdayOf(now, timeZone);
  return programs.flatMap(({ program, routines }) =>
    (program.schedule?.days ?? [])
      .filter((d) => d.day === today)
      .flatMap((d) => {
        const routine = routines.find((r) => r.id === d.routineId);
        return routine ? [{ program, routine, day: today }] : [];
      }),
  );
}

/** Weekday -> routine id for the editor. If an import scheduled a day twice, the first routine is shown. */
export function scheduleByDay(
  program: Pick<Program, "schedule">,
): Partial<Record<Weekday, string>> {
  const out: Partial<Record<Weekday, string>> = {};
  for (const d of program.schedule?.days ?? []) {
    const day = WEEKDAYS.find((w) => w === d.day);
    if (day && out[day] === undefined) out[day] = d.routineId;
  }
  return out;
}

/**
 * Replaces the program's weekly schedule with one routine per day (Monday first). Only routines that belong
 * to the program are kept; an empty assignment removes the schedule.
 */
export async function setProgramSchedule(
  programId: string,
  assignments: Partial<Record<Weekday, string | undefined>>,
  database: AppDB = defaultDb,
): Promise<Program> {
  return database.transaction(
    "rw",
    database.programs,
    database.routines,
    async () => {
      const program = await database.programs.get(programId);
      if (!program) throw new Error(`Program ${programId} not found`);
      const members = new Set(
        (
          await database.routines.where("programId").equals(programId).toArray()
        ).map((r) => r.id),
      );
      const days = WEEKDAYS.flatMap((day) => {
        const routineId = assignments[day];
        return routineId && members.has(routineId) ? [{ day, routineId }] : [];
      });
      const { schedule: _schedule, ...rest } = program;
      const saved: Program = {
        ...rest,
        ...(days.length > 0 && { schedule: { type: "weekly" as const, days } }),
        updatedAt: new Date().toISOString(),
      };
      await database.programs.put(saved);
      return saved;
    },
  );
}
