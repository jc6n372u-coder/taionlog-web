/**
 * 日付・時刻フォーマッタ（SSOT）
 *
 * 同じロジックが HomePage / InputPage / ChartPage に
 * 散らばっていたものを集約。
 */

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** "MM/DD(曜日)" 形式 */
export function formatDateWithWeek(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
}

/** "今日" / "昨日" / "N日前" */
export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayDiff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (dayDiff <= 0) return "今日";
  if (dayDiff === 1) return "昨日";
  return `${dayDiff}日前`;
}

/** "HH:MM" 形式 */
export function formatTimeHM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 当日かどうか判定 */
export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** ローカル時間の "YYYY-MM-DD"（toISOString は UTC 基準なのでズレる） */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 経過時間を「N分前 / N時間M分経過 / N日前」で返す */
export function formatElapsedSince(lastIso: string, currentIso: string): string {
  const diffMs = new Date(currentIso).getTime() - new Date(lastIso).getTime();
  if (diffMs < 0) return "";

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}分前`;

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours >= 24) {
    return `${Math.floor(diffHours / 24)}日前`;
  }

  const m = diffMin % 60;
  return `${diffHours}時間${m > 0 ? m + "分" : ""}経過`;
}
