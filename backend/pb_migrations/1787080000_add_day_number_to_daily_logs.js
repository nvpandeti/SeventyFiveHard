/// <reference path="../pb_data/types.d.ts" />

/** @param {unknown} value */
function normalizeDayNumber(value) {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

/** @param {unknown} value */
function normalizeRecordDate(value) {
  const text = String(value ?? "").trim();
  return text.length >= 10 ? text.slice(0, 10) : text;
}

/** @param {Date} date */
function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * @param {string} isoDate
 * @param {number} days
 */
function offsetISODate(isoDate, days) {
  const normalized = normalizeRecordDate(isoDate);
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return normalized;
  }

  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/**
 * @param {any} app
 * @param {string} userId
 * @param {string} isoDate
 */
function findDailyLogByUserAndDate(app, userId, isoDate) {
  const escapedUser = String(userId).replace(/"/g, "\\\"");
  const escapedDate = String(isoDate).replace(/"/g, "\\\"");

  try {
    return app.findFirstRecordByFilter(
      "daily_logs",
      `user = \"${escapedUser}\" && date = \"${escapedDate}\"`,
    );
  } catch (err) {
    const logs = app.findRecordsByFilter("daily_logs", `user = \"${escapedUser}\"`, "", 5000, 0);
    for (const log of logs) {
      if (!log) continue;
      if (normalizeRecordDate(log.getString("date")) === isoDate) {
        return log;
      }
    }
    return null;
  }
}

/**
 * @param {any} app
 * @param {string} userId
 * @param {string} isoDate
 */
function resolveChallengeDayNumber(app, userId, isoDate) {
  const previousDate = offsetISODate(isoDate, -1);
  const previousLog = findDailyLogByUserAndDate(app, userId, previousDate);
  if (!previousLog || !previousLog.getBool("completed")) {
    return 1;
  }

  return normalizeDayNumber(previousLog.getInt("day_number")) + 1;
}

/** @param {any} app */
function backfillDailyLogDayNumbers(app) {
  const logs = app.findRecordsByFilter("daily_logs", "", "", 5000, 0);
  const sorted = [...logs].sort((left, right) => {
    const leftUser = left.getString("user");
    const rightUser = right.getString("user");
    if (leftUser !== rightUser) return leftUser < rightUser ? -1 : 1;

    const leftDate = normalizeRecordDate(left.getString("date"));
    const rightDate = normalizeRecordDate(right.getString("date"));
    if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;

    const leftCreated = String(left.getString("created") ?? "");
    const rightCreated = String(right.getString("created") ?? "");
    return leftCreated < rightCreated ? -1 : leftCreated > rightCreated ? 1 : 0;
  });

  const previousByUser = new Map();

  for (const log of sorted) {
    if (!log) continue;

    const userId = log.getString("user");
    const currentDate = normalizeRecordDate(log.getString("date"));
    const previous = previousByUser.get(userId);
    let dayNumber = 1;

    if (previous) {
      const current = new Date(`${currentDate}T00:00:00`);
      const prior = new Date(`${previous.date}T00:00:00`);
      const gap = Number.isNaN(current.getTime()) || Number.isNaN(prior.getTime())
        ? 0
        : Math.round((current.getTime() - prior.getTime()) / (1000 * 60 * 60 * 24));

      if (gap === 1 && previous.log.getBool("completed")) {
        dayNumber = normalizeDayNumber(previous.log.getInt("day_number")) + 1;
      }
    }

    log.set("day_number", dayNumber);
    app.save(log);
    previousByUser.set(userId, { log, date: currentDate });
  }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("daily_logs");
  const dayNumberField = collection.fields.getByName("day_number");

  if (!dayNumberField) {
    collection.fields.addAt(9, new NumberField({
      "hidden": false,
      "id": "number_day_number_daily_logs",
      "max": undefined,
      "min": 1,
      "name": "day_number",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
    }));
    app.save(collection);
  }

  backfillDailyLogDayNumbers(app);
}, (app) => {
  const collection = app.findCollectionByNameOrId("daily_logs");
  const dayNumberField = collection.fields.getByName("day_number");

  if (dayNumberField) {
    collection.fields.removeById(dayNumberField.id);
    app.save(collection);
  }
});
