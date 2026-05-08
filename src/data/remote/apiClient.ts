import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import type { PushData, SyncResponse } from "../../utils/types";
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
//   これは「共有秘密キーによる軽い保護」であり真の認証ではない点に留意。
// =============================================================
const baseUrl = import.meta.env.VITE_GAS_BASE_URL as string | undefined;
const apiSecret = import.meta.env.VITE_API_SECRET as string | undefined;

if (!baseUrl || !apiSecret) {
  // 開発時の typo / 本番デプロイ時の設定漏れを早期検知
  console.error(
    "[ApiClient] 必須環境変数が未設定です: VITE_GAS_BASE_URL / VITE_API_SECRET。" +
      ".env または Cloudflare Pages の変数とシークレットを確認してください。"
  );
}

// =============================================================
// 型定義
// =============================================================
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
// 内部ユーティリティ
// =============================================================
function translateError(error?: string): string {
  switch (error) {
    case "Unauthorized":
      return "認証に失敗しました";
    case "Rate limit exceeded. Try again later.":
      return "アクセス頻度が高すぎます。しばらく待ってください";
    case "Join code expired":
      return "参加コードの期限が切れています";
    case "Invalid join code":
      return "参加コードが正しくありません";
    case "Group not found":
      return "グループが見つかりません";
    case "Server busy":
      return "サーバーが混雑しています。少し待ってから再試行してください";
    default:
      return error ?? "不明なエラーが発生しました";
  }
}

async function post(body: Record<string, any>) {
  if (!baseUrl || !apiSecret) {
    throw new Error("環境変数 (VITE_GAS_BASE_URL / VITE_API_SECRET) が未設定です");
  }
  const device_id = await getDeviceId();
  const payload = {
    ...body,
    api_secret: apiSecret,
    device_id,
  };

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  if (!res.ok) throw new Error("サーバーエラーが発生しました");
  const json = await res.json();
  if (json.status === "error") throw new Error(json.message);
  if (json.ok === false) throw new Error(translateError(json.error));
  return json;
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
//     - Anthropic 公式 SDK の仕様 (dangerouslyAllowBrowser) を承知の上で利用
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
      lastError = new AiCallError("Gemini の応答を JSON として解釈できませんでした", "gemini", "parse");
    } catch (e) {
      console.warn("Gemini failed:", e);
      lastError = new AiCallError("Gemini 呼び出しに失敗しました", "gemini", "request", e);
    }
  }

  // 2) Groq フォールバック
  if (settings.groqApiKey) {
    try {
      const groq = new Groq({ apiKey: settings.groqApiKey, dangerouslyAllowBrowser: true });
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: settings.groqModel || AI_DEFAULTS.groq.model,
        temperature: 0.3,
      });
      const text = completion.choices[0]?.message?.content || "";
      const parsed = parseJsonLoose<MedicationGuidance>(text);
      if (parsed) return parsed;
      lastError = new AiCallError("Groq の応答を JSON として解釈できませんでした", "groq", "parse");
    } catch (e) {
      console.error("Groq failed:", e);
      lastError = new AiCallError("Groq 呼び出しに失敗しました", "groq", "request", e);
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
    } catch (e) {
      console.warn("Gemini failed:", e);
      lastError = new AiCallError("Gemini 呼び出しに失敗しました", "gemini", "request", e);
    }
  }

  // 2) Groq フォールバック
  if (settings.groqApiKey) {
    try {
      const groq = new Groq({ apiKey: settings.groqApiKey, dangerouslyAllowBrowser: true });
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
    } catch (e) {
      console.error("Groq failed:", e);
      lastError = new AiCallError("Groq 呼び出しに失敗しました", "groq", "request", e);
    }
  }

  throw lastError ?? new AiCallError("AI 呼び出しが失敗しました", "none", "empty");
}

// =============================================================
// 公開 API
// =============================================================
export const ApiClient = {
  // --- GAS 経由のサーバー機能 ---
  createGroup: async (name: string) => post({ action: "create_group", name }),
  joinGroup: async (join_code: string) => post({ action: "join_group", join_code }),
  getGroupInfo: async (group_id: string) => post({ action: "get_group_info", group_id }),
  rotateSecret: async (new_secret: string) => post({ action: "rotate_secret", new_secret }),
  sync: async (group_id: string, since: string, push: PushData): Promise<SyncResponse> =>
    post({ action: "sync", group_id, since, push }),

  // --- AI（クライアント直接呼び出し） ---
  /**
   * お薬手帳用の構造化 AI 相談。
   * 失敗時は AiCallError を throw する（旧実装の null 返しを廃止）。
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
