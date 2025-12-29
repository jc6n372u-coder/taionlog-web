import { useEffect, useMemo, useState } from "react";
import { APP_META } from "../../app/appMeta";
import { loadDeviceSettings, saveDeviceSettings } from "../../app/deviceSettings";

export default function VersionUpdateNotice() {
  const initial = useMemo(() => loadDeviceSettings(), []);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(initial);

  useEffect(() => {
    const last = settings.lastSeenAppVersion;
    if (last !== APP_META.version) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  const onClose = () => {
    const next = { ...settings, lastSeenAppVersion: APP_META.version };
    setSettings(next);
    saveDeviceSettings(next);
    setOpen(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "grid", placeItems: "center", zIndex: 9998, padding: 16
    }}>
      <div style={{
        width: "min(560px, 100%)", background: "#fff", borderRadius: 16,
        padding: 16, boxShadow: "0 10px 40px rgba(0,0,0,0.2)"
      }}>
        <h2 style={{ margin: "0 0 8px" }}>アップデートされました（v{APP_META.version}）</h2>
        <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
          {APP_META.releaseNotes.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "10px 14px", borderRadius: 12, border: "none",
            background: "#5BB6E5", color: "#fff", fontWeight: 700
          }}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}