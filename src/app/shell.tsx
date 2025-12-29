import { Outlet, Link, useLocation } from "react-router-dom";
export function AppShell() {
  const loc = useLocation();
  const is = (p: string) => loc.pathname === p || (p === "/" && loc.pathname === "/");
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: 12, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>たいおんログ</h1>
        <nav style={{ display: "flex", gap: 10, fontSize: 14 }}>
          <Link to="/" style={{ fontWeight: is("/") ? 700 : 400, textDecoration: "none", color: is("/") ? "#000" : "#666" }}>ホーム</Link>
          <Link to="/chart" style={{ fontWeight: is("/chart") ? 700 : 400, textDecoration: "none", color: is("/chart") ? "#000" : "#666" }}>グラフ</Link>
          <Link to="/settings" style={{ fontWeight: is("/settings") ? 700 : 400, textDecoration: "none", color: is("/settings") ? "#000" : "#666" }}>設定</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}