import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useRouter } from '@/lib/router';

const faqs = [
  {
    question: "ما هو JPU-IT Hub؟",
    answer: "هي منصة تعليمية غير ربحية موجهة لطلاب كلية تكنولوجيا المعلومات في جامعة جرش (JPU). تهدف لجمع وتنظيم المواد الدراسية، الملخصات، أسئلة السنوات السابقة، وتسهيل مشاركتها بين الطلاب للارتقاء بالمستوى الأكاديمي."
  },
  {
    question: "هل الملفات الموجودة هنا رسمية من الجامعة؟",
    answer: "لا، المنصة مبادرة طلابية، ومعظم الملفات المرفوعة هي من مجهود وتلخيص الطلاب أنفسهم. يجب اعتبارها مواد مساعدة وداعمة للمقرر الرسمي الذي يطرحه دكتور المادة."
  },
  {
    question: "كيف أرفع ملفاً جديداً للمنصة؟",
    answer: "إذا كنت مسجلاً في الموقع، يمكنك الذهاب إلى صفحة المادة المطلوبة والضغط على زر 'رفع ملف'. يمكنك رفع ملف واحد أو مجلد كامل. سيتم مراجعة الملف من قبل الإدارة قبل نشره."
  },
  {
    question: "لماذا يظهر ملفي بحالة Pending (قيد المراجعة)؟",
    answer: "كإجراء أمني ولضمان جودة المحتوى، تمر ملفات الطلاب العاديين (الرتبة: طالب) بمرحلة مراجعة من الإدارة للتأكد من خلوها من التكرار وأنها تتبع المادة الصحيحة. بمجرد قبولها ستصبح متاحة للجميع."
  },
  {
    question: "لماذا تم رفض ملفي؟",
    answer: "قد يُرفض الملف لعدة أسباب: إذا كان مكرراً، أو غير واضح، أو لا علاقة له بالمادة، أو ينتهك حقوق الآخرين. في العادة، يتم إرفاق سبب الرفض ويمكنك رفعه مرة أخرى بعد التعديل."
  },
  {
    question: "كيف أصبح مستخدماً موثوقاً (Trusted)؟",
    answer: "بمجرد أن تقوم برفع 20 ملفاً مفيداً ويتم اعتمادها (Approved) من قبل الإدارة، سيتم ترقية حسابك تلقائياً وبشكل فوري إلى رتبة 'موثوق' (Trusted). الحساب الموثوق تُنشر ملفاته مباشرة دون انتظار المراجعة، ويتاح له الوصول لتبويب الامتحانات."
  },
  {
    question: "لماذا لا أرى تبويب 'امتحانات سنوات سابقة'؟",
    answer: "حمايةً لنزاهة العملية التعليمية ولمنع سوء الاستخدام، تم تقييد الوصول لأسئلة السنوات السابقة (الامتحانات). لا يظهر هذا التبويب إلا للمستخدمين الموثوقين والمدراء."
  },
  {
    question: "ما أنواع الملفات المسموحة؟",
    answer: "المنصة تدعم رفع الملفات بصيغة PDF والصور (JPG, PNG)، وبحجم أقصاه 10 ميغابايت للملف الواحد. في حال رفع مجلد (Batch)، يمكن أن يحتوي على عدة ملفات معاً."
  }
];

export function FAQPage() {
  const { navigate } = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button onClick={() => navigate('/')} className="mb-5 flex items-center gap-1 text-sm text-slate-400 hover:text-brand-300 transition">
        <Icon name="ChevronLeft" className="h-4 w-4" /> العودة للرئيسية
      </button>

      <div className="text-center mb-10">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-500/10 text-brand-400">
          <Icon name="HelpCircle" className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-100 md:text-3xl">الأسئلة الشائعة (FAQ)</h1>
        <p className="mt-2 text-slate-400">كل ما تحتاج معرفته عن استخدام المنصة ونظام التوثيق.</p>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div 
              key={index} 
              className={`card overflow-hidden transition-colors ${isOpen ? 'border-brand-500/30 bg-ink-800' : 'hover:border-white/10'}`}
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full flex items-center justify-between p-5 text-right"
              >
                <span className={`font-bold ${isOpen ? 'text-brand-300' : 'text-slate-200'}`}>
                  {faq.question}
                </span>
                <Icon 
                  name={isOpen ? 'ChevronUp' : 'ChevronDown'} 
                  className={`h-5 w-5 shrink-0 transition-transform ${isOpen ? 'text-brand-400' : 'text-slate-500'}`} 
                />
              </button>
              
              <div 
                className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <div className="p-5 pt-0 text-slate-400 leading-relaxed border-t border-white/5 mt-1">
                  {faq.answer}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-12 text-center text-sm text-slate-500">
        لم تجد إجابة لسؤالك؟ <a href="mailto:support@jpu-it-hub.com" className="text-brand-400 hover:underline">تواصل مع الإدارة</a>
      </div>
    </div>
  );
}
