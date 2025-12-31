import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { Medication, EventRow } from "../../utils/types";

// DBから症状が読めなかった場合の初期値
const FALLBACK_SYMPTOMS = ["咳", "鼻水", "頭痛", "喉の痛み", "食欲なし", "機嫌悪い", "嘔吐", "下痢", "発疹"];

export function InputPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const targetUserId = params.get("userId");
  
  // 編集モード用のパラメータ
  const editId = params.get("editId"); 
  const editType = params.get("type"); // 'temp' | 'med'

  // モード: "temp"=体温+薬, "meds"=薬のみ
  const [mode, setMode] = useState<"temp" | "meds">("temp");

  // 表示する症状リスト
  const [symptomsList, setSymptomsList] = useState<string[]>([]);

  // 入力データ
  const [temp, setTemp] = useState<number>(36.5);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  
  const [meds, setMeds] = useState<Medication[]>([]);
  const [selMeds, setSelMeds] = useState<string[]>([]); // 選択中の薬IDリスト
  
  // 編集時に読み込んだ元のお薬イベント（保存時の比較用）
  const [loadedMedEvents, setLoadedMedEvents] = useState<EventRow[]>([]);
  
  const [isSaving, setIsSaving] = useState(false);
  const [userName, setUserName] = useState("");

  // 初期化 & データロード
  useEffect(() => {
    const now = new Date();
    const yyyymmdd = now.toISOString().slice(0, 10);
    const hhmm = now.toTimeString().slice(0, 5);
    setDate(yyyymmdd);
    setTime(hhmm);

    LocalDb.getCurrentGroup().then(async (g) => {
        if (!g) return;
        
        // マスタ取得
        setMeds(await LocalDb.getMedications(g.group_id));

        const key = `symptoms_${g.group_id}`;
        const savedSym = await LocalDb.getMeta(key);
        setSymptomsList(savedSym ? JSON.parse(savedSym) : FALLBACK_SYMPTOMS);

        if (targetUserId) {
            const users = await LocalDb.listUsers(g.group_id);
            const u = users.find(u => u.uuid === targetUserId);
            if (u) setUserName(u.name);

            // === 編集データの読み込み ===
            if (editId) {
                const allEvents = await LocalDb.listEvents(targetUserId);

                if (editType === 'temp') {
                    // 体温記録の読み込み
                    const recs = await LocalDb.listRecords(targetUserId);
                    const target = recs.find(r => r.uuid === editId);
                    if (target) {
                        setMode("temp");
                        setTemp(target.temp);
                        // undefined対策
                        setMemo(target.memo || "");
                        
                        const d = new Date(target.measured_at);
                        setDate(d.toISOString().slice(0, 10));
                        setTime(d.toTimeString().slice(0, 5));

                        // 同じ時刻に記録されたお薬イベントを探して復元
                        const targetTime = target.measured_at;
                        const relatedMeds = allEvents.filter(e => 
                            e.event_type === "medication" && 
                            e.occurred_at === targetTime
                        );
                        
                        // ★修正: ここで undefined が混ざらないように || "" を追加
                        const medIds = relatedMeds.map(e => {
                            try {
                                const p = JSON.parse(e.payload || "{}");
                                // ペイロードが文字列ならそれ、オブジェクトならmedId、なければpayloadそのもの
                                return typeof p === 'string' ? p : (p.medId || e.payload || "");
                            } catch {
                                // JSONパース失敗時はpayloadそのもの（空なら空文字）
                                return e.payload || "";
                            }
                        });
                        // 空文字（失敗分）を除去してセット
                        setSelMeds(medIds.filter(id => id !== ""));
                        setLoadedMedEvents(relatedMeds);
                    }
                } else if (editType === 'med') {
                    // 投薬のみ記録の読み込み
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

  // 削除機能
  const deleteRecord = async () => {
      if (!confirm("この記録を削除しますか？")) return;
      setIsSaving(true);
      try {
          const g = await LocalDb.getCurrentGroup();
          if (!g || !targetUserId || !editId) throw new Error("情報不足");

          // 1. 体温記録の削除
          if (editType === 'temp') {
              const recs = await LocalDb.listRecords(targetUserId);
              const target = recs.find(r => r.uuid === editId);
              if (target) {
                  await LocalDb.upsertRecord({ ...target, is_deleted: 1, updated_at: new Date().toISOString() });
              }
          }

          // 2. 紐づいているお薬イベントも全て削除
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

  const save = async () => {
    if (isSaving) return;
    if (!targetUserId) {
        alert("ユーザーが指定されていません");
        return;
    }
    setIsSaving(true);
    try {
      const g = await LocalDb.getCurrentGroup();
      if (!g) throw new Error("グループ未設定");

      const ts = new Date(`${date}T${time}`).toISOString();
      
      // メモ構築
      let finalMemo = memo.trim();
      if (!editId && mode === "temp" && symptoms.length > 0) {
        const tags = symptoms.join(", ");
        if (!finalMemo.includes(tags)) {
          finalMemo = finalMemo ? `${tags}\n${finalMemo}` : tags;
        }
      }

      const recordUuid = (editType === 'temp' && editId) ? editId : crypto.randomUUID();

      // 1. 体温記録の保存
      if (mode === "temp") {
        await LocalDb.upsertRecord({
          uuid: recordUuid,
          group_id: g.group_id,
          user_uuid: targetUserId,
          temp: temp,
          memo: finalMemo,
          measured_at: ts,
          is_deleted: 0,
          updated_at: new Date().toISOString(),
        });
      }

      // 2. 投薬イベントの同期（追加・更新・削除）
      
      // A. チェックされているものを保存（新規作成 or 時刻更新）
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
                user_uuid: targetUserId,
                event_type: "medication",
                occurred_at: ts,
                payload: medId,
                is_deleted: 0,
                updated_at: new Date().toISOString(),
            });
        }
      }

      // B. チェックが外されたものを削除
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

      // 3. 投薬のみモードでメモのみ（編集非対応）
      if (mode === "meds" && finalMemo && !editId && selMeds.length === 0) {
         await LocalDb.upsertRecord({
          uuid: crypto.randomUUID(),
          group_id: g.group_id,
          user_uuid: targetUserId,
          temp: 0, 
          memo: finalMemo,
          measured_at: ts,
          is_deleted: 0,
          updated_at: new Date().toISOString(),
        });
      }

      navigate(-1);
    } catch (e) {
      console.error(e);
      alert("保存失敗");
      setIsSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.appBar}>
        <button onClick={() => navigate(-1)} style={styles.navBtn}>キャンセル</button>
        <span style={styles.title}>
            {editId ? "記録の編集" : (userName ? `${userName}の記録` : "記録する")}
        </span>
        <button onClick={save} disabled={isSaving} style={styles.navBtnBold}>
          {isSaving ? "..." : (editId ? "更新" : "保存")}
        </button>
      </header>

      {/* タブ切り替え（編集時は変更不可） */}
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
          
          {meds.length === 0 ? <div style={styles.emptyMsg}>登録されたお薬はありません</div> : (
            <div style={styles.list}>
              {meds.map((m) => (
                <label key={m.uuid} style={selMeds.includes(m.uuid) ? styles.listItemActive : styles.listItem}>
                  <input
                    type="checkbox"
                    checked={selMeds.includes(m.uuid)}
                    onChange={() => toggleMed(m.uuid)}
                    style={{ transform: "scale(1.2)", marginRight: 12 }}
                  />
                  <span>{m.name}</span>
                </label>
              ))}
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

        {/* 削除ボタン */}
        {editId && (
            <button 
                onClick={deleteRecord} 
                style={{marginTop: 16, width: "100%", padding: 16, background: "white", color: "#e53935", border: "none", borderRadius: 12, fontWeight: "bold", cursor: "pointer"}}
            >
                この記録を削除する
            </button>
        )}

      </div>
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
};