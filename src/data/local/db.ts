import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  EventRow,
  Medication,
  RecordRow,
  Reminder,
  SettingsRow,
  User,
} from "../../utils/types";

export type GroupRow = {
  uuid: string;
  name?: string;
  join_code?: string;
  join_code_expires_at?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type PushableStore =
  | "users"
  | "records"
  | "medications"
  | "events"
  | "reminders"
  | "settings";

export type SharedRowStore = PushableStore | "groups";

export type SyncQueueEntry = {
  key: string;
  store: PushableStore;
  row_key: string;
  group_id: string;
  change_id: string;
  base_updated_at: string | null;
  payload: Record<string, unknown>;
  queued_at: string;
};

export type SyncConflictEntry = {
  key: string;
  store: PushableStore;
  row_key: string;
  group_id: string;
  local_row: Record<string, unknown>;
  remote_row: Record<string, unknown> | null;
  remote_updated_at: string | null;
  detected_at: string;
};

export type DraftFormType = "record" | "member" | "medication";

export type DraftEntry = {
  key: string;
  form_type: DraftFormType;
  entity_id: string | null;
  group_id: string;
  user_id?: string | null;
  payload: Record<string, unknown>;
  base_updated_at: string | null;
  base_row: Record<string, unknown> | null;
  is_new: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export interface MyDB extends DBSchema {
  users: { key: string; value: User; indexes: { by_group: string } };
  records: {
    key: string;
    value: RecordRow;
    indexes: { by_user: string; by_group: string };
  };
  medications: { key: string; value: Medication; indexes: { by_group: string } };
  events: {
    key: string;
    value: EventRow;
    indexes: { by_user: string; by_group: string };
  };
  reminders: {
    key: string;
    value: Reminder;
    indexes: { by_user: string; by_group: string };
  };
  settings: { key: string; value: SettingsRow };
  meta: { key: string; value: { key: string; value: unknown } };
  groups: { key: string; value: GroupRow };
  sync_queue: {
    key: string;
    value: SyncQueueEntry;
    indexes: { by_group: string };
  };
  sync_conflicts: {
    key: string;
    value: SyncConflictEntry;
    indexes: { by_group: string };
  };
  drafts: {
    key: string;
    value: DraftEntry;
    indexes: { by_group: string; by_updated_at: string };
  };
}

let dbPromise: Promise<IDBPDatabase<MyDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<MyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MyDB>("taionlog-db", 5, {
      upgrade(db, oldVersion, newVersion, transaction) {
        void newVersion;

        if (!db.objectStoreNames.contains("users")) {
          const store = db.createObjectStore("users", { keyPath: "uuid" });
          store.createIndex("by_group", "group_id");
        }
        if (!db.objectStoreNames.contains("records")) {
          const store = db.createObjectStore("records", { keyPath: "uuid" });
          store.createIndex("by_user", "user_uuid");
          store.createIndex("by_group", "group_id");
        }
        if (!db.objectStoreNames.contains("medications")) {
          const store = db.createObjectStore("medications", { keyPath: "uuid" });
          store.createIndex("by_group", "group_id");
        }
        if (!db.objectStoreNames.contains("events")) {
          const store = db.createObjectStore("events", { keyPath: "uuid" });
          store.createIndex("by_user", "user_uuid");
          store.createIndex("by_group", "group_id");
        }
        if (!db.objectStoreNames.contains("reminders")) {
          const store = db.createObjectStore("reminders", { keyPath: "uuid" });
          store.createIndex("by_user", "user_uuid");
          store.createIndex("by_group", "group_id");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "group_id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("groups")) {
          db.createObjectStore("groups", { keyPath: "uuid" });
        }

        if (oldVersion < 4) {
          const eventsStore = transaction.objectStore("events");
          if (!eventsStore.indexNames.contains("by_group")) {
            eventsStore.createIndex("by_group", "group_id");
          }

          const remindersStore = transaction.objectStore("reminders");
          if (!remindersStore.indexNames.contains("by_group")) {
            remindersStore.createIndex("by_group", "group_id");
          }

          if (!db.objectStoreNames.contains("sync_queue")) {
            const store = db.createObjectStore("sync_queue", { keyPath: "key" });
            store.createIndex("by_group", "group_id");
          }

          if (!db.objectStoreNames.contains("sync_conflicts")) {
            const store = db.createObjectStore("sync_conflicts", { keyPath: "key" });
            store.createIndex("by_group", "group_id");
          }
        }

        // v5はv4ブロックへ相乗りさせない。v3→v5、v4→v5の双方で必ず作成する。
        if (oldVersion < 5 && !db.objectStoreNames.contains("drafts")) {
          const store = db.createObjectStore("drafts", { keyPath: "key" });
          store.createIndex("by_group", "group_id");
          store.createIndex("by_updated_at", "updated_at");
        }
      },
    });
  }

  return dbPromise;
}
