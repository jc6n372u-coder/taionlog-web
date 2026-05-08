import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { User, RecordRow, Medication, EventRow, Reminder, SettingsRow } from "../../utils/types";

interface MyDB extends DBSchema {
  users: { key: string; value: User; indexes: { "by_group": string } };
  records: { key: string; value: RecordRow; indexes: { "by_user": string; "by_group": string } };
  medications: { key: string; value: Medication; indexes: { "by_group": string } };
  events: { key: string; value: EventRow; indexes: { "by_user": string; "by_group": string } };
  reminders: { key: string; value: Reminder; indexes: { "by_user": string; "by_group": string } };
  settings: { key: string; value: SettingsRow };
  meta: { key: string; value: { key: string; value: any } };
  groups: { key: string; value: any }; // groupsテーブル定義
}

let _db: Promise<IDBPDatabase<MyDB>>;

export function getDb() {
  if (!_db) {
    // ★ここを「3」に変更してください！
    // これにより、スマホが「おっ、新しい構造だ！」と気づいて groups テーブルを作成します。
    _db = openDB<MyDB>("taionlog-db", 3, {
      upgrade(db, _oldVersion, _newVersion, _tx) {
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
        }
        if (!db.objectStoreNames.contains("reminders")) {
            const store = db.createObjectStore("reminders", { keyPath: "uuid" });
            store.createIndex("by_user", "user_uuid");
        }
        if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", { keyPath: "group_id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
            db.createObjectStore("meta", { keyPath: "key" });
        }
        
        // groupsテーブルの作成処理
        if (!db.objectStoreNames.contains("groups")) {
            db.createObjectStore("groups", { keyPath: "uuid" });
        }
      },
    });
  }
  return _db;
}