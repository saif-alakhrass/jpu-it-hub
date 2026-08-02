import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { useCountUp } from '@/hooks/useCountUp';
import type { AdminStats } from '@/services/files';

function StatTile({ icon, value, label, color, delay }: { icon: string; value: number; label: string; color: string; delay: number }) {
  const { ref, value: animatedValue } = useCountUp(value);
  return (
    <Reveal delay={delay} className="card group relative overflow-hidden p-6">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/5 blur-2xl transition group-hover:bg-white/10" />
      <div className="relative flex items-center gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${color}`}>
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <div>
          <div className="text-2xl font-extrabold text-slate-100">
            <span ref={ref}>{animatedValue.toLocaleString('en-US')}</span>
          </div>
          <div className="text-sm text-slate-400">{label}</div>
        </div>
      </div>
    </Reveal>
  );
}

function ProgressBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-400">{value} ({percentage}%)</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink-700">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function AdminOverview({ stats, pendingCount }: { stats: AdminStats | null; pendingCount: number }) {
  if (!stats) {
    return <div className="card p-12 text-center"><Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile icon="FileText" value={stats.totalFiles} label="إجمالي الملفات" color="bg-brand-500/15 text-brand-400" delay={0} />
        <StatTile icon="Clock" value={pendingCount} label="قيد المراجعة" color="bg-accent-500/15 text-accent-400" delay={80} />
        <StatTile icon="Users" value={stats.totalUsers} label="المستخدمون" color="bg-ink-700 text-slate-300" delay={160} />
        <StatTile icon="BookOpen" value={stats.totalSubjects} label="المواد" color="bg-brand-500/15 text-brand-400" delay={240} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile icon="Check" value={stats.approvedFiles} label="ملفات منشورة" color="bg-success-500/15 text-success-400" delay={0} />
        <StatTile icon="FileWarning" value={stats.rejectedFiles} label="ملفات مرفوضة" color="bg-danger-500/15 text-danger-400" delay={80} />
        <StatTile icon="Shield" value={stats.trustedUsers} label="مستخدمون موثوقون" color="bg-brand-500/15 text-brand-400" delay={160} />
        <StatTile icon="ShieldCheck" value={stats.admins} label="المديرون" color="bg-accent-500/15 text-accent-400" delay={240} />
      </div>

      <Reveal delay={200}>
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-100">
            <Icon name="BarChart3" className="h-5 w-5 text-brand-400" />
            توزيع الملفات حسب الحالة
          </h3>
          <div className="space-y-3">
            <ProgressBar label="منشورة" value={stats.approvedFiles} total={stats.totalFiles} color="bg-success-500" />
            <ProgressBar label="قيد المراجعة" value={stats.pendingFiles} total={stats.totalFiles} color="bg-accent-500" />
            <ProgressBar label="مرفوضة" value={stats.rejectedFiles} total={stats.totalFiles} color="bg-danger-500" />
          </div>
        </div>
      </Reveal>
    </div>
  );
}
