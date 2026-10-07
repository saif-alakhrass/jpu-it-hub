import { Icon } from '@/components/Icon';
import { GETTING_STARTED_VIDEO_URL } from '@/lib/gettingStartedGuide';

const FAQ_ITEMS = [
  {
    question: 'ما هو JPU-IT Hub؟',
    answer: 'منصة طلابية تجمع الملفات الدراسية المفيدة لطلبة كلية تكنولوجيا المعلومات في جامعة جرش، وتسهّل الوصول إليها حسب المادة ونوع المحتوى.',
  },
  {
    question: 'كيف أرفع ملفًا؟',
    answer: 'سجّل الدخول، افتح صفحة المادة المطلوبة، ثم استخدم زر رفع الملفات واختر القسم المناسب. راجع اسم الملف ومكانه قبل الإرسال.',
  },
  {
    question: 'لماذا ملفي قيد المراجعة؟',
    answer: 'ملفات الطلاب تُراجع قبل ظهورها للجميع للتأكد من سلامتها، وصحة المادة والقسم، وعدم تكرار المحتوى.',
  },
  {
    question: 'كيف أصبح موثوقًا؟',
    answer: 'تتم الترقية تلقائيًا بعد وصولك إلى 20 ملفًا فريدًا ومعتمدًا. الملفات المعلقة أو المرفوضة أو المحذوفة لا تدخل في العدد.',
  },
  {
    question: 'ما حدود رفع الملفات؟',
    answer: 'يمكن للطالب رفع 10 ملفات، وللمستخدم الموثوق 20 ملفًا خلال كل 10 دقائق. يبقى الحد الأقصى لحجم الملف الواحد 20 ميجابايت.',
  },
  {
    question: 'ما ميزات المستخدم الموثوق؟',
    answer: 'يمكن للمستخدم الموثوق الوصول إلى قسم الامتحانات والسنوات السابقة، وإضافة مواد جديدة، ونشر الملفات الفردية مباشرة. أما الملفات المرفوعة ضمن مجلد فتظل خاضعة لمراجعة الإدارة حفاظًا على تنظيم المحتوى.',
  },
  {
    question: 'لماذا لا أرى السنوات السابقة؟',
    answer: 'قسم الامتحانات والسنوات السابقة متاح حاليًا للمستخدمين الموثوقين والمديرين حسب نظام صلاحيات المنصة.',
  },
  {
    question: 'ما أنواع الملفات المسموحة؟',
    answer: 'يمكن رفع PDF وWord وPowerPoint والصور بصيغ PNG وJPG وJPEG، وبحد أقصى 20 ميجابايت للملف الواحد.',
  },
  {
    question: 'لماذا تم رفض ملفي؟',
    answer: 'قد يُرفض الملف إذا كان مكررًا، أو في مادة أو قسم غير مناسب، أو لا يطابق شروط المحتوى والملفات. يظهر سبب الرفض في إشعارات حسابك.',
  },
  {
    question: 'هل الملفات رسمية من الجامعة؟',
    answer: 'لا. المنصة طلابية، والملفات يرفعها المستخدمون للاستفادة الدراسية. لا تُعد المواد منشورات رسمية من الجامعة إلا إذا ذُكر مصدرها بوضوح.',
  },
] as const;

export function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-brand-400">
          <Icon name="HelpCircle" className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-100">الأسئلة الشائعة</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">إجابات مختصرة عن رفع الملفات، مراجعتها، وصلاحيات الحساب.</p>
      </header>

      <a
        href={GETTING_STARTED_VIDEO_URL}
        target="_blank"
        rel="noreferrer"
        className="group mb-8 flex overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-l from-brand-50 via-white to-sky-50 p-1 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_18px_45px_rgba(30,94,166,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <div className="flex w-full items-center gap-4 rounded-xl border border-white/80 px-4 py-5 sm:px-6">
          <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white shadow-glow">
            <span className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 transition group-hover:opacity-100" />
            <Icon name="PlayCircle" className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <span className="text-[11px] font-bold text-brand-600">فيديو تعريفي</span>
            <h2 className="mt-0.5 text-base font-extrabold text-slate-100 sm:text-lg">شاهد طريقة استخدام الموقع خطوة بخطوة</h2>
            <p className="mt-1 text-xs leading-6 text-slate-500 sm:text-sm">البحث، عرض الملفات، تحميلها، ورفع ملف جديد في شرح واحد مختصر.</p>
          </div>
          <Icon name="ExternalLink" className="h-5 w-5 shrink-0 text-brand-500 transition group-hover:-translate-x-0.5" />
        </div>
      </a>

      <div className="space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="group card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-right font-bold text-slate-100 transition hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60">
              <span>{item.question}</span>
              <Icon name="ChevronDown" className="h-5 w-5 shrink-0 text-slate-500 transition-transform duration-300 group-open:rotate-180" />
            </summary>
            <p className="border-t border-white/5 px-5 py-4 text-sm leading-7 text-slate-400">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
