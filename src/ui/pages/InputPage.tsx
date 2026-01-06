import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { Medication, EventRow } from "../../utils/types";

// DBから症状が読めなかった場合の初期値
const FALLBACK_SYMPTOMS = ["咳", "鼻水", "頭痛", "喉の痛み", "食欲なし", "機嫌悪い", "嘔吐", "下痢", "発疹"];

// 前回の服用時間を計算するためのヘルパー
function getLastTakenTime(medId: string, events: EventRow[], currentEventId: string | null): string | null {
    // 自分自身（編集中）を除外して、過去の同じ薬のイベントを探す
    const targetEvents = events.filter(e => {
        if (e.uuid === currentEventId) return false;
        if (e.event_type !== "medication") return false;
        
        let mId = e.payload;
        try {
            const p = JSON.parse(e.payload || "{}");
            if (typeof p !== 'string' && p.medId) mId = p.medId;
        } catch {}
        
        return mId === medId;
    });

    if (targetEvents.length === 0) return null;
    
    // 新しい順にソート
    targetEvents.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return targetEvents[0].occurred_at;
}

// 時間差分を表示形式に変換 (例: "8時間経過")
function getElapsedText(lastIso: string, currentIso: string): string {
    const last = new Date(lastIso).getTime();
    const curr = new Date(currentIso).getTime();
    const diffMin = Math.floor((curr - last) / 60000);
    
    if (diffMin < 60) return `${diffMin}分前`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `${h}時間${m > 0 ? m + "分" : ""}経過`;
}

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
  
  // 過去の全イベント（前回服用チェック用）
  const [allUserEvents, setAllUserEvents] = useState<EventRow[]>([]);

  const [loadedMedEvents, setLoadedMedEvents] = useState<EventRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [userName, setUserName] = useState("");

  // リマインダー設定モーダル用
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderTargetMeds, setReminderTargetMeds] = useState<Medication[]>([]);

  useEffect(() => {
    const now = new Date();
    const yyyymmdd = now.toISOString().slice(0, 10);
    const hhmm = now.toTimeString().slice(0, 5);
    setDate(yyyymmdd);
    setTime(hhmm);

    LocalDb.getCurrentGroup().then(async (g) => {
        if (!g) return;
        
        // お薬マスタ取得
        setMeds(await LocalDb.getMedications(g.group_id));

        const key = `symptoms_${g.group_id}`;
        const savedSym = await LocalDb.getMeta(key);
        setSymptomsList(savedSym ? JSON.parse(savedSym) : FALLBACK_SYMPTOMS);

        if (targetUserId) {
            const users = await LocalDb.listUsers(g.group_id);
            const u = users.find(u => u.uuid === targetUserId);
            if (u) setUserName(u.name);

            // 過去イベント全取得
            const allEvents = await LocalDb.listEvents(targetUserId);
            setAllUserEvents(allEvents);

            // === 編集データの読み込み ===
            if (editId) {
                if (editType === 'temp') {
                    const recs = await LocalDb.listRecords(targetUserId);
                    const target = recs.find(r => r.uuid === editId);
                    if (target) {
                        setMode("temp");
                        setTemp(target.temp);
                        setMemo(target.memo || "");
                        
                        const d = new Date(target.measured_at);
                        setDate(d.toISOString().slice(0, 10));
                        setTime(d.toTimeString().slice(0, 5));

                        const targetTime = target.measured_at;
                        const relatedMeds = allEvents.filter(e => 
                            e.event_type === "medication" && 
                            e.occurred_at === targetTime
                        );
                        
                        const medIds = relatedMeds.map(e => {
                            try {
                                const p = JSON.parse(e.payload || "{}");
                                return typeof p === 'string' ? p : (p.medId || e.payload || "");
                            } catch {
                                return e.payload || "";
                            }
                        });
                        setSelMeds(medIds.filter(id => id !== ""));
                        setLoadedMedEvents(relatedMeds);
                    }
                } else if (editType === 'med') {
                    const target = allEvents.find(e => e.uuid === editId);
                    if (target) {
                        setMode("meds");
                        const d = new Date(target.occurred_at);
                        setDate(d.toISOString().slice(0, 10));
                        setTime(d.toTimeString().slice(0, 5));
                        
                        let currentId = target.payload;
                        try {
                             const p = JSON.parse(target.payload || "{}");
                             if (typeof p !== 'string' && p.medId) currentId = p.medId;
                        } catch {}

                        if (currentId && !currentId.startsWith("{")) {
                            setSelMeds([currentId]);
                        }
                        setLoadedMedEvents([target]);
                    }
                }
            }
        }
    });
  }, [targetUserId, editId, editType]);

  const toggleSymptom = (s: string) => {
    setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const toggleMed = (id: string) => {
    setSelMeds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getTempColor = (t: number) => {
    if (t >= 37.5) return "#FF5722";
    return "#66A9D9";
  };

  const deleteRecord = async () => {
      if (!confirm("この記録を削除しますか？")) return;
      setIsSaving(true);
      try {
          const g = await LocalDb.getCurrentGroup();
          if (!g || !targetUserId || !editId) throw new Error("情報不足");

          if (editType === 'temp') {
              const recs = await LocalDb.listRecords(targetUserId);
              const target = recs.find(r => r.uuid === editId);
              if (target) {
                  await LocalDb.upsertRecord({ ...target, is_deleted: 1, updated_at: new Date().toISOString() });
              }
          }

          for (const evt of loadedMedEvents) {
              await LocalDb.upsertEvent({ ...evt, is_deleted: 1, updated_at: new Date().toISOString() });
          }

          alert("削除しました");
          navigate(-1);
      } catch (e) {
          console.error(e);
          alert("削除に失敗しました");
          setIsSaving(false);
      }
  };

  // 保存処理
  const handleSave = async () => {
    if (isSaving) return;
    if (!targetUserId) {
        alert("ユーザーが指定されていません");
        return;
    }
    
    // リマインダー設定が必要な薬があるかチェック
    // 条件: 今回選択された薬の中で、reminder_minutes > 0 の設定があるもの
    // かつ、まだリマインダーモーダルを表示していない場合
    if (!showReminderModal && selMeds.length > 0) {
        const targets = meds.filter(m => 
            selMeds.includes(m.uuid) && 
            m.schedule && 
            (m.schedule.reminder_minutes || 0) > 0
        );
        
        if (targets.length > 0) {
            // モーダルを表示して一旦停止
            setReminderTargetMeds(targets);
            setShowReminderModal(true);
            return;
        }
    }

    await executeSave();
  };

  // 実際の保存実行（リマインダー登録含む）
  const executeSave = async (remindersToSet: { medId: string, minutes: number }[] = []) => {
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

      const recordUuid = (editType === 'temp' && editId) ? editId : crypto.randomUUID();

      // 1. 体温記録
      if (mode === "temp") {
        await LocalDb.upsertRecord({
          uuid: recordUuid,
          group_id: g.group_id,
          user_uuid: targetUserId!,
          temp: temp,
          memo: finalMemo,
          measured_at: ts,
          is_deleted: 0,
          updated_at: new Date().toISOString(),
        });
      }

      // 2. 投薬イベント
      for (const medId of selMeds) {
        const existingEvent = loadedMedEvents.find(e => {
            try {
                 const p = JSON.parse(e.payload || "{}");
                 const pid = typeof p === 'string' ? p : (p.medId || e.payload);
                 return pid === medId;
            } catch {
                 return e.payload === medId;
            }
        });

        if (existingEvent) {
            await LocalDb.upsertEvent({
                ...existingEvent,
                occurred_at: ts, 
                is_deleted: 0,
                updated_at: new Date().toISOString()
            });
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

      // 削除された投薬イベントの処理
      for (const evt of loadedMedEvents) {
          let evtMedId = evt.payload || "";
          try {
              const p = JSON.parse(evt.payload || "{}");
              if (typeof p !== 'string' && p.medId) evtMedId = p.medId;
          } catch {}

          if (!selMeds.includes(evtMedId)) {
              await LocalDb.upsertEvent({
                  ...evt,
                  is_deleted: 1, 
                  updated_at: new Date().toISOString()
              });
          }
      }

      // 3. 投薬のみモードのメモ
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

      // === 4. リマインダー登録 (Notification API) ===
      if (remindersToSet.length > 0 && "Notification" in window) {
          if (Notification.permission === "default") {
              await Notification.requestPermission();
          }
          if (Notification.permission === "granted") {
              // サービスワーカーの登録取得（PWA前提）
              const reg = await navigator.serviceWorker.ready;
              
              for (const r of remindersToSet) {
                  const med = meds.find(m => m.uuid === r.medId);
                  if (!med) continue;
                  
                  // 通知予定時刻
                  const targetTime = new Date(new Date(ts).getTime() + r.minutes * 60000);
                  
                  // showNotificationは即時通知用だが、timestampオプションで未来を指定しても
                  // ブラウザによっては即時出てしまうことがある。
                  // 本格的な遅延通知には Push API + Server が必要だが、
                  // ここでは簡易的に「現在時刻 + 遅延」で通知を試みるか、
                  // もしくはアプリ起動時のチェックで出す設計にするのが一般的。
                  // 今回はブラウザの制限上、setTimeoutでアプリが開いている間のみ有効な簡易実装とするか、
                  // またはサーバーレスの限界として「カレンダー登録」などを促すのが現実的。
                  
                  // ★ここでは「リマインダーデータ(Reminder)」をDBに保存し、
                  //   アプリ起動時や定期チェックで通知を出す仕組みに繋げるためのデータ保存を行う。
                  
                  await LocalDb.upsertReminder({
                      uuid: crypto.randomUUID(),
                      group_id: g.group_id,
                      user_uuid: targetUserId!,
                      medication_uuid: med.uuid,
                      title: `${med.name}の時間です`,
                      scheduled_at: targetTime.toISOString(),
                      is_notified: 0,
                      is_deleted: 0,
                      updated_at: new Date().toISOString()
                  });
              }
              // ユーザーへのフィードバック
              alert(`${remindersToSet.length}件のリマインダーをセットしました`);
          }
      }

      navigate(-1);
    } catch (e) {
      console.error(e);
      alert("保存失敗");
      setIsSaving(false);
    }
  };

  // 表示する薬リストのフィルタリング
  const displayMeds = meds.filter(m => {
      // 1. 今回選択されている薬は必ず表示
      if (selMeds.includes(m.uuid)) return true;
      // 2. 設定で「表示」になっている薬を表示
      // (show_in_input が undefined の場合は true 扱い)
      return m.show_in_input !== 0; 
  });

  return (
    <div style={styles.page}>
      <header style={styles.appBar}>
        <button onClick={() => navigate(-1)} style={styles.navBtn}>キャンセル</button>
        <span style={styles.title}>
            {editId ? "記録の編集" : (userName ? `${userName}の記録` : "記録する")}
        </span>
        <button onClick={handleSave} disabled={isSaving} style={styles.navBtnBold}>
          {isSaving ? "..." : (editId ? "更新" : "保存")}
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

      <div style={styles.body}>
        
        {/* === 体温入力カード === */}
        {mode === "temp" && (
          <div style={styles.card}>
            <div style={{...styles.tempDisplay, color: getTempColor(temp)}}>
              {temp.toFixed(1)}<span style={styles.unit}>℃</span>
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
                <span>35.0</span><span>37.5</span><span>42.0</span>
              </div>
            </div>
            <div style={styles.stepperRow}>
                <button onClick={() => setTemp(t => +(t - 0.1).toFixed(1))} style={styles.stepBtn}>－0.1</button>
                <button onClick={() => setTemp(t => +(t + 0.1).toFixed(1))} style={styles.stepBtn}>＋0.1</button>
            </div>
          </div>
        )}

        {/* === 日時カード === */}
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

        {/* === 症状カード === */}
        {mode === "temp" && (
          <div style={styles.card}>
            <div style={styles.rowBetween}>
              <div style={styles.label}>症状</div>
              {!editId && (
                  <button onClick={() => navigate("/settings/symptoms")} style={styles.linkBtn}>＋</button>
              )}
            </div>
            {editId ? (
                <div style={{fontSize:12, color:"#999"}}>※編集時は下のメモ欄で直接修正してください</div>
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

        {/* === お薬カード === */}
        <div style={styles.card}>
          <div style={styles.rowBetween}>
            <div style={styles.label}>お薬</div>
            {!editId && <button onClick={() => navigate("/settings/medications")} style={styles.linkBtn}>＋ 設定から追加</button>}
          </div>
          
          {displayMeds.length === 0 ? <div style={styles.emptyMsg}>表示できるお薬がありません</div> : (
            <div style={styles.list}>
              {displayMeds.map((m) => {
                // 前回情報の取得
                const lastTime = getLastTakenTime(m.uuid, allUserEvents, editId);
                const currentIso = `${date}T${time}`;
                const elapsedText = lastTime ? getElapsedText(lastTime, currentIso) : null;
                const isIntervalMode = m.schedule?.type === 'interval';

                return (
                  <label key={m.uuid} style={selMeds.includes(m.uuid) ? styles.listItemActive : styles.listItem}>
                    <input
                      type="checkbox"
                      checked={selMeds.includes(m.uuid)}
                      onChange={() => toggleMed(m.uuid)}
                      style={{ transform: "scale(1.2)", marginRight: 12 }}
                    />
                    <div style={{flex: 1}}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>{m.name}</span>
                            {/* 間隔モードで、前回情報があれば表示 */}
                            {isIntervalMode && elapsedText && (
                                <span style={{ fontSize: 11, background: "#fef3c7", color: "#d97706", padding: "2px 6px", borderRadius: 4 }}>
                                    {elapsedText}
                                </span>
                            )}
                        </div>
                        {isIntervalMode && lastTime && (
                             <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                                 前回: {new Date(lastTime).toLocaleString([], {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                             </div>
                        )}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* === メモカード === */}
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
                style={{marginTop: 16, width: "100%", padding: 16, background: "white", color: "#e53935", border: "none", borderRadius: 12, fontWeight: "bold", cursor: "pointer"}}
            >
                この記録を削除する
            </button>
        )}

      </div>

      {/* === リマインダー設定モーダル === */}
      {showReminderModal && (
          <div style={styles.modalOverlay}>
              <div style={styles.modalContent}>
                  <h3 style={{marginTop:0, marginBottom: 16}}>リマインダー設定</h3>
                  <div style={{fontSize:14, marginBottom:16}}>
                      今回のお薬について、次回の通知をセットしますか？
                  </div>
                  {reminderTargetMeds.map(m => (
                      <div key={m.uuid} style={{marginBottom:12, padding:10, background:"#f9f9f9", borderRadius:8}}>
                          <div style={{fontWeight:"bold", marginBottom:4}}>{m.name}</div>
                          <div style={{fontSize:13, color:"#666"}}>
                              設定値: {Math.floor((m.schedule?.reminder_minutes || 0) / 60)}時間後
                          </div>
                      </div>
                  ))}
                  <div style={{display:"flex", gap:10, marginTop:20}}>
                      <button 
                          onClick={() => executeSave([])} // 通知なしで保存
                          style={{flex:1, padding:12, borderRadius:8, border:"1px solid #ddd", background:"white", cursor:"pointer"}}
                      >
                          通知しない
                      </button>
                      <button 
                          onClick={() => {
                              // 設定値をそのまま使う
                              const reminders = reminderTargetMeds.map(m => ({
                                  medId: m.uuid,
                                  minutes: m.schedule?.reminder_minutes || 0
                              }));
                              executeSave(reminders);
                          }}
                          style={{flex:1, padding:12, borderRadius:8, border:"none", background:"#111827", color:"white", fontWeight:"bold", cursor:"pointer"}}
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

// === スタイル定義 ===
const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#f4f5f7", fontFamily: "sans-serif" },
  appBar: { height: 56, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", background: "#66A9D9", color: "white", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 4px rgba(0,0,0,0.1)" },
  title: { fontWeight: "bold", fontSize: 18 },
  navBtn: { background: "transparent", border: "none", color: "white", fontSize: 14, cursor: "pointer" },
  navBtnBold: { background: "transparent", border: "none", color: "white", fontSize: 16, fontWeight: "bold", cursor: "pointer" },
  tabContainer: { display: "flex", background: "white", borderBottom: "1px solid #ddd" },
  tabActive: { flex: 1, padding: 12, border: "none", background: "#E8F4FF", borderBottom: "3px solid #66A9D9", color: "#005a9e", fontWeight: "bold", cursor: "pointer" },
  tabInactive: { flex: 1, padding: 12, border: "none", background: "white", borderBottom: "3px solid transparent", color: "#999", cursor: "pointer" },
  body: { padding: 16, display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 },
  card: { background: "white", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  tempDisplay: { fontSize: 48, fontWeight: "bold", textAlign: "center", marginBottom: 8 },
  unit: { fontSize: 20, marginLeft: 4, color: "#999" },
  sliderWrap: { padding: "10px 0" },
  rangeInput: { width: "100%", height: 6, background: "#ddd", borderRadius: 3, outline: "none", cursor: "pointer" },
  scaleLabels: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999", marginTop: 8 },
  stepperRow: { display: "flex", gap: 16, justifyContent: "center", marginTop: 12 },
  stepBtn: { padding: "8px 24px", borderRadius: 20, border: "1px solid #ddd", background: "#f9f9f9", fontSize: 14, fontWeight: "bold", cursor: "pointer" },
  label: { fontSize: 13, fontWeight: "bold", color: "#888", marginBottom: 8 },
  row: { display: "flex", gap: 10 },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  inputBox: { flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 16, textAlign: "center", background: "#f9f9f9" },
  chipWrap: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { padding: "8px 16px", borderRadius: 20, border: "1px solid #ddd", background: "white", color: "#666", cursor: "pointer" },
  chipActive: { padding: "8px 16px", borderRadius: 20, border: "1px solid #66A9D9", background: "#E8F4FF", color: "#005a9e", fontWeight: "bold", cursor: "pointer" },
  linkBtn: { border: "none", background: "transparent", color: "#005a9e", fontSize: 13, cursor: "pointer", fontWeight: "bold" },
  emptyMsg: { textAlign: "center", color: "#ccc", fontSize: 14, padding: 10 },
  list: { display: "grid", gap: 8 },
  listItem: { display: "flex", alignItems: "center", padding: 12, borderRadius: 8, border: "1px solid #eee", background: "white", cursor: "pointer" },
  listItemActive: { display: "flex", alignItems: "center", padding: 12, borderRadius: 8, border: "1px solid #66A9D9", background: "#f0f9ff", cursor: "pointer", fontWeight: "bold", color: "#005a9e" },
  textArea: { width: "100%", height: 80, padding: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" },
  
  // モーダル用
  modalOverlay: { position: "fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"center", alignItems:"center", zIndex: 100 },
  modalContent: { width: "85%", maxWidth: 400, background: "white", borderRadius: 12, padding: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" },
};
