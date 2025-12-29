import { useMemo, useState } from "react";
import { loadDeviceSettings, saveDeviceSettings } from "../../app/deviceSettings";

export default function SecurityPolicyGate() {
  const initial = useMemo(() => loadDeviceSettings(), []);
  const [settings, setSettings] = useState(initial);

  const accepted = !!settings.securityPolicyAcceptedAt;

  if (accepted) return null;

  const onAccept = () => {
    const next = { ...settings, securityPolicyAcceptedAt: new Date().toISOString() };
    setSettings(next);
    saveDeviceSettings(next);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "grid", placeItems: "center", zIndex: 9999, padding: 16
    }}>
      <div style={{
        width: "min(560px, 100%)", background: "#fff", borderRadius: 16,
        padding: 16, boxShadow: "0 10px 40px rgba(0,0,0,0.2)"
      }}>
        <h2 style={{ margin: "0 0 8px" }}>ご利用前の確認</h2>
        <pre style={{
          whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit",
          background: "#f7f7f7", borderRadius: 12, padding: 12, lineHeight: 1.4
        }}>
          {settings.securityPolicyText}
        </pre>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button onClick={onAccept} style={{
            padding: "10px 14px", borderRadius: 12, border: "none",
            background: "#5BB6E5", color: "#fff", fontWeight: 700
          }}>
            了承して開始
          </button>
        </div>
      </div>
    </div>
  );
}