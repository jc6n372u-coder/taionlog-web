// 体温伏せ字
export function maskTemp(temp: number) {
  // 例: 38.2 -> ""**.*""
  const s = temp.toFixed(1);
  return s.replace(/[0-9]/g, '*');
}

// セキュリティ・プライバシーポリシー文言定義
export const PRIVACY_POLICY = {
  version: '1.0.0',
  lastUpdated: '2025-12-29',
  summary: [
    'グループ情報は管理者のスプレッドシートで管理されます',
    '個人情報（住所・漢字フルネーム等）は記載しないでください',
    '端末紛失時のリスクがあります',
  ],
};
