import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../../data/local/localDb";
import {
  onDataRefreshRequested,
  type SyncStoreName,
} from "../../../services/sync/syncEvents";
import { COLORS } from "../../../ui/tokens";
import type { Medication } from "../../../utils/types";
import { showAppConfirm } from "../../../ui/feedback/feedbackService";

const MEDICATION_SETTINGS_REFRESH_STORES: readonly SyncStoreName[] = [
  "groups",
  "medications",
];

type Operation = "add" | "delete" | "reorder" | null;
type MessageTone = "success" | "warning" | "danger";

type PanelMessage = {
  tone: MessageTone;
  text: string;
};

const MESSAGE_STYLES: Record<MessageTone, React.CSSProperties> = {
  success: {
    color: COLORS.success,
    background: COLORS.successBg,
    borderColor: COLORS.success,
  },
  warning: {
    color: COLORS.warning,
    background: COLORS.warningBg,
    borderColor: COLORS.warning,
  },
  danger: {
    color: COLORS.danger,
    background: COLORS.dangerBg,
    borderColor: COLORS.danger,
  },
};

function includesMedicationSettingsRefreshStore(
  stores: readonly SyncStoreName[]
): boolean {
  return stores.some((store) => MEDICATION_SETTINGS_REFRESH_STORES.includes(store));
}

function sortByDisplayOrder(rows: readonly Medication[]): Medication[] {
  return [...rows].sort((a, b) => {
    const orderDiff = (a.display_order ?? 0) - (b.display_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name, "ja");
  });
}

export default function MedicationSettingsPage() {
  const navigate = useNavigate();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [newName, setNewName] = useState("");
  const [operation, setOperation] = useState<Operation>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<PanelMessage | null>(null);

  const mountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const medsRef = useRef<Medication[]>([]);
  const operationRef = useRef<Operation>(null);
  const deferredRefreshRef = useRef(false);

  const loadMeds = useCallback(async (): Promise<void> => {
    const requestId = ++loadRequestIdRef.current;

    if (mountedRef.current) {
      setIsLoading(true);
    }

    try {
      const group = await LocalDb.getCurrentGroup();

      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;

      if (!group) {
        medsRef.current = [];
        setMeds([]);
        setIsLoading(false);
        navigate("/onboarding", { replace: true });
        return;
      }

      const list = await LocalDb.getMedications(group.group_id, "order");
      const sorted = sortByDisplayOrder(list);

      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;

      medsRef.current = sorted;
      setMeds(sorted);
      setIsLoading(false);
    } catch {
      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;

      setIsLoading(false);
      setMessage({
        tone: "danger",
        text: "お薬一覧を読み込めませんでした。時間をおいて再度お試しください。",
      });
    }
  }, [navigate]);

  const finishOperation = useCallback(async (): Promise<void> => {
    operationRef.current = null;

    if (mountedRef.current) {
      setOperation(null);
    }

    if (!deferredRefreshRef.current) return;

    deferredRefreshRef.current = false;
    await loadMeds();
  }, [loadMeds]);

  useEffect(() => {
    mountedRef.current = true;
    const timerId = window.setTimeout(() => {
      void loadMeds();
    }, 0);

    return () => {
      mountedRef.current = false;
      loadRequestIdRef.current += 1;
      window.clearTimeout(timerId);
    };
  }, [loadMeds]);

  useEffect(() => {
    return onDataRefreshRequested((detail) => {
      if (!includesMedicationSettingsRefreshStore(detail.stores)) return;

      if (operationRef.current) {
        deferredRefreshRef.current = true;
        return;
      }

      void loadMeds();
    });
  }, [loadMeds]);

  const addMed = useCallback(async (): Promise<void> => {
    const trimmedName = newName.trim();
    if (!trimmedName || operationRef.current) return;

    operationRef.current = "add";
    setOperation("add");
    setMessage(null);
    loadRequestIdRef.current += 1;

    try {
      const group = await LocalDb.getCurrentGroup();
      if (!group) {
        if (mountedRef.current) {
          navigate("/onboarding", { replace: true });
        }
        return;
      }

      const currentMeds = medsRef.current;
      const maxOrder = currentMeds.reduce(
        (max, med) => Math.max(max, med.display_order ?? 0),
        0
      );
      const now = new Date().toISOString();

      await LocalDb.upsertMedication({
        uuid: crypto.randomUUID(),
        group_id: group.group_id,
        name: trimmedName,
        display_order: maxOrder + 1,
        is_deleted: 0,
        created_at: now,
        updated_at: now,
      });

      if (mountedRef.current) {
        setNewName("");
        setMessage({ tone: "success", text: "お薬を追加しました。" });
      }

      await loadMeds();
    } catch {
      if (mountedRef.current) {
        setMessage({
          tone: "danger",
          text: "お薬を追加できませんでした。時間をおいて再度お試しください。",
        });
      }
    } finally {
      await finishOperation();
    }
  }, [finishOperation, loadMeds, navigate, newName]);

  const deleteMed = useCallback(
    async (id: string): Promise<void> => {
      if (operationRef.current) return;

      const target = medsRef.current.find((med) => med.uuid === id);
      if (!target) return;
      const confirmed = await showAppConfirm({
        title: `「${target.name}」を削除しますか？`,
        message: "記録時のお薬一覧に表示されなくなります。",
        confirmLabel: "削除する",
        cancelLabel: "キャンセル",
        danger: true,
      });
      if (!confirmed) return;

      operationRef.current = "delete";
      setOperation("delete");
      setMessage(null);
      loadRequestIdRef.current += 1;

      try {
        await LocalDb.upsertMedication({
          ...target,
          is_deleted: 1,
          updated_at: new Date().toISOString(),
        });

        if (mountedRef.current) {
          setMessage({ tone: "success", text: "お薬を一覧から削除しました。" });
        }

        await loadMeds();
      } catch {
        if (mountedRef.current) {
          setMessage({
            tone: "danger",
            text: "お薬を削除できませんでした。時間をおいて再度お試しください。",
          });
        }
      } finally {
        await finishOperation();
      }
    },
    [finishOperation, loadMeds]
  );

  const moveItem = useCallback(
    async (index: number, direction: -1 | 1): Promise<void> => {
      if (operationRef.current) return;

      const currentMeds = medsRef.current;
      const destinationIndex = index + direction;
      if (index < 0 || index >= currentMeds.length) return;
      if (destinationIndex < 0 || destinationIndex >= currentMeds.length) return;

      operationRef.current = "reorder";
      setOperation("reorder");
      setMessage(null);
      loadRequestIdRef.current += 1;

      const previousMeds = [...currentMeds];
      const reordered = [...currentMeds];
      const [movedItem] = reordered.splice(index, 1);
      reordered.splice(destinationIndex, 0, movedItem);

      const now = new Date().toISOString();
      const updates = reordered.map((med, orderIndex) => ({
        ...med,
        display_order: orderIndex,
        updated_at: now,
      }));

      medsRef.current = updates;
      setMeds(updates);

      try {
        await LocalDb.updateMedicationOrder(updates);

        if (mountedRef.current) {
          setMessage({ tone: "success", text: "並び順を保存しました。" });
        }
      } catch {
        medsRef.current = previousMeds;
        if (mountedRef.current) {
          setMeds(previousMeds);
          setMessage({
            tone: "danger",
            text: "並び順を保存できませんでした。元の順番に戻しました。",
          });
        }
      } finally {
        await finishOperation();
      }
    },
    [finishOperation]
  );

  const isBusy = operation !== null;
  const addDisabled = isBusy || newName.trim().length === 0;

  return (
    <div style={styles.page}>
      <header style={styles.appBar}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={styles.navBtn}
          aria-label="前の画面へ戻る"
          disabled={isBusy}
        >
          ←
        </button>
        <span style={styles.title}>お薬の設定</span>
        <div style={styles.headerSpacer} aria-hidden="true" />
      </header>

      <main style={styles.body} aria-busy={isBusy || isLoading}>
        <div style={styles.inputRow}>
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !addDisabled) {
                event.preventDefault();
                void addMed();
              }
            }}
            placeholder="お薬名を入力（例：カロナール）"
            style={styles.input}
            disabled={isBusy}
            aria-label="追加するお薬名"
          />
          <button
            type="button"
            onClick={() => void addMed()}
            disabled={addDisabled}
            style={{
              ...styles.addBtn,
              ...(addDisabled ? styles.buttonDisabled : null),
            }}
          >
            {operation === "add" ? "追加中" : "追加"}
          </button>
        </div>

        {message ? (
          <div
            role={message.tone === "danger" ? "alert" : "status"}
            aria-live={message.tone === "danger" ? "assertive" : "polite"}
            aria-atomic="true"
            style={{ ...styles.message, ...MESSAGE_STYLES[message.tone] }}
          >
            {message.text}
          </div>
        ) : null}

        <section style={styles.listContainer} aria-label="登録済みのお薬">
          {meds.map((med, index) => {
            const canMoveUp = index > 0 && !isBusy;
            const canMoveDown = index < meds.length - 1 && !isBusy;

            return (
              <div key={med.uuid} style={styles.listItem}>
                <div style={styles.medName}>{med.name}</div>

                <div style={styles.actions}>
                  <button
                    type="button"
                    onClick={() => void moveItem(index, -1)}
                    disabled={!canMoveUp}
                    style={canMoveUp ? styles.moveBtn : styles.moveBtnDisabled}
                    aria-label={`${med.name}を上へ移動`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveItem(index, 1)}
                    disabled={!canMoveDown}
                    style={canMoveDown ? styles.moveBtn : styles.moveBtnDisabled}
                    aria-label={`${med.name}を下へ移動`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteMed(med.uuid)}
                    disabled={isBusy}
                    style={{
                      ...styles.deleteBtn,
                      ...(isBusy ? styles.buttonDisabled : null),
                    }}
                    aria-label={`${med.name}を一覧から削除`}
                  >
                    削除
                  </button>
                </div>
              </div>
            );
          })}

          {isLoading && meds.length === 0 ? (
            <div style={styles.empty}>読み込み中です…</div>
          ) : null}

          {!isLoading && meds.length === 0 ? (
            <div style={styles.empty}>登録がありません</div>
          ) : null}
        </section>

        {operation === "reorder" ? (
          <div style={styles.processingText} role="status" aria-live="polite">
            並び順を保存しています…
          </div>
        ) : null}

        <div style={styles.note}>
          ※ここで登録した薬は、体温記録の際に選択できるようになります。
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: COLORS.bg,
    fontFamily: "sans-serif",
  },
  appBar: {
    height: 56,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 16px",
    background: COLORS.primary,
    color: COLORS.surface,
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  title: { fontWeight: "bold", fontSize: 18 },
  navBtn: {
    background: "transparent",
    border: "none",
    color: COLORS.surface,
    fontSize: 20,
    cursor: "pointer",
    width: 40,
    minHeight: 40,
  },
  headerSpacer: { width: 40 },
  body: { padding: 16 },
  inputRow: { display: "flex", gap: 8, marginBottom: 16 },
  input: {
    minWidth: 0,
    flex: 1,
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    fontSize: 16,
  },
  addBtn: {
    minWidth: 72,
    minHeight: 42,
    padding: "0 20px",
    borderRadius: 8,
    border: "none",
    background: COLORS.primary,
    color: COLORS.surface,
    fontWeight: "bold",
    cursor: "pointer",
  },
  buttonDisabled: { opacity: 0.5, cursor: "not-allowed" },
  message: {
    border: "1px solid",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.5,
  },
  listContainer: { display: "flex", flexDirection: "column", gap: 8 },
  listItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: COLORS.surface,
    padding: "12px 16px",
    borderRadius: 8,
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
  },
  medName: {
    minWidth: 0,
    flex: 1,
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.text,
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", gap: 8, flexShrink: 0 },
  moveBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.primaryLight,
    color: COLORS.primaryDark,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: "bold",
  },
  moveBtnDisabled: {
    width: 40,
    height: 40,
    borderRadius: 20,
    border: `1px solid ${COLORS.borderLight}`,
    background: COLORS.bg,
    color: COLORS.textSubtle,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    cursor: "not-allowed",
  },
  deleteBtn: {
    minWidth: 56,
    minHeight: 40,
    padding: "0 12px",
    borderRadius: 20,
    border: "none",
    background: COLORS.dangerBg,
    color: COLORS.danger,
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { textAlign: "center", color: COLORS.textSubtle, padding: 20 },
  processingText: {
    marginTop: 12,
    fontSize: 13,
    color: COLORS.primaryDark,
    fontWeight: "bold",
  },
  note: { marginTop: 12, fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 },
};
