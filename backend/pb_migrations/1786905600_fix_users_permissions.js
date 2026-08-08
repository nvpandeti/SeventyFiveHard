/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // Allow signed-in users to read user profiles (for feed/profile expand data)
  // and allow public signup from the mobile app.
  unmarshal({
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\"",
    "createRule": ""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // Restore the previous restrictive/incorrect rules.
  unmarshal({
    "listRule": "\"\" = @request.auth.id",
    "viewRule": "\"\" = @request.auth.id"
  }, collection)

  return app.save(collection)
})
