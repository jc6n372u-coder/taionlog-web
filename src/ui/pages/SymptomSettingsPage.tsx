import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import { showAppAlert, showAppConfirm, showAppPrompt } from "../feedback/feedbackService";

const DEFAULT_SYMPTOMS = [
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

export default function SymptomSettingsPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<string[]>([]);
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<{ groupId: string; items: string[] } | null> => {
      const group = await LocalDb.getCurrentGroup();
      if (!group) return null;

      const saved = await LocalDb.getMeta(`symptoms_${group.group_id}`);
      if (!saved) return { groupId: group.group_id, items: DEFAULT_SYMPTOMS };

      try {
        const parsed = JSON.parse(saved) as unknown;
        return {
          groupId: group.group_id,
          items:
            Array.isArray(parsed) && parsed.every((value) => typeof value === "string")
              ? parsed
              : DEFAULT_SYMPTOMS,
        };
      } catch {
        return { groupId: group.group_id, items: DEFAULT_SYMPTOMS };
      }
    };

    void load().then((result) => {
      if (!result || cancelled) return;
      setGroupId(result.groupId);
      setItems(result.items);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (newItems: string[]) => {
      setItems(newItems);
      if (groupId) {
        await LocalDb.setMeta(`symptoms_${groupId}`, JSON.stringify(newItems));
      }
    },
    [groupId]
  );

  const add = useCallback(async () => {
    const name = (await showAppPrompt({
      title: "症状を追加",
      label: "新しい症状",
      placeholder: "例：倦怠感",
      confirmLabel: "追加する",
    }))?.trim();
    if (!name) return;
    if (items.includes(name)) {
      await showAppAlert("追加できません", "その症状は既にあります。");
      return;
    }
    void save([...items, name]);
  }, [items, save]);

  const del = useCallback(
    async (target: string) => {
      const confirmed = await showAppConfirm({
        title: `「${target}」を削除しますか？`,
        message: "症状の選択肢から削除します。",
        confirmLabel: "削除する",
        cancelLabel: "キャンセル",
        danger: true,
      });
      if (!confirmed) return;
      void save(items.filter((item) => item !== target));
    },
    [items, save]
  );

  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      const destination = index + direction;
      if (destination < 0 || destination >= items.length) return;
      const nextItems = [...items];
      [nextItems[index], nextItems[destination]] = [
        nextItems[destination],
        nextItems[index],
      ];
      void save(nextItems);
    },
    [items, save]
  );

  const reset = useCallback(async () => {
    const confirmed = await showAppConfirm({
      title: "初期のリストに戻しますか？",
      message: "現在の並びと追加した症状は置き換えられます。",
      confirmLabel: "初期状態に戻す",
      cancelLabel: "キャンセル",
      danger: true,
    });
    if (!confirmed) return;
    await save(DEFAULT_SYMPTOMS);
  }, [save]);

  return (
    <div style={{ minHeight: "100dvh", background: "#f4f5f7" }}>
      <header
        style={{
          height: 56,
          background: "#66A9D9",
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          color: "white",
        }}
      >
        <button
          type="button"
          onClick={() => nav(-1)}
          style={{
            border: "none",
            background: "transparent",
            color: "white",
            fontSize: 20,
            width: 40,
          }}
        >
          ←
        </button>
        <span style={{ fontWeight: "bold", fontSize: 16 }}>症状タグの管理</span>
      </header>

      <main style={{ padding: 16 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 16 }}>
          <button
            type="button"
            onClick={add}
            style={{
              width: "100%",
              padding: 12,
              background: "#E8F4FF",
              color: "#005a9e",
              border: "none",
              borderRadius: 8,
              fontWeight: "bold",
              marginBottom: 16,
            }}
          >
            + 症状を追加する
          </button>

          <div style={{ display: "grid", gap: 8 }}>
            {items.map((item, index) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: "1px solid #f0f0f0",
                  padding: 10,
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {index > 0 && (
                      <button type="button" onClick={() => move(index, -1)} style={styles.arrowBtn}>
                        ↑
                      </button>
                    )}
                    {index < items.length - 1 && (
                      <button type="button" onClick={() => move(index, 1)} style={styles.arrowBtn}>
                        ↓
                      </button>
                    )}
                  </div>
                  <div style={{ fontWeight: "bold" }}>{item}</div>
                </div>
                <button
                  type="button"
                  onClick={() => del(item)}
                  style={{
                    border: "1px solid #ddd",
                    background: "white",
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#e53935",
                  }}
                >
                  削除
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                fontSize: 12,
                color: "#999",
                background: "transparent",
                border: "none",
                textDecoration: "underline",
              }}
            >
              デフォルトに戻す
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  arrowBtn: {
    border: "none",
    background: "transparent",
    color: "#66A9D9",
    fontWeight: "bold",
    fontSize: 14,
    cursor: "pointer",
    padding: "2px 8px",
  },
};
