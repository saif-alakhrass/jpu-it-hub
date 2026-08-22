import { Icon } from '@/components/Icon';
import type { BannedIdentity } from '@/lib/types';

export function AdminBannedUsers({
  bannedUsers,
  requestUnban,
  busyId,
}: {
  bannedUsers: BannedIdentity[];
  requestUnban: (email: string) => void;
  busyId: string | null;
}) {
  if (bannedUsers.length === 0) {
    return <div className="card p-12 text-center"><p className="text-slate-400">لا يوجد مستخدمون محظورون.</p></div>;
  }

  return (
    <div className="grid gap-3">
      {bannedUsers.map((banned) => (
        <div key={banned.email} className="card flex items-center gap-3 p-4 border-red-500/20">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-400 font-bold">
            <Icon name="Ban" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-bold text-slate-100">{banned.email}</h3>
              <span className={`badge border ${banned.ban_type === 'permanent' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-orange-500/20 text-orange-400 border-orange-500/40'}`}>
                {banned.ban_type === 'permanent' ? 'حظر دائم' : 'حظر مؤقت'}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              تم الحظر في: {new Date(banned.banned_at).toLocaleDateString('ar')} 
              {banned.ban_type === 'temporary' && banned.expires_at && ` · ينتهي في: ${new Date(banned.expires_at).toLocaleDateString('ar')}`}
            </div>
            {banned.reason && (
              <div className="text-sm text-slate-300 mt-2 bg-ink-700 p-2 rounded-lg border border-white/5">
                <strong className="text-slate-500">السبب:</strong> {banned.reason}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => requestUnban(banned.email)}
              className="btn-ghost border border-slate-500/30 hover:border-slate-500/60"
              title="إلغاء الحظر"
              disabled={busyId === banned.email}
            >
              <Icon name="Unlock" className="h-4 w-4" /> فك الحظر
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
