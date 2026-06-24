import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import type { SyncPushPayload, PushAcknowledgement, PushConflict } from "../local/localDb";
import { getDeviceId } from "../../security/deviceId";
import { LocalDb } from "../local/localDb";
import { AI_DEFAULTS } from "../../config/aiDefaults";
import { parseJsonLoose } from "../../utils/aiParse";

// =============================================================
// 環境変数
// =============================================================
//
// 値の供給元:
//   - 本番(Cloudflare Pages): プロジェクト設定 > 変数とシークレット
//       VITE_GAS_BASE_URL = https://script.google.com/macros/s/.../exec
//       VITE_API_SECRET   = (GAS スクリプトプロパティ API_SECRET と同値)
//   - ローカル開発: プロジェクトルートの .env (Git 管理外、.env.example を参照)
//
// セキュリティ:
//   VITE_ プレフィックス付き変数はビルド時にバンドルへ静的に埋め込まれます。
//   そのため VITE_API_SECRET はクライアント JS を解析すれば露出します。
//   これは「共有秘密キーによる軽い保護」であり真の認証ではありません。
//
//   ADMIN_SECRET はフロントエンド、Cloudflare、IndexedDBへ保存しません。
//   管理者APIはこの ApiClient から意図的に公開しません。
// =============================================================
const baseUrl = (import.meta.env.VITE_GAS_BASE_URL as string | undefined)?.trim();
const apiSecret = (import.meta.env.VITE_API_SECRET as string | undefined)?.trim();

const REQUEST_TIMEOUT_MS = 30_000;

if (!baseUrl || !apiSecret) {
  console.error(
    "[ApiClient] 必須環境変数が未設定です: VITE_GAS_BASE_URL / VITE_API_SECRET。" +
      ".env または Cloudflare Pages の変数とシークレットを確認してください。"
  );
}

// =============================================================
// GAS 通信の型定義
// =============================================================
type JsonObject = Record<string, unknown>;

type GasSuccessResponse<T> = {
  ok: true;
  data: T;
};

type GasStructuredError = {
  code?: unknown;
  message?: unknown;
  retryable?: unknown;
};

type CreateGroupData = {
  group_id: string;
  name: string;
  join_code: string;
  expires_at: string;
};

type JoinGroupData = {
  group_id: string;
  name: string;
};

type GroupInfoData = JsonObject & {
  uuid?: string;
  group_id?: string;
  name?: string;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly httpStatus: number | null = null,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type SyncApiPulledPayload = {
  users?: Record<string, unknown>[];
  records?: Record<string, unknown>[];
  medications?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  reminders?: Record<string, unknown>[];
  groups?: Record<string, unknown>[];
  settings?: Record<string, unknown> | null;
};

export type SyncApiResponseData = {
  pulled: SyncApiPulledPayload;
  pushed: Record<string, number>;
  acknowledgements: PushAcknowledgement[];
  conflicts: PushConflict[];
  server_cursor: string;
};

export interface MedicationGuidance {
  description: string;
  side_effects: string;
  tags: string[];
  interaction: { status: string; message: string };
}

/**
 * AI 呼び出しの失敗理由を保持する例外。
 * 旧コードは null を返していたため、UI 側で「何が原因か」が分からなかった。
 */
export class AiCallError extends Error {
  constructor(
    message: string,
    public readonly provider: "gemini" | "groq" | "none",
    public readonly stage: "config" | "request" | "parse" | "empty",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

// =============================================================
// GAS 通信ユーティリティ
// =============================================================
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDefaultRetryable(code: string): boolean {
  return ![
    "INVALID_REQUEST",
    "UNAUTHORIZED",
    "SERVER_CONFIG_ERROR",
    "SHEET_NOT_FOUND",
    "GROUP_NOT_FOUND",
    "INVALID_JOIN_CODE",
    "JOIN_CODE_EXPIRED",
    "INVALID_SECRET",
    "CLIENT_CONFIG_ERROR",
  ].includes(code);
}

function normalizeLegacyServerError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  const raw = typeof error === "string" ? error.trim() : "";

  switch (raw) {
    case "Unauthorized":
      return { code: "UNAUTHORIZED", message: "認証に失敗しました", retryable: false };
    case "Rate limit exceeded. Try again later.":
      return {
        code: "RATE_LIMITED",
        message: "アクセス頻度が高すぎます。しばらく待ってください",
        retryable: true,
      };
    case "Join code expired":
      return {
        code: "JOIN_CODE_EXPIRED",
        message: "参加コードの期限が切れています",
        retryable: false,
      };
    case "Invalid join code":
      return {
        code: "INVALID_JOIN_CODE",
        message: "参加コードが正しくありません",
        retryable: false,
      };
    case "Group not found":
      return {
        code: "GROUP_NOT_FOUND",
        message: "グループが見つかりません",
        retryable: false,
      };
    case "Server busy":
      return {
        code: "SYNC_BUSY",
        message: "サーバーが混雑しています。少し待ってから再試行してください",
        retryable: true,
      };
    default:
      return {
        code: "SERVER_ERROR",
        message: raw || "サーバー処理に失敗しました",
        retryable: true,
      };
  }
}

function toApiClientError(error: unknown, httpStatus: number | null = null): ApiClientError {
  if (error instanceof ApiClientError) return error;

  if (isJsonObject(error)) {
    const structured = error as GasStructuredError;
    const code =
      typeof structured.code === "string" && structured.code.trim()
        ? structured.code.trim()
        : "SERVER_ERROR";
    const message =
      typeof structured.message === "string" && structured.message.trim()
        ? structured.message.trim()
        : "サーバー処理に失敗しました";
    const retryable =
      typeof structured.retryable === "boolean"
        ? structured.retryable
        : getDefaultRetryable(code);

    return new ApiClientError(message, code, retryable, httpStatus, error);
  }

  const legacy = normalizeLegacyServerError(error);
  return new ApiClientError(
    legacy.message,
    legacy.code,
    legacy.retryable,
    httpStatus,
    error
  );
}

function createHttpError(status: number, statusText: string): ApiClientError {
  if (status === 401 || status === 403) {
    return new ApiClientError("認証に失敗しました", "UNAUTHORIZED", false, status);
  }

  if (status === 408 || status === 504) {
    return new ApiClientError(
      "通信がタイムアウトしました",
      "NETWORK_TIMEOUT",
      true,
      status
    );
  }

  if (status === 429) {
    return new ApiClientError(
      "アクセス頻度が高すぎます。しばらく待ってください",
      "RATE_LIMITED",
      true,
      status
    );
  }

  if (status >= 500) {
    return new ApiClientError(
      "サーバー処理に失敗しました",
      "SERVER_ERROR",
      true,
      status
    );
  }

  return new ApiClientError(
    `サーバーとの通信に失敗しました (${status}${statusText ? ` ${statusText}` : ""})`,
    "HTTP_ERROR",
    false,
    status
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const bodyText = await response.text();
  if (!bodyText.trim()) return null;

  try {
    return JSON.parse(bodyText) as unknown;
  } catch (error) {
    throw new ApiClientError(
      "サーバー応答を読み取れませんでした",
      "INVALID_RESPONSE",
      true,
      response.status,
      error
    );
  }
}

function parseGasResponse<T>(json: unknown, httpStatus: number): GasSuccessResponse<T> {
  if (!isJsonObject(json)) {
    throw new ApiClientError(
      "サーバー応答の形式が正しくありません",
      "INVALID_RESPONSE",
      true,
      httpStatus
    );
  }

  if (json.ok === false) {
    throw toApiClientError(json.error, httpStatus);
  }

  // v15以前の文字列エラー応答との段階的互換。
  if (json.status === "error") {
    throw toApiClientError(json.error ?? json.message, httpStatus);
  }

  if (json.ok !== true || !("data" in json)) {
    throw new ApiClientError(
      "サーバー応答の形式が正しくありません",
      "INVALID_RESPONSE",
      true,
      httpStatus
    );
  }

  return json as GasSuccessResponse<T>;
}

async function post<T>(body: JsonObject): Promise<GasSuccessResponse<T>> {
  if (!baseUrl || !apiSecret) {
    throw new ApiClientError(
      "環境変数 (VITE_GAS_BASE_URL / VITE_API_SECRET) が未設定です",
      "CLIENT_CONFIG_ERROR",
      false
    );
  }

  const deviceId = await getDeviceId();
  const payload = {
    ...body,
    api_secret: apiSecret,
    device_id: deviceId,
  };

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });

    let json: unknown = null;
    try {
      json = await readJsonResponse(response);
    } catch (error) {
      if (!response.ok) {
        throw createHttpError(response.status, response.statusText);
      }
      throw error;
    }

    if (!response.ok) {
      if (isJsonObject(json) && json.ok === false) {
        throw toApiClientError(json.error, response.status);
      }
      throw createHttpError(response.status, response.statusText);
    }

    return parseGasResponse<T>(json, response.status);
  } catch (error) {
    if (error instanceof ApiClientError) throw error;

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError(
        "通信がタイムアウトしました",
        "NETWORK_TIMEOUT",
        true,
        null,
        error
      );
    }

    throw new ApiClientError(
      "ネットワークに接続できませんでした",
      "NETWORK_ERROR",
      true,
      null,
      error
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

// =============================================================
// AI 呼び出し（クライアントサイド直接 + Failover）
// =============================================================
//
// 設計意図:
//   ユーザー個別の API キーを端末ローカルに保管し、ブラウザから
//   直接 Gemini / Groq に投げる方式（GAS 経由ではない）。
//   これにより
//     - GAS の実行時間制限 / 料金制限を消費しない
//     - キーが GAS のログに残らない
//     - Groq SDK のブラウザ利用設定を承知の上で利用
//
function buildMedPrompt(target: string, others: string[]): string {
  return `
あなたは薬剤師です。以下の薬についてJSON形式のみで回答してください。
薬名: ${target}
併用中の薬: ${others.join(", ") || "なし"}

必須項目:
1. description: 30文字程度の幼児の親向けのわかりやすい解説（「〜なお薬です」等）
2. side_effects: 主な副作用（簡潔に）
3. tags: ["発熱", "咳"] のような用途タグの配列
4. interaction: { status: "safe"|"warning"|"danger"|"none", message: "飲み合わせの注意点" }
   - statusは、併用薬がない場合は"none"、問題なければ"safe"、注意なら"warning"、危険なら"danger"
   - messageは親御さんが理解できる言葉で

回答はJSONのみを行ってください。Markdown記法は不要です。
`;
}

/**
 * Gemini → Groq の順で試行。両方失敗時は AiCallError を throw。
 */
async function callJsonAi(prompt: string): Promise<MedicationGuidance> {
  const settings = await LocalDb.getAiSettings();
  if (!settings) {
    throw new AiCallError("AI 設定がありません", "none", "config");
  }
  if (!settings.geminiApiKey && !settings.groqApiKey) {
    throw new AiCallError("API キーが未登録です", "none", "config");
  }

  let lastError: AiCallError | null = null;

  // 1) Gemini
  if (settings.geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: settings.geminiModel || AI_DEFAULTS.gemini.model,
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseJsonLoose<MedicationGuidance>(text);
      if (parsed) return parsed;
      lastError = new AiCallError(
        "Gemini の応答を JSON として解釈できませんでした",
        "gemini",
        "parse"
      );
    } catch (error) {
      console.warn("Gemini failed:", error);
      lastError = new AiCallError(
        "Gemini 呼び出しに失敗しました",
        "gemini",
        "request",
        error
      );
    }
  }

  // 2) Groq フォールバック
  if (settings.groqApiKey) {
    try {
      const groq = new Groq({
        apiKey: settings.groqApiKey,
        dangerouslyAllowBrowser: true,
      });
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: settings.groqModel || AI_DEFAULTS.groq.model,
        temperature: 0.3,
      });
      const text = completion.choices[0]?.message?.content || "";
      const parsed = parseJsonLoose<MedicationGuidance>(text);
      if (parsed) return parsed;
      lastError = new AiCallError(
        "Groq の応答を JSON として解釈できませんでした",
        "groq",
        "parse"
      );
    } catch (error) {
      console.error("Groq failed:", error);
      lastError = new AiCallError(
        "Groq 呼び出しに失敗しました",
        "groq",
        "request",
        error
      );
    }
  }

  throw lastError ?? new AiCallError("AI 呼び出しが失敗しました", "none", "empty");
}

async function callTextAi(systemPrompt: string, userPrompt: string): Promise<string> {
  const settings = await LocalDb.getAiSettings();
  if (!settings) {
    throw new AiCallError("AI 設定がありません", "none", "config");
  }
  if (!settings.geminiApiKey && !settings.groqApiKey) {
    throw new AiCallError("API キーが未登録です", "none", "config");
  }

  let lastError: AiCallError | null = null;

  // 1) Gemini
  if (settings.geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
      const model = genAI.getGenerativeModel({
        model: settings.geminiModel || AI_DEFAULTS.gemini.model,
        systemInstruction: systemPrompt,
      });
      const result = await model.generateContent(userPrompt);
      const text = result.response.text();
      if (text) return text;
      lastError = new AiCallError("Gemini の応答が空でした", "gemini", "empty");
    } catch (error) {
      console.warn("Gemini failed:", error);
      lastError = new AiCallError(
        "Gemini 呼び出しに失敗しました",
        "gemini",
        "request",
        error
      );
    }
  }

  // 2) Groq フォールバック
  if (settings.groqApiKey) {
    try {
      const groq = new Groq({
        apiKey: settings.groqApiKey,
        dangerouslyAllowBrowser: true,
      });
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: settings.groqModel || AI_DEFAULTS.groq.model,
        temperature: 0.7,
      });
      const text = completion.choices[0]?.message?.content || "";
      if (text) return text;
      lastError = new AiCallError("Groq の応答が空でした", "groq", "empty");
    } catch (error) {
      console.error("Groq failed:", error);
      lastError = new AiCallError(
        "Groq 呼び出しに失敗しました",
        "groq",
        "request",
        error
      );
    }
  }

  throw lastError ?? new AiCallError("AI 呼び出しが失敗しました", "none", "empty");
}

// =============================================================
// 公開 API
// =============================================================
export const ApiClient = {
  // --- GAS 経由の一般利用者向け機能 ---
  createGroup: async (name: string): Promise<GasSuccessResponse<CreateGroupData>> =>
    post<CreateGroupData>({ action: "create_group", name }),

  joinGroup: async (joinCode: string): Promise<GasSuccessResponse<JoinGroupData>> =>
    post<JoinGroupData>({ action: "join_group", join_code: joinCode }),

  getGroupInfo: async (groupId: string): Promise<GasSuccessResponse<GroupInfoData>> =>
    post<GroupInfoData>({ action: "get_group_info", group_id: groupId }),

  sync: async (
    groupId: string,
    since: string,
    push: SyncPushPayload
  ): Promise<GasSuccessResponse<SyncApiResponseData>> =>
    post<SyncApiResponseData>({ action: "sync", group_id: groupId, since, push }),

  // 管理者API (rotate_secret / revoke_previous_secret / get_secret_status) は
  // ADMIN_SECRETをブラウザへ持ち込まないため、ここへ定義しない。

  // --- AI（クライアント直接呼び出し） ---
  /**
   * お薬手帳用の構造化 AI 相談。
   * 失敗時は AiCallError を throw する。
   */
  fetchMedicationGuidance: async (payload: {
    targetMedName: string;
    currentMedNames: string[];
  }): Promise<MedicationGuidance> => {
    const prompt = buildMedPrompt(payload.targetMedName, payload.currentMedNames);
    return callJsonAi(prompt);
  },

  /**
   * 汎用テキスト AI 相談。
   * 失敗時は AiCallError を throw する。
   */
  fetchAiGeneral: async (systemPrompt: string, userPrompt: string): Promise<string> => {
    return callTextAi(systemPrompt, userPrompt);
  },
};
