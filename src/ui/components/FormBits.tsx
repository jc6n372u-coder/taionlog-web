export function Field({ label, children }: { label: string; children: any }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      {children}
    </label>
  );
}
export function Row({ children }: { children: any }) {
  return <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{children}</div>;
}
export function Card({ title, children }: { title: string; children: any }) {
  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "white" }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {children}
    </section>
  );
}