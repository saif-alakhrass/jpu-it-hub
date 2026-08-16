import type { ReactNode } from 'react';
import { BusyIcon } from '@/components/BusyIcon';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';

const TONES = {
  danger: { callout: 'border-danger-500/30 bg-danger-500/10 text-danger-400', confirm: 'btn-danger' },
  accent: { callout: 'border-accent-500/30 bg-accent-500/10 text-accent-400', confirm: 'btn-primary' },
} as const;

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  heading: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  icon?: string;
  confirmIcon?: string;
  tone?: keyof typeof TONES;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
}

export function ConfirmDialog({
  open, title, heading, description, confirmLabel, onConfirm, onClose,
  icon = 'AlertCircle', confirmIcon = 'Trash2', tone = 'danger',
  busy = false, confirmDisabled = false, children,
}: ConfirmDialogProps) {
  const styles = TONES[tone];
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className={`flex items-start gap-3 rounded-xl border p-4 ${styles.callout}`}>
          <Icon name={icon} className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">{heading}</p>
            <p className="mt-1 text-sm">{description}</p>
          </div>
        </div>
        {children}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost" disabled={busy}>إلغاء</button>
          <button onClick={onConfirm} className={styles.confirm} disabled={busy || confirmDisabled}>
            <BusyIcon busy={busy} name={confirmIcon} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
