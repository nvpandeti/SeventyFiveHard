/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_");
  collection.addIndex("idx_users_next_rollover_at_utc", false, "`next_rollover_at_utc`", "");
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_");
  collection.removeIndex("idx_users_next_rollover_at_utc");
  app.save(collection);
});
