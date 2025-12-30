export type ISO = string;

// ユーザー情報
export type User = {
  uuid: string;
  group_id: string;
  name: string;
  
  // 既存データ（消してはいけない）
  birth_date?: string | null;
  icon_key?: string; // 旧仕様のアイコン
  gender?: string;
  allergy?: string;
  history?: string;
  note?: string;
  
  // ★追加: 今回の新機能用
  icon?: string;     // 新しいアイコン文字
  color?: string;    // テーマカラー
  
  // 並び順制御
  display_order?: number; // 旧仕様
  sort_order?: number;    // Phase B仕様
  order_index?: number;   // 新UI用
  
  is_deleted: 0 | 1;
  updated_at: ISO;
  created_at?: ISO;
};

// 体温記録
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

// お薬マスタ
export type Medication = {
  uuid: string;
  group_id: string;
  name: string;
  
  // 既存データ
  default_interval_hours?: number;
  
  // ★追加: 今回の新機能用
  reminder_time?: string; // "08:00" などの時間指定
  
  // 並び順
  display_order?: number;
  sort_order?: number;
  
  is_deleted: 0 | 1;
  updated_at: ISO;
  created_at?: ISO;
};

// イベント（投薬記録など）
export type EventRow = {
  uuid: string;
  group_id: string;
  user_uuid: string;
  
  // event_type は拡張性を考慮
  event_type: "medication" | "memo" | "other" | string; 
  occurred_at: ISO;
  
  // 互換性のため維持
  payload?: string;        // 旧仕様
  medication_uuid?: string | null; // 新仕様
  note?: string | null;

  // ★追加: 今回の新機能用
  title?: string;          // エラー回避用
  detail?: string;         // 投薬内容の文字列保存用
  
  is_deleted: 0 | 1;
  synced_at?: ISO; // ★重要: これがないと同期のゴミ掃除機能が壊れます
  updated_at: ISO;
  created_at?: ISO;
};

// 通知設定
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

// アプリ設定
export type SettingsRow = {
  group_id: string;
  show_temp_on_home: boolean;
  updated_at: ISO;
};

// 同期用データ型
export type PushData = {
  users: User[];
  records: RecordRow[];
  medications: Medication[];
  events: EventRow[];
  reminders: Reminder[];
  settings?: SettingsRow | null;
};

// APIレスポンス型
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
      // groups?: any[]; // 必要なら追加
    };
    pushed: Record<string, number>;
  };
};