import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { User, Medication } from "../../utils/types";

// 五十音インデックス用
const INDEX_CHARS = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ", "他"];

// ヨミガナからインデックス文字を判定する
function getIndexChar(yomi: string): string {
  if (!yomi) return "他";
  const first = yomi.charAt(0);
  if (/[あ-お]/.test(first)) return "あ";
  if (/[か-こが-ご]/.test(first)) return "か";
  if (/[さ-そざ-ぞ]/.test(first)) return "さ";
  if (/[た-とだ-ど]/.test(first)) return "た";
  if (/[な-の]/.test(first)) return "な";
  if (/[は-ほば-ぼぱ-ぽ]/.test(first)) return "は";
  if (/[ま-も]/.test(first)) return "ま";
  if (/[や-よ]/.test(first)) return "や";
  if (/[ら-ろ]/.test(first)) return "ら";
  if (/[わ-ん]/.test(first)) return "わ";
  return "他";
}

// データパース用ヘルパー: タグ
function safeParseTags(input: any): string[] {
    try {
        if (Array.isArray(input)) return input;
        if (typeof input === "string") {
            const trimmed = input.trim();
            if (!trimmed) return [];
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed : [trimmed];
            }
            return [trimmed];
        }
    } catch { return []; }
    return [];
}

// データパース用ヘルパー: スケジュール
function safeParseSchedule(input: any): any {
    try {
        if (typeof input === "object") return input;
        if (typeof input === "string") return JSON.parse(input);
    } catch { return {}; }
    return {};
}

// ★追加: データパース用ヘルパー: 飲み合わせ・AI判定 (編集画面から移植)
function parseCustomFormat(input: any): { status: string, message: string } | null {
  if (!input) return null;
  if (typeof input === "object") return input; 
  if (typeof input === "string") {
    const trimmed = input.trim();
    try { return JSON.parse(trimmed); } catch {}
    
    // 特殊フォーマット {status=..., message=...} の解析
    if (trimmed.startsWith("{") && trimmed.includes("message=")) {
      let status = "none";
      let message = trimmed;
      if (trimmed.includes("status=danger")) status = "danger";
      else if (trimmed.includes("status=warning")) status = "warning";
      else if (trimmed.includes("status=safe")) status = "safe";
      
      const msgStart = trimmed.indexOf("message=");
      if (msgStart !== -1) {
        let cleanMsg = trimmed.slice(msgStart + 8);
        if (cleanMsg.endsWith("}")) cleanMsg = cleanMsg.slice(0, -1);
        const statusIdx = cleanMsg.lastIndexOf(", status=");
        if (statusIdx !== -1) cleanMsg = cleanMsg.substring(0, statusIdx);
        message = cleanMsg.trim();
      }
      return { status, message };
    }
    // 単純な文字列の場合
    return { status: "none", message: trimmed };
  }
  return null;
}

export default function MedicationBookPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  
  // 展開中のアイテムID
  const [expandedMedId, setExpandedMedId] = useState<string | null>(null);

  // AIモデル名表示用
  const [modelName, setModelName] = useState("");

  // スクロール制御用Ref
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    LocalDb.getCurrentGroup().then(async (g) => {
      if (!g) return;
      const us = await LocalDb.listUsers(g.group_id);
      setUsers(us);
      const meds = await LocalDb.getMedications(g.group_id);
      setMedications(meds);

      // AI設定の読み込み
      const s = await LocalDb.getAiSettings();
      if (s?.geminiApiKey) {
        setModelName(s.geminiModel || "Gemini 1.5 Flash");
      } else if (s?.groqApiKey) {
        setModelName((s.groqModel || "Llama 3") + " (via Groq)");
      } else {
        setModelName("AI Model");
      }
    });
  }, []);

  // フィルタリング
  const filteredMeds = medications.filter(m => {
    if (activeTab === "ALL") return true;
    return !m.target_user_id || m.target_user_id === activeTab;
  });

  // グルーピング処理
  const groupedMeds = filteredMeds.reduce((acc, med) => {
    // 正しいカラム名 yomi を使用
    const m = med as any; 
    const idx = getIndexChar(m.yomi || m.name);
    if (!acc[idx]) acc[idx] = [];
    acc[idx].push(med);
    return acc;
  }, {} as Record<string, Medication[]>);

  // インデックスジャンプ
  const scrollToSection = (char: string) => {
    const el = sectionRefs.current[char];
    if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // アコーディオン開閉
  const toggleDetail = (uuid: string) => {
    if (expandedMedId === uuid) {
      setExpandedMedId(null);
    } else {
      setExpandedMedId(uuid);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f5f7", paddingBottom: 80, display: "flex", flexDirection: "column" }}>
      {/* ヘッダー */}
      <header style={{ height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", padding: "0 16px", flexShrink: 0 }}>
        <button onClick={() => nav("/")} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>←</button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>お薬手帳</span>
      </header>

      {/* ユーザータブ */}
      <div style={{ display: "flex", overflowX: "auto", background: "white", borderBottom: "1px solid #eee", padding: "0 8px", flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab("ALL")}
          style={{
            padding: "12px 16px", background: "none", border: "none",
            borderBottom: activeTab === "ALL" ? "3px solid #66A9D9" : "3px solid transparent",
            fontWeight: activeTab === "ALL" ? "bold" : "normal",
            color: activeTab === "ALL" ? "#66A9D9" : "#666",
            cursor: "pointer", whiteSpace: "nowrap"
          }}
        >
          全員
        </button>
        {users.map(u => (
          <button
            key={u.uuid}
            onClick={() => setActiveTab(u.uuid)}
            style={{
              padding: "12px 16px", background: "none", border: "none",
              borderBottom: activeTab === u.uuid ? "3px solid #66A9D9" : "3px solid transparent",
              fontWeight: activeTab === u.uuid ? "bold" : "normal",
              color: activeTab === u.uuid ? "#66A9D9" : "#666",
              cursor: "pointer", whiteSpace: "nowrap"
            }}
          >
            {u.name}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flex: 1, position: "relative", overflow: "hidden" }}>
        {/* メインリストエリア */}
        <main style={{ flex: 1, overflowY: "auto", padding: "16px 36px 80px 16px" }}> 
          {filteredMeds.length === 0 && (
            <div style={{ textAlign: "center", color: "#999", marginTop: 40 }}>
              お薬が登録されていません。<br />
              右下のボタンから追加してください。
            </div>
          )}

          {INDEX_CHARS.map(char => {
            const group = groupedMeds[char];
            if (!group || group.length === 0) return null;

            return (
              <div 
                key={char} 
                ref={(el) => { sectionRefs.current[char] = el; }} 
                style={{ marginBottom: 24 }}
              >
                <div style={{ 
                    fontSize: 14, fontWeight: "bold", color: "#66A9D9", 
                    background: "#e0f2fe", padding: "4px 8px", borderRadius: 4, 
                    display: "inline-block", marginBottom: 8 
                }}>
                    {char}行
                </div>
                
                <div style={{ display: "grid", gap: 8 }}>
                  {group.map(med => {
                    // 正式なフィールドにアクセスするためキャスト
                    const m = med as any;

                    const owner = users.find(u => u.uuid === m.target_user_id);
                    const tags = safeParseTags(m.ai_tags);
                    const isExpanded = expandedMedId === m.uuid;
                    
                    // ★修正: 単数形 ai_interaction を取得しパースする
                    const interaction = parseCustomFormat(m.ai_interaction);
                    
                    return (
                      <div 
                        key={m.uuid}
                        style={{
                          background: "white", borderRadius: 12,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                          overflow: "hidden", 
                          border: isExpanded ? "2px solid #66A9D9" : "1px solid transparent" 
                        }}
                      >
                        {/* --- クリックで開閉するヘッダー部分 --- */}
                        <div
                            onClick={() => toggleDetail(m.uuid)}
                            style={{
                                padding: "12px 16px", cursor: "pointer",
                                display: "flex", justifyContent: "space-between", alignItems: "center"
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: "bold", fontSize: 16, color: "#333", marginBottom: 4 }}>
                                    {m.name}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                                    {owner && (
                                        <span style={{ fontSize: 10, background: "#f3f4f6", color: "#666", padding: "2px 6px", borderRadius: 4 }}>
                                            {owner.name}
                                        </span>
                                    )}
                                    {tags.slice(0, 3).map((t: string, i: number) => (
                                        <span key={i} style={{ fontSize: 10, background: "#e0f2fe", color: "#0369a1", padding: "2px 6px", borderRadius: 4 }}>
                                            {t}
                                        </span>
                                    ))}
                                    {/* ヘッダーにも危険信号があれば表示 */}
                                    {interaction && interaction.status === 'danger' && (
                                        <span style={{ fontSize: 10, background: "#fee2e2", color: "#b91c1c", padding: "2px 6px", borderRadius: 4, fontWeight: "bold" }}>
                                            ⚠️ 注意
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ color: "#ccc", fontSize: 18, transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", marginLeft: 8 }}>
                                ›
                            </div>
                        </div>

                        {/* --- アコーディオン詳細部分 --- */}
                        {isExpanded && (
                            <div style={{ 
                                padding: "16px", 
                                borderTop: "1px solid #eee", 
                                background: "#fafafa",
                                wordBreak: "break-all",
                                whiteSpace: "pre-wrap"
                            }}>
                                {/* 1. AI判定結果（飲み合わせ/注意） */}
                                {interaction && interaction.message && (
                                    <div style={{ 
                                        background: interaction.status === 'danger' ? "#fee2e2" : interaction.status === 'warning' ? "#fef9c3" : "#dcfce7", 
                                        color: interaction.status === 'danger' ? "#b91c1c" : interaction.status === 'warning' ? "#854d0e" : "#166534", 
                                        padding: "12px", borderRadius: 8, fontSize: 14, marginBottom: 16, 
                                        border: `1px solid ${interaction.status === 'danger' ? "#fecaca" : interaction.status === 'warning' ? "#fde047" : "#bbf7d0"}`
                                    }}>
                                        <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                                            {interaction.status === 'danger' ? "⚠️ 併用注意・警告" : interaction.status === 'safe' ? "✅ 判定結果" : "ℹ️ 判定結果"}
                                        </div>
                                        {interaction.message}
                                    </div>
                                )}

                                {/* 2. 飲み方・タイミング（詳細表示） */}
                                <div style={{ background: "white", padding: 12, borderRadius: 8, fontSize: 14, marginBottom: 12, border: "1px solid #eee" }}>
                                    <div style={{ fontWeight: "bold", marginBottom: 4, color: "#555" }}>⏰ 飲むタイミング</div>
                                    {(() => {
                                        const s = safeParseSchedule(m.schedule);
                                        const intervalHours = Number(s?.interval_hours || m.default_interval_hours || 0);
                                        const maxTimes = Number(s?.max_times || 0);
                                        const reminderMin = Number(s?.reminder_minutes || 0);

                                        // 間隔モード
                                        if (s?.type === 'interval' || (m.default_interval_hours && m.default_interval_hours > 0)) {
                                            return (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                    <div>⏱️ <b>{intervalHours > 0 ? intervalHours : "?"}時間</b>おき (1日{maxTimes > 0 ? maxTimes : "?"}回まで)</div>
                                                    {reminderMin > 0 && (
                                                        <div style={{ fontSize: 12, color: "#666" }}>🔔 通知: {reminderMin / 60}時間後</div>
                                                    )}
                                                </div>
                                            );
                                        } 
                                        // 固定時間モード (デフォルト)
                                        else {
                                            const times = [
                                                (Number(s?.wakeup) > 0) && "起床時",
                                                (Number(s?.morning) > 0) && "朝",
                                                (Number(s?.lunch) > 0) && "昼",
                                                (Number(s?.evening) > 0) && "夕",
                                                (Number(s?.bedtime) > 0) && "寝る前"
                                            ].filter(Boolean);
                                            
                                            return (
                                                <div>
                                                    {times.length > 0 ? (
                                                        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                                                            {times.map((t:any) => (
                                                                <span key={t} style={{background:"#f3f4f6", padding:"2px 8px", borderRadius:4, fontSize:13}}>{t}</span>
                                                            ))}
                                                        </div>
                                                    ) : "指定なし (医師の指示に従ってください)"}
                                                    
                                                    {reminderMin > 0 && (
                                                        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>🔔 通知あり</div>
                                                    )}
                                                </div>
                                            );
                                        }
                                    })()}
                                </div>

                                {/* 3. 医師・薬剤師メモ */}
                                {m.doctor_comment && (
                                    <div style={{ background: "#fffbeb", padding: 12, borderRadius: 8, fontSize: 14, color: "#92400e", lineHeight: 1.5, marginBottom: 12, border: "1px solid #fef3c7" }}>
                                        <div style={{ fontWeight: "bold", marginBottom: 4 }}>👨‍⚕️ 医師・薬剤師メモ</div>
                                        {m.doctor_comment}
                                    </div>
                                )}

                                {/* 4. 親メモ（味・飲ませ方） */}
                                {(m.memo_taste || m.taste_rating) && (
                                    <div style={{ background: "white", padding: 12, borderRadius: 8, fontSize: 14, color: "#4b5563", marginBottom: 12, border: "1px solid #eee" }}>
                                        <div style={{ fontWeight: "bold", marginBottom: 4 }}>📝 親メモ (味・飲ませ方)</div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                            {m.taste_rating === 'good' && <span style={{fontSize:18, color:"#0369a1"}}>◎</span>}
                                            {m.taste_rating === 'normal' && <span style={{fontSize:18, color:"#666"}}>○</span>}
                                            {m.taste_rating === 'bad' && <span style={{fontSize:18, color:"#991b1b"}}>△</span>}
                                        </div>
                                        {m.memo_taste}
                                    </div>
                                )}

                                {/* 5. AI解説 */}
                                {m.ai_description && (
                                    <div style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6, background: "white", padding: 12, borderRadius: 8, border: "1px solid #eee" }}>
                                        <div style={{ fontWeight: "bold", marginBottom: 4, color: "#333" }}>🤖 AI解説</div>
                                        {m.ai_description}
                                        <div style={{ textAlign: "right", marginTop: 8, fontSize: 10, color: "#ccc" }}>
                                            Powered by {modelName}
                                        </div>
                                    </div>
                                )}

                                {/* 編集ボタン */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); 
                                        nav(`/medication-book/edit/${m.uuid}`);
                                    }}
                                    style={{
                                        width: "100%", padding: 14, background: "#111827", color: "white",
                                        borderRadius: 12, border: "none", fontWeight: "bold", fontSize: 15,
                                        cursor: "pointer", marginTop: 16
                                    }}
                                >
                                    ✎ 情報を編集する
                                </button>
                            </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </main>

        {/* 右端インデックスバー */}
        <nav style={{ 
            width: 24, background: "rgba(255,255,255,0.9)", 
            display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
            boxShadow: "-1px 0 3px rgba(0,0,0,0.05)", zIndex: 10
        }}>
            {INDEX_CHARS.map(char => (
                <div 
                    key={char}
                    onClick={() => scrollToSection(char)}
                    style={{ 
                        flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: "#66A9D9", fontWeight: "bold", cursor: "pointer"
                    }}
                >
                    {char}
                </div>
            ))}
        </nav>
      </div>

      <button 
        onClick={() => nav("/medication-book/new")}
        style={{ 
          position: "fixed", right: 20, bottom: 20, 
          width: 56, height: 56, borderRadius: 28, 
          background: "#111827", color: "white", 
          border: "none", fontSize: 24, fontWeight: "bold", 
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 20
        }}
      >
        ＋
      </button>
    </div>
  );
}