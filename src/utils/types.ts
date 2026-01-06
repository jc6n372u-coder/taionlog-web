export type ISO = string;

// AI設定（ユーザーローカル保存用）
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

// ★変更: お薬データの拡張
export type Medication = {
  uuid: string;
  group_id: string;
  name: string;
  
  // ★追加: ヨミガナ（あいうえお順用）
  yomi?: string; 

  default_interval_hours?: number; // 旧仕様（互換性のため維持）

  // 誰の薬か
  target_user_id?: string;

  // ★追加: 医師・薬剤師コメント
  doctor_comment?: string;

  // ★追加: 記録メニューに表示するか（アーカイブ機能）
  // 0:非表示, 1:表示（デフォルトは1推奨）
  show_in_input?: 0 | 1;

  // AI取得データ
  ai_tags?: string[];
  ai_description?: string;
  ai_side_effects?: string;
  ai_interaction?: {
    status: 'danger' | 'warning' | 'ok' | 'none';
    message: string;
  };

  // ★変更: 服薬スケジュール（構造拡張）
  // fixed: 固定時間（朝昼晩など）
  // interval: 間隔指定（8時間おきなど）
  schedule?: {
    type?: 'fixed' | 'interval';
    
    // fixedモード用
    wakeup?: number;  // 起床
    morning?: number; // 朝
    lunch?: number;   // 昼
    evening?: number; // 夕
    bedtime?: number; // 就寝
    
    // intervalモード用
    interval_hours?: number; // 何時間おき
    max_times?: number;      // 1日何回まで
    start_timing?: string;   // 開始の目安（例: 発熱時）

    // リマインダー設定（分単位で保持、例: 480 = 8時間）
    reminder_minutes?: number; 
  };

  // 親メモ・評価
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
    };
    pushed: Record<string, number>;
  };
};
