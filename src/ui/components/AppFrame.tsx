import { useEffect, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { COLORS } from "../tokens";

const MAIN_PATHS = new Set(["/", "/chart", "/settings"]);

export function AppFrame() {
  const location = useLocation();
  const showBottomNavigation = MAIN_PATHS.has(location.pathname);

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>("main h1, main [data-page-heading]");
    if (!heading) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div style={styles.app}>
      <a href="#main-content" style={styles.skipLink} className="skip-link">
        本文へ移動
      </a>
      <main
        id="main-content"
        style={{
          ...styles.content,
          ...(showBottomNavigation ? styles.contentWithNavigation : null),
        }}
      >
        <Outlet />
      </main>
      {showBottomNavigation && (
        <nav aria-label="主要メニュー" style={styles.bottomNav}>
          <NavItem to="/" label="ホーム" icon="⌂" end />
          <NavItem to="/chart" label="グラフ" icon="⌁" />
          <NavItem to="/settings" label="設定" icon="⚙" />
        </nav>
      )}
    </div>
  );
}

function NavItem({
  to,
  label,
  icon,
  end = false,
}: {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        ...styles.navItem,
        color: isActive ? COLORS.primaryDark : COLORS.textMuted,
        fontWeight: isActive ? 800 : 600,
      })}
    >
      <span aria-hidden="true" style={styles.navIcon}>{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

const styles: Record<string, CSSProperties> = {
  app: { minHeight: "100dvh", background: COLORS.bg },
  skipLink: {
    position: "fixed",
    top: 8,
    left: 8,
    zIndex: 2000,
    padding: "10px 14px",
    borderRadius: 8,
    background: COLORS.dark,
    color: "white",
    transform: "translateY(-160%)",
  },
  content: { minHeight: "calc(100dvh - 60px)" },
  contentWithNavigation: { paddingBottom: "calc(72px + env(safe-area-inset-bottom))" },
  bottomNav: {
    position: "fixed",
    left: "50%",
    bottom: 0,
    transform: "translateX(-50%)",
    width: "min(100%, 680px)",
    minHeight: 64,
    paddingBottom: "env(safe-area-inset-bottom)",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    background: "rgba(255,255,255,0.98)",
    borderTop: `1px solid ${COLORS.borderLight}`,
    boxShadow: "0 -6px 18px rgba(15,23,42,0.08)",
    zIndex: 900,
  },
  navItem: {
    minHeight: 64,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    textDecoration: "none",
    fontSize: 12,
  },
  navIcon: { fontSize: 22, lineHeight: 1 },
};
