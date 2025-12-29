import { useNavigate } from "react-router-dom";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "#666", margin: "14px 0 8px" }}>{children}</div>;
}

function MenuButton({ label, desc, onClick }: { label: string; desc?: string; onClick: () => void; }) {
  return (
    <button onClick={onClick} style={{ width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", marginBottom: 8 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{label}</div>
      {desc ? <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{desc}</div> : null}
    </button>
  );
}

export default function SettingsPage() {
  const nav = useNavigate();
  return (
    <div style={{ padding: 8 }}>
      <h2 style={{ margin: "6px 0 10px" }}>設定</h2>
      
      <SectionTitle>グループ設定</SectionTitle>
      <MenuButton label="グループ設定" desc="グループ名 / 招待コード / メンバー管理" onClick={() => nav("/settings/group")} />

      <SectionTitle>投薬設定</SectionTitle>
      <MenuButton label="投薬設定" desc="登録薬の編集・削除 / 並び替え" onClick={() => nav("/settings/medication")} />

      <SectionTitle>個別設定（この端末のみ）</SectionTitle>
      <MenuButton label="個別設定" desc="高熱ライン / 案内 / 連絡先 / 通知" onClick={() => nav("/settings/personal")} />
      
      <div style={{ marginTop: 8, fontSize: 12, color: "#666", background: "#f7f7f7", borderRadius: 12, padding: 10 }}>
        ※「個別設定」は、この端末にのみ反映されます。
      </div>
    </div>
  );
}