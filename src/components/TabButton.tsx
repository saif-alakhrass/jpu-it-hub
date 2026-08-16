import { Icon } from '@/components/Icon';

interface TabButtonProps {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
  activeClassName?: string;
  className?: string;
}

/** Underlined tab used by the subject page and the admin dashboard. */
export function TabButton({
  active, icon, label, onClick,
  activeClassName = 'border-brand-500 text-brand-300',
  className = '',
}: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${className} ${
        active ? activeClassName : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}
