import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { User, RecordRow, Medication, EventRow, Reminder, SettingsRow } from '../../utils/types';

interface TaionDb extends DBSchema {
  users: { key: string; value: User };
  records: { key: string; value: RecordRow; indexes: { 'by_user': string; 'by_measured': string } };
  medications: { key: string; value: Medication };
  events: { key: string; value: EventRow; indexes: { 'by_user': string; 'by_occurred': string } };
  reminders: { key: string; value: Reminder; indexes: { 'by_user': string; 'by_scheduled': string } };
  settings: { key: string; value: SettingsRow };
  meta: { key: string; value: { key: string; value: string } };
}

let _db: Promise<IDBPDatabase<TaionDb>> | null = null;

export function getDb() {
  if (!_db) {
    _db = openDB<TaionDb>('taionlog_web_v10', 1, {
      upgrade(db) {
        db.createObjectStore('users', { keyPath: 'uuid' });
        const records = db.createObjectStore('records', { keyPath: 'uuid' });
        records.createIndex('by_user', 'user_uuid');
        records.createIndex('by_measured', 'measured_at');
        db.createObjectStore('medications', { keyPath: 'uuid' });
        const events = db.createObjectStore('events', { keyPath: 'uuid' });
        events.createIndex('by_user', 'user_uuid');
        events.createIndex('by_occurred', 'occurred_at');
        const reminders = db.createObjectStore('reminders', { keyPath: 'uuid' });
        reminders.createIndex('by_user', 'user_uuid');
        reminders.createIndex('by_scheduled', 'scheduled_at');
        db.createObjectStore('settings', { keyPath: 'group_id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return _db;
}
