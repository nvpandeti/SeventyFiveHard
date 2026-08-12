/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const runCollection = new Collection({
    name: "rollover_runs",
    type: "base",
    listRule: "@request.auth.id != \"\"",
    viewRule: "@request.auth.id != \"\"",
  });

  runCollection.fields.addAt(0, new TextField({
    id: "text_trigger_rollover_runs",
    name: "trigger",
    required: true,
    min: 3,
    max: 32,
    pattern: "",
    hidden: false,
    presentable: false,
    system: false,
  }));

  runCollection.fields.addAt(1, new DateField({
    id: "date_rollover_date_rollover_runs",
    name: "rollover_date",
    required: true,
    hidden: false,
    presentable: false,
    system: false,
  }));

  runCollection.fields.addAt(2, new DateField({
    id: "date_today_rollover_runs",
    name: "today_date",
    required: true,
    hidden: false,
    presentable: false,
    system: false,
  }));

  runCollection.fields.addAt(3, new JSONField({
    id: "json_summary_rollover_runs",
    name: "summary",
    required: false,
    maxSize: 2000000,
    hidden: false,
    presentable: false,
    system: false,
  }));

  runCollection.fields.addAt(4, new JSONField({
    id: "json_metadata_rollover_runs",
    name: "metadata",
    required: false,
    maxSize: 500000,
    hidden: false,
    presentable: false,
    system: false,
  }));

  runCollection.fields.addAt(5, new NumberField({
    id: "number_touched_rollover_runs",
    name: "touched_records_count",
    required: true,
    min: 0,
    max: undefined,
    onlyInt: true,
    hidden: false,
    presentable: false,
    system: false,
  }));

  app.save(runCollection);

  const changeCollection = new Collection({
    name: "rollover_run_changes",
    type: "base",
    listRule: "@request.auth.id != \"\"",
    viewRule: "@request.auth.id != \"\"",
  });

  changeCollection.fields.addAt(0, new RelationField({
    id: "rel_rollover_run_rollover_changes",
    name: "rollover_run",
    required: true,
    collectionId: runCollection.id,
    cascadeDelete: true,
    minSelect: 0,
    maxSelect: 1,
    hidden: false,
    presentable: false,
    system: false,
  }));

  changeCollection.fields.addAt(1, new TextField({
    id: "text_user_id_rollover_changes",
    name: "user_id",
    required: true,
    min: 1,
    max: 64,
    pattern: "",
    hidden: false,
    presentable: false,
    system: false,
  }));

  changeCollection.fields.addAt(2, new TextField({
    id: "text_change_type_rollover_changes",
    name: "change_type",
    required: true,
    min: 3,
    max: 64,
    pattern: "",
    hidden: false,
    presentable: false,
    system: false,
  }));

  changeCollection.fields.addAt(3, new TextField({
    id: "text_entity_type_rollover_changes",
    name: "entity_type",
    required: true,
    min: 3,
    max: 64,
    pattern: "",
    hidden: false,
    presentable: false,
    system: false,
  }));

  changeCollection.fields.addAt(4, new TextField({
    id: "text_entity_id_rollover_changes",
    name: "entity_id",
    required: true,
    min: 1,
    max: 64,
    pattern: "",
    hidden: false,
    presentable: false,
    system: false,
  }));

  changeCollection.fields.addAt(5, new TextField({
    id: "text_effective_date_rollover_changes",
    name: "effective_date",
    required: false,
    min: 0,
    max: 32,
    pattern: "",
    hidden: false,
    presentable: false,
    system: false,
  }));

  changeCollection.fields.addAt(6, new JSONField({
    id: "json_before_rollover_changes",
    name: "before_data",
    required: false,
    maxSize: 1000000,
    hidden: false,
    presentable: false,
    system: false,
  }));

  changeCollection.fields.addAt(7, new JSONField({
    id: "json_after_rollover_changes",
    name: "after_data",
    required: false,
    maxSize: 1000000,
    hidden: false,
    presentable: false,
    system: false,
  }));

  changeCollection.fields.addAt(8, new JSONField({
    id: "json_delta_rollover_changes",
    name: "delta",
    required: false,
    maxSize: 1000000,
    hidden: false,
    presentable: false,
    system: false,
  }));

  app.save(changeCollection);
}, (app) => {
  const changeCollection = app.findCollectionByNameOrId("rollover_run_changes");
  app.delete(changeCollection);

  const runCollection = app.findCollectionByNameOrId("rollover_runs");
  app.delete(runCollection);
});
