import { useEffect, useState } from 'react';
import { subscribeNotices, type InAppNotice } from '../../services/notifications/tier0';

export function InAppNotices() {
  const [n, setN] = useState<InAppNotice[]>([]);
  useEffect(() => subscribeNotices(setN), []);
  if (!n.length) return null;

  const bg = (lv: InAppNotice['level']) => lv === 'danger' ? '#ffe5e5' : lv === 'warn' ? '#fff5d6' : '#e8f4ff';
  const bd = (lv: InAppNotice['level']) => lv === 'danger' ? '#ff7a7a' : lv === 'warn' ? '#ffcc66' : '#7ab8ff';

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
      {n.map(x => (
        <div key={x.id} style={{ padding: 10, borderRadius: 10, background: bg(x.level), border: `1px solid ${bd(x.level)}` }}>
          <div style={{ fontWeight: 700 }}>{x.title}</div>
          {x.detail && <div style={{ fontSize: 12, opacity: 0.8 }}>{x.detail}</div>}
        </div>
      ))}
    </div>
  );
}