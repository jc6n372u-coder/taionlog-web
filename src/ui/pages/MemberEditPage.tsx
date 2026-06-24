import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { onDataRefreshRequested } from "../../services/sync/syncEvents";
import { useSafeDraft } from "../../services/drafts/useSafeDraft";
import type { User } from "../../utils/types";
import { showAppAlert, showAppConfirm, showSnackbar } from "../feedback/feedbackService";
import { COLORS } from "../tokens";

type MemberDraftPayload = {
  name: string;
  birth: string;
  gender: string;
  allergy: string;
  history: string;
};

export default function MemberEditPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const targetUuid = params.get("id");

  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState("未回答");
  const [allergy, setAllergy] = useState("");
  const [history, setHistory] = useState("");
  const [originalUser, setOriginalUser] = useState<User | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);

  useEffect(() => {
    void (async () => {
      const group = await LocalDb.getCurrentGroup();
      if (!group) return;
      setGroupId(group.group_id);
      if (targetUuid) {
        const users = await LocalDb.listUsers(group.group_id);
        const user = users.find((item) => item.uuid === targetUuid);
        if (user) {
          setOriginalUser(user);
          setName(user.name);
          setBirth(user.birth_date ?? "");
          setGender(user.gender ?? "未回答");
          setAllergy(user.allergy ?? "");
          setHistory(user.history ?? "");
        }
      }
      setReady(true);
    })();
  }, [targetUuid]);

  const payload = useMemo<MemberDraftPayload>(
    () => ({ name, birth, gender, allergy, history }),
    [allergy, birth, gender, history, name],
  );
  const initialPayload = useMemo<MemberDraftPayload>(
    () => ({
      name: originalUser?.name ?? "",
      birth: originalUser?.birth_date ?? "",
      gender: originalUser?.gender ?? "未回答",
      allergy: originalUser?.allergy ?? "",
      history: originalUser?.history ?? "",
    }),
    [originalUser],
  );
  const dirty = ready && JSON.stringify(payload) !== JSON.stringify(initialPayload);

  const restoreDraft = useCallback((draft: MemberDraftPayload) => {
    setName(draft.name ?? "");
    setBirth(draft.birth ?? "");
    setGender(draft.gender ?? "未回答");
    setAllergy(draft.allergy ?? "");
    setHistory(draft.history ?? "");
  }, []);

  const draft = useSafeDraft<MemberDraftPayload>({
    draftKey: groupId ? `member:${targetUuid ?? "new"}:${groupId}` : null,
    formType: "member",
    groupId,
    entityId: targetUuid,
    payload,
    baseUpdatedAt: originalUser?.updated_at ?? null,
    baseRow: originalUser ? { ...originalUser } : null,
    rowStore: "users",
    dirty,
    ready,
    onRestore: (next, context) => {
      restoreDraft(next);
      if (context.remoteChanged) setRemoteChanged(true);
    },
  });

  useEffect(() => {
    if (!targetUuid || !originalUser || !groupId) return;
    return onDataRefreshRequested(({ stores }) => {
      if (!stores.includes("users")) return;
      void (async () => {
        const current = await LocalDb.getSharedRow("users", targetUuid);
        if (current?.updated_at && current.updated_at !== originalUser.updated_at) {
          setRemoteChanged(true);
        }
      })();
    });
  }, [groupId, originalUser, targetUuid]);

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      await showAppAlert("入力内容を確認してください", "名前を入力してください。");
      return;
    }
    if (remoteChanged) {
      const continueSave = await showAppConfirm({
        title: "共有側にも新しい変更があります",
        message:
          "現在の入力内容は保持されています。保存すると競合として確認が必要になる場合があります。入力内容をこのまま保存しますか？",
        confirmLabel: "この内容で保存する",
        cancelLabel: "入力を続ける",
      });
      if (!continueSave) return;
    }

    setIsSaving(true);
    try {
      const group = await LocalDb.getCurrentGroup();
      if (!group) throw new Error("共有グループを確認してください");
      const users = await LocalDb.listUsers(group.group_id);
      const existing = targetUuid ? originalUser ?? undefined : undefined;
      const nextDisplayOrder =
        users.reduce((maximum, item) => Math.max(maximum, item.display_order ?? -1), -1) + 1;
      const user: User = {
        ...existing,
        uuid: targetUuid || crypto.randomUUID(),
        group_id: group.group_id,
        name: trimmedName,
        birth_date: birth || null,
        gender,
        allergy,
        history,
        display_order: existing?.display_order ?? nextDisplayOrder,
        is_deleted: 0,
        updated_at: new Date().toISOString(),
      };
      await LocalDb.upsertUser(user, "local", {
        baseUpdatedAt: originalUser?.updated_at ?? null,
      });
      await draft.clearDraft();
      showSnackbar("この端末に保存しました");
      nav(-1);
    } catch (error) {
      setIsSaving(false);
      await showAppAlert("保存できませんでした", error instanceof Error ? error.message : "入力内容を保持しています。もう一度お試しください。");
    }
  };

  const doDelete = async () => {
    if (!targetUuid) return;
    const confirmed = await showAppConfirm({
      title: `「${originalUser?.name ?? name}」を削除しますか？`,
      message: "このメンバーの過去の記録は通常画面に表示されなくなります。",
      confirmLabel: "削除する",
      cancelLabel: "キャンセル",
      danger: true,
    });
    if (!confirmed) return;
    setIsSaving(true);
    try {
      await LocalDb.deleteUser(targetUuid, "local", {
        baseUpdatedAt: originalUser?.updated_at ?? null,
      });
      await draft.clearDraft();
      showSnackbar("メンバーを削除しました", { tone: "info" });
      nav(-1);
    } finally {
      setIsSaving(false);
    }
  };

  const leave = async () => {
    if (await draft.requestLeaveKeepingDraft()) nav(-1);
  };

  return (
    <div style={styles.page} aria-busy={isSaving}>
      <header style={styles.header}>
        <button type="button" onClick={() => void leave()} disabled={isSaving} aria-label="前の画面へ戻る" style={styles.backButton}>←</button>
        <h1 data-page-heading style={styles.title}>{targetUuid ? "メンバー編集" : "メンバー追加"}</h1>
      </header>

      <main style={styles.main}>
        {remoteChanged && (
          <section role="alert" style={styles.warning}>
            <strong>このメンバーは別の端末で更新されています</strong>
            <span>入力内容は保持しています。保存時に競合判定を行います。</span>
          </section>
        )}
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <label style={styles.label}>名前（必須）
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" style={styles.input} />
          </label>
          <label style={styles.label}>生年月日
            <input type="date" value={birth} onChange={(event) => setBirth(event.target.value)} style={styles.input} />
          </label>
          <label style={styles.label}>性別
            <select value={gender} onChange={(event) => setGender(event.target.value)} style={styles.input}>
              <option value="未回答">未回答</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </label>
        </section>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>医療情報</h2>
          <label style={styles.label}>アレルギー
            <input value={allergy} onChange={(event) => setAllergy(event.target.value)} style={styles.input} />
          </label>
          <label style={styles.label}>既往歴など
            <textarea value={history} onChange={(event) => setHistory(event.target.value)} style={{ ...styles.input, minHeight: 96 }} />
          </label>
        </section>

        <div style={styles.actions}>
          <button type="button" onClick={() => void save()} disabled={isSaving} aria-busy={isSaving} style={styles.saveButton}>
            {isSaving ? "保存中…" : "保存する"}
          </button>
          {targetUuid && (
            <button type="button" onClick={() => void doDelete()} disabled={isSaving} style={styles.deleteButton}>
              メンバーを削除
            </button>
          )}
          {dirty && (
            <button type="button" onClick={() => void draft.discardDraftAndLeave().then((ok) => ok && nav(-1))} disabled={isSaving} style={styles.discardButton}>
              変更を破棄して戻る
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100%", background: COLORS.bg },
  header: { minHeight: 56, maxWidth: 680, margin: "0 auto", display: "flex", alignItems: "center", gap: 8, padding: "0 12px" },
  backButton: { width: 44, border: "none", background: "transparent", fontSize: 24 },
  title: { margin: 0, fontSize: 20 },
  main: { maxWidth: 680, margin: "0 auto", padding: "0 12px 28px", display: "grid", gap: 14 },
  warning: { display: "grid", gap: 4, padding: 14, borderRadius: 12, background: COLORS.warningBg, border: `1px solid ${COLORS.warning}`, color: COLORS.darkInk },
  card: { background: COLORS.surface, padding: 16, borderRadius: 14, display: "grid", gap: 14, border: `1px solid ${COLORS.borderLight}` },
  sectionTitle: { margin: 0, fontSize: 16 },
  label: { display: "grid", gap: 6, fontWeight: 700, color: COLORS.text },
  input: { width: "100%", minHeight: 44, padding: 12, borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 16, background: COLORS.surface },
  actions: { position: "sticky", bottom: 0, display: "grid", gap: 10, padding: "12px 0 calc(12px + env(safe-area-inset-bottom))", background: COLORS.bg },
  saveButton: { minHeight: 52, borderRadius: 12, border: "none", background: COLORS.fever, color: "white", fontWeight: 800, fontSize: 16 },
  deleteButton: { minHeight: 48, borderRadius: 12, border: `1px solid ${COLORS.danger}`, background: COLORS.surface, color: COLORS.danger, fontWeight: 700 },
  discardButton: { minHeight: 44, border: "none", background: "transparent", color: COLORS.textMuted, textDecoration: "underline" },
};
