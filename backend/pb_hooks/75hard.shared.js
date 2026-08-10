function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  return toISODate(date);
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

function hookLog(scope, message, payload) {
  try {
    const suffix = payload ? ` ${JSON.stringify(payload)}` : "";
    console.log(`[75hard][${scope}] ${message}${suffix}`);
  } catch (err) {
    console.log(`[75hard][${scope}] ${message}`);
  }
}

function hookWarn(scope, message, payload) {
  try {
    const suffix = payload ? ` ${JSON.stringify(payload)}` : "";
    console.warn(`[75hard][${scope}] ${message}${suffix}`);
  } catch (err) {
    console.warn(`[75hard][${scope}] ${message}`);
  }
}

function canUseDayNumberField() {
  try {
    const collection = $app.findCollectionByNameOrId("daily_logs");
    const fields = collection && collection.fields ? collection.fields : null;
    const supported = !!(fields && fields.getByName("day_number"));
    hookLog("schema", "Resolved day_number field support", {
      supported,
    });
    return supported;
  } catch (err) {
    hookWarn("schema", "Could not resolve day_number field support", {
      error: String(err ?? "unknown"),
    });
    return false;
  }
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
    hookLog("day-number", "Resolved to reset day 1", {
      userId,
      isoDate,
      previousDate,
      hasPreviousLog: !!previousLog,
      previousCompleted: !!(previousLog && previousLog.getBool("completed")),
    });
    return 1;
  }

  const previousDayNumber = normalizeDayNumber(previousLog.getInt("day_number"));
  const nextDayNumber = previousDayNumber + 1;
  hookLog("day-number", "Resolved incremented day number", {
    userId,
    isoDate,
    previousDate,
    previousDayNumber,
    nextDayNumber,
  });
  return nextDayNumber;
}

function syncCurrentDayLogDayNumber(userId, isoDate) {
  if (!canUseDayNumberField()) {
    return false;
  }

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

function isUniqueConstraintError(err) {
  const message = String(err ?? "").toLowerCase();
  return (
    message.includes("must be unique") ||
    message.includes("already exists") ||
    message.includes("duplicate") ||
    message.includes("not_unique") ||
    message.includes("unique constraint")
  );
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
  if (canUseDayNumberField()) {
    log.set("day_number", resolveChallengeDayNumber(userId, isoDate));
  }

  try {
    $app.save(log);
    return { record: log, created: true };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const conflicted = findDailyLogByUserAndDate(userId, isoDate);
      if (conflicted) {
        return { record: conflicted, created: false };
      }
    }
    throw err;
  }
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

function runRolloverForDate(rolloverDateISO, todayISO) {
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
      const rolloverLog = findDailyLogByUserAndDate(userId, rolloverDateISO);

      let completedForRollover = false;
      if (rolloverLog) {
        const eligibleForCompletion = isEligibleForCompletion(rolloverLog);

        if (!rolloverLog.getBool("completed") && eligibleForCompletion) {
          rolloverLog.set("completed", true);
          $app.save(rolloverLog);
          summary.autoCompletedLogs += 1;
        }

        completedForRollover = rolloverLog.getBool("completed") || eligibleForCompletion;
      }

      if (completedForRollover) {
        const nextCurrentDay = normalizeCurrentDay(user.getInt("current_day")) + 1;
        const nextCompletedDays = normalizeCompletedDays(user.getInt("completed_days")) + 1;

        user.set("current_day", nextCurrentDay);
        user.set("completed_days", nextCompletedDays);
        $app.save(user);
        syncCurrentDayLogDayNumber(userId, todayISO);
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
}

module.exports = {
  canUseDayNumberField,
  ensureMissedDayLog,
  formatDate,
  findDailyLogByUserAndDate,
  hookLog,
  hookWarn,
  isEligibleForCompletion,
  normalizeCompletedDays,
  normalizeCurrentDay,
  normalizeDayNumber,
  normalizeRecordDate,
  offsetISODate,
  resolveChallengeDayNumber,
  runRolloverForDate,
  syncCurrentDayLogDayNumber,
  toISODate,
};