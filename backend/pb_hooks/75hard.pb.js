/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  if (!e.record) {
    return e.next();
  }

  const hooks = require(`${__hooks}/75hard.shared.js`);

  const userId = e.record.getString("user");
  const dateISO = e.record.getString("date");
  hooks.hookLog("log-create", "Incoming daily_logs create request", {
    userId,
    dateISO,
    completed: e.record.getBool("completed"),
    hasProgressPhoto: !!e.record.getString("progress_photo"),
    supportsDayNumber: hooks.canUseDayNumberField(),
  });
  if (hooks.canUseDayNumberField() && userId && dateISO) {
    const resolved = hooks.resolveChallengeDayNumber(userId, dateISO);
    e.record.set("day_number", resolved);
    hooks.hookLog("log-create", "Assigned day_number on create", {
      userId,
      dateISO,
      dayNumber: resolved,
    });
  }

  if (e.record.getBool("completed") && !hooks.isEligibleForCompletion(e.record)) {
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

  const hooks = require(`${__hooks}/75hard.shared.js`);

  const userId = e.record.getString("user");
  const dateISO = e.record.getString("date");
  const original = e.record.original();
  hooks.hookLog("log-update", "Incoming daily_logs update request", {
    userId,
    dateISO,
    originalDate: original?.getString?.("date") ?? null,
    originalDayNumber: original ? original.getInt("day_number") : null,
    originalCompleted: !!original?.getBool?.("completed"),
    nextCompleted: e.record.getBool("completed"),
    supportsDayNumber: hooks.canUseDayNumberField(),
  });
  if (hooks.canUseDayNumberField() && userId && dateISO) {
    const resolved = hooks.resolveChallengeDayNumber(userId, dateISO);
    e.record.set("day_number", resolved);
    hooks.hookLog("log-update", "Assigned day_number on update", {
      userId,
      dateISO,
      dayNumber: resolved,
    });
  }

  if (original.getBool("completed")) {
    hooks.hookWarn("log-update", "Rejected update for completed log", {
      userId,
      dateISO,
      logId: original.getString("id"),
    });
    throw new BadRequestError(
      "This day is already submitted and cannot be edited.",
      null,
    );
  }

  if (e.record.getBool("completed") && !hooks.isEligibleForCompletion(e.record)) {
    throw new BadRequestError(
      "Cannot submit day until all tasks are completed and a progress photo is uploaded.",
      null,
    );
  }

  return e.next();
}, "daily_logs");

onRecordAfterCreateSuccess((e) => {
  if (!e.record) {
    return;
  }

  const hooks = require(`${__hooks}/75hard.shared.js`);
  if (!e.record.getBool("completed")) {
    return;
  }

  const userId = e.record.getString("user");
  const dateISO = e.record.getString("date");
  hooks.hookLog("log-create", "Persisted completed daily log", {
    userId,
    dateISO,
    logId: e.record.getString("id"),
  });
  hooks.incrementUserCompletedDays(userId);
}, "daily_logs");

onRecordAfterUpdateSuccess((e) => {
  if (!e.record) {
    return;
  }

  const hooks = require(`${__hooks}/75hard.shared.js`);
  const original = e.record.original();
  const wasCompleted = !!original?.getBool?.("completed");
  const nowCompleted = e.record.getBool("completed");
  if (wasCompleted || !nowCompleted) {
    return;
  }

  const userId = e.record.getString("user");
  const dateISO = e.record.getString("date");
  hooks.hookLog("log-update", "Persisted completion transition for daily log", {
    userId,
    dateISO,
    logId: e.record.getString("id"),
  });
  hooks.incrementUserCompletedDays(userId);
}, "daily_logs");

cronAdd("rollover-challenge-progress", "*/5 * * * *", () => {
  const hooks = require(`${__hooks}/75hard.shared.js`);
  const summary = hooks.runScheduledRollover({ trigger: "cron" });
  if (summary.failedUsers > 0) {
    console.error("[rollover-challenge-progress] Completed with failures", summary);
  }
});

routerAdd(
  "POST",
  "/api/admin/rollover",
  (e) => {
    try {
      const hooks = require(`${__hooks}/75hard.shared.js`);
      const summary = hooks.runScheduledRollover({ trigger: "manual_admin" });
      const ok = summary.failedUsers === 0;
      return e.json(ok ? 200 : 207, {
        ok,
        message: ok
          ? "Manual scheduled rollover executed."
          : "Manual scheduled rollover executed with some user failures.",
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
