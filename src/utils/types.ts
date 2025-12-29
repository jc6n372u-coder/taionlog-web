export type ISO = string;

export type User = {
  uuid: string;
  group_id: string;
  name: string;
  birth_date?: string;
  icon_key?: string;
  display_order?: number;
  gender?: string;
  allergy?: string;
  history?: string;
  note?: string;
  is_deleted: 0 | 1;
  updated_at: ISO;
  // Phase B追記: ローカル並び替え用
  sort_order?: number;
};

export type RecordRow = {
  uuid: string;
  group_id: string;
  user_uuid: string;
  temp: number;
  memo?: string;
  measured_at: ISO;
  is_deleted: 0 | 1;
  updated_at: ISO;
};

export type Medication = {
  uuid: string;
  group_id: string;
  name: string;
  default_interval_hours: number;
  display_order: number;
  is_deleted: 0 | 1;
  updated_at: ISO;
  // Phase B追記
  sort_order?: number;
};

export type EventRow = {
  uuid: string;
  group_id: string;
  user_uuid: string;
  event_type: "medication";
  occurred_at: ISO;
  payload?: string; // medication_uuid
  is_deleted: 0 | 1;
  synced_at?: ISO; // 自動整理用
  updated_at: ISO;
};

export type Reminder = {
  uuid: string;
  group_id: string;
  user_uuid: string;
  medication_uuid?: string;
  scheduled_at: ISO;
  is_notified: 0 | 1;
  is_deleted: 0 | 1;
  updated_at: ISO;
};

export type SettingsRow = {
  group_id: string;
  show_temp_on_home: boolean;
  updated_at: ISO;
};

export type PushData = {
  users: User[];
  records: RecordRow[];
  medications: Medication[];
  events: EventRow[];
  reminders: Reminder[];
  settings?: SettingsRow; 
};

export type SyncResponse = {
  ok: true;
  data: {
    pulled: {
      users: User[];
      records: RecordRow[];
      medications: Medication[];
      events: EventRow[];
      reminders: Reminder[];
      settings: SettingsRow | null;
    };
    pushed: Record<string, number>;
  };
};