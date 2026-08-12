/// <reference path="../pb_data/types.d.ts" />

function normalizeTimezone(value) {
  const text = String(value ?? "").trim();
  return text || "America/New_York";
}

function computeNextRolloverAtUTC(timezoneName) {
  const tzName = normalizeTimezone(timezoneName);
  const tz = new Timezone(tzName);
  const now = new DateTime();
  const localNow = now.time().in(tz);
  const todayISO = localNow.format("2006-01-02");
  return new DateTime(`${todayISO} 00:00:00`, tzName).addDate(0, 0, 1);
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_");

  collection.fields.addAt(12, new TextField({
    "hidden": false,
    "id": "text_user_timezone_75",
    "max": 64,
    "min": 0,
    "name": "timezone",
    "pattern": "",
    "presentable": false,
    "required": false,
    "system": false,
  }));

  collection.fields.addAt(13, new DateField({
    "hidden": false,
    "id": "date_next_rollover_utc_users",
    "max": undefined,
    "min": undefined,
    "name": "next_rollover_at_utc",
    "presentable": false,
    "required": false,
    "system": false,
  }));

  app.save(collection);

  const users = app.findRecordsByFilter("users", "", "", 5000, 0);
  for (const user of users) {
    if (!user) continue;

    const timezoneName = normalizeTimezone(user.getString("timezone"));
    user.set("timezone", timezoneName);

    const existing = String(user.getString("next_rollover_at_utc") ?? "").trim();
    if (!existing) {
      const nextRolloverAtUTC = computeNextRolloverAtUTC(timezoneName);
      user.set("next_rollover_at_utc", nextRolloverAtUTC.string());
    }

    app.save(user);
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_");

  collection.fields.removeById("date_next_rollover_utc_users");
  collection.fields.removeById("text_user_timezone_75");

  app.save(collection);
});
