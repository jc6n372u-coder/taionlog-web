/**
 * AI モデルのデフォルト値（SSOT: Single Source of Truth）
 *
 * モデル名やベンダー表示名の参照元はここに集約します。
 * 旧コードでは複数ファイルに同名のリテラルがハードコードされていましたが、
 * 変更時の追従漏れを防ぐため一箇所にまとめています。
 *
 * Gemini:
 * - 通常運用では、無料枠・回数・安定性を優先し、Stable の Gemini 3.1 Flash Lite を既定値にします。
 * - より高精度な回答が必要な場合は、設定画面で Gemini 3 Flash Preview を選択できるようにします。
 *
 * Groq:
 * - Production Models を中心に候補を構成します。
 * - 非推奨または終了済みのモデルIDは候補から除外します。
 */

export const AI_DEFAULTS = {
  gemini: {
    model: "gemini-3.1-flash-lite",
    /** モデル名フィールドが空のとき UI で表示するラベル */
    displayName: "Gemini 3.1 Flash Lite",
    /** datalist 候補 */
    candidates: [
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite-preview",
    ],
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  groq: {
    model: "llama-3.3-70b-versatile",
    /** モデル名フィールドが空のとき UI で表示するラベル */
    displayName: "Llama 3.3 70B",
    /** datalist 候補 */
    candidates: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
    ],
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