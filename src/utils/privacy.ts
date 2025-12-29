export const PRIVACY_POLICY = {
  version: '1.0.0',
  lastUpdated: '2025-12-29',
  summary: [
    'グループ情報は管理者のスプレッドシートで管理されます',
  ],
};

export function maskTemp(temp: number) {
  // 数値を文字列に変換してから置換
  return String(temp).replace(/[0-9]/g, "*");
}