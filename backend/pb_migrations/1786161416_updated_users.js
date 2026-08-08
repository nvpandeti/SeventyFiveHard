/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "listRule": "\"\" = @request.auth.id",
    "viewRule": "\"\" = @request.auth.id"
  }, collection)

  // add field
  collection.fields.addAt(9, new DateField({
    "help": "",
    "hidden": false,
    "id": "date2502384312",
    "max": undefined,
    "min": undefined,
    "name": "start_date",
    "presentable": false,
    "required": true,
    "system": false
  }))

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "listRule": "id = @request.auth.id",
    "viewRule": "id = @request.auth.id"
  }, collection)

  // remove field
  collection.fields.removeById("date2502384312")

  app.save(collection)
})
