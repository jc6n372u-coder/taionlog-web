import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { ApiClient } from "../../data/remote/apiClient";
import { requestFullSync } from "../../services/sync/syncCoordinator";
import { showAppAlert } from "../feedback/feedbackService";

type Mode = "menu" | "create" | "join";

function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace("Exception: ", "");
}

export default function OnboardingPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("menu");
  const [groupName, setGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 既にグループ設定済みなら、Onboarding を見せない
  useEffect(() => {
    void (async () => {
      const g = await LocalDb.getCurrentGroup();
      if (g) nav("/");
    })();
  }, [nav]);

  const canCreate = useMemo(() => groupName.trim().length >= 1, [groupName]);
  const canJoin = useMemo(() => joinCode.trim().length >= 4, [joinCode]);

  function resetErrors() {
    setErr(null);
  }

  async function doCreateGroup() {
    if (!canCreate) return;
    resetErrors();
    setBusy(true);
    try {
      const name = groupName.trim();
      const resp = await ApiClient.createGroup(name);
      const data = resp.data;
      const group_id = data.group_id;
      const group_name = data.name || name;
      const join_code = data.join_code;

      if (!group_id) throw new Error("グループ作成に失敗しました（ID取得不可）");
      
      await LocalDb.setCurrentGroup(group_id, group_name);
      // 参加コードも保存しておく
      if (join_code) {
        await LocalDb.setMeta("invite_code", join_code);
      }

      await requestFullSync();
      nav("/");
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function doJoinGroup() {
    if (!canJoin) return;
    resetErrors();
    setBusy(true);
    try {
      const code = joinCode.trim().toUpperCase();
      const resp = await ApiClient.joinGroup(code);
      const data = resp.data;
      const group_id = data.group_id;
      const group_name = data.name || "家族";

      if (!group_id) throw new Error("グループ参加に失敗しました（ID取得不可）");
      
      await LocalDb.setCurrentGroup(group_id, group_name);
      // 参加したコード自体を保存しておく
      await LocalDb.setMeta("invite_code", code);

      await requestFullSync();
      nav("/");
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function explainSecurity() {
    await showAppAlert(
      "初回の安全確認",
      "【初回だけ確認】\n\n" +
        "・このアプリは家族向けの体温記録です。\n" +
        "・データは端末内（ローカルDB）に保存されます。\n" +
        "・家族共有は「グループ」と「参加コード」で行います。\n" +
        "・端末の覗き見が気になる場合は、設定で体温表示をOFFにできます。"
    );
  }

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={styles.h1}>たいおんログ</div>
          <p style={styles.sub}>
            家族で体温を共有するために、最初に「グループ」を作成するか「参加」してください。
          </p>
        </div>

        {err && (
          <div style={styles.errorBox}>
            {err}
          </div>
        )}

        {mode === "menu" && (
          <>
            <button style={styles.primaryBtn} disabled={busy} onClick={() => setMode("create")}>
              グループを作成する
            </button>
            <button style={styles.btn} disabled={busy} onClick={() => setMode("join")}>
              参加コードで参加する
            </button>
            <button style={styles.btn} disabled={busy} onClick={() => void explainSecurity()}>
              先に確認（保存場所・プライバシー）
            </button>
            <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>
              ※「参加コード」は、グループ作成者の画面（設定等）から共有してください。
            </div>
          </>
        )}

        {mode === "create" && (
          <>
            <div style={{ fontWeight: 900 }}>グループ作成</div>
            <input
              style={styles.input}
              placeholder="例）家族、実家、◯◯家"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={busy}
            />
            <button style={styles.primaryBtn} disabled={busy || !canCreate} onClick={doCreateGroup}>
              {busy ? "作成中..." : "作成して開始"}
            </button>
            <div style={styles.smallBtnRow}>
              <button style={styles.btn} disabled={busy} onClick={() => setMode("menu")}>
                戻る
              </button>
            </div>
          </>
        )}

        {mode === "join" && (
          <>
            <div style={{ fontWeight: 900 }}>グループ参加</div>
            <input
              style={styles.input}
              placeholder="参加コード（例：AB12CD34EF56）"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              disabled={busy}
              inputMode="text"
              autoCapitalize="characters"
            />
            <button style={styles.primaryBtn} disabled={busy || !canJoin} onClick={doJoinGroup}>
              {busy ? "参加中..." : "参加して開始"}
            </button>
            <div style={styles.smallBtnRow}>
              <button style={styles.btn} disabled={busy} onClick={() => setMode("menu")}>
                戻る
              </button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>
              ※コードは大文字・小文字を区別しません。
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    padding: 16,
    background: "#f6f7fb",
  },
  card: {
    width: "min(520px, 100%)",
    background: "white",
    border: "1px solid #e6e6e6",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    display: "grid",
    gap: 12,
  },
  h1: { margin: 0, fontSize: 20, fontWeight: 900 },
  sub: { margin: 0, fontSize: 12, opacity: 0.75, lineHeight: 1.5 },
  btn: {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
  },
  primaryBtn: {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "white",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    fontSize: 16,
    outline: "none",
  },
  smallBtnRow: { display: "grid", gridTemplateColumns: "1fr", gap: 10 },
  errorBox: {
    border: "1px solid #f2b8b5",
    background: "#fff5f5",
    borderRadius: 12,
    padding: 12,
    color: "#b42318",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.5,
  },
};
