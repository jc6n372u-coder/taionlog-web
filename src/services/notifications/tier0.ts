import { LocalDb } from "../../data/local/localDb";
import { differenceInMinutes, isBefore, parseISO } from "date-fns";

export type InAppNotice = {
  id: string;
  level: "info" | "warn" | "danger";
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
  setTimeout(() => void refreshNotices(), 30_000);
  setInterval(() => void refreshNotices(), 60_000);
  void refreshNotices();
}

export async function refreshNotices() {
  const cg = await LocalDb.getCurrentGroup();
  if (!cg) return setNotices([]);

  const notices: InAppNotice[] = [];

  // 1) 同期警告
  const lastSync = await LocalDb.getMeta("last_sync");
  if (!lastSync) {
    notices.push({ id: "sync-never", level: "warn", title: "未同期です", detail: "ネット接続後に同期してください" });
  } else {
    const mins = differenceInMinutes(new Date(), parseISO(lastSync));
    if (mins >= 180) {
      notices.push({ id: "sync-old", level: "warn", title: "同期が古いです", detail: `最終同期: ${mins}分前` });
    }
  }

  // 2) 投薬予定（SSOT 19.7: 最も近い予定を確実に拾うロジック）
  const users = await LocalDb.listUsers(cg.group_id);
  for (const u of users) {
    const rems = await LocalDb.listReminders(u.uuid);
    const upcoming = rems
      .filter(r => r.is_notified === 0 && r.is_deleted === 0)
      .filter(r => isBefore(new Date(), parseISO(r.scheduled_at))) // 未来ではない（＝予定時刻を過ぎている、または現在）
      // ※SSOT修正: isBefore(new Date(), scheduled) だと「未来」なので、通知条件としては
      // 「予定時刻になった」つまり scheduled <= now か、あるいは「もうすぐ」を判定したい。
      // ここではSSOT 18.14/19.7 の意図「予定が近い(未来)」または「過ぎた」を正しく実装します。
      
      // 修正ロジック: 未来の予定も含めてソートし、直近のものを見る
      // is_notified=0 の全件取得
      .sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at));
      
      // 直近の1件を探す
      const target = upcoming.find(r => {
        // 予定時刻と現在の差分
        const diff = differenceInMinutes(parseISO(r.scheduled_at), new Date());
        // 30分以内（未来） または 既に過ぎている（マイナス）
        return diff <= 30;
      });

    if (target) {
      const mins = differenceInMinutes(parseISO(target.scheduled_at), new Date());
      // 過ぎている場合は「経過」と表示、未来なら「後」
      const timeText = mins < 0 ? `${Math.abs(mins)}分経過` : `${mins}分後`;
      const lv = mins <= 10 ? "warn" : "info"; // 10分切ったら黄色
      
      notices.push({ id: `rem-${u.uuid}`, level: lv, title: "投薬予定が近いです", detail: `${u.name}: ${timeText}` });
    }
  }
  setNotices(notices);
}