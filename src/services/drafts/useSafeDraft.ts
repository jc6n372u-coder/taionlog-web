import { useCallback, useEffect, useRef, useState } from "react";
import {
  LocalDb,
  type DraftFormType,
  type PushableStore,
} from "../../data/local/localDb";
import { showAppConfirm, showSnackbar } from "../../ui/feedback/feedbackService";

const DAY_MS = 86_400_000;

export type SafeDraftOptions<T extends Record<string, unknown>> = {
  draftKey: string | null;
  formType: DraftFormType;
  groupId: string | null;
  entityId: string | null;
  userId?: string | null;
  payload: T;
  baseUpdatedAt: string | null;
  baseRow: Record<string, unknown> | null;
  rowStore: PushableStore | null;
  dirty: boolean;
  ready: boolean;
  onRestore: (payload: T, context: { asNew: boolean; remoteChanged: boolean }) => void;
};

export type SafeDraftResult = {
  draftFound: boolean;
  remoteChanged: boolean;
  clearDraft: () => Promise<void>;
  discardDraftAndLeave: () => Promise<boolean>;
  requestLeaveKeepingDraft: () => Promise<boolean>;
};

function ageInDays(updatedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / DAY_MS));
}

export function useSafeDraft<T extends Record<string, unknown>>(
  options: SafeDraftOptions<T>,
): SafeDraftResult {
  const {
    draftKey,
    formType,
    groupId,
    entityId,
    userId,
    payload,
    baseUpdatedAt,
    baseRow,
    rowStore,
    dirty,
    ready,
    onRestore,
  } = options;
  const [draftFound, setDraftFound] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const initialCheckDoneRef = useRef(false);
  const payloadRef = useRef(payload);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    if (!ready || !draftKey || !groupId || initialCheckDoneRef.current) return;
    initialCheckDoneRef.current = true;

    void (async () => {
      const draft = await LocalDb.getDraft(draftKey);
      if (!draft) return;
      setDraftFound(true);
      const age = ageInDays(draft.updated_at);
      const currentRow = rowStore && draft.entity_id
        ? await LocalDb.getSharedRow(rowStore, draft.entity_id)
        : null;
      const rowWasDeleted = Boolean(draft.entity_id && !currentRow);
      const changedSinceDraft = Boolean(
        currentRow &&
          draft.base_updated_at &&
          currentRow.updated_at !== draft.base_updated_at,
      );

      if (rowWasDeleted) {
        const restoreAsNew = await showAppConfirm({
          title: "共有側では元のデータが削除されています",
          message:
            "入力途中の内容は端末に残っています。別の新規データとして復元できます。",
          confirmLabel: "新規として復元する",
          cancelLabel: "あとで確認する",
        });
        if (restoreAsNew) {
          onRestore(draft.payload as T, { asNew: true, remoteChanged: true });
          setRemoteChanged(true);
        }
        return;
      }

      const title = age <= 7 ? "入力途中の内容があります" : "古い入力途中の内容があります";
      const ageText = age <= 7 ? "前回の続きから入力できます。" : `${age}日前の下書きです。内容と日時を確認してから保存してください。`;
      const restore = await showAppConfirm({
        title,
        message: changedSinceDraft
          ? `${ageText}\n\n下書き保存後に共有側が更新されています。復元後に違いを確認できます。`
          : ageText,
        confirmLabel: "続きから入力する",
        cancelLabel: "今は復元しない",
      });
      if (!restore) return;

      setRemoteChanged(changedSinceDraft);
      onRestore(draft.payload as T, { asNew: false, remoteChanged: changedSinceDraft });
      if (changedSinceDraft) {
        showSnackbar("共有側にも新しい変更があります。保存前に内容を確認してください", { tone: "warning", durationMs: 5_000 });
      }
    })();
  }, [draftKey, groupId, onRestore, ready, rowStore]);

  useEffect(() => {
    if (!ready || !dirty || !draftKey || !groupId) return;
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      void LocalDb.saveDraft({
        key: draftKey,
        form_type: formType,
        entity_id: entityId,
        group_id: groupId,
        user_id: userId,
        payload: payloadRef.current,
        base_updated_at: baseUpdatedAt,
        base_row: baseRow,
        is_new: !entityId,
        updated_at: now,
        expires_at: new Date(new Date(now).getTime() + 30 * DAY_MS).toISOString(),
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [baseRow, baseUpdatedAt, dirty, draftKey, entityId, formType, groupId, ready, userId]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const clearDraft = useCallback(async () => {
    if (!draftKey) return;
    await LocalDb.deleteDraft(draftKey);
    setDraftFound(false);
  }, [draftKey]);

  const requestLeaveKeepingDraft = useCallback(async () => {
    if (!dirty) return true;
    return showAppConfirm({
      title: "入力途中の内容があります",
      message:
        "下書きとして端末に保存したまま移動できます。次回、この画面で続きから入力できます。",
      confirmLabel: "下書きを残して移動",
      cancelLabel: "入力を続ける",
    });
  }, [dirty]);

  const discardDraftAndLeave = useCallback(async () => {
    if (!dirty) return true;
    const discard = await showAppConfirm({
      title: "入力途中の内容を破棄しますか？",
      message: "今回の変更は保存されません。この操作は取り消せません。",
      confirmLabel: "破棄して移動",
      cancelLabel: "入力を続ける",
      danger: true,
    });
    if (discard) await clearDraft();
    return discard;
  }, [clearDraft, dirty]);

  return {
    draftFound,
    remoteChanged,
    clearDraft,
    discardDraftAndLeave,
    requestLeaveKeepingDraft,
  };
}
