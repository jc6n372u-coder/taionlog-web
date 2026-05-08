/**
 * AI 応答のパース処理（SSOT）
 *
 * 旧コードでは MedicationBookPage / MedicationEditPage に
 * 同じ parseCustomFormat / safeParseTags / safeParseSchedule が
 * コピペされていたものをここに集約。
 */

export type InteractionStatus = "danger" | "warning" | "ok" | "safe" | "none";

export type Interaction = {
  status: InteractionStatus;
  message: string;
};

const VALID_STATUSES: ReadonlyArray<InteractionStatus> = [
  "danger",
  "warning",
  "ok",
  "safe",
  "none",
];

function coerceStatus(raw: unknown): InteractionStatus {
  if (typeof raw === "string" && (VALID_STATUSES as readonly string[]).includes(raw)) {
    return raw as InteractionStatus;
  }
  return "none";
}

/**
 * AI 飲み合わせ判定結果のパース。
 * 通常は JSON、または Java/Python 風の `{status=..., message=...}` 形式が
 * 来ることがあるため両方を救済する。
 */
export function parseInteraction(input: unknown): Interaction | null {
  if (input === null || input === undefined || input === "") return null;

  if (typeof input === "object") {
    const obj = input as Partial<Interaction>;
    if (typeof obj.message === "string") {
      return { status: coerceStatus(obj.status), message: obj.message };
    }
    return null;
  }

  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. 標準的な JSON 形式
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
      return { status: coerceStatus(parsed.status), message: parsed.message };
    }
  } catch {
    /* 次の形式へフォールバック */
  }

  // 2. `{status=danger, message=...}` のような独自フォーマット
  if (trimmed.startsWith("{") && trimmed.includes("message=")) {
    let status: InteractionStatus = "none";
    if (trimmed.includes("status=danger")) status = "danger";
    else if (trimmed.includes("status=warning")) status = "warning";
    else if (trimmed.includes("status=safe")) status = "safe";
    else if (trimmed.includes("status=ok")) status = "ok";

    const msgStart = trimmed.indexOf("message=");
    let message = trimmed;
    if (msgStart !== -1) {
      let cleanMsg = trimmed.slice(msgStart + "message=".length);
      if (cleanMsg.endsWith("}")) cleanMsg = cleanMsg.slice(0, -1);
      const statusIdx = cleanMsg.lastIndexOf(", status=");
      if (statusIdx !== -1) cleanMsg = cleanMsg.substring(0, statusIdx);
      message = cleanMsg.trim();
    }
    return { status, message };
  }

  // 3. プレーンな文字列
  return { status: "none", message: trimmed };
}

/**
 * AI タグ配列のパース。
 * 配列／JSON 文字列／カンマ区切り／単一文字列 のいずれにも対応。
 */
export function parseTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((v) => String(v)).filter((v) => v.length > 0);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map(String) : [trimmed];
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  return [];
}

/**
 * 服薬スケジュール (JSON or オブジェクト) のパース。
 * 失敗時は空オブジェクトを返す（呼び出し側の null チェックを不要に）。
 */
export function parseSchedule(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object") return input as Record<string, unknown>;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * AI が JSON 文字列を返してきたが、Markdown コードフェンスや前後に
 * 説明文を付けてしまう場合に備えて中身だけ取り出してパースする。
 */
export function parseJsonLoose<T = unknown>(text: string): T | null {
  try {
    const stripped = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    const target = start !== -1 && end !== -1 ? stripped.substring(start, end + 1) : stripped;
    return JSON.parse(target) as T;
  } catch (e) {
    console.error("parseJsonLoose failed:", e);
    return null;
  }
}
