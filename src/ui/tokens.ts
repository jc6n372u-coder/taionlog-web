/**
 * UI トークン（SSOT）
 *
 * 全画面に散らばる「青(#66A9D9)」「発熱赤(#FF5722)」等の色を集約。
 * 既存画面のインラインスタイルは段階移行のため未統一だが、
 * 新規コードは原則ここを参照すること。
 */

export const COLORS = {
  /** プライマリ（AppBar / アクセント） */
  primary: "#66A9D9",
  primaryDark: "#005a9e",
  primaryLight: "#E8F4FF",
  primarySoft: "#e0f2fe",

  /** 体温・発熱 */
  fever: "#FF5722",

  /** 投薬マーカー */
  medication: "#F59E0B",

  /** 背景・ベース */
  bg: "#f4f5f7",
  surface: "#ffffff",

  /** 文字色 */
  text: "#333333",
  textMuted: "#666666",
  textSubtle: "#999999",

  /** 区切り線 */
  border: "#dddddd",
  borderLight: "#eeeeee",

  /** 強調・警告 */
  danger: "#dc2626",
  dangerBg: "#fee2e2",
  warning: "#d97706",
  warningBg: "#fef9c3",
  success: "#059669",
  successBg: "#dcfce7",

  /** ダーク（保存ボタン等） */
  dark: "#111827",
  darkInk: "#1e293b",
} as const;
