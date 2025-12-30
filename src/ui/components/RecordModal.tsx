import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { User, RecordRow } from "../../utils/types";
import { LocalDb } from "../../data/local/localDb";

type Props = {
  user: User;
  onClose: () => void;
  onSaved: () => void;
};

export function RecordModal({ user, onClose, onSaved }: Props) {
  const [temp, setTemp] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!temp) return;
    const v = Number(temp);
    if (!Number.isFinite(v)) return;

    try {
      setSaving(true);
      // addRecord ではなく upsertRecord を使用
      const now = new Date().toISOString();
      const newRecord: RecordRow = {
        uuid: crypto.randomUUID(),
        user_uuid: user.uuid,
        group_id: user.group_id,
        temp: v,
        measured_at: now,
        updated_at: now,
        is_deleted: 0,
      };
      await LocalDb.upsertRecord(newRecord);
      
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.handle} />
          <div style={styles.title}>{user.name}</div>
        </div>
        <div style={styles.body}>
          <div style={styles.tempDisplay}>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="36.5"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              style={styles.tempInput}
              autoFocus
            />
            <span style={styles.unit}>℃</span>
          </div>
          <div style={styles.hint}>例：36.5</div>
          
          <button
            type="button"
            onClick={save}
            disabled={!temp || saving}
            style={{
              ...styles.primaryBtn,
              opacity: !temp || saving ? 0.5 : 1,
            }}
          >
            {saving ? "保存中…" : "保存"}
          </button>
          
          <button type="button" onClick={onClose} style={styles.secondaryBtn}>
            キャンセル
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    zIndex: 1000,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    background: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 16,
    boxShadow: "0 -10px 24px rgba(0,0,0,0.25)",
    animation: "slideUp 0.2s ease-out",
  },
  header: {
    paddingTop: 8,
    paddingBottom: 12,
    display: "grid",
    gap: 8,
    justifyItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    background: "rgba(0,0,0,0.25)",
  },
  title: {
    fontSize: 16,
    fontWeight: 800,
  },
  body: {
    padding: "0 20px",
    display: "grid",
    gap: 12,
  },
  tempDisplay: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  tempInput: {
    fontSize: 48,
    fontWeight: 900,
    textAlign: "right",
    width: 140,
    border: "none",
    outline: "none",
  },
  unit: {
    fontSize: 24,
    fontWeight: 700,
  },
  hint: {
    textAlign: "center",
    fontSize: 12,
    opacity: 0.6,
  },
  primaryBtn: {
    marginTop: 10,
    width: "100%",
    height: 48,
    borderRadius: 14,
    border: "none",
    background: "#66A9D9",
    color: "white",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryBtn: {
    width: "100%",
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
};