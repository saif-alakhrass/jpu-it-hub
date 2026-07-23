import { Icon } from './Icon';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  const styles = {
    success: 'bg-brand-500/15 border-brand-500/40 text-brand-200',
    error: 'bg-danger-500/15 border-danger-500/40 text-danger-400',
    info: 'bg-ink-700 border-white/10 text-slate-200',
  }[type];
  const iconName = { success: 'Check', error: 'AlertCircle', info: 'AlertCircle' }[type];

  return (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-slideUp">
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-card ${styles}`}>
        <Icon name={iconName} className="h-5 w-5 shrink-0" />
        <span className="text-sm font-bold">{message}</span>
        <button onClick={onClose} className="ms-2 opacity-60 hover:opacity-100">
          <Icon name="X" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
