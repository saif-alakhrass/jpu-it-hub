import { Icon } from '@/components/Icon';
import { useRouter } from '@/lib/router';

export function NotFoundPage() {
  const { navigate } = useRouter();

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-ink-800 text-brand-400">
        <Icon name="Compass" className="h-10 w-10" />
      </span>
      <h1 className="text-5xl font-extrabold text-slate-100">404</h1>
      <p className="mt-3 text-lg font-bold text-slate-300">الصفحة غير موجودة</p>
      <p className="mt-2 text-sm text-slate-500">
        ربما تم نقل الصفحة أو حذفها، أو أن الرابط غير صحيح.
      </p>
      <button onClick={() => navigate('/')} className="btn-primary mt-8">
        <Icon name="Home" className="h-4 w-4" />
        العودة للرئيسية
      </button>
    </div>
  );
}
