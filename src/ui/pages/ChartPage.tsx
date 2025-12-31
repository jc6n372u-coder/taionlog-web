import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LocalDb } from "../../data/local/localDb";
import TemperatureMedicationChart, { ViewMode } from "../../features/chart/TemperatureMedicationChart";
import type { User, RecordRow, EventRow, Medication } from "../../utils/types";

const COLORS = {
  BLUE: '#66A9D9',
  FEVER: '#FF5722',
  MED: '#F59E0B',
};

export default function ChartPage() {
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [selUser, setSelUser] = useState<string>("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [meds, setMeds] = useState<EventRow[]>([]);
  
  // ★追加: お薬の名前を引くためのマスタデータ
  const [medMaster, setMedMaster] = useState<Medication[]>([]);
  
  const [viewMode, setViewMode] = useState<ViewMode>('week'); 

  // 初期化（ユーザー一覧とお薬マスタの取得）
  useEffect(() => {
    LocalDb.getCurrentGroup().then(async (g) => {
      if (!g) return nav("/");
      
      const us = await LocalDb.listUsers(g.group_id);
      setUsers(us);
      if (us.length > 0) setSelUser(us[0].uuid);

      // ★追加: お薬マスタを取得して保存
      const mm = await LocalDb.getMedications(g.group_id);
      setMedMaster(mm);
    });
  }, [nav]);

  useEffect(() => {
    if (!selUser) return;
    Promise.all([
      LocalDb.listRecords(selUser),
      LocalDb.listEvents(selUser) 
    ]).then(([r, m]) => {
      setRecords(r);
      const onlyMeds = m.filter(e => e.event_type === "medication");
      setMeds(onlyMeds);
    });
  }, [selUser]);

  const windowDays = useMemo(() => {
    switch (viewMode) {
      case 'day': return 1;
      case 'week': return 7;
      case 'month': return 30;
      case 'year': return 365;
    }
  }, [viewMode]);

  // ★お薬IDから名前を解決する関数
  const getMedName = (payload: string) => {
      if (!payload) return "未指定";

      // 1. マスタからIDで直接探す (今のInputPageの保存形式)
      const directMatch = medMaster.find(m => m.uuid === payload);
      if (directMatch) return directMatch.name;

      // 2. JSON形式の場合 (古いデータや特殊な保存形式)
      try {
          const obj = JSON.parse(payload);
          // 名前が直接入っている場合
          if (obj.medName) return obj.medName;
          // IDが入っている場合
          if (obj.medId) {
             const match = medMaster.find(m => m.uuid === obj.medId);
             if (match) return match.name;
          }
      } catch {}

      return "不明なお薬";
  };

  const chartData = useMemo(() => {
    const now = new Date().getTime();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;

    const tempPoints = records
      .filter(r => (now - new Date(r.measured_at).getTime()) < windowMs)
      .filter(r => r.temp > 30.0)
      .map(r => ({ time: new Date(r.measured_at).getTime(), value: r.temp }));

    const medPoints = meds
      .filter(m => (now - new Date(m.occurred_at).getTime()) < windowMs)
      .map(m => {
        // ★修正: 名前解決関数を使用
        return { 
            time: new Date(m.occurred_at).getTime(), 
            name: getMedName(m.payload || "") 
        };
      });

    return { tempPoints, medPoints };
  }, [records, meds, windowDays, medMaster]); // medMasterが変わったら再計算

  const combinedList = useMemo(() => {
    const now = new Date().getTime();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;

    const map = new Map<string, { 
      date: string, 
      temp?: number, 
      medNames: string[], 
      memo?: string,
      id: string,
      type: 'temp' | 'med'
    }>();

    records.forEach(r => {
      if ((now - new Date(r.measured_at).getTime()) >= windowMs) return;
      const key = r.measured_at; 
      map.set(key, { 
        date: r.measured_at, 
        temp: r.temp > 0 ? r.temp : undefined, 
        memo: r.memo ?? undefined,
        medNames: [],
        id: r.uuid,
        type: 'temp'
      });
    });

    meds.forEach(m => {
      if ((now - new Date(m.occurred_at).getTime()) >= windowMs) return;
      const key = m.occurred_at;
      
      // ★修正: 名前解決関数を使用
      const name = getMedName(m.payload || "");

      if (map.has(key)) {
        map.get(key)!.medNames.push(name);
      } else {
        map.set(key, {
          date: m.occurred_at,
          medNames: [name],
          id: m.uuid,
          type: 'med'
        });
      }
    });

    return Array.from(map.values())
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  }, [records, meds, windowDays, medMaster]);

  const goEdit = (item: { id: string, type: string }) => {
      nav(`/input?userId=${selUser}&editId=${item.id}&type=${item.type}`);
  };

  return (
    <div style={{minHeight: "100dvh", background: "#f4f5f7", display: "flex", flexDirection: "column"}}>
      <header style={{height: 56, background: COLORS.BLUE, display: "flex", alignItems: "center", padding: "0 8px", color: "white"}}>
        <button onClick={() => nav("/")} style={{border:"none", background:"transparent", color:"white", fontSize:20, width:40}}>←</button>
        <span style={{fontWeight: "bold", fontSize: 16}}>グラフ</span>
      </header>

      <div style={{background: "white", padding: "12px 16px", overflowX: "auto", display: "flex", gap: 8, borderBottom: "1px solid #eee"}}>
        {users.map(u => (
          <button 
            key={u.uuid} 
            onClick={() => setSelUser(u.uuid)}
            style={selUser === u.uuid ? styles.tabActive : styles.tab}
          >
            {u.name}
          </button>
        ))}
      </div>

      <div style={{padding: 16, background: "white", marginBottom: 16}}>
        <div style={{display: "flex", justifyContent: "center", marginBottom: 16}}>
            <div style={styles.segmentControl}>
                {['day', 'week', 'month', 'year'].map(mode => (
                    <button 
                      key={mode}
                      onClick={() => setViewMode(mode as ViewMode)}
                      style={viewMode === mode ? styles.segmentBtnActive : styles.segmentBtn}
                    >
                        {{day:'日', week:'週', month:'月', year:'年'}[mode]}
                    </button>
                ))}
            </div>
        </div>

        <TemperatureMedicationChart 
            temperatures={chartData.tempPoints}
            medications={chartData.medPoints}
            viewMode={viewMode} 
        />
      </div>

      <div style={{flex: 1, padding: 16, overflowY: "auto"}}>
        <h3 style={{fontSize: 14, color: "#666", marginBottom: 12}}>
            履歴 ({viewMode === 'day' ? '24時間' : viewMode === 'week' ? '1週間' : viewMode === 'month' ? '1ヶ月' : '1年'})
        </h3>
        {combinedList.length === 0 && <div style={{textAlign:"center", color:"#ccc", padding:20}}>記録がありません</div>}
        
        {combinedList.map(item => {
            const hasTemp = item.temp !== undefined;
            const isFever = hasTemp && item.temp! >= 37.5;
            
            let leftColor = "#333";
            if (hasTemp) {
                leftColor = isFever ? COLORS.FEVER : COLORS.BLUE;
            } else {
                leftColor = COLORS.MED; 
            }

            return (
                <div 
                    key={item.id} 
                    onClick={() => goEdit(item)}
                    style={{background: "white", padding: 12, borderRadius: 8, marginBottom: 8, display: "flex", alignItems: "center", gap: 16, cursor: "pointer"}}
                >
                   <div style={{minWidth: 80, textAlign: "center"}}>
                       <div style={{fontSize: 24, fontWeight: "bold", color: leftColor}}>
                           {hasTemp ? `${item.temp!.toFixed(1)}℃` : "💊"}
                       </div>
                   </div>

                   <div style={{flex: 1, borderLeft: "1px solid #eee", paddingLeft: 12}}>
                       <div style={{fontSize: 12, color: "#999", marginBottom: 4}}>
                           {new Date(item.date).toLocaleDateString()} {new Date(item.date).getHours()}:{new Date(item.date).getMinutes().toString().padStart(2, '0')}
                       </div>
                       
                       {item.medNames.length > 0 && (
                           <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom: 4}}>
                               {item.medNames.map((name, idx) => (
                                   <span key={idx} style={{fontSize: 12, background: "#FFF3E0", color: "#E65100", padding: "2px 8px", borderRadius: 4, fontWeight:"bold"}}>
                                       💊 {name}
                                   </span>
                               ))}
                           </div>
                       )}

                       {item.memo && <div style={{fontSize: 14, color: "#333", whiteSpace: "pre-wrap"}}>{item.memo}</div>}
                   </div>
                </div>
            );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tab: { padding: "6px 16px", borderRadius: 20, border: "1px solid #ddd", background: "white", whiteSpace: "nowrap", cursor: "pointer" },
  tabActive: { padding: "6px 16px", borderRadius: 20, border: "1px solid #66A9D9", background: "#e0f2fe", color: "#0e7490", fontWeight: "bold", whiteSpace: "nowrap", cursor: "pointer" },
  segmentControl: { display: "flex", background: "#f4f5f7", borderRadius: 8, padding: 4 },
  segmentBtn: { flex: 1, padding: "6px 16px", border: "none", background: "transparent", color: "#666", cursor: "pointer", borderRadius: 6, fontSize: 13 },
  segmentBtnActive: { flex: 1, padding: "6px 16px", border: "none", background: "white", color: "#66A9D9", fontWeight: "bold", cursor: "pointer", borderRadius: 6, boxShadow: "0 1px 2px rgba(0,0,0,0.1)", fontSize: 13 },
};