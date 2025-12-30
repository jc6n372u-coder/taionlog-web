import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { LocalDb } from "../../data/local/localDb";
import type { User } from "../../utils/types";

/**
 * Flutter寄せ：メンバー編集画面
 * - カードUI
 * - 並び替え（上/下）
 * - 削除（確認付き）
 * - FABで追加
 */
export default function MembersPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return nav("/onboarding");
    const us = await LocalDb.listUsers(g.group_id);
    setUsers(us);
  }

  useEffect(() => { void load(); }, []);

  async function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= users.length) return;
    const next = [...users];
    const [a, b] = [next[idx], next[target]];
    next[idx] = b;
    next[target] = a;
    setUsers(next);

    // 並び順保存
    setBusy(true);
    try {
      // LocalDb.updateUserOrder は実装済みなので直接呼ぶ
      await LocalDb.updateUserOrder(next.map((u, i) => ({ uuid: u.uuid, order_index: i })));
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: User) {
    if (!confirm(`「${u.name}」を削除しますか？\n（記録は保持されます）`)) return;
    setBusy(true);
    try {
      await LocalDb.softDeleteUser(u.uuid);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="メンバー"
      back
      fabLabel="＋"
      onFabClick={() => nav("/members/new")}
    >
      <div style={{ display: "grid", gap: 12 }}>
        {users.map((u, i) => (
          <section key={u.uuid} style={styles.card}>
            <div style={styles.row}>
              <div style={styles.left}>
                <div style={styles.avatar}>{u.name.slice(0, 1)}</div>
                <div style={styles.name}>{u.name}</div>
              </div>
              <div style={styles.actions}>
                <button
                  type="button"
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                  style={styles.iconBtn}
                  aria-label="上へ"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={busy || i === users.length - 1}
                  onClick={() => move(i, 1)}
                  style={styles.iconBtn}
                  aria-label="下へ"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(u)}
                  style={{ ...styles.iconBtn, color: "#e53935" }}
                  aria-label="削除"
                >
                  ✕
                </button>
              </div>
            </div>
          </section>
        ))}
        {users.length === 0 && (
          <div style={{ textAlign: "center", opacity: 0.6, padding: 20 }}>
            メンバーがいません
          </div>
        )}
      </div>
    </AppShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "white",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: 12,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    background: "#66A9D9",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
  },
  name: {
    fontWeight: 800,
  },
  actions: {
    display: "flex",
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
};