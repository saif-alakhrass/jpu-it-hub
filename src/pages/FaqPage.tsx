import { Icon } from '@/components/Icon';

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
