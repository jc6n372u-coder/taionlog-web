export type ISO = string;

// ★追加: AI設定（ユーザーローカル保存用）
export type AiSettings = {
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  useFallback: boolean;
};

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

  // 並び順制御
  display_order?: number; // 旧仕様
  sort_order?: number;    // Phase B仕様
  order_index?: number;   // 新UI用

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

  // ★追加: 誰の薬か
  target_user_id?: string;

  // ★追加: AI取得データ
  ai_tags?: string[];       // 用途タグ
  ai_description?: string;  // 解説
  ai_side_effects?: string; // 副作用
  ai_interaction?: {        // 飲み合わせ
    status: 'danger' | 'warning' | 'ok' | 'none';
    message: string;
  };

  // ★追加: 服薬スケジュール（回数入力）
  schedule?: {
    wakeup?: number;  // 起床
    morning?: number; // 朝
    lunch?: number;   // 昼
    evening?: number; // 夕
    bedtime?: number; // 就寝
  };

  // ★追加: 親メモ・評価
  memo_taste?: string;
  taste_rating?: 'good' | 'normal' | 'bad';

  // 並び順
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
      // groups の pull は GAS 側で拡張済み
    };
    pushed: Record<string, number>;
  };
};