import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";

// デフォルトの症状リスト（初期値）
const DEFAULT_SYMPTOMS = ["咳", "鼻水", "頭痛", "喉の痛み", "食欲なし", "機嫌悪い", "嘔吐", "下痢", "発疹"];

export default function SymptomSettingsPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<string[]>([]);
  const [groupId, setGroupId] = useState("");

  useEffect(() => { reload(); }, []);

  async function reload() {
    const g = await LocalDb.getCurrentGroup();
    if (!g) return;
    setGroupId(g.group_id);

    // DB(Meta)から保存された症状リストを取得
    const key = `symptoms_${g.group_id}`;
    const saved = await LocalDb.getMeta(key);
    
    if (saved) {
      // 保存データがあればそれをパースして使用
      try {
        setItems(JSON.parse(saved));
      } catch {
        setItems(DEFAULT_SYMPTOMS);
      }
    } else {
      // まだ保存されていなければデフォルトを表示
      setItems(DEFAULT_SYMPTOMS);
    }
  }

  // 保存処理
  const save = async (newItems: string[]) => {
    setItems(newItems);
    if (groupId) {
      const key = `symptoms_${groupId}`;
      await LocalDb.setMeta(key, JSON.stringify(newItems));
    }
  };

  // 追加
  const add = () => {
    const name = prompt("新しい症状を入力してください");
    if (!name) return;
    if (items.includes(name)) return alert("その症状は既にあります");
    save([...items, name]);
  };

  // 削除
  const del = (target: string) => {
    if (!confirm(`「${target}」を削除しますか？`)) return;
    save(items.filter(i => i !== target));
  };

  // 並び替え
  const move = (index: number, direction: -1 | 1) => {
    const newItems = [...items];
    const swapTarget = newItems[index + direction];
    if (!swapTarget) return;

    newItems[index + direction] = newItems[index];
    newItems[index] = swapTarget;
    save(newItems);
  };

  // 初期化（リセット）
  const reset = () => {
    if (!confirm("初期のリストに戻しますか？")) return;
    save(DEFAULT_SYMPTOMS);
  };

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7"}}>
      <header style={{height: 56, background: "#66A9D9", display: "flex", alignItems: "center", padding: "0 8px", color: "white"}}>
        <button onClick={() => nav(-1)} style={{border:"none", background:"transparent", color:"white", fontSize:20, width:40}}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>症状タグの管理</span>
      </header>

      <main style={{padding: 16}}>
         <div style={{background:"white", borderRadius:12, padding:16}}>
             <button onClick={add} style={{width:"100%", padding:12, background:"#E8F4FF", color:"#005a9e", border:"none", borderRadius:8, fontWeight:"bold", marginBottom:16}}>
                 + 症状を追加する
             </button>

             <div style={{display: "grid", gap: 8}}>
               {items.map((item, i) => (
                 <div key={item} style={{display: "flex", justifyContent: "space-between", alignItems: "center", border:"1px solid #f0f0f0", padding: 10, borderRadius:8}}>
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                        <div style={{display:"flex", flexDirection:"column"}}>
                           {i > 0 && <button onClick={() => move(i, -1)} style={styles.arrowBtn}>↑</button>}
                           {i < items.length - 1 && <button onClick={() => move(i, 1)} style={styles.arrowBtn}>↓</button>}
                        </div>
                        <div style={{fontWeight: "bold"}}>{item}</div>
                    </div>
                    <button onClick={() => del(item)} style={{border:"1px solid #ddd", background:"white", padding:"6px 12px", borderRadius: 8, fontSize: 12, color:"#e53935"}}>
                      削除
                    </button>
                 </div>
               ))}
             </div>

             <div style={{marginTop: 24, textAlign: "center"}}>
                <button onClick={reset} style={{fontSize: 12, color: "#999", background: "transparent", border: "none", textDecoration: "underline"}}>
                    デフォルトに戻す
                </button>
             </div>
         </div>
      </main>
    </div>
  );
}

const styles = {
    arrowBtn: { border:"none", background:"transparent", color:"#66A9D9", fontWeight:"bold", fontSize:14, cursor:"pointer", padding: "2px 8px" }
};