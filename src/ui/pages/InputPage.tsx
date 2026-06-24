import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { onDataRefreshRequested } from "../../services/sync/syncEvents";
import { useSafeDraft } from "../../services/drafts/useSafeDraft";
import type { Medication, EventRow } from "../../utils/types";
import { extractMedId } from "../../utils/payload";
import { toLocalDateStr, formatElapsedSince } from "../../utils/dateFormat";
import { showAppAlert, showAppConfirm, showSnackbar } from "../feedback/feedbackService";

// 症状リスト読み込み失敗時のフォールバック
const FALLBACK_SYMPTOMS = [
  "咳",
  "鼻水",
  "頭痛",
  "喉の痛み",
  "食欲なし",
  "機嫌悪い",
  "嘔吐",
  "下痢",
  "発疹",
];

/**
 * 指定の medId が「最後に投薬された時刻」を返す。
 * referenceTimeIso 以降のイベントは未来扱いとして除外（編集時の自分自身は currentEventId で除外）。
 */
function getLastTakenTime(
  medId: string,
  events: EventRow[],
  currentEventId: string | null,
  referenceTimeIso: string
): string | null {
  const refTime = new Date(referenceTimeIso).getTime();

  const targetEvents = events.filter((e) => {
    if (e.uuid === currentEventId) return false;
    if (e.event_type !== "medication") return false;
    if (extractMedId(e) !== medId) return false;
    if (new Date(e.occurred_at).getTime() >= refTime) return false;
    return true;
  });

  if (targetEvents.length === 0) return null;
  targetEvents.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return targetEvents[0].occurred_at;
}

type InputDraftPayload = {
  mode: "temp" | "meds";
  temp: number;
  date: string;
  time: string;
  memo: string;
  symptoms: string[];
  selectedMedicationIds: string[];
};

export default function InputPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const targetUserId = params.get("userId");

  const editId = params.get("editId");
  const editType = params.get("type");

  const [mode, setMode] = useState<"temp" | "meds">("temp");
  const [symptomsList, setSymptomsList] = useState<string[]>([]);

  // 入力データ
  const [temp, setTemp] = useState<number>(36.5);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [symptoms, setSymptoms] = useState<string[]>([]);

  const [meds, setMeds] = useState<Medication[]>([]);
  const [selMeds, setSelMeds] = useState<string[]>([]);

  const [allUserEvents, setAllUserEvents] = useState<EventRow[]>([]);
  const [loadedMedEvents, setLoadedMedEvents] = useState<EventRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [userName, setUserName] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [originalRecordUpdatedAt, setOriginalRecordUpdatedAt] = useState<string | null>(null);
  const [initialDraftPayload, setInitialDraftPayload] = useState<InputDraftPayload | null>(null);

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderTargetMeds, setReminderTargetMeds] = useState<Medication[]>([]);

  useEffect(() => {
    const now = new Date();
    setDate(toLocalDateStr(now));
    setTime(now.toTimeString().slice(0, 5));

    void LocalDb.getCurrentGroup().then(async (g) => {
      if (!g) return;
      setGroupId(g.group_id);

      setMeds(await LocalDb.getMedications(g.group_id));

      const key = `symptoms_${g.group_id}`;
      const savedSym = await LocalDb.getMeta(key);
      setSymptomsList(savedSym ? JSON.parse(savedSym) : FALLBACK_SYMPTOMS);

      if (!targetUserId) {
        setReady(true);
        return;
      }

      const users = await LocalDb.listUsers(g.group_id);
      const u = users.find((x) => x.uuid === targetUserId);
      if (u) setUserName(u.name);

      const allEvents = await LocalDb.listEvents(targetUserId);
      setAllUserEvents(allEvents);

      // 編集モード
      if (!editId) return;

      if (editType === "temp") {
        const recs = await LocalDb.listRecords(targetUserId);
        const target = recs.find((r) => r.uuid === editId);
        if (!target) return;

        setMode("temp");
        setOriginalRecordUpdatedAt(target.updated_at);
        setTemp(target.temp);
        setMemo(target.memo || "");

        const d = new Date(target.measured_at);
        setDate(toLocalDateStr(d));
        setTime(d.toTimeString().slice(0, 5));

        const targetTime = target.measured_at;
        const relatedMeds = allEvents.filter(
          (e) => e.event_type === "medication" && e.occurred_at === targetTime
        );

        const medIds = relatedMeds.map(extractMedId).filter((id) => id !== "");
        setSelMeds(medIds);
        setLoadedMedEvents(relatedMeds);
      } else if (editType === "med") {
        const target = allEvents.find((e) => e.uuid === editId);
        if (!target) {
          setReady(true);
          return;
        }
        setOriginalRecordUpdatedAt(target.updated_at);

        setMode("meds");
        const d = new Date(target.occurred_at);
        setDate(toLocalDateStr(d));
        setTime(d.toTimeString().slice(0, 5));

        const currentId = extractMedId(target);
        if (currentId) setSelMeds([currentId]);
        setLoadedMedEvents([target]);
      }
      setReady(true);
    });
  }, [targetUserId, editId, editType]);

  const draftPayload = useMemo<InputDraftPayload>(() => ({
    mode,
    temp,
    date,
    time,
    memo,
    symptoms,
    selectedMedicationIds: selMeds,
  }), [date, memo, mode, selMeds, symptoms, temp, time]);

  useEffect(() => {
    if (ready && !initialDraftPayload) setInitialDraftPayload(draftPayload);
  }, [draftPayload, initialDraftPayload, ready]);

  const dirty = ready && initialDraftPayload !== null &&
    JSON.stringify(draftPayload) !== JSON.stringify(initialDraftPayload);

  const restoreDraft = useCallback((payload: InputDraftPayload) => {
    setMode(payload.mode);
    setTemp(payload.temp);
    setDate(payload.date);
    setTime(payload.time);
    setMemo(payload.memo);
    setSymptoms(payload.symptoms ?? []);
    setSelMeds(payload.selectedMedicationIds ?? []);
  }, []);

  const primaryStore = editType === "med" ? "events" : "records";
  const draft = useSafeDraft<InputDraftPayload>({
    draftKey: groupId && targetUserId
      ? `record:${targetUserId}:${editId ?? "new"}:${editType ?? mode}:${groupId}`
      : null,
    formType: "record",
    groupId,
    entityId: editId,
    userId: targetUserId,
    payload: draftPayload,
    baseUpdatedAt: originalRecordUpdatedAt,
    baseRow: null,
    rowStore: editId ? primaryStore : null,
    dirty,
    ready,
    onRestore: (payload, context) => {
      restoreDraft(payload);
      if (context.remoteChanged) setRemoteChanged(true);
    },
  });

  useEffect(() => {
    if (!editId || !originalRecordUpdatedAt) return;
    return onDataRefreshRequested(({ stores }) => {
      if (!stores.includes(primaryStore)) return;
      void LocalDb.getSharedRow(primaryStore, editId).then((current) => {
        if (current?.updated_at && current.updated_at !== originalRecordUpdatedAt) {
          setRemoteChanged(true);
        }
      });
    });
  }, [editId, originalRecordUpdatedAt, primaryStore]);

  const leave = useCallback(async () => {
    if (await draft.requestLeaveKeepingDraft()) navigate(-1);
  }, [draft, navigate]);

  const toggleSymptom = (s: string) => {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const toggleMed = (id: string) => {
    setSelMeds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const getTempColor = (t: number) => (t >= 37.5 ? "#FF5722" : "#66A9D9");

  const deleteRecord = async () => {
    const confirmed = await showAppConfirm({
      title: "この記録を削除しますか？",
      message: "削除した記録は通常画面に表示されなくなります。",
      confirmLabel: "削除する",
      cancelLabel: "キャンセル",
      danger: true,
    });
    if (!confirmed) return;
    setIsSaving(true);
    try {
      const g = await LocalDb.getCurrentGroup();
      if (!g || !targetUserId || !editId) throw new Error("情報不足");

      if (editType === "temp") {
        const recs = await LocalDb.listRecords(targetUserId);
        const target = recs.find((r) => r.uuid === editId);
        if (target) {
          await LocalDb.upsertRecord({
            ...target,
            is_deleted: 1,
            updated_at: new Date().toISOString(),
          });
        }
      }

      for (const evt of loadedMedEvents) {
        await LocalDb.upsertEvent({
          ...evt,
          is_deleted: 1,
          updated_at: new Date().toISOString(),
        });
      }

      await draft.clearDraft();
      showSnackbar("記録を削除しました", { tone: "info" });
      navigate(-1);
    } catch (e) {
      console.error(e);
      await showAppAlert("削除に失敗しました", "入力内容は保持されています。");
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!targetUserId) {
      await showAppAlert("記録できません", "対象のメンバーが指定されていません。");
      return;
    }

    if (remoteChanged) {
      const proceed = await showAppConfirm({
        title: "共有側にも新しい変更があります",
        message: "現在の入力内容は保持されています。保存すると競合として確認が必要になる場合があります。この内容で保存しますか？",
        confirmLabel: "この内容で保存する",
        cancelLabel: "入力を続ける",
      });
      if (!proceed) return;
    }

    if (!showReminderModal && selMeds.length > 0) {
      const targets = meds.filter(
        (m) =>
          selMeds.includes(m.uuid) &&
          m.schedule &&
          (m.schedule.reminder_minutes || 0) > 0
      );

      if (targets.length > 0) {
        setReminderTargetMeds(targets);
        setShowReminderModal(true);
        return;
      }
    }

    await executeSave();
  };

  const executeSave = async (
    remindersToSet: { medId: string; minutes: number }[] = []
  ) => {
    setIsSaving(true);
    try {
      const g = await LocalDb.getCurrentGroup();
      if (!g) throw new Error("グループ未設定");

      const ts = new Date(`${date}T${time}`).toISOString();

      let finalMemo = memo.trim();
      if (!editId && mode === "temp" && symptoms.length > 0) {
        const tags = symptoms.join(", ");
        if (!finalMemo.includes(tags)) {
          finalMemo = finalMemo ? `${tags}\n${finalMemo}` : tags;
        }
      }

      const recordUuid = editType === "temp" && editId ? editId : crypto.randomUUID();

      if (mode === "temp") {
        await LocalDb.upsertRecord({
          uuid: recordUuid,
          group_id: g.group_id,
          user_uuid: targetUserId!,
          temp,
          memo: finalMemo,
          measured_at: ts,
          is_deleted: 0,
          updated_at: new Date().toISOString(),
        }, "local", {
          baseUpdatedAt: editType === "temp" && editId ? originalRecordUpdatedAt : null,
        });
      }

      // 既存イベントの再利用 or 新規作成
      for (const medId of selMeds) {
        const existingEvent = loadedMedEvents.find((e) => extractMedId(e) === medId);

        if (existingEvent) {
          await LocalDb.upsertEvent({
            ...existingEvent,
            occurred_at: ts,
            is_deleted: 0,
            updated_at: new Date().toISOString(),
          }, "local", { baseUpdatedAt: existingEvent.updated_at });
        } else {
          await LocalDb.upsertEvent({
            uuid: crypto.randomUUID(),
            group_id: g.group_id,
            user_uuid: targetUserId!,
            event_type: "medication",
            occurred_at: ts,
            payload: medId,
            is_deleted: 0,
            updated_at: new Date().toISOString(),
          });
        }
      }

      // 編集前に存在したが選択解除されたイベントを soft delete
      for (const evt of loadedMedEvents) {
        const evtMedId = extractMedId(evt);
        if (!selMeds.includes(evtMedId)) {
          await LocalDb.upsertEvent({
            ...evt,
            is_deleted: 1,
            updated_at: new Date().toISOString(),
          }, "local", { baseUpdatedAt: evt.updated_at });
        }
      }

      // 投薬のみモードでメモがある場合の救済（記録としてもメモ保持）
      if (mode === "meds" && finalMemo && !editId && selMeds.length === 0) {
        await LocalDb.upsertRecord({
          uuid: crypto.randomUUID(),
          group_id: g.group_id,
          user_uuid: targetUserId!,
          temp: 0,
          memo: finalMemo,
          measured_at: ts,
          is_deleted: 0,
          updated_at: new Date().toISOString(),
        });
      }

      // リマインダーセット
      if (remindersToSet.length > 0 && "Notification" in window) {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (Notification.permission === "granted") {
          for (const r of remindersToSet) {
            const med = meds.find((m) => m.uuid === r.medId);
            if (!med) continue;

            const targetTime = new Date(new Date(ts).getTime() + r.minutes * 60000);

            await LocalDb.upsertReminder({
              uuid: crypto.randomUUID(),
              group_id: g.group_id,
              user_uuid: targetUserId!,
              medication_uuid: med.uuid,
              title: `${med.name}の時間です`,
              scheduled_at: targetTime.toISOString(),
              is_notified: 0,
              is_deleted: 0,
              updated_at: new Date().toISOString(),
            });
          }
          showSnackbar(`${remindersToSet.length}件のリマインダーをセットしました`, { tone: "info" });
        }
      }

      await draft.clearDraft();
      showSnackbar("この端末に保存しました");
      navigate(-1);
    } catch (e) {
      console.error(e);
      await showAppAlert("保存できませんでした", "入力内容は保持されています。もう一度お試しください。");
      setIsSaving(false);
    }
  };

  const displayMeds = meds.filter((m) => {
    if (selMeds.includes(m.uuid)) return true;
    return m.show_in_input !== 0;
  });

  return (
    <div style={styles.page}>
      <header style={styles.appBar}>
        <button type="button" onClick={() => void leave()} disabled={isSaving} style={styles.navBtn}>
          キャンセル
        </button>
        <span style={styles.title}>
          {editId ? "記録の編集" : userName ? `${userName}の記録` : "記録する"}
        </span>
        <button type="button" onClick={() => void handleSave()} disabled={isSaving} aria-busy={isSaving} style={styles.navBtnBold}>
          {isSaving ? "..." : editId ? "更新" : "保存"}
        </button>
      </header>

      {!editId && (
        <div style={styles.tabContainer}>
          <button
            onClick={() => setMode("temp")}
            style={mode === "temp" ? styles.tabActive : styles.tabInactive}
          >
            体温 ＋ お薬
          </button>
          <button
            onClick={() => setMode("meds")}
            style={mode === "meds" ? styles.tabActive : styles.tabInactive}
          >
            💊 投薬のみ
          </button>
        </div>
      )}

      {remoteChanged && (
        <div role="alert" style={{ margin: "12px 16px 0", padding: 12, borderRadius: 10, background: "#fef9c3", color: "#713f12" }}>
          <strong>この記録は別の端末で更新されています</strong><br />
          入力内容は保持しています。保存時に競合判定を行います。
        </div>
      )}

      <div style={styles.body}>
        {mode === "temp" && (
          <div style={styles.card}>
            <div style={{ ...styles.tempDisplay, color: getTempColor(temp) }}>
              {temp.toFixed(1)}
              <span style={styles.unit}>℃</span>
            </div>

            <div style={styles.sliderWrap}>
              <input
                type="range"
                min="35.0"
                max="42.0"
                step="0.1"
                value={temp}
                onChange={(e) => setTemp(parseFloat(e.target.value))}
                style={styles.rangeInput}
              />
              <div style={styles.scaleLabels}>
                <span>35.0</span>
                <span>37.5</span>
                <span>42.0</span>
              </div>
            </div>
            <div style={styles.stepperRow}>
              <button
                onClick={() => setTemp((t) => +(t - 0.1).toFixed(1))}
                style={styles.stepBtn}
              >
                －0.1
              </button>
              <button
                onClick={() => setTemp((t) => +(t + 0.1).toFixed(1))}
                style={styles.stepBtn}
              >
                ＋0.1
              </button>
            </div>
          </div>
        )}

        <div style={styles.card}>
          <div style={styles.label}>日時</div>
          <div style={styles.row}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={styles.inputBox}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={styles.inputBox}
            />
          </div>
        </div>

        {mode === "temp" && (
          <div style={styles.card}>
            <div style={styles.rowBetween}>
              <div style={styles.label}>症状</div>
              {!editId && (
                <button
                  onClick={() => navigate("/settings/symptoms")}
                  style={styles.linkBtn}
                >
                  ＋
                </button>
              )}
            </div>
            {editId ? (
              <div style={{ fontSize: 12, color: "#999" }}>
                ※編集時は下のメモ欄で直接修正してください
              </div>
            ) : (
              <div style={styles.chipWrap}>
                {symptomsList.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleSymptom(s)}
                    style={symptoms.includes(s) ? styles.chipActive : styles.chip}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={styles.card}>
          <div style={styles.rowBetween}>
            <div style={styles.label}>お薬</div>
            {!editId && (
              <button
                onClick={() => navigate("/settings/medications")}
                style={styles.linkBtn}
              >
                ＋ 設定から追加
              </button>
            )}
          </div>

          {displayMeds.length === 0 ? (
            <div style={styles.emptyMsg}>表示できるお薬がありません</div>
          ) : (
            <div style={styles.list}>
              {displayMeds.map((m) => {
                const currentIso = `${date}T${time}`;
                const lastTime = getLastTakenTime(m.uuid, allUserEvents, editId, currentIso);
                const elapsedText = lastTime ? formatElapsedSince(lastTime, currentIso) : null;

                return (
                  <label
                    key={m.uuid}
                    style={selMeds.includes(m.uuid) ? styles.listItemActive : styles.listItem}
                  >
                    <input
                      type="checkbox"
                      checked={selMeds.includes(m.uuid)}
                      onChange={() => toggleMed(m.uuid)}
                      style={{ transform: "scale(1.2)", marginRight: 12 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>{m.name}</span>
                        {elapsedText && (
                          <span
                            style={{
                              fontSize: 11,
                              background: "#fef3c7",
                              color: "#d97706",
                              padding: "2px 6px",
                              borderRadius: 4,
                            }}
                          >
                            {elapsedText}
                          </span>
                        )}
                      </div>
                      {lastTime && (
                        <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                          前回:{" "}
                          {new Date(lastTime).toLocaleString([], {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.label}>メモ</div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            style={styles.textArea}
            placeholder="様子や特記事項を入力..."
          />
        </div>

        {editId && (
          <button
            onClick={deleteRecord}
            style={{
              marginTop: 16,
              width: "100%",
              padding: 16,
              background: "white",
              color: "#e53935",
              border: "none",
              borderRadius: 12,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            この記録を削除する
          </button>
        )}
      </div>

      {showReminderModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>リマインダー設定</h3>
            <div style={{ fontSize: 14, marginBottom: 16 }}>
              今回のお薬について、次回の通知をセットしますか？
            </div>
            {reminderTargetMeds.map((m) => (
              <div
                key={m.uuid}
                style={{
                  marginBottom: 12,
                  padding: 10,
                  background: "#f9f9f9",
                  borderRadius: 8,
                }}
              >
                <div style={{ fontWeight: "bold", marginBottom: 4 }}>{m.name}</div>
                <div style={{ fontSize: 13, color: "#666" }}>
                  設定値: {Math.floor((m.schedule?.reminder_minutes || 0) / 60)}時間後
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => executeSave([])}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                通知しない
              </button>
              <button
                onClick={() => {
                  const reminders = reminderTargetMeds.map((m) => ({
                    medId: m.uuid,
                    minutes: m.schedule?.reminder_minutes || 0,
                  }));
                  void executeSave(reminders);
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  border: "none",
                  background: "#111827",
                  color: "white",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                セットして保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#f4f5f7", fontFamily: "sans-serif" },
  appBar: {
    height: 56,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 16px",
    background: "#66A9D9",
    color: "white",
    position: "sticky",
    top: 0,
    zIndex: 10,
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  title: { fontWeight: "bold", fontSize: 18 },
  navBtn: { background: "transparent", border: "none", color: "white", fontSize: 14, cursor: "pointer" },
  navBtnBold: {
    background: "transparent",
    border: "none",
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    cursor: "pointer",
  },
  tabContainer: { display: "flex", background: "white", borderBottom: "1px solid #ddd" },
  tabActive: {
    flex: 1,
    padding: 12,
    border: "none",
    background: "#E8F4FF",
    borderBottom: "3px solid #66A9D9",
    color: "#005a9e",
    fontWeight: "bold",
    cursor: "pointer",
  },
  tabInactive: {
    flex: 1,
    padding: 12,
    border: "none",
    background: "white",
    borderBottom: "3px solid transparent",
    color: "#999",
    cursor: "pointer",
  },
  body: { padding: 16, display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 },
  card: { background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  tempDisplay: { fontSize: 48, fontWeight: "bold", textAlign: "center", marginBottom: 8 },
  unit: { fontSize: 20, marginLeft: 4, color: "#999" },
  sliderWrap: { padding: "10px 0" },
  rangeInput: {
    width: "100%",
    height: 6,
    background: "#ddd",
    borderRadius: 3,
    outline: "none",
    cursor: "pointer",
  },
  scaleLabels: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999", marginTop: 8 },
  stepperRow: { display: "flex", gap: 16, justifyContent: "center", marginTop: 12 },
  stepBtn: {
    padding: "8px 24px",
    borderRadius: 20,
    border: "1px solid #ddd",
    background: "#f9f9f9",
    fontSize: 14,
    fontWeight: "bold",
    cursor: "pointer",
  },
  label: { fontSize: 13, fontWeight: "bold", color: "#888", marginBottom: 8 },
  row: { display: "flex", gap: 10 },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  inputBox: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    border: "1px solid #ddd",
    fontSize: 16,
    textAlign: "center",
    background: "#f9f9f9",
  },
  chipWrap: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    padding: "8px 16px",
    borderRadius: 20,
    border: "1px solid #ddd",
    background: "white",
    color: "#666",
    cursor: "pointer",
  },
  chipActive: {
    padding: "8px 16px",
    borderRadius: 20,
    border: "1px solid #66A9D9",
    background: "#E8F4FF",
    color: "#005a9e",
    fontWeight: "bold",
    cursor: "pointer",
  },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "#005a9e",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: "bold",
  },
  emptyMsg: { textAlign: "center", color: "#ccc", fontSize: 14, padding: 10 },
  list: { display: "grid", gap: 8 },
  listItem: {
    display: "flex",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #eee",
    background: "white",
    cursor: "pointer",
  },
  listItemActive: {
    display: "flex",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #66A9D9",
    background: "#f0f9ff",
    cursor: "pointer",
    fontWeight: "bold",
    color: "#005a9e",
  },
  textArea: {
    width: "100%",
    height: 80,
    padding: 10,
    borderRadius: 8,
    border: "1px solid #ddd",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  modalContent: {
    width: "85%",
    maxWidth: 400,
    background: "white",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
  },
};
