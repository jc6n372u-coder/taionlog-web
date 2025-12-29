import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiClient } from '../../data/remote/apiClient';
import { LocalDb } from '../../data/local/localDb';

export default function OnboardingPage() {
  const nav = useNavigate();
  const [checked, setChecked] = useState(false);
  const [step, setStep] = useState<'policy'|'action'>('policy');
  
  const [groupName, setGroupName] = useState('家族');
  const [joinCode, setJoinCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ポリシー同意 (Phase B-8)
  function acceptPolicy() {
    setStep('action');
  }

  async function createGroup() {
    setErr(null); setLoading(true);
    try {
      const res = await ApiClient.createGroup(groupName.trim());
      const data = res.data as any;
      await LocalDb.setCurrentGroup(data.group_id, (data.name ?? groupName.trim()) || '家族');
      // ここがエラーの原因でした（バッククォートと$を復活）
      alert(`参加コード : ${data.join_code}\n有効期限 : ${data.expires_at ?? ''}`);
      nav('/');
    } catch (e: any) { setErr(e.message ?? String(e)); } finally { setLoading(false); }
  }

  async function joinGroup() {
    setErr(null); setLoading(true);
    try {
      const code = joinCode.toUpperCase().trim();
      if (!code) return setErr('参加コードを入力してください');
      const res = await ApiClient.joinGroup(code);
      const data = res.data as any;
      await LocalDb.setCurrentGroup(data.group_id, data.name ?? '家族');
      nav('/');
    } catch (e: any) { setErr(e.message ?? String(e)); } finally { setLoading(false); }
  }

  if (step === 'policy') {
    return (
      <div style={{ padding: 24, maxWidth: 500, margin: '0 auto' }}>
        <h2>ご利用前の確認</h2>
        <ul style={{ lineHeight: 1.6 }}>
          <li>本アプリのグループ設定は管理者のスプレッドシートで管理されます</li>
          <li>端末紛失・誤操作等のリスクがあります</li>
          <li>住所・漢字フルネーム等の個人情報は記載しないでください</li>
          <li>本アプリは医療行為を代替するものではありません</li>
        </ul>
        <label style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <input type='checkbox' checked={checked} onChange={e => setChecked(e.target.checked)} />
          内容を理解しました
        </label>
        <button disabled={!checked} onClick={acceptPolicy} style={{ marginTop: 20, padding: '12px 24px', background: checked ? '#3b82f6' : '#ccc', color: 'white', border: 'none', borderRadius: 8 }}>
          同意して利用開始
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12, padding: 16, maxWidth: 500, margin: '0 auto' }}>
      <h2 style={{ margin: 0 }}>はじめに</h2>
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
      
      <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>新しく始める</div>
        <input value={groupName} onChange={(e)=>setGroupName(e.target.value)} placeholder='グループ名' style={{ width: '100%', padding: 10, marginBottom: 8 }} />
        <button onClick={createGroup} disabled={loading} style={{ padding: 10 }}>作成</button>
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>参加する</div>
        <input value={joinCode} onChange={(e)=>setJoinCode(e.target.value)} placeholder='参加コード' style={{ width: '100%', padding: 10, textTransform: 'uppercase', marginBottom: 8 }} />
        <button onClick={joinGroup} disabled={loading} style={{ padding: 10 }}>参加</button>
      </section>
    </div>
  );
}