/// <reference path="../pb_data/types.d.ts" />

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(days) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return toISODate(now);
}

function normalizeCurrentDay(value) {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function normalizeCompletedDays(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function findDailyLogByUserAndDate(userId, isoDate) {
  const escapedUser = String(userId).replace(/"/g, "\\\"");
  const escapedDate = String(isoDate).replace(/"/g, "\\\"");

  try {
    return $app.findFirstRecordByFilter(
      "daily_logs",
      `user = \"${escapedUser}\" && date = \"${escapedDate}\"`,
    );
  } catch (err) {
    return null;
  }
}

function ensureMissedDayLog(userId, isoDate) {
  const existing = findDailyLogByUserAndDate(userId, isoDate);
  if (existing) {
    return { record: existing, created: false };
  }

  const logsCollection = $app.findCollectionByNameOrId("daily_logs");
  const log = new Record(logsCollection);
  log.set("user", userId);
  log.set("date", isoDate);
  log.set("diet_ok", false);
  log.set("workout_1", false);
  log.set("workout_2", false);
  log.set("water_ok", false);
  log.set("reading_ok", false);
  log.set("completed", false);
  $app.save(log);
  return { record: log, created: true };
}

function runRolloverForDate(rolloverDateISO, todayISO) {
  const users = $app.findRecordsByFilter("users", "", "", 500, 0);
  const summary = {
    date: rolloverDateISO,
    totalUsers: 0,
    progressedUsers: 0,
    resetUsers: 0,
    createdMissedLogs: 0,
  };

  for (const user of users) {
    if (!user) continue;
    summary.totalUsers += 1;

    const userId = user.getString("id");
    const rolloverLog = findDailyLogByUserAndDate(userId, rolloverDateISO);

    if (rolloverLog && rolloverLog.getBool("completed")) {
      const nextCurrentDay = normalizeCurrentDay(user.getInt("current_day")) + 1;
      const nextCompletedDays = normalizeCompletedDays(user.getInt("completed_days")) + 1;

      user.set("current_day", nextCurrentDay);
      user.set("completed_days", nextCompletedDays);
      $app.save(user);
      summary.progressedUsers += 1;
      continue;
    }

    const missed = ensureMissedDayLog(userId, rolloverDateISO);
    if (missed.created) {
      summary.createdMissedLogs += 1;
    }

    user.set("current_day", 1);
    user.set("completed_days", 0);
    user.set("start_date", todayISO);
    $app.save(user);
    summary.resetUsers += 1;
  }

  return summary;
}

function isEligibleForCompletion(record) {
  return (
    record.getBool("diet_ok") &&
    record.getBool("workout_1") &&
    record.getBool("workout_2") &&
    record.getBool("water_ok") &&
    record.getBool("reading_ok") &&
    !!record.getString("progress_photo")
  );
}

onRecordCreateRequest((e) => {
  if (!e.record) {
    return e.next();
  }

  if (e.record.getBool("completed") && !isEligibleForCompletion(e.record)) {
    throw new BadRequestError(
      "Cannot submit day until all tasks are completed and a progress photo is uploaded.",
      null,
    );
  }

  return e.next();
}, "daily_logs");

onRecordUpdateRequest((e) => {
  if (!e.record) {
    return e.next();
  }

  const original = e.record.original();
  if (original.getBool("completed")) {
    throw new BadRequestError(
      "This day is already submitted and cannot be edited.",
      null,
    );
  }

  if (e.record.getBool("completed") && !isEligibleForCompletion(e.record)) {
    throw new BadRequestError(
      "Cannot submit day until all tasks are completed and a progress photo is uploaded.",
      null,
    );
  }

  return e.next();
}, "daily_logs");

cronAdd("rollover-challenge-progress", "0 0 * * *", () => {
  const yesterday = dateOffset(-1);
  const today = dateOffset(0);
  runRolloverForDate(yesterday, today);
});

routerAdd(
  "POST",
  "/api/admin/rollover",
  (e) => {
    const rolloverDate = dateOffset(-1);
    const today = dateOffset(0);
    const summary = runRolloverForDate(rolloverDate, today);
    return e.json(200, {
      ok: true,
      message: "Manual rollover executed.",
      summary,
    });
  },
  $apis.requireSuperuserAuth(),
);
