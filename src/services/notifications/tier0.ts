import { LocalDb } from '../../data/local/localDb';
import { differenceInMinutes, isBefore, parseISO } from 'date-fns';

export type InAppNotice = {
  id: string;
  level: 'info' | 'warn' | 'danger';
  title: string;
  detail?: string;
};

let _notices: InAppNotice[] = [];
let _listeners: Array<(n: InAppNotice[]) => void> = [];

export function subscribeNotices(fn: (n: InAppNotice[]) => void) {
  _listeners.push(fn);
  fn(_notices);
  return () => { _listeners = _listeners.filter(x => x !== fn); };
}

function setNotices(n: InAppNotice[]) {
  _notices = n;
  for (const fn of _listeners) fn(_notices);
}

export function ensureTier0Scheduler() {
  // 30秒後→以降60秒ごと（軽さ優先/過剰に回さない）
  setTimeout(() => void refreshNotices(), 30_000);
  setInterval(() => void refreshNotices(), 60_000);
  void refreshNotices();
}

export async function refreshNotices() {
  const cg = await LocalDb.getCurrentGroup();
  if (!cg) return setNotices([]);

  const notices: InAppNotice[] = [];

  // 1) 同期警告
  const lastSync = await LocalDb.getMeta('last_sync');
  if (!lastSync) {
    notices.push({ id: 'sync-never', level: 'warn', title: '未同期です', detail: 'ネット接続後に同期してください' });
  } else {
    const mins = differenceInMinutes(new Date(), parseISO(lastSync));
    if (mins >= 180) {
      // 修正: テンプレートリテラルを復活
      notices.push({ id: 'sync-old', level: 'warn', title: '同期が古いです', detail: `最終同期: ${mins}分前` });
    }
  }

  // 2) 投薬予定（修正版: SSOT 19.7）
  const users = await LocalDb.listUsers(cg.group_id);
  for (const u of users) {
    const rems = await LocalDb.listReminders(u.uuid);
    const upcoming = rems
      .filter(r => r.is_notified === 0 && r.is_deleted === 0)
      .filter(r => isBefore(new Date(), parseISO(r.scheduled_at)))
      .sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at))[0];

    if (!upcoming) continue;

    const mins = differenceInMinutes(parseISO(upcoming.scheduled_at), new Date());
    
    if (mins <= 60 && mins >= -60) {
       // 修正: テンプレートリテラルを復活
       notices.push({ 
         id: `rem-${u.uuid}`, 
         level: mins <= 10 ? 'warn' : 'info', 
         title: '投薬予定が近いです', 
         detail: `${u.name}: ${mins}分後` 
       });
    }
  }
  setNotices(notices);
}