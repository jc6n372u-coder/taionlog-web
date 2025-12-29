export type FeverGuideFrequency =
  | { mode: "every" }
  | { mode: "firstOnly" }
  | { mode: "cooldown"; hours: number };

export type DeviceSettingsV1 = {
  feverThresholdC: number;
  feverGuideEnabled: boolean;
  feverGuideFrequency: FeverGuideFrequency;
  feverGuideTitle: string;
  guideContacts: { label: string; number: string; enabled: boolean }[];
  securityPolicyText: string;
  securityPolicyAcceptedAt?: string;
  lastSeenAppVersion?: string;
  member_sort_order?: string[]; 
};

const LS_KEY = "taionlog_device_settings_v1";

export function getDefaultDeviceSettings(): DeviceSettingsV1 {
  return {
    feverThresholdC: 37.5,
    feverGuideEnabled: true,
    feverGuideFrequency: { mode: "every" },
    feverGuideTitle: "高熱が記録されました。",
    guideContacts: [
      { label: "#7119 を表示", number: "7119", enabled: true },
      { label: "#8000 を表示", number: "8000", enabled: true },
    ],
    securityPolicyText:
      "【セキュリティポリシー】\n" +
      "・グループ設定は管理者のスプレッドシートで管理されています。\n" +
      "・共有グループに参加したメンバーは記録を閲覧できます。\n" +
      "・個人情報（住所、漢字フルネーム、学校名など）をメモに載せないでください。\n" +
      "・不安がある場合は共有グループを作らず、端末内のみでご利用ください。",
  };
}

export function loadDeviceSettings(): DeviceSettingsV1 {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return getDefaultDeviceSettings();
    const parsed = JSON.parse(raw) as Partial<DeviceSettingsV1>;
    return { ...getDefaultDeviceSettings(), ...parsed };
  } catch {
    return getDefaultDeviceSettings();
  }
}

export function saveDeviceSettings(next: DeviceSettingsV1) {
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}