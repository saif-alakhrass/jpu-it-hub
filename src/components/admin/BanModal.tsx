import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Icon } from '@/components/Icon';
import type { Profile } from '@/lib/types';

export function BanModal({
  user,
  onClose,
  onBan,
  busy,
}: {
  user: Profile;
  onClose: () => void;
  onBan: (type: 'temporary' | 'permanent', days: number, reason: string) => void;
  busy: boolean;
}) {
  const [type, setType] = useState<'temporary' | 'permanent'>('temporary');
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState('');

  return (
    <Modal open={true} onClose={onClose} title="حظر المستخدم" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="p-3 bg-ink-700 rounded-lg border border-white/5 flex gap-3 items-center">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-900 text-slate-300 font-bold">{(user.full_name ?? '؟').slice(0, 1)}</span>
          <div>
            <div className="font-bold text-slate-200">{user.full_name || 'بدون اسم'}</div>
            <div className="text-xs text-slate-400">سيتم تطبيق الحظر على هذا الحساب.</div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-300">نوع الحظر</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType('temporary')}
              className={`p-3 rounded-lg border text-sm font-bold flex flex-col items-center gap-1 transition ${type === 'temporary' ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-white/10 bg-ink-900 text-slate-400 hover:bg-ink-700'}`}
            >
              <Icon name="Clock" className="h-5 w-5" />
              مؤقت
            </button>
            <button
              onClick={() => setType('permanent')}
              className={`p-3 rounded-lg border text-sm font-bold flex flex-col items-center gap-1 transition ${type === 'permanent' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-white/10 bg-ink-900 text-slate-400 hover:bg-ink-700'}`}
            >
              <Icon name="Ban" className="h-5 w-5" />
              دائم
            </button>
          </div>
        </div>

        {type === 'temporary' && (
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-300">المدة (بالأيام)</label>
            <input
              type="number"
              className="input w-full"
              min="1"
              max="365"
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 1)}
            />
          </div>
        )}

        {type === 'permanent' && (
          <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-sm text-red-200 flex gap-2">
            <Icon name="AlertTriangle" className="h-5 w-5 text-red-400 shrink-0" />
            <p><strong>تنبيه:</strong> سيتم تجميد هذا الحساب للأبد (حظر حتى عام 3000) مع منع الإيميل من التسجيل مستقبلاً. ملفات المستخدم ستبقى متاحة للطلاب.</p>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm font-bold text-slate-300">سبب الحظر (مطلوب)</label>
          <textarea
            className="input w-full min-h-[80px] resize-none"
            placeholder="اكتب سبب الحظر هنا..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost" disabled={busy}>إلغاء</button>
          <button
            onClick={() => onBan(type, days, reason)}
            className="btn-danger"
            disabled={busy || reason.trim().length < 3}
          >
            {busy ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Ban" className="h-4 w-4" />}
            تأكيد الحظر
          </button>
        </div>
      </div>
    </Modal>
  );
}
