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

// データパース用ヘルパー
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

function safeParseSchedule(input: any): any {
    try {
        if (typeof input === "object") return input;
        if (typeof input === "string") return JSON.parse(input);
    } catch { return {}; }
    return {};
}

export default function MedicationBookPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  
  // 展開している薬のID管理
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // スクロール制御用Ref
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    LocalDb.getCurrentGroup().then(async (g) => {
      if (!g) return;
      const us = await LocalDb.listUsers(g.group_id);
      setUsers(us);
      // listMedicationsは既にヨミガナ順で返ってくる
      const meds = await LocalDb.getMedications(g.group_id);
      setMedications(meds);
    });
  }, []);

  // フィルタリング
  const filteredMeds = medications.filter(m => {
    if (activeTab === "ALL") return true;
    return !m.target_user_id || m.target_user_id === activeTab;
  });

  // グルーピング処理
  const groupedMeds = filteredMeds.reduce((acc, med) => {
    const idx = getIndexChar(med.yomi || med.name);
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
          {/* paddingRightを広めにとってインデックスバーと重ならないようにする */}
          
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
                  {group.map(m => {
                    const owner = users.find(u => u.uuid === m.target_user_id);
                    const tags = safeParseTags(m.ai_tags);
                    const isExpanded = expandedId === m.uuid;
                    const schedule = safeParseSchedule(m.schedule);

                    return (
                      <div 
                        key={m.uuid}
                        onClick={() => setExpandedId(isExpanded ? null : m.uuid)}
                        style={{
                          background: "white", padding: 12, borderRadius: 12,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)", cursor: "pointer",
                          border: isExpanded ? "2px solid #66A9D9" : "1px solid transparent"
                        }}
                      >
                        {/* 閉じた状態（サマリー） */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: "bold", fontSize: 16, color: "#333" }}>{m.name}</div>
                            {owner && (
                              <span style={{ fontSize: 10, background: "#f3f4f6", color: "#666", padding: "2px 6px", borderRadius: 4, marginRight: 6 }}>
                                {owner.name}
                              </span>
                            )}
                            {tags.slice(0, 3).map((t, i) => (
                                <span key={i} style={{ fontSize: 10, background: "#e0f2fe", color: "#0369a1", padding: "2px 6px", borderRadius: 4, marginRight: 4 }}>
                                    {t}
                                </span>
                            ))}
                          </div>
                          <div style={{ color: "#ccc", fontSize: 12 }}>
                            {isExpanded ? "▲" : "▼"}
                          </div>
                        </div>

                        {/* 開いた状態（詳細） */}
                        {isExpanded && (
                          <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
                            
                            {/* スケジュール表示 */}
                            <div style={{ fontSize: 13, marginBottom: 8 }}>
                                <strong>⏰ タイミング: </strong>
                                {schedule?.type === 'interval' ? (
                                    <span>{schedule.interval_hours}時間おき (1日{schedule.max_times}回まで)</span>
                                ) : (
                                    <span>
                                        {[
                                            schedule?.morning > 0 && "朝",
                                            schedule?.lunch > 0 && "昼",
                                            schedule?.evening > 0 && "夕",
                                            schedule?.bedtime > 0 && "寝る前"
                                        ].filter(Boolean).join("・") || "回数指定なし"}
                                    </span>
                                )}
                            </div>

                            {/* 医師コメント */}
                            {m.doctor_comment && (
                                <div style={{ background: "#fffbeb", padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 13, color: "#92400e" }}>
                                    <strong>👨‍⚕️ 医師・薬剤師より:</strong><br/>
                                    {m.doctor_comment}
                                </div>
                            )}

                            {/* AI解説 */}
                            {m.ai_description && (
                                <div style={{ fontSize: 12, color: "#666", marginBottom: 12, lineHeight: "1.4" }}>
                                    <strong>🤖 AI解説:</strong><br/>
                                    {m.ai_description}
                                </div>
                            )}

                            {/* 編集ボタン */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation(); // アコーディオン開閉を阻止
                                    nav(`/medication-book/edit/${m.uuid}`);
                                }}
                                style={{
                                    width: "100%", padding: 8, background: "#111827", color: "white",
                                    borderRadius: 8, border: "none", fontWeight: "bold", fontSize: 13
                                }}
                            >
                                ✎ 編集する
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
