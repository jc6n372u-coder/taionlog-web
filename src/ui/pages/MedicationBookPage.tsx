import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { User, Medication } from "../../utils/types";

export default function MedicationBookPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [activeTab, setActiveTab] = useState<string>("ALL"); // 'ALL' or user_uuid

  useEffect(() => {
    LocalDb.getCurrentGroup().then(async (g) => {
      if (!g) return;
      const us = await LocalDb.listUsers(g.group_id);
      setUsers(us);
      const meds = await LocalDb.getMedications(g.group_id);
      setMedications(meds);
    });
  }, []);

  // フィルタリング処理
  const filteredMeds = medications.filter(m => {
    if (activeTab === "ALL") return true;
    return !m.target_user_id || m.target_user_id === activeTab;
  });

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f5f7", paddingBottom: 80 }}>
      {/* ヘッダー */}
      <header style={{ height: 56, background: "#66A9D9", color: "white", display: "flex", alignItems: "center", padding: "0 16px" }}>
        <button onClick={() => nav("/ai-support")} style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>←</button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>お薬手帳</span>
      </header>

      {/* ユーザータブ (家族フィルタ) */}
      <div style={{ display: "flex", overflowX: "auto", background: "white", borderBottom: "1px solid #eee", padding: "0 8px" }}>
        <button
          onClick={() => setActiveTab("ALL")}
          style={{
            padding: "12px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "ALL" ? "3px solid #66A9D9" : "3px solid transparent",
            fontWeight: activeTab === "ALL" ? "bold" : "normal",
            color: activeTab === "ALL" ? "#66A9D9" : "#666",
            cursor: "pointer",
            whiteSpace: "nowrap"
          }}
        >
          全員
        </button>
        {users.map(u => (
          <button
            key={u.uuid}
            onClick={() => setActiveTab(u.uuid)}
            style={{
              padding: "12px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTab === u.uuid ? "3px solid #66A9D9" : "3px solid transparent",
              fontWeight: activeTab === u.uuid ? "bold" : "normal",
              color: activeTab === u.uuid ? "#66A9D9" : "#666",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            {u.name}
          </button>
        ))}
      </div>

      <main style={{ padding: 16 }}>
        {filteredMeds.length === 0 && (
          <div style={{ textAlign: "center", color: "#999", marginTop: 40 }}>
            お薬が登録されていません。<br />
            右下のボタンから追加してください。
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {filteredMeds.map(m => {
            const owner = users.find(u => u.uuid === m.target_user_id);
            
            // タグの安全なパース処理
            let displayTags: string[] = [];
            try {
                const rawTags = m.ai_tags as any;
                if (Array.isArray(rawTags)) {
                    displayTags = rawTags;
                } else if (typeof rawTags === "string") {
                    const trimmed = rawTags.trim();
                    if (trimmed) {
                        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                            try {
                                const parsed = JSON.parse(trimmed);
                                if (Array.isArray(parsed)) displayTags = parsed;
                                else displayTags = [trimmed];
                            } catch { displayTags = [trimmed]; }
                        } else {
                            displayTags = [trimmed];
                        }
                    }
                }
            } catch (e) {
                displayTags = [];
            }

            return (
              <div 
                key={m.uuid}
                onClick={() => nav(`/medication-book/edit/${m.uuid}`)}
                style={{
                  background: "white",
                  padding: 16,
                  borderRadius: 12,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  cursor: "pointer"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: "bold", fontSize: 16, color: "#333" }}>{m.name}</div>
                  {owner && (
                    <div style={{ fontSize: 11, background: "#e0f2fe", color: "#0369a1", padding: "2px 8px", borderRadius: 10 }}>
                      {owner.name}
                    </div>
                  )}
                </div>

                {displayTags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                    {displayTags.map((tag, i) => (
                      <span key={i} style={{ fontSize: 11, background: "#f3f4f6", color: "#4b5563", padding: "2px 6px", borderRadius: 4 }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                
                {/* 解説：改行を許可し、全体を表示するように修正 */}
                {m.ai_description && (
                  <div style={{ fontSize: 12, color: "#666", marginTop: 8, whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
                    {m.ai_description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <button 
        onClick={() => nav("/medication-book/new")}
        style={{ 
          position: "fixed", right: 20, bottom: 20, 
          width: 56, height: 56, borderRadius: 28, 
          background: "#111827", color: "white", 
          border: "none", fontSize: 24, fontWeight: "bold", 
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
        }}
      >
        ＋
      </button>
    </div>
  );
}
