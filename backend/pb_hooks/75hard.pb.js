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

function normalizeDayNumber(value) {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function normalizeRecordDate(value) {
  const text = String(value ?? "").trim();
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function offsetISODate(isoDate, days) {
  const normalized = normalizeRecordDate(isoDate);
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return normalized;
  }

  date.setDate(date.getDate() + days);
  return toISODate(date);
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
    try {
      const logs = $app.findRecordsByFilter("daily_logs", `user = \"${escapedUser}\"`, "", 5000, 0);
      for (const log of logs) {
        if (!log) continue;
        if (normalizeRecordDate(log.getString("date")) === isoDate) {
          return log;
        }
      }
      return null;
    } catch (fallbackErr) {
      return null;
    }
  }
}

function resolveChallengeDayNumber(userId, isoDate) {
  const previousDate = offsetISODate(isoDate, -1);
  const previousLog = findDailyLogByUserAndDate(userId, previousDate);
  if (!previousLog || !previousLog.getBool("completed")) {
    return 1;
  }

  return normalizeDayNumber(previousLog.getInt("day_number")) + 1;
}

function syncCurrentDayLogDayNumber(userId, isoDate) {
  const log = findDailyLogByUserAndDate(userId, isoDate);
  if (!log) {
    return false;
  }

  const nextDayNumber = resolveChallengeDayNumber(userId, isoDate);
  if (normalizeDayNumber(log.getInt("day_number")) === nextDayNumber) {
    return false;
  }

  log.set("day_number", nextDayNumber);
  $app.save(log);
  return true;
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
  log.set("day_number", resolveChallengeDayNumber(userId, isoDate));
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
    failedUsers: 0,
    failures: [],
  };

  for (const user of users) {
    if (!user) continue;
    summary.totalUsers += 1;

    const userId = user.getString("id");
    try {
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
    } catch (err) {
      summary.failedUsers += 1;
      summary.failures.push({
        userId,
        email: user.getString("email"),
        currentDay: user.getInt("current_day"),
        completedDays: user.getInt("completed_days"),
        error: err ? String(err) : "Unknown error",
      });
    }
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

  const userId = e.record.getString("user");
  const dateISO = e.record.getString("date");
  if (userId && dateISO) {
    e.record.set("day_number", resolveChallengeDayNumber(userId, dateISO));
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

  const userId = e.record.getString("user");
  const dateISO = e.record.getString("date");
  if (userId && dateISO) {
    e.record.set("day_number", resolveChallengeDayNumber(userId, dateISO));
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
  const normalizeCurrentDayLocal = (value) => {
    const parsed = Number(value ?? 1);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.floor(parsed));
  };

  const normalizeCompletedDaysLocal = (value) => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
  };

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const findDailyLogByUserAndDateLocal = (userId, isoDate) => {
    try {
      return findDailyLogByUserAndDate(userId, isoDate);
    } catch (err) {
      return null;
    }
  };

  const ensureMissedDayLogLocal = (userId, isoDate) => {
    const existing = findDailyLogByUserAndDateLocal(userId, isoDate);
    if (existing) {
      return { record: existing, created: false };
    }

    const isUniqueConstraintError = (err) => {
      const message = String(err ?? "").toLowerCase();
      return (
        message.includes("must be unique") ||
        message.includes("already exists") ||
        message.includes("duplicate") ||
        message.includes("not_unique") ||
        message.includes("unique constraint")
      );
    };

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
    log.set("day_number", resolveChallengeDayNumber(userId, isoDate));
    try {
      $app.save(log);
      return { record: log, created: true };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const conflicted = findDailyLogByUserAndDateLocal(userId, isoDate);
        if (conflicted) {
          return { record: conflicted, created: false };
        }
      }
      throw err;
    }
  };

  const runRolloverForDateLocal = (rolloverDateISO, todayISO) => {
    const users = $app.findRecordsByFilter("users", "", "", 500, 0);
    const summary = {
      date: rolloverDateISO,
      totalUsers: 0,
      progressedUsers: 0,
      resetUsers: 0,
      createdMissedLogs: 0,
      autoCompletedLogs: 0,
      failedUsers: 0,
      failures: [],
    };

    for (const user of users) {
      if (!user) continue;
      summary.totalUsers += 1;

      const userId = user.getString("id");
      try {
        const rolloverLog = findDailyLogByUserAndDateLocal(userId, rolloverDateISO);

        let completedForRollover = false;
        if (rolloverLog) {
          const eligibleForCompletion =
            rolloverLog.getBool("diet_ok") &&
            rolloverLog.getBool("workout_1") &&
            rolloverLog.getBool("workout_2") &&
            rolloverLog.getBool("water_ok") &&
            rolloverLog.getBool("reading_ok") &&
            !!rolloverLog.getString("progress_photo");

          if (!rolloverLog.getBool("completed") && eligibleForCompletion) {
            rolloverLog.set("completed", true);
            $app.save(rolloverLog);
            summary.autoCompletedLogs += 1;
          }

          completedForRollover = rolloverLog.getBool("completed") || eligibleForCompletion;
        }

        if (completedForRollover) {
          const nextCurrentDay = normalizeCurrentDayLocal(user.getInt("current_day")) + 1;
          const nextCompletedDays =
            normalizeCompletedDaysLocal(user.getInt("completed_days")) + 1;

          user.set("current_day", nextCurrentDay);
          user.set("completed_days", nextCompletedDays);
          $app.save(user);
          syncCurrentDayLogDayNumber(userId, todayISO);
          summary.progressedUsers += 1;
          continue;
        }

        const missed = ensureMissedDayLogLocal(userId, rolloverDateISO);
        if (missed.created) {
          summary.createdMissedLogs += 1;
        }

        user.set("current_day", 1);
        user.set("completed_days", 0);
        user.set("start_date", todayISO);
        $app.save(user);
        syncCurrentDayLogDayNumber(userId, todayISO);
        summary.resetUsers += 1;
      } catch (err) {
        summary.failedUsers += 1;
        summary.failures.push({
          userId,
          email: user.getString("email"),
          currentDay: user.getInt("current_day"),
          completedDays: user.getInt("completed_days"),
          error: err ? String(err) : "Unknown error",
        });
      }
    }

    return summary;
  };

  const now = new Date();
  const todayDate = new Date(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

  const today = formatDate(todayDate);
  const yesterday = formatDate(yesterdayDate);
  const summary = runRolloverForDateLocal(yesterday, today);
  if (summary.failedUsers > 0) {
    console.error("[rollover-challenge-progress] Completed with failures", summary);
  }
});

routerAdd(
  "POST",
  "/api/admin/rollover",
  (e) => {
    try {
      const normalizeCurrentDayLocal = (value) => {
        const parsed = Number(value ?? 1);
        if (!Number.isFinite(parsed)) return 1;
        return Math.max(1, Math.floor(parsed));
      };

      const normalizeCompletedDaysLocal = (value) => {
        const parsed = Number(value ?? 0);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(0, Math.floor(parsed));
      };

      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const findDailyLogByUserAndDateLocal = (userId, isoDate) => {
        try {
          return findDailyLogByUserAndDate(userId, isoDate);
        } catch (err) {
          return null;
        }
      };

      const ensureMissedDayLogLocal = (userId, isoDate) => {
        const existing = findDailyLogByUserAndDateLocal(userId, isoDate);
        if (existing) {
          return { record: existing, created: false };
        }

        const isUniqueConstraintError = (err) => {
          const message = String(err ?? "").toLowerCase();
          return (
            message.includes("must be unique") ||
            message.includes("already exists") ||
            message.includes("duplicate") ||
            message.includes("not_unique") ||
            message.includes("unique constraint")
          );
        };

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
        log.set("day_number", resolveChallengeDayNumber(userId, isoDate));
        try {
          $app.save(log);
          return { record: log, created: true };
        } catch (err) {
          if (isUniqueConstraintError(err)) {
            const conflicted = findDailyLogByUserAndDateLocal(userId, isoDate);
            if (conflicted) {
              return { record: conflicted, created: false };
            }
          }
          throw err;
        }
      };

      const runRolloverForDateLocal = (rolloverDateISO, todayISO) => {
        const users = $app.findRecordsByFilter("users", "", "", 500, 0);
        const summary = {
          date: rolloverDateISO,
          totalUsers: 0,
          progressedUsers: 0,
          resetUsers: 0,
          createdMissedLogs: 0,
          autoCompletedLogs: 0,
          failedUsers: 0,
          failures: [],
        };

        for (const user of users) {
          if (!user) continue;
          summary.totalUsers += 1;

          const userId = user.getString("id");
          try {
            const rolloverLog = findDailyLogByUserAndDateLocal(userId, rolloverDateISO);

            let completedForRollover = false;
            if (rolloverLog) {
              const eligibleForCompletion =
                rolloverLog.getBool("diet_ok") &&
                rolloverLog.getBool("workout_1") &&
                rolloverLog.getBool("workout_2") &&
                rolloverLog.getBool("water_ok") &&
                rolloverLog.getBool("reading_ok") &&
                !!rolloverLog.getString("progress_photo");

              if (!rolloverLog.getBool("completed") && eligibleForCompletion) {
                rolloverLog.set("completed", true);
                $app.save(rolloverLog);
                summary.autoCompletedLogs += 1;
              }

              completedForRollover = rolloverLog.getBool("completed") || eligibleForCompletion;
            }

            if (completedForRollover) {
              const nextCurrentDay = normalizeCurrentDayLocal(user.getInt("current_day")) + 1;
              const nextCompletedDays =
                normalizeCompletedDaysLocal(user.getInt("completed_days")) + 1;

              user.set("current_day", nextCurrentDay);
              user.set("completed_days", nextCompletedDays);
              $app.save(user);
              syncCurrentDayLogDayNumber(userId, todayISO);
              summary.progressedUsers += 1;
              continue;
            }

            const missed = ensureMissedDayLogLocal(userId, rolloverDateISO);
            if (missed.created) {
              summary.createdMissedLogs += 1;
            }

            user.set("current_day", 1);
            user.set("completed_days", 0);
            user.set("start_date", todayISO);
            $app.save(user);
            syncCurrentDayLogDayNumber(userId, todayISO);
            summary.resetUsers += 1;
          } catch (err) {
            summary.failedUsers += 1;
            summary.failures.push({
              userId,
              email: user.getString("email"),
              currentDay: user.getInt("current_day"),
              completedDays: user.getInt("completed_days"),
              error: err ? String(err) : "Unknown error",
            });
          }
        }

        return summary;
      };

      const now = new Date();
      const todayDate = new Date(now);
      const rolloverDateObj = new Date(now);
      rolloverDateObj.setDate(rolloverDateObj.getDate() - 1);

      const today = formatDate(todayDate);
      const rolloverDate = formatDate(rolloverDateObj);
      const summary = runRolloverForDateLocal(rolloverDate, today);
      const ok = summary.failedUsers === 0;
      return e.json(ok ? 200 : 207, {
        ok,
        message: ok
          ? "Manual rollover executed."
          : "Manual rollover executed with some user failures.",
        summary,
      });
    } catch (err) {
      const details = err ? String(err) : "Unknown error";
      console.error("[manual-rollover] Unhandled failure", details);
      return e.json(500, {
        ok: false,
        message: "Manual rollover failed.",
        details,
      });
    }
  },
  $apis.requireSuperuserAuth(),
);
