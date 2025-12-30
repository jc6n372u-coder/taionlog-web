export type ISO = string;

export type User = {
  uuid: string;
  group_id: string;
  name: string;
  birth_date?: string | null;
  icon_key?: string;
  gender?: string;
  allergy?: string;
  history?: string;
  note?: string;
  display_order?: number;
  sort_order?: number;
  order_index?: number;
  is_deleted: 0 | 1;
  updated_at: ISO;
  created_at?: ISO;
};

export type RecordRow = {
  uuid: string;
  group_id: string;
  user_uuid: string;
  temp: number;
  memo?: string | null;
  measured_at: ISO;
  is_deleted: 0 | 1;
  updated_at: ISO;
  created_at?: ISO;
};

export type Medication = {
  uuid: string;
  group_id: string;
  name: string;
  default_interval_hours?: number;
  display_order?: number;
  sort_order?: number;
  is_deleted: 0 | 1;
  updated_at: ISO;
  created_at?: ISO;
};

export type EventRow = {
  uuid: string;
  group_id: string;
  user_uuid: string;
  event_type: "medication" | "memo" | "other"; 
  occurred_at: ISO;
  payload?: string;
  medication_uuid?: string | null;
  note?: string | null;
  is_deleted: 0 | 1;
  synced_at?: ISO;
  updated_at: ISO;
  created_at?: ISO;
};

export type Reminder = {
  uuid: string;
  group_id: string;
  user_uuid: string;
  medication_uuid?: string;
  title?: string;
  scheduled_at: ISO;
  is_notified: 0 | 1;
  is_completed?: 0 | 1;
  is_deleted: 0 | 1;
  updated_at: ISO;
  created_at?: ISO;
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
  settings?: SettingsRow | null;
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