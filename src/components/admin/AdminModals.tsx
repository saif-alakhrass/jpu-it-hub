import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import type { FileRow, Profile, Role } from '@/lib/types';

interface RejectModalProps {
  file: FileRow | null;
  rejectionReason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busyId: string | null;
}

export function RejectModal({ file, rejectionReason, onReasonChange, onConfirm, onCancel, busyId }: RejectModalProps) {
  if (!file) return null;
  
  return (
    <Modal isOpen={true} onClose={onCancel} title="رفض الملف">
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          أنت بصدد رفض الملف: <span className="font-bold text-slate-200">{file.title}</span>
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">سبب الرفض</label>
          <textarea
            value={rejectionReason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="اكتب سبب الرفض بثلاثة أحرف على الأقل..."
            className="w-full rounded-lg border border-white/10 bg-ink-900 p-3 text-slate-200 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">إلغاء</button>
          <button
            onClick={onConfirm}
            disabled={busyId === file.id || rejectionReason.trim().length < 3}
            className="btn-danger"
          >
            {busyId === file.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />}
            رفض الملف
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface RoleChangeModalProps {
  user: Profile | null;
  toRole: Role | null;
  onConfirm: () => void;
  onCancel: () => void;
  busyId: string | null;
}

export function RoleChangeModal({ user, toRole, onConfirm, onCancel, busyId }: RoleChangeModalProps) {
  if (!user || !toRole) return null;
  
  const roleLabels: Record<Role, string> = {
    admin: 'مدير',
    trusted: 'موثوق',
    student: 'طالب',
  };
  
  return (
    <Modal isOpen={true} onClose={onCancel} title="تغيير دور المستخدم">
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          أنت بصدد تغيير دور المستخدم: <span className="font-bold text-slate-200">{user.full_name}</span>
        </p>
        <p className="text-sm text-slate-400">
          من دور الحالي إلى: <span className="font-bold text-brand-300">{roleLabels[toRole]}</span>
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">إلغاء</button>
          <button
            onClick={onConfirm}
            disabled={busyId === user.id}
            className="btn-primary"
          >
            {busyId === user.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : 'تأكيد التغيير'}
          </button>
        </div>
      </div>
    </Modal>
  );
}