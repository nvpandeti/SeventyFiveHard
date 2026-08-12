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
    const dt = new DateTime(text);
    if (dt && typeof dt.isZero === "function" && dt.isZero()) {
      return null;
    }
    return dt;
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

function initializeUserRolloverSchedule(user, referenceDateTime) {
  if (!user || !canUsePerUserRolloverFields()) {
    return false;
  }

  const schedule = computeUserRolloverSchedule(user, referenceDateTime);
  const currentTimezone = normalizeTimezone(user.getString("timezone"));
  const currentNext = String(user.getString("next_rollover_at_utc") || "");
  const nextValue = schedule.nextRolloverAtUTC.string();

  if (currentTimezone === schedule.timezoneName && currentNext === nextValue) {
    return false;
  }

  user.set("timezone", schedule.timezoneName);
  user.set("next_rollover_at_utc", nextValue);
  $app.save(user);
  return true;
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

let __dayNumberFieldCache = { value: null, expiresAt: 0 };
function canUseDayNumberField() {
  const now = Date.now();
  if (__dayNumberFieldCache.value !== null && __dayNumberFieldCache.expiresAt > now) {
    return __dayNumberFieldCache.value;
  }
  try {
    const collection = $app.findCollectionByNameOrId("daily_logs");
    const fields = collection && collection.fields ? collection.fields : null;
    const supported = !!(fields && fields.getByName("day_number"));
    __dayNumberFieldCache = { value: supported, expiresAt: now + 60000 };
    return supported;
  } catch (err) {
    hookWarn("schema", "Could not resolve day_number field support", {
      error: String(err ?? "unknown"),
    });
    __dayNumberFieldCache = { value: false, expiresAt: now + 5000 };
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

function syncCurrentDayLogDayNumberDetails(userId, isoDate, existingLog) {
  if (!canUseDayNumberField()) {
    return { changed: false, beforeData: null, afterData: null };
  }

  const log = existingLog || findDailyLogByUserAndDate(userId, isoDate);
  if (!log) {
    return { changed: false, beforeData: null, afterData: null };
  }

  const beforeData = snapshotDailyLogRecord(log);
  const nextDayNumber = resolveChallengeDayNumber(userId, isoDate);
  if (normalizeDayNumber(log.getInt("day_number")) === nextDayNumber) {
    return { changed: false, beforeData, afterData: beforeData };
  }

  log.set("day_number", nextDayNumber);
  $app.save(log);
  return {
    changed: true,
    beforeData,
    afterData: snapshotDailyLogRecord(log),
  };
}

function syncCurrentDayLogDayNumber(userId, isoDate) {
  return syncCurrentDayLogDayNumberDetails(userId, isoDate, null).changed;
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

function processSingleUserRollover(userParam, rolloverDateISO, todayISO, summary, audit) {
  let user = userParam;
  const userId = user.getString("id");
  const userBefore = snapshotUserRecord(user);
  const rolloverLog = findDailyLogByUserAndDate(userId, rolloverDateISO);

  let completedForRollover = false;
  let logSaveTriggeredHook = false;
  if (rolloverLog) {
    const rolloverLogBefore = snapshotDailyLogRecord(rolloverLog);
    const eligibleForCompletion = isEligibleForCompletion(rolloverLog);

    if (!rolloverLog.getBool("completed") && eligibleForCompletion) {
      rolloverLog.set("completed", true);
      $app.save(rolloverLog);
      // The daily_logs after-update hook increments user.completed_days in the
      // database. Our in-memory `user` is now stale; the reload below picks up
      // the incremented value so we do not clobber it when we next save `user`.
      logSaveTriggeredHook = true;
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

  if (logSaveTriggeredHook) {
    const refreshed = $app.findRecordById("users", userId);
    if (refreshed) {
      user = refreshed;
    }
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

    const todayLog = findDailyLogByUserAndDate(userId, todayISO);
    const syncResult = syncCurrentDayLogDayNumberDetails(userId, todayISO, todayLog);
    if (syncResult.changed) {
      audit.recordChange({
        userId,
        changeType: "sync_current_day_number",
        entityType: "daily_log",
        entityId: syncResult.afterData?.id || syncResult.beforeData?.id || "",
        effectiveDate: todayISO,
        beforeData: syncResult.beforeData,
        afterData: syncResult.afterData,
      });
    }

    summary.progressedUsers += 1;
    return user;
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

  const todayLog = findDailyLogByUserAndDate(userId, todayISO);
  const syncResult = syncCurrentDayLogDayNumberDetails(userId, todayISO, todayLog);
  if (syncResult.changed) {
    audit.recordChange({
      userId,
      changeType: "sync_current_day_number",
      entityType: "daily_log",
      entityId: syncResult.afterData?.id || syncResult.beforeData?.id || "",
      effectiveDate: todayISO,
      beforeData: syncResult.beforeData,
      afterData: syncResult.afterData,
    });
  }

  summary.resetUsers += 1;
  return user;
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
  if (summary.touchedRecords > 0) {
    summary.auditRunId = audit.persist(summary);
  }

  return summary;
}

function processDueUserWithCatchup(userParam, referenceDateTime, summary, audit) {
  const userId = userParam.getString("id");
  let user = userParam;
  const MAX_CATCHUP_ITERATIONS = 100;

  for (let i = 0; i < MAX_CATCHUP_ITERATIONS; i += 1) {
    const storedStr = String(user.getString("next_rollover_at_utc") || "");
    const storedDT = parseDateTimeValue(storedStr);
    if (!storedDT || storedDT.after(referenceDateTime)) {
      break;
    }

    // Derive the missed rollover boundary from the STORED due timestamp,
    // not the current wall clock, so a delayed/missed cron catches up correctly.
    const schedule = computeUserRolloverSchedule(user, storedDT);
    const processed = processSingleUserRollover(
      user,
      schedule.rolloverDateISO,
      schedule.todayISO,
      summary,
      audit,
    );
    if (processed) {
      user = processed;
    }

    const beforeSchedule = snapshotUserRecord(user);
    user.set("timezone", schedule.timezoneName);
    user.set("next_rollover_at_utc", schedule.nextRolloverAtUTC.string());
    $app.save(user);
    const afterSchedule = snapshotUserRecord(user);
    if (JSON.stringify(beforeSchedule) !== JSON.stringify(afterSchedule)) {
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
    }
  }

  return user;
}

function runScheduledRollover(options) {
  const opts = options && typeof options === "object" ? options : {};
  const auditTrigger = String(opts.trigger || "cron");
  const initializeMissingSchedules = !!opts.initializeMissingSchedules;
  const batchSize = Math.max(1, Number(opts.pageSize) || 500);
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
  const dueFilter = `next_rollover_at_utc != \"\" && next_rollover_at_utc <= \"${escapedNowString}\"`;
  const missingFilter = `next_rollover_at_utc = \"\"`;

  // Single-batch query: we process records directly (no re-fetch by id) and
  // any user whose schedule advances beyond `now` naturally drops out of
  // subsequent ticks. Batch cap protects against unbounded runs; leftover
  // users get picked up on the next 5-minute cron.
  const dueUsers = $app.findRecordsByFilter(
    "users",
    dueFilter,
    "next_rollover_at_utc,id",
    batchSize,
    0,
  );
  summary.dueUsers = dueUsers.length;

  const missingUsers = initializeMissingSchedules
    ? $app.findRecordsByFilter("users", missingFilter, "created,id", batchSize, 0)
    : [];

  if (dueUsers.length === 0 && missingUsers.length === 0) {
    return summary;
  }

  const audit = createRolloverAuditRecorder(nowUTCDateISO, nowUTCDateISO, `${auditTrigger}_scheduled`);

  for (const dueUser of dueUsers) {
    if (!dueUser) continue;
    summary.totalUsers += 1;
    const userId = dueUser.getString("id");
    try {
      processDueUserWithCatchup(dueUser, currentDateTime, summary, audit);
    } catch (err) {
      summary.failedUsers += 1;
      summary.failures.push({
        userId,
        email: dueUser.getString("email"),
        currentDay: dueUser.getInt("current_day"),
        completedDays: dueUser.getInt("completed_days"),
        error: err ? String(err) : "Unknown error",
      });
    }
  }

  for (const missingUser of missingUsers) {
    if (!missingUser) continue;
    const userId = missingUser.getString("id");
    try {
      if (initializeUserRolloverSchedule(missingUser, currentDateTime)) {
        summary.initializedSchedules += 1;
      }
    } catch (err) {
      summary.failedUsers += 1;
      summary.failures.push({
        userId,
        email: missingUser.getString("email"),
        currentDay: missingUser.getInt("current_day"),
        completedDays: missingUser.getInt("completed_days"),
        error: err ? String(err) : "Unknown error",
      });
    }
  }

  summary.touchedRecords = audit.count();
  if (summary.touchedRecords > 0) {
    summary.auditRunId = audit.persist(summary);
  }

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
  initializeUserRolloverSchedule,
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