import { Icon } from '@/components/Icon';

interface BusyIconProps {
  busy: boolean;
  name: string;
  className?: string;
}

/** Shows a spinner while an action is running and the given icon otherwise. */
export function BusyIcon({ busy, name, className = 'h-4 w-4' }: BusyIconProps) {
  return busy
    ? <Icon name="Loader2" className={`${className} animate-spin`} />
    : <Icon name={name} className={className} />;
}
