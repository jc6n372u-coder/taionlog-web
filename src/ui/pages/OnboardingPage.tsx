import { useState } from 'react';

export default function OnboardingPage() {
  const [checked, setChecked] = useState(false);

  function accept() {
    localStorage.setItem('policyAccepted', 'true');
    window.location.reload(); // 同意を反映してAppRouterを再評価
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h2 style={{ color: '#333' }}>ご利用前の確認</h2>
      <div style={{ background: '#f7f7f7', padding: 16, borderRadius: 12, marginBottom: 20 }}>
        <ul style={{ lineHeight: 1.6 }}>
          <li>グループ設定は管理者のスプレッドシートで管理されます [cite: 2116]</li>
          <li>住所・漢字フルネーム等の個人情報は記載しないでください [cite: 2118]</li>
          <li>本アプリは医療行為を代替するものではありません [cite: 2119]</li>
        </ul>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
        <span>上記内容を理解しました [cite: 2123]</span>
      </label>

      <button 
        disabled={!checked} 
        onClick={accept}
        style={{
          marginTop: 20, width: '100%', padding: 12, borderRadius: 12,
          background: checked ? '#5BB6E5' : '#ccc', color: '#fff', border: 'none', fontWeight: 700
        }}
      >
        同意して利用開始 [cite: 2127]
      </button>
    </div>
  );
}