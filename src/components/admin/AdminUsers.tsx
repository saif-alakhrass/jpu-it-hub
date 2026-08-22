import { Icon } from '@/components/Icon';
import type { Profile, Role } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

const ROLE_BADGES: Record<Role, { label: string; className: string; icon: string }> = {
  admin: { label: 'مدير', className: 'bg-accent-500/20 text-accent-400 border-accent-500/40', icon: 'ShieldCheck' },
  trusted: { label: 'موثوق', className: 'bg-brand-500/20 text-brand-300 border-brand-500/40', icon: 'Shield' },
  student: { label: 'طالب', className: 'bg-ink-700 text-slate-300 border-white/10', icon: 'GraduationCap' },
};

function RoleBadge({ user }: { user: Profile }) {
  const badge = ROLE_BADGES[user.role];
  return (
    <div className="flex gap-2">
      <span className={`badge border ${badge.className}`}>
        <Icon name={badge.icon} className="h-3 w-3" />{badge.label}
      </span>
      {user.is_super_admin && (
        <span className="badge border bg-purple-500/20 text-purple-300 border-purple-500/40">
          <Icon name="Crown" className="h-3 w-3" /> مدير رئيسي
        </span>
      )}
    </div>
  );
}

export function AdminUsers({ users, requestRoleChange, busyId }: {
  users: Profile[];
  requestRoleChange: (user: Profile, toRole: Role) => void;
  busyId: string | null;
}) {
  const { profile: currentUser } = useAuth();
  const isCurrentUserSuperAdmin = currentUser?.is_super_admin === true;

  if (users.length === 0) {
    return <div className="card p-12 text-center"><p className="text-slate-400">لا يوجد مستخدمون.</p></div>;
  }

  return (
    <div className="grid gap-3">
      {users.map((user) => {
        const isSelf = user.id === currentUser?.id;
        const targetIsAdmin = user.role === 'admin';
        const targetIsSuperAdmin = user.is_super_admin;
        
        // Who can manage this user's role?
        // - Self: cannot change own role here
        // - Target is Super Admin: Nobody can change it
        // - Target is Admin: Only Super Admin can demote
        // - Target is Not Admin: Admins can manage
        const canManageRole = !isSelf && !targetIsSuperAdmin && (!targetIsAdmin || isCurrentUserSuperAdmin);
        
        return (
          <div key={user.id} className="card flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-700 text-slate-300 font-bold">{(user.full_name ?? '؟').slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-bold text-slate-100">{user.full_name ?? 'بدون اسم'}</h3>
                <RoleBadge user={user} />
              </div>
              <div className="text-xs text-slate-500">{new Date(user.created_at).toLocaleDateString('ar')}</div>
            </div>
            
            <div className="flex items-center gap-2">
              {canManageRole && (
                <>
                  {user.role === 'student' && (
                    <>
                      <button onClick={() => requestRoleChange(user, 'trusted')} className="btn-primary" title="ترقية إلى موثوق" disabled={busyId === user.id}><Icon name="Shield" className="h-4 w-4" /> موثوق</button>
                      {isCurrentUserSuperAdmin && (
                        <button onClick={() => requestRoleChange(user, 'admin')} className="btn-ghost border border-accent-500/30 text-accent-400 hover:bg-accent-500/10" title="ترقية إلى مدير" disabled={busyId === user.id}><Icon name="ShieldCheck" className="h-4 w-4" /> مدير</button>
                      )}
                    </>
                  )}
                  {user.role === 'trusted' && (
                    <>
                      {isCurrentUserSuperAdmin && (
                        <button onClick={() => requestRoleChange(user, 'admin')} className="btn-ghost border border-accent-500/30 text-accent-400 hover:bg-accent-500/10" title="ترقية إلى مدير" disabled={busyId === user.id}><Icon name="ShieldCheck" className="h-4 w-4" /> مدير</button>
                      )}
                      <button onClick={() => requestRoleChange(user, 'student')} className="btn-ghost" title="تخفيض إلى طالب" disabled={busyId === user.id}><Icon name="GraduationCap" className="h-4 w-4" /> طالب</button>
                    </>
                  )}
                  {user.role === 'admin' && isCurrentUserSuperAdmin && (
                    <>
                      <button onClick={() => requestRoleChange(user, 'trusted')} className="btn-ghost" title="تخفيض إلى موثوق" disabled={busyId === user.id}><Icon name="Shield" className="h-4 w-4" /> موثوق</button>
                      <button onClick={() => requestRoleChange(user, 'student')} className="btn-ghost border border-red-500/30 text-red-400 hover:bg-red-500/10" title="تخفيض إلى طالب" disabled={busyId === user.id}><Icon name="GraduationCap" className="h-4 w-4" /> طالب</button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
