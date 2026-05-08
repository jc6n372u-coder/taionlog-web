/**
 * EventRow.payload からの medId 抽出（SSOT）
 *
 * 旧コードでは payload に下記のいずれかの形式で値が入っており、
 * 読み取り側で 4 箇所以上に同じ try/catch が散らばっていた:
 *   - "uuid"                            … 単純な文字列
 *   - '{"medId":"uuid", ...}'           … JSON
 *   - "uuid" (JSON.parse すると文字列)  … 念のため
 *
 * 書き込み時はなるべく単純な「uuid 文字列」を payload に格納するが、
 * 過去データとの互換のため抽出側はこのヘルパーを必ず通すこと。
 */
import type { EventRow } from "./types";

/**
 * payload から medId を取り出す。取れなければ "" を返す。
 */
export function extractMedId(event: Pick<EventRow, "payload" | "medication_uuid">): string {
  // 1. 専用カラム medication_uuid が入っていれば最優先
  if (event.medication_uuid) return event.medication_uuid;

  const payload = event.payload;
  if (!payload) return "";

  // 2. JSON として解釈できる場合（{ medId: ..., medName: ... } など）
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && typeof parsed.medId === "string") {
      return parsed.medId;
    }
    if (typeof parsed === "string") return parsed;
  } catch {
    /* プレーン文字列として扱う */
  }

  // 3. プレーン文字列として返す
  return payload;
}

/**
 * payload に名前情報が含まれている場合（古いフォーマット）はそれを返す。
 * 含まれない場合は null。呼び出し側でマスタから引き直すことを想定。
 */
export function extractMedNameFromPayload(payload: string | undefined | null): string | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && typeof parsed.medName === "string") {
      return parsed.medName;
    }
  } catch {
    /* noop */
  }
  return null;
}
