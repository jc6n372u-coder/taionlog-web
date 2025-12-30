import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { LocalDb } from "../../data/local/localDb";

export default function InvitePage() {
  const nav = useNavigate();
  const [code, setCode] = useState<string>("");

  useEffect(() => {
    void (async () => {
      const g = await LocalDb.getCurrentGroup();
      if (!g) return nav("/onboarding");
      
      // LocalDb.getInviteCode の代わりに直接メタデータを取得
      const c = await LocalDb.getMeta("invite_code");
      setCode(c ?? "");
    })();
  }, [nav]);

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    alert("参加コードをコピーしました");
  }

  return (
    <AppShell title="参加コード" back>
      <div style={{ display: "grid", gap: 12 }}>
        <section style={styles.card}>
          <div style={styles.codeBox}>{code || "------"}</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
            このコードを共有すると、家族・メンバーが参加できます。
          </div>
        </section>

        <button type="button" style={styles.primaryBtn} onClick={copy}>
          コピー
        </button>
        
        <button type="button" style={styles.secondaryBtn} onClick={() => nav(-1)}>
          戻る
        </button>
      </div>
    </AppShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "white",
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: 20,
    textAlign: "center",
  },
  codeBox: {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 4,
  },
  primaryBtn: {
    width: "100%",
    height: 48,
    border: "none",
    borderRadius: 12,
    background: "#66A9D9",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryBtn: {
    width: "100%",
    height: 44,
    border: "1px solid rgba(0,0,0,0.15)",
    borderRadius: 12,
    background: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
};