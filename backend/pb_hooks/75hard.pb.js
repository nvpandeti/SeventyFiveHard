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

cronAdd("rollover-challenge-progress", "0 0 * * *", () => {
  const hooks = require(`${__hooks}/75hard.shared.js`);

  const now = new Date();
  const todayDate = new Date(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

  const today = hooks.formatDate(todayDate);
  const yesterday = hooks.formatDate(yesterdayDate);
  const summary = hooks.runRolloverForDate(yesterday, today);
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

      const now = new Date();
      const todayDate = new Date(now);
      const rolloverDateObj = new Date(now);
      rolloverDateObj.setDate(rolloverDateObj.getDate() - 1);

      const today = hooks.formatDate(todayDate);
      const rolloverDate = hooks.formatDate(rolloverDateObj);
      const summary = hooks.runRolloverForDate(rolloverDate, today);
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
