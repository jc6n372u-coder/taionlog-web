/**
 * AI モデルのデフォルト値（SSOT: Single Source of Truth）
 *
 * モデル名やベンダー表示名の参照元はここに集約します。
 * 旧コードでは複数ファイルに同名のリテラルがハードコードされていましたが、
 * 変更時の追従漏れを防ぐため一箇所にまとめています。
 */

export const AI_DEFAULTS = {
  gemini: {
    model: "gemini-3-flash",
    /** モデル名フィールドが空のとき UI で表示するラベル */
    displayName: "Gemini 1.5 Flash",
    /** datalist 候補 */
    candidates: ["gemini-3-flash", "gemini-2.5-flash", "gemini-1.5-flash"],
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  groq: {
    model: "llama-3.3-70b-versatile",
    displayName: "Llama 3",
    candidates: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"],
    docsUrl: "https://console.groq.com/keys",
  },
} as const;

/**
 * 設定オブジェクトから「現在使われている AI モデル名」のラベルを返す。
 * 優先順位: Gemini > Groq > "AI Model"
 */
export function describeActiveAiModel(settings: {
  geminiApiKey?: string;
  geminiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
} | null | undefined): string {
  if (!settings) return "AI Model";
  if (settings.geminiApiKey) {
    return settings.geminiModel || AI_DEFAULTS.gemini.displayName;
  }
  if (settings.groqApiKey) {
    return (settings.groqModel || AI_DEFAULTS.groq.displayName) + " (via Groq)";
  }
  return "AI Model";
}
