import type { PushData, SyncResponse } from "../../utils/types";
import { getDeviceId } from "../../security/deviceId";
import { LocalDb } from "../local/localDb"; // ★追加: AI設定取得用

const baseUrl = import.meta.env.VITE_GAS_BASE_URL as string;
const apiSecret = import.meta.env.VITE_API_SECRET as string;

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
  // AI系は status: "success" / "error" で返る場合があるため、okチェックを調整
  if (json.status === "error") throw new Error(json.message);
  if (json.ok === false) throw new Error(translateError(json.error));
  return json;
}

export const ApiClient = {
  createGroup: async (name: string) => post({ action: "create_group", name }),
  joinGroup: async (join_code: string) => post({ action: "join_group", join_code }),
  getGroupInfo: async (group_id: string) => post({ action: "get_group_info", group_id }),
  rotateSecret: async (new_secret: string) => post({ action: "rotate_secret", new_secret }),
  sync: async (group_id: string, since: string, push: PushData): Promise<SyncResponse> =>
    post({ action: "sync", group_id, since, push }),

  // ★追加: お薬AI相談
  fetchMedicationGuidance: async (payload: { targetMedName: string, currentMedNames: string[] }) => {
    const aiSettings = await LocalDb.getAiSettings();
    if (!aiSettings) throw new Error("AI設定がありません");
    const res = await post({ action: "aiMedGuidance", aiSettings, payload });
    return res.data;
  },

  // ★追加: 汎用AI相談
  fetchAiGeneral: async (systemPrompt: string, userPrompt: string) => {
    const aiSettings = await LocalDb.getAiSettings();
    if (!aiSettings) throw new Error("AI設定がありません");
    const res = await post({ action: "aiGeneralQuery", aiSettings, payload: { systemPrompt, userPrompt } });
    return res.data.text;
  }
};