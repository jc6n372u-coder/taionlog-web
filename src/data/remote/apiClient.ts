import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import type { PushData, SyncResponse } from "../../utils/types";
import { getDeviceId } from "../../security/deviceId";
import { LocalDb } from "../local/localDb";

const baseUrl = import.meta.env.VITE_GAS_BASE_URL as string;
const apiSecret = import.meta.env.VITE_API_SECRET as string;

// AIからの応答型定義
export interface MedicationGuidance {
  description: string;
  side_effects: string;
  tags: string[];
  interaction: { status: string; message: string; };
}

function translateError(error?: string) {
  switch (error) {
    case "Unauthorized": return "認証に失敗しました";
    case "Rate limit exceeded. Try again later.": return "アクセス頻度が高すぎます。しばらく待ってください";
    case "Join code expired": return "参加コードの期限が切れています";
    case "Invalid join code": return "参加コードが正しくありません";
    case "Group not found": return "グループが見つかりません";
    case "Server busy": return "サーバーが混雑しています。少し待ってから再試行してください";
    default: return error ?? "不明なエラーが発生しました";
  }
}

async function post(body: Record<string, any>) {
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

// プロンプト作成（共通）
function createMedPrompt(target: string, others: string[]): string {
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

// JSONパース処理（Markdown記号除去）
function parseAiJson(text: string): any {
  try {
    let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      clean = clean.substring(start, end + 1);
    }
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON Parse Error", e);
    return null;
  }
}

export const ApiClient = {
  // === 既存のサーバー機能 ===
  createGroup: async (name: string) => post({ action: "create_group", name }),
  joinGroup: async (join_code: string) => post({ action: "join_group", join_code }),
  getGroupInfo: async (group_id: string) => post({ action: "get_group_info", group_id }),
  rotateSecret: async (new_secret: string) => post({ action: "rotate_secret", new_secret }),
  sync: async (group_id: string, since: string, push: PushData): Promise<SyncResponse> =>
    post({ action: "sync", group_id, since, push }),

  // === ★修正: お薬AI相談 (クライアントサイド + Failover) ===
  fetchMedicationGuidance: async (payload: { targetMedName: string, currentMedNames: string[] }): Promise<MedicationGuidance | null> => {
    const settings = await LocalDb.getAiSettings();
    if (!settings) throw new Error("AI設定がありません");

    const prompt = createMedPrompt(payload.targetMedName, payload.currentMedNames);
    let resultJson: MedicationGuidance | null = null;

    // 1. Gemini で挑戦
    if (settings.geminiApiKey) {
      try {
        console.log("Attempting Gemini...");
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: settings.geminiModel || "gemini-3-flash" });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        resultJson = parseAiJson(text);
      } catch (e) {
        console.warn("Gemini failed, switching to Groq...", e);
        // エラー時はスルーしてGroqへ
      }
    }

    // 2. 成功していなければ Groq (Llama 3.3) で挑戦
    if (!resultJson && settings.groqApiKey) {
      try {
        console.log("Attempting Groq...");
        const groq = new Groq({ apiKey: settings.groqApiKey, dangerouslyAllowBrowser: true });
        
        const completion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "llama-3.3-70b-versatile", // ★最新モデル指定
          temperature: 0.3,
        });

        const text = completion.choices[0]?.message?.content || "";
        resultJson = parseAiJson(text);
      } catch (e) {
        console.error("Groq also failed", e);
      }
    }

    return resultJson;
  },

  // === ★修正: 汎用AI相談 (クライアントサイド + Failover) ===
  fetchAiGeneral: async (systemPrompt: string, userPrompt: string): Promise<string> => {
    const settings = await LocalDb.getAiSettings();
    if (!settings) throw new Error("AI設定がありません");

    // 1. Gemini
    if (settings.geminiApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: settings.geminiModel || "gemini-3-flash", systemInstruction: systemPrompt });
        const result = await model.generateContent(userPrompt);
        return result.response.text();
      } catch (e) {
        console.warn("Gemini failed, switching to Groq...", e);
      }
    }

    // 2. Groq
    if (settings.groqApiKey) {
      try {
        const groq = new Groq({ apiKey: settings.groqApiKey, dangerouslyAllowBrowser: true });
        const completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          model: "llama-3.3-70b-versatile",
          temperature: 0.7,
        });
        return completion.choices[0]?.message?.content || "エラー: 応答を取得できませんでした";
      } catch (e) {
        console.error("Groq also failed", e);
      }
    }
    return "エラー: AIサービスに接続できませんでした";
  }
};