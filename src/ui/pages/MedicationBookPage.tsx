import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import type { User, Medication } from "../../utils/types";
import { parseInteraction, parseTags, parseSchedule } from "../../utils/aiParse";
import { describeActiveAiModel } from "../../config/aiDefaults";
import {
  onDataRefreshRequested,
  type SyncStoreName,
} from "../../services/sync/syncEvents";

// 五十音インデックス
const INDEX_CHARS = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ", "他"];

const MEDICATION_BOOK_REFRESH_STORES = new Set<SyncStoreName>([
  "groups",
  "users",
  "medications",
]);

function includesMedicationBookRefreshStore(stores: readonly SyncStoreName[]): boolean {
  return stores.some((store) => MEDICATION_BOOK_REFRESH_STORES.has(store));
}

/** ヨミガナ先頭文字からインデックス文字を判定 */
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

export default function MedicationBookPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);

  // フィルター
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // アコーディオン展開中ID
  const [expandedMedId, setExpandedMedId] = useState<string | null>(null);

  // AI モデル名表示
  const [modelName, setModelName] = useState("AI Model");

  // セクションへのスクロール用 ref
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const mountedRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const activeTabRef = useRef(activeTab);
  const activeTagRef = useRef(activeTag);
  const expandedMedIdRef = useRef(expandedMedId);

  const loadMedicationBookData = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    const group = await LocalDb.getCurrentGroup();

    if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;

    if (!group) {
      activeTabRef.current = "ALL";
      activeTagRef.current = null;
      expandedMedIdRef.current = null;
      setUsers([]);
      setMedications([]);
      setActiveTab("ALL");
      setActiveTag(null);
      setExpandedMedId(null);
      return;
    }

    const [nextUsers, nextMedications, aiSettings] = await Promise.all([
      LocalDb.listUsers(group.group_id),
      LocalDb.getMedications(group.group_id),
      LocalDb.getAiSettings(),
    ]);

    if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;

    const currentTab = activeTabRef.current;
    if (currentTab !== "ALL" && !nextUsers.some((user) => user.uuid === currentTab)) {
      activeTabRef.current = "ALL";
      setActiveTab("ALL");
    }

    const currentTag = activeTagRef.current;
    if (currentTag) {
      const nextTags = new Set(nextMedications.flatMap((medication) => parseTags(medication.ai_tags)));
      if (!nextTags.has(currentTag)) {
        activeTagRef.current = null;
        setActiveTag(null);
      }
    }

    const currentExpandedId = expandedMedIdRef.current;
    if (
      currentExpandedId &&
      !nextMedications.some((medication) => medication.uuid === currentExpandedId)
    ) {
      expandedMedIdRef.current = null;
      setExpandedMedId(null);
    }

    setUsers(nextUsers);
    setMedications(nextMedications);
    setModelName(describeActiveAiModel(aiSettings));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const initialLoadTimer = window.setTimeout(() => {
      void loadMedicationBookData();
    }, 0);

    return () => {
      mountedRef.current = false;
      loadRequestIdRef.current += 1;
      window.clearTimeout(initialLoadTimer);
    };
  }, [loadMedicationBookData]);

  useEffect(() => {
    return onDataRefreshRequested((detail) => {
      if (!includesMedicationBookRefreshStore(detail.stores)) return;
      void loadMedicationBookData();
    });
  }, [loadMedicationBookData]);

  const handleSelectTab = (tab: string) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
  };

  const handleSelectTag = (tag: string | null) => {
    activeTagRef.current = tag;
    setActiveTag(tag);
  };

  // 全タグ抽出（重複排除・ソート）
  const allTags = Array.from(
    new Set(medications.flatMap((m) => parseTags(m.ai_tags)))
  ).sort();

  // フィルタリング
  const filteredMeds = medications.filter((m) => {
    const userMatch =
      activeTab === "ALL" || !m.target_user_id || m.target_user_id === activeTab;
    const medTags = parseTags(m.ai_tags);
    const tagMatch = !activeTag || medTags.includes(activeTag);
    return userMatch && tagMatch;
  });

  // 五十音グルーピング
  const groupedMeds = filteredMeds.reduce((acc, med) => {
    const idx = getIndexChar(med.yomi || med.name);
    if (!acc[idx]) acc[idx] = [];
    acc[idx].push(med);
    return acc;
  }, {} as Record<string, Medication[]>);

  const scrollToSection = (char: string) => {
    sectionRefs.current[char]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleDetail = (uuid: string) => {
    setExpandedMedId((currentId) => {
      const nextId = currentId === uuid ? null : uuid;
      expandedMedIdRef.current = nextId;
      return nextId;
    });
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#f4f5f7",
        paddingBottom: 80,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          height: 56,
          background: "#66A9D9",
          color: "white",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => nav("/")}
          style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}
        >
          ←
        </button>
        <span style={{ marginLeft: 16, fontWeight: "bold" }}>お薬手帳</span>
      </header>

      {/* ユーザータブ */}
      <div
        style={{
          display: "flex",
          overflowX: "auto",
          background: "white",
          borderBottom: "1px solid #eee",
          padding: "0 8px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => handleSelectTab("ALL")}
          style={{
            padding: "12px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "ALL" ? "3px solid #66A9D9" : "3px solid transparent",
            fontWeight: activeTab === "ALL" ? "bold" : "normal",
            color: activeTab === "ALL" ? "#66A9D9" : "#666",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          全員
        </button>
        {users.map((u) => (
          <button
            key={u.uuid}
            onClick={() => handleSelectTab(u.uuid)}
            style={{
              padding: "12px 16px",
              background: "none",
              border: "none",
              borderBottom: activeTab === u.uuid ? "3px solid #66A9D9" : "3px solid transparent",
              fontWeight: activeTab === u.uuid ? "bold" : "normal",
              color: activeTab === u.uuid ? "#66A9D9" : "#666",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {u.name}
          </button>
        ))}
      </div>

      {/* タグフィルター */}
      {allTags.length > 0 && (
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            gap: 8,
            padding: "12px 16px",
            background: "#f9fafb",
            borderBottom: "1px solid #eee",
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 12, color: "#666", fontWeight: "bold", flexShrink: 0 }}>絞り込み:</div>
          <button
            onClick={() => handleSelectTag(null)}
            style={{
              padding: "6px 12px",
              borderRadius: 16,
              border: "1px solid",
              fontSize: 12,
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: activeTag === null ? "#66A9D9" : "white",
              color: activeTag === null ? "white" : "#666",
              borderColor: activeTag === null ? "#66A9D9" : "#ddd",
            }}
          >
            すべて
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleSelectTag(tag === activeTag ? null : tag)}
              style={{
                padding: "6px 12px",
                borderRadius: 16,
                border: "1px solid",
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: activeTag === tag ? "#e0f2fe" : "white",
                color: activeTag === tag ? "#0369a1" : "#666",
                borderColor: activeTag === tag ? "#0369a1" : "#ddd",
                fontWeight: activeTag === tag ? "bold" : "normal",
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, position: "relative", overflow: "hidden" }}>
        <main style={{ flex: 1, overflowY: "auto", padding: "16px 36px 80px 16px" }}>
          {filteredMeds.length === 0 && (
            <div style={{ textAlign: "center", color: "#999", marginTop: 40 }}>
              {activeTag ? (
                <>
                  該当するお薬が見つかりません。
                  <br />
                  条件を変更してください。
                </>
              ) : (
                <>
                  お薬が登録されていません。
                  <br />
                  右下のボタンから追加してください。
                </>
              )}
            </div>
          )}

          {INDEX_CHARS.map((char) => {
            const group = groupedMeds[char];
            if (!group || group.length === 0) return null;

            return (
              <div
                key={char}
                ref={(el) => {
                  sectionRefs.current[char] = el;
                }}
                style={{ marginBottom: 24 }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: "bold",
                    color: "#66A9D9",
                    background: "#e0f2fe",
                    padding: "4px 8px",
                    borderRadius: 4,
                    display: "inline-block",
                    marginBottom: 8,
                  }}
                >
                  {char}行
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {group.map((m) => {
                    const owner = users.find((u) => u.uuid === m.target_user_id);
                    const tags = parseTags(m.ai_tags);
                    const isExpanded = expandedMedId === m.uuid;
                    const interaction = parseInteraction(m.ai_interaction);

                    return (
                      <div
                        key={m.uuid}
                        style={{
                          background: "white",
                          borderRadius: 12,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                          overflow: "hidden",
                          border: isExpanded ? "2px solid #66A9D9" : "1px solid transparent",
                        }}
                      >
                        {/* ヘッダー（タップで開閉） */}
                        <div
                          onClick={() => toggleDetail(m.uuid)}
                          style={{
                            padding: "12px 16px",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: "bold",
                                fontSize: 16,
                                color: "#333",
                                marginBottom: 4,
                              }}
                            >
                              {m.name}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: 6,
                              }}
                            >
                              {owner && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: "#f3f4f6",
                                    color: "#666",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {owner.name}
                                </span>
                              )}
                              {tags.slice(0, 3).map((t, i) => (
                                <span
                                  key={i}
                                  style={{
                                    fontSize: 10,
                                    background: "#e0f2fe",
                                    color: "#0369a1",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {t}
                                </span>
                              ))}

                              {m.doctor_comment && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: "#92400e",
                                    background: "#fffbeb",
                                    padding: "2px 4px",
                                    borderRadius: 4,
                                  }}
                                  title="医師メモあり"
                                >
                                  👨‍⚕️
                                </span>
                              )}
                              {(m.memo_taste || m.taste_rating) && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: "#4b5563",
                                    background: "#f3f4f6",
                                    padding: "2px 4px",
                                    borderRadius: 4,
                                  }}
                                  title="親メモあり"
                                >
                                  📝
                                </span>
                              )}

                              {interaction && interaction.status === "danger" && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: "#fee2e2",
                                    color: "#b91c1c",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    fontWeight: "bold",
                                  }}
                                >
                                  ⚠️ 注意
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            style={{
                              color: "#ccc",
                              fontSize: 18,
                              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 0.2s",
                              marginLeft: 8,
                            }}
                          >
                            ›
                          </div>
                        </div>

                        {/* アコーディオン詳細 */}
                        {isExpanded && (
                          <div
                            style={{
                              padding: "16px",
                              borderTop: "1px solid #eee",
                              background: "#fafafa",
                              wordBreak: "break-all",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {/* 1. AI判定 */}
                            {interaction && interaction.message && (
                              <div
                                style={{
                                  background:
                                    interaction.status === "danger"
                                      ? "#fee2e2"
                                      : interaction.status === "warning"
                                      ? "#fef9c3"
                                      : "#dcfce7",
                                  color:
                                    interaction.status === "danger"
                                      ? "#b91c1c"
                                      : interaction.status === "warning"
                                      ? "#854d0e"
                                      : "#166534",
                                  padding: "12px",
                                  borderRadius: 8,
                                  fontSize: 14,
                                  marginBottom: 16,
                                  border: `1px solid ${
                                    interaction.status === "danger"
                                      ? "#fecaca"
                                      : interaction.status === "warning"
                                      ? "#fde047"
                                      : "#bbf7d0"
                                  }`,
                                }}
                              >
                                <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                                  {interaction.status === "danger"
                                    ? "⚠️ 併用注意・警告"
                                    : interaction.status === "safe"
                                    ? "✅ 判定結果"
                                    : "ℹ️ 判定結果"}
                                </div>
                                {interaction.message}
                              </div>
                            )}

                            {/* 2. 飲むタイミング */}
                            <div
                              style={{
                                background: "white",
                                padding: 12,
                                borderRadius: 8,
                                fontSize: 14,
                                marginBottom: 12,
                                border: "1px solid #eee",
                              }}
                            >
                              <div style={{ fontWeight: "bold", marginBottom: 4, color: "#555" }}>
                                ⏰ 飲むタイミング
                              </div>
                              {(() => {
                                const s = parseSchedule(m.schedule);
                                const intervalHours = Number(
                                  s.interval_hours || m.default_interval_hours || 0
                                );
                                const maxTimes = Number(s.max_times || 0);
                                const reminderMin = Number(s.reminder_minutes || 0);

                                if (
                                  s.type === "interval" ||
                                  (m.default_interval_hours && m.default_interval_hours > 0)
                                ) {
                                  return (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      <div>
                                        ⏱️ <b>{intervalHours > 0 ? intervalHours : "?"}時間</b>おき (1日
                                        {maxTimes > 0 ? maxTimes : "?"}回まで)
                                      </div>
                                      {reminderMin > 0 && (
                                        <div style={{ fontSize: 12, color: "#666" }}>
                                          🔔 通知: {reminderMin / 60}時間後
                                        </div>
                                      )}
                                    </div>
                                  );
                                }

                                const times = [
                                  Number(s.wakeup) > 0 && "起床時",
                                  Number(s.morning) > 0 && "朝",
                                  Number(s.lunch) > 0 && "昼",
                                  Number(s.evening) > 0 && "夕",
                                  Number(s.bedtime) > 0 && "寝る前",
                                ].filter(Boolean) as string[];

                                return (
                                  <div>
                                    {times.length > 0 ? (
                                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        {times.map((t) => (
                                          <span
                                            key={t}
                                            style={{
                                              background: "#f3f4f6",
                                              padding: "2px 8px",
                                              borderRadius: 4,
                                              fontSize: 13,
                                            }}
                                          >
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      "指定なし (医師の指示に従ってください)"
                                    )}

                                    {reminderMin > 0 && (
                                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                                        🔔 通知あり
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* 3. 医師・薬剤師メモ */}
                            <div
                              style={{
                                background: "#fffbeb",
                                padding: 12,
                                borderRadius: 8,
                                fontSize: 14,
                                color: "#92400e",
                                lineHeight: 1.5,
                                marginBottom: 12,
                                border: "1px solid #fef3c7",
                              }}
                            >
                              <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                                👨‍⚕️ 医師・薬剤師メモ
                              </div>
                              {m.doctor_comment ? (
                                m.doctor_comment
                              ) : (
                                <span style={{ opacity: 0.6 }}>（記載なし）</span>
                              )}
                            </div>

                            {/* 4. 親メモ */}
                            <div
                              style={{
                                background: "white",
                                padding: 12,
                                borderRadius: 8,
                                fontSize: 14,
                                color: "#4b5563",
                                marginBottom: 12,
                                border: "1px solid #eee",
                              }}
                            >
                              <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                                📝 親メモ (味・飲ませ方)
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  marginBottom: 4,
                                }}
                              >
                                {m.taste_rating === "good" && (
                                  <span style={{ fontSize: 18, color: "#0369a1" }}>◎</span>
                                )}
                                {m.taste_rating === "normal" && (
                                  <span style={{ fontSize: 18, color: "#666" }}>○</span>
                                )}
                                {m.taste_rating === "bad" && (
                                  <span style={{ fontSize: 18, color: "#991b1b" }}>△</span>
                                )}
                              </div>
                              {m.memo_taste ? (
                                m.memo_taste
                              ) : (
                                <span style={{ opacity: 0.6 }}>（記載なし）</span>
                              )}
                            </div>

                            {/* 5. AI解説 */}
                            {m.ai_description && (
                              <div
                                style={{
                                  fontSize: 14,
                                  color: "#4b5563",
                                  lineHeight: 1.6,
                                  background: "white",
                                  padding: 12,
                                  borderRadius: 8,
                                  border: "1px solid #eee",
                                }}
                              >
                                <div style={{ fontWeight: "bold", marginBottom: 4, color: "#333" }}>
                                  🤖 AI解説
                                </div>
                                {m.ai_description}
                                <div
                                  style={{
                                    textAlign: "right",
                                    marginTop: 8,
                                    fontSize: 10,
                                    color: "#ccc",
                                  }}
                                >
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
                                width: "100%",
                                padding: 14,
                                background: "#111827",
                                color: "white",
                                borderRadius: 12,
                                border: "none",
                                fontWeight: "bold",
                                fontSize: 15,
                                cursor: "pointer",
                                marginTop: 16,
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
        <nav
          style={{
            width: 24,
            background: "rgba(255,255,255,0.9)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: "-1px 0 3px rgba(0,0,0,0.05)",
            zIndex: 10,
          }}
        >
          {INDEX_CHARS.map((char) => (
            <div
              key={char}
              onClick={() => scrollToSection(char)}
              style={{
                flex: 1,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                color: "#66A9D9",
                fontWeight: "bold",
                cursor: "pointer",
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
          position: "fixed",
          right: 20,
          bottom: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: "#111827",
          color: "white",
          border: "none",
          fontSize: 24,
          fontWeight: "bold",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
        }}
      >
        ＋
      </button>
    </div>
  );
}
