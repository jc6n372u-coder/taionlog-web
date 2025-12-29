import { useEffect, useState } from "react";
import { loadDeviceSettings, saveDeviceSettings, type DeviceSettingsV1 } from "../../../app/deviceSettings";
import { requestBrowserNotificationPermission } from "../../../services/notifications/tier1_push_min";

export default function PersonalSettingsPage() {
  const [settings, setSettings] = useState<DeviceSettingsV1>(loadDeviceSettings());

  function update(patch: Partial<DeviceSettingsV1>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveDeviceSettings(next);
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>個別設定</h2>
      <p style={{ fontSize: 12, color: "#666" }}>この設定はこの端末にのみ保存されます。</p>

      <section style={{ marginTop: 20, padding: 12, background: "white", borderRadius: 12 }}>
        <h4 style={{ margin: "0 0 10px" }}>高熱ライン</h4>
        <label>
          閾値: 
          <input 
            type="number" step="0.1" 
            value={settings.feverThresholdC} 
            onChange={e => update({ feverThresholdC: Number(e.target.value) })}
            style={{ width: 60, marginLeft: 8 }}
          /> ℃
        </label>
      </section>

      <section style={{ marginTop: 12, padding: 12, background: "white", borderRadius: 12 }}>
        <h4 style={{ margin: "0 0 10px" }}>緊急連絡先（高熱時案内）</h4>
        {settings.guideContacts.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={c.label} readOnly style={{ border: "none", background: "#f0f0f0", padding: 4 }} />
            <input value={c.number} readOnly style={{ border: "none", background: "#f0f0f0", padding: 4 }} />
          </div>
        ))}
        <div style={{ fontSize: 12, color: "#999" }}>※編集機能は次回実装予定</div>
      </section>

      <section style={{ marginTop: 12, padding: 12, background: "white", borderRadius: 12 }}>
        <h4 style={{ margin: "0 0 10px" }}>通知設定</h4>
        <button onClick={async () => {
           const p = await requestBrowserNotificationPermission();
           alert(`権限状態: ${p}`);
        }}>
          通知権限を確認・取得
        </button>
      </section>
    </div>
  );
}