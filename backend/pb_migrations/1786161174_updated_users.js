/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // add field
  collection.fields.addAt(8, new NumberField({
    "help": "",
    "hidden": false,
    "id": "number3965507238",
    "max": undefined,
    "min": 1,
    "name": "current_day",
    "onlyInt": true,
    "presentable": false,
    "required": true,
    "system": false
  }))

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // remove field
  collection.fields.removeById("number3965507238")

  app.save(collection)
})
