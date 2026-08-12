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

function normalizeTimezone(value) {
  const text = String(value ?? "").trim();
  return text || "America/New_York";
}

function safeTimezone(value) {
  try {
    return new Timezone(normalizeTimezone(value));
  } catch (err) {
    return new Timezone("America/New_York");
  }
}

function parseDateTimeValue(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  try {
    return new DateTime(text);
  } catch (err) {
    return null;
  }
}

function nowDateTime() {
  return new DateTime();
}

function computeUserRolloverSchedule(user, referenceDateTime) {
  const currentDateTime = referenceDateTime || nowDateTime();
  const timezoneName = normalizeTimezone(user?.getString?.("timezone"));
  const timezone = safeTimezone(timezoneName);
  const localNow = currentDateTime.time().in(timezone);
  const todayISO = localNow.format("2006-01-02");
  const rolloverDateISO = localNow.addDate(0, 0, -1).format("2006-01-02");
  const nextMidnightUTC = new DateTime(`${todayISO} 00:00:00`, timezoneName).addDate(0, 0, 1);

  return {
    timezoneName,
    todayISO,
    rolloverDateISO,
    nextRolloverAtUTC: nextMidnightUTC,
  };
}

function canUsePerUserRolloverFields() {
  try {
    const collection = $app.findCollectionByNameOrId("users");
    const fields = collection && collection.fields ? collection.fields : null;
    return !!(fields && fields.getByName("timezone") && fields.getByName("next_rollover_at_utc"));
  } catch (err) {
    return false;
  }
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

function incrementUserCompletedDays(userId) {
  if (!userId) return false;
  try {
    const user = $app.findRecordById("users", userId);
    if (!user) {
      hookWarn("completion", "Could not find user to increment completed_days", {
        userId,
      });
      return false;
    }
    const nextValue = normalizeCompletedDays(user.getInt("completed_days")) + 1;
    user.set("completed_days", nextValue);
    $app.save(user);
    hookLog("completion", "Incremented user.completed_days on day completion", {
      userId,
      completedDays: nextValue,
    });
    return true;
  } catch (err) {
    hookWarn("completion", "Failed to increment user.completed_days", {
      userId,
      error: String(err ?? "unknown"),
    });
    return false;
  }
}

function snapshotUserRecord(user) {
  if (!user) return null;
  return {
    id: user.getString("id"),
    email: user.getString("email"),
    timezone: user.getString("timezone"),
    next_rollover_at_utc: user.getString("next_rollover_at_utc"),
    current_day: user.getInt("current_day"),
    completed_days: user.getInt("completed_days"),
    start_date: normalizeRecordDate(user.getString("start_date")),
  };
}

function processSingleUserRollover(user, rolloverDateISO, todayISO, summary, audit) {
  const userId = user.getString("id");
  const userBefore = snapshotUserRecord(user);
  const rolloverLog = findDailyLogByUserAndDate(userId, rolloverDateISO);

  let completedForRollover = false;
  if (rolloverLog) {
    const rolloverLogBefore = snapshotDailyLogRecord(rolloverLog);
    const eligibleForCompletion = isEligibleForCompletion(rolloverLog);

    if (!rolloverLog.getBool("completed") && eligibleForCompletion) {
      rolloverLog.set("completed", true);
      $app.save(rolloverLog);
      summary.autoCompletedLogs += 1;
      const rolloverLogAfter = snapshotDailyLogRecord(rolloverLog);
      audit.recordChange({
        userId,
        changeType: "auto_complete_log",
        entityType: "daily_log",
        entityId: rolloverLog.getString("id"),
        effectiveDate: normalizeRecordDate(rolloverLog.getString("date")),
        beforeData: rolloverLogBefore,
        afterData: rolloverLogAfter,
      });
    }

    completedForRollover = rolloverLog.getBool("completed") || eligibleForCompletion;
  }

  if (completedForRollover) {
    const nextCurrentDay = normalizeCurrentDay(user.getInt("current_day")) + 1;
    user.set("current_day", nextCurrentDay);
    $app.save(user);
    const userAfter = snapshotUserRecord(user);
    audit.recordChange({
      userId,
      changeType: "progress_user",
      entityType: "user",
      entityId: user.getString("id"),
      effectiveDate: todayISO,
      beforeData: userBefore,
      afterData: userAfter,
    });

    const beforeTodayLog = snapshotDailyLogRecord(findDailyLogByUserAndDate(userId, todayISO));
    syncCurrentDayLogDayNumber(userId, todayISO);
    const afterTodayLog = snapshotDailyLogRecord(findDailyLogByUserAndDate(userId, todayISO));
    if (JSON.stringify(beforeTodayLog ?? {}) !== JSON.stringify(afterTodayLog ?? {})) {
      audit.recordChange({
        userId,
        changeType: "sync_current_day_number",
        entityType: "daily_log",
        entityId: afterTodayLog?.id || beforeTodayLog?.id || "",
        effectiveDate: todayISO,
        beforeData: beforeTodayLog,
        afterData: afterTodayLog,
      });
    }

    summary.progressedUsers += 1;
    return;
  }

  const missed = ensureMissedDayLog(userId, rolloverDateISO);
  if (missed.created) {
    summary.createdMissedLogs += 1;
    const missedAfter = snapshotDailyLogRecord(missed.record);
    audit.recordChange({
      userId,
      changeType: "create_missed_log",
      entityType: "daily_log",
      entityId: missed.record.getString("id"),
      effectiveDate: rolloverDateISO,
      beforeData: null,
      afterData: missedAfter,
    });
  }

  user.set("current_day", 1);
  user.set("completed_days", 0);
  user.set("start_date", todayISO);
  $app.save(user);
  const userAfterReset = snapshotUserRecord(user);
  audit.recordChange({
    userId,
    changeType: "reset_user",
    entityType: "user",
    entityId: user.getString("id"),
    effectiveDate: todayISO,
    beforeData: userBefore,
    afterData: userAfterReset,
  });

  const beforeTodayLog = snapshotDailyLogRecord(findDailyLogByUserAndDate(userId, todayISO));
  syncCurrentDayLogDayNumber(userId, todayISO);
  const afterTodayLog = snapshotDailyLogRecord(findDailyLogByUserAndDate(userId, todayISO));
  if (JSON.stringify(beforeTodayLog ?? {}) !== JSON.stringify(afterTodayLog ?? {})) {
    audit.recordChange({
      userId,
      changeType: "sync_current_day_number",
      entityType: "daily_log",
      entityId: afterTodayLog?.id || beforeTodayLog?.id || "",
      effectiveDate: todayISO,
      beforeData: beforeTodayLog,
      afterData: afterTodayLog,
    });
  }

  summary.resetUsers += 1;
}

function snapshotDailyLogRecord(log) {
  if (!log) return null;
  return {
    id: log.getString("id"),
    user: log.getString("user"),
    date: normalizeRecordDate(log.getString("date")),
    day_number: log.getInt("day_number"),
    diet_ok: log.getBool("diet_ok"),
    workout_1: log.getBool("workout_1"),
    workout_2: log.getBool("workout_2"),
    water_ok: log.getBool("water_ok"),
    reading_ok: log.getBool("reading_ok"),
    progress_photo: log.getString("progress_photo"),
    completed: log.getBool("completed"),
  };
}

function computeDelta(beforeData, afterData) {
  const beforeValue = beforeData && typeof beforeData === "object" ? beforeData : {};
  const afterValue = afterData && typeof afterData === "object" ? afterData : {};
  const keys = new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)]);
  const delta = {};

  for (const key of keys) {
    const beforeItem = beforeValue[key];
    const afterItem = afterValue[key];
    if (beforeItem !== afterItem) {
      delta[key] = {
        before: beforeItem,
        after: afterItem,
      };
    }
  }

  return delta;
}

function createRolloverAuditRecorder(rolloverDateISO, todayISO, trigger) {
  const safeTrigger = String(trigger || "cron");
  const changes = [];

  function recordChange(change) {
    if (!change || typeof change !== "object") {
      return;
    }
    const beforeData = change.beforeData ?? null;
    const afterData = change.afterData ?? null;
    const delta = computeDelta(beforeData, afterData);
    changes.push({
      userId: String(change.userId || ""),
      changeType: String(change.changeType || "unknown"),
      entityType: String(change.entityType || "unknown"),
      entityId: String(change.entityId || ""),
      effectiveDate: String(change.effectiveDate || ""),
      beforeData,
      afterData,
      delta,
    });
  }

  function persist(summary) {
    try {
      const runCollection = $app.findCollectionByNameOrId("rollover_runs");
      const runRecord = new Record(runCollection);
      runRecord.set("trigger", safeTrigger);
      runRecord.set("rollover_date", rolloverDateISO);
      runRecord.set("today_date", todayISO);
      runRecord.set("summary", summary ?? {});
      runRecord.set("metadata", {
        capturedAtISO: new Date().toISOString(),
      });
      runRecord.set("touched_records_count", changes.length);
      $app.save(runRecord);

      const changesCollection = $app.findCollectionByNameOrId("rollover_run_changes");
      for (const change of changes) {
        const changeRecord = new Record(changesCollection);
        changeRecord.set("rollover_run", runRecord.getString("id"));
        changeRecord.set("user_id", change.userId);
        changeRecord.set("change_type", change.changeType);
        changeRecord.set("entity_type", change.entityType);
        changeRecord.set("entity_id", change.entityId);
        changeRecord.set("effective_date", change.effectiveDate);
        changeRecord.set("before_data", change.beforeData);
        changeRecord.set("after_data", change.afterData);
        changeRecord.set("delta", change.delta);
        $app.save(changeRecord);
      }

      return runRecord.getString("id");
    } catch (err) {
      hookWarn("rollover-audit", "Failed to persist rollover audit run", {
        trigger: safeTrigger,
        rolloverDateISO,
        todayISO,
        touchedRecords: changes.length,
        error: String(err ?? "unknown"),
      });
      return "";
    }
  }

  function count() {
    return changes.length;
  }

  return {
    count,
    recordChange,
    persist,
  };
}

function runRolloverForDate(rolloverDateISO, todayISO, options) {
  const opts = options && typeof options === "object" ? options : {};
  const auditTrigger = String(opts.trigger || "cron");
  const audit = createRolloverAuditRecorder(rolloverDateISO, todayISO, auditTrigger);
  const users = $app.findRecordsByFilter("users", "", "", 500, 0);
  const summary = {
    date: rolloverDateISO,
    trigger: auditTrigger,
    totalUsers: 0,
    progressedUsers: 0,
    resetUsers: 0,
    createdMissedLogs: 0,
    autoCompletedLogs: 0,
    touchedRecords: 0,
    auditRunId: "",
    failedUsers: 0,
    failures: [],
  };

  for (const user of users) {
    if (!user) continue;
    summary.totalUsers += 1;

    const userId = user.getString("id");
    try {
      processSingleUserRollover(user, rolloverDateISO, todayISO, summary, audit);
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

  summary.touchedRecords = audit.count();
  summary.auditRunId = audit.persist(summary);

  return summary;
}

function runScheduledRollover(options) {
  const opts = options && typeof options === "object" ? options : {};
  const auditTrigger = String(opts.trigger || "cron");
  const currentDateTime = nowDateTime();
  const nowUTC = currentDateTime.time().utc();
  const nowUTCDateISO = nowUTC.format("2006-01-02");

  if (!canUsePerUserRolloverFields()) {
    hookWarn("rollover-scheduled", "Per-user rollover fields missing; falling back to server-date rollover", {
      trigger: auditTrigger,
    });
    const yesterdayUTCDateISO = nowUTC.addDate(0, 0, -1).format("2006-01-02");
    return runRolloverForDate(yesterdayUTCDateISO, nowUTCDateISO, {
      trigger: `${auditTrigger}_fallback`,
    });
  }

  const audit = createRolloverAuditRecorder(nowUTCDateISO, nowUTCDateISO, `${auditTrigger}_scheduled`);
  const summary = {
    date: nowUTCDateISO,
    trigger: `${auditTrigger}_scheduled`,
    totalUsers: 0,
    progressedUsers: 0,
    resetUsers: 0,
    createdMissedLogs: 0,
    autoCompletedLogs: 0,
    touchedRecords: 0,
    auditRunId: "",
    failedUsers: 0,
    failures: [],
    dueUsers: 0,
    initializedSchedules: 0,
    advancedSchedules: 0,
  };

  const nowString = currentDateTime.string();
  const escapedNowString = String(nowString).replace(/"/g, "\\\"");
  const dueUsers = $app.findRecordsByFilter(
    "users",
    `next_rollover_at_utc != \"\" && next_rollover_at_utc <= \"${escapedNowString}\"`,
    "",
    5000,
    0,
  );

  summary.dueUsers = dueUsers.length;

  for (const user of dueUsers) {
    if (!user) continue;
    summary.totalUsers += 1;

    const userId = user.getString("id");
    try {
      const schedule = computeUserRolloverSchedule(user, currentDateTime);
      processSingleUserRollover(user, schedule.rolloverDateISO, schedule.todayISO, summary, audit);

      const beforeSchedule = snapshotUserRecord(user);
      user.set("timezone", schedule.timezoneName);
      user.set("next_rollover_at_utc", schedule.nextRolloverAtUTC.string());
      $app.save(user);
      const afterSchedule = snapshotUserRecord(user);
      audit.recordChange({
        userId,
        changeType: "advance_user_rollover_schedule",
        entityType: "user",
        entityId: userId,
        effectiveDate: schedule.todayISO,
        beforeData: beforeSchedule,
        afterData: afterSchedule,
      });
      summary.advancedSchedules += 1;
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

  // Backfill missing schedule pointers for users that predate the new fields.
  const usersWithMissingSchedule = $app.findRecordsByFilter(
    "users",
    `next_rollover_at_utc = \"\"`,
    "",
    5000,
    0,
  );

  for (const user of usersWithMissingSchedule) {
    if (!user) continue;
    try {
      const schedule = computeUserRolloverSchedule(user, currentDateTime);
      user.set("timezone", schedule.timezoneName);
      user.set("next_rollover_at_utc", schedule.nextRolloverAtUTC.string());
      $app.save(user);
      summary.initializedSchedules += 1;
    } catch (err) {
      summary.failedUsers += 1;
      summary.failures.push({
        userId: user.getString("id"),
        email: user.getString("email"),
        currentDay: user.getInt("current_day"),
        completedDays: user.getInt("completed_days"),
        error: err ? String(err) : "Unknown error",
      });
    }
  }

  summary.touchedRecords = audit.count();
  summary.auditRunId = audit.persist(summary);

  return summary;
}

module.exports = {
  canUseDayNumberField,
  canUsePerUserRolloverFields,
  computeUserRolloverSchedule,
  ensureMissedDayLog,
  formatDate,
  findDailyLogByUserAndDate,
  hookLog,
  hookWarn,
  incrementUserCompletedDays,
  isEligibleForCompletion,
  normalizeCompletedDays,
  normalizeCurrentDay,
  normalizeDayNumber,
  normalizeRecordDate,
  normalizeTimezone,
  offsetISODate,
  resolveChallengeDayNumber,
  runRolloverForDate,
  runScheduledRollover,
  syncCurrentDayLogDayNumber,
  toISODate,
};