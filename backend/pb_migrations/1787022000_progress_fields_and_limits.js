/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  const currentDayField = collection.fields.getByName("current_day")
  if (currentDayField) {
    unmarshal({
      "max": undefined,
      "min": 1,
      "required": true,
      "onlyInt": true
    }, currentDayField)
  }

  collection.fields.addAt(10, new NumberField({
    "hidden": false,
    "id": "number1986754321",
    "max": undefined,
    "min": 0,
    "name": "completed_days",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false
  }))

  const users = app.findRecordsByFilter("users", "", "", 5000, 0)
  for (const user of users) {
    if (!user) continue

    const value = user.getInt("completed_days")
    if (!Number.isFinite(value) || value < 0) {
      user.set("completed_days", 0)
      app.save(user)
    }
  }

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  const currentDayField = collection.fields.getByName("current_day")
  if (currentDayField) {
    unmarshal({
      "max": 75,
      "min": 1,
      "required": true,
      "onlyInt": true
    }, currentDayField)
  }

  collection.fields.removeById("number1986754321")

  app.save(collection)
})
