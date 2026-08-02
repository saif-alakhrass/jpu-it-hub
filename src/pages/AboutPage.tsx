import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { useCountUp } from '@/hooks/useCountUp';
import { useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import type { TeamMember } from '@/lib/types';

function StatCard({ icon, value, suffix, label, delay }: { icon: string; value: number; suffix?: string; label: string; delay: number }) {
  const { ref, value: v } = useCountUp(value);
  return (
    <Reveal delay={delay} className="card group relative overflow-hidden p-6 text-center">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-brand-500/10 blur-2xl transition group-hover:bg-brand-500/20" />
      <span className="relative mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-ink-700 text-brand-400 transition group-hover:bg-brand-500 group-hover:text-ink-950">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div className="relative text-3xl font-extrabold text-slate-100">
        <span ref={ref}>{v.toLocaleString('en-US')}</span>
        {suffix && <span className="text-brand-400">{suffix}</span>}
      </div>
      <div className="relative mt-1 text-sm text-slate-400">{label}</div>
    </Reveal>
  );
}

function PillarCard({ icon, title, children, accent, delay }: { icon: string; title: string; children: React.ReactNode; accent: 'brand' | 'accent'; delay: number }) {
  const ring = accent === 'accent' ? 'hover:border-accent-500/40' : 'hover:border-brand-500/40';
  const iconBg = accent === 'accent' ? 'bg-accent-500/15 text-accent-400 group-hover:bg-accent-500 group-hover:text-ink-950' : 'bg-brand-500/15 text-brand-400 group-hover:bg-brand-500 group-hover:text-ink-950';
  return (
    <Reveal delay={delay} y={32}>
      <div className={`card group h-full p-7 transition-all duration-300 hover:-translate-y-1 ${ring}`}>
        <span className={`mb-5 grid h-14 w-14 place-items-center rounded-2xl transition ${iconBg}`}>
          <Icon name={icon} className="h-7 w-7" />
        </span>
        <h3 className="mb-2 text-xl font-extrabold text-slate-100">{title}</h3>
        <p className="text-sm leading-relaxed text-slate-400">{children}</p>
      </div>
    </Reveal>
  );
}

function FeatureRow({ icon, title, desc, delay }: { icon: string; title: string; desc: string; delay: number }) {
  return (
    <Reveal delay={delay} className="flex items-start gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-700 text-brand-400">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div>
        <h4 className="font-bold text-slate-100">{title}</h4>
        <p className="text-sm text-slate-400">{desc}</p>
      </div>
    </Reveal>
  );
}

interface SocialLink { href: string; icon: string; label: string }

function PersonCard({ member, verified = false, links = [], delay = 0 }: { member: TeamMember; verified?: boolean; links?: SocialLink[]; delay?: number }) {
  const hasPhoto = member.image_url && member.image_url !== '/my-photo.jpg';
  return (
    <Reveal delay={delay} y={32} className="h-full">
      <div className="card group relative flex h-full flex-col overflow-hidden p-7 text-center transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 md:p-9">
        <div className="absolute inset-0 bg-[radial-gradient(22rem_14rem_at_50%_0%,rgba(52,189,130,0.12),transparent_70%)]" />
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-500/10 blur-2xl transition group-hover:bg-brand-500/20" />
        <div className="absolute -left-8 -bottom-8 h-28 w-28 rounded-full bg-accent-500/10 blur-2xl" />
        <div className="relative flex flex-1 flex-col items-center">
          <div className="relative mb-5 h-28 w-28 md:h-32 md:w-32">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-400 via-brand-500 to-accent-500 p-[3px] shadow-glow transition group-hover:from-brand-300 group-hover:to-accent-400">
              <div className="h-full w-full rounded-full bg-ink-900 p-1">
                <div className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-ink-800">
                  {hasPhoto ? <img src={member.image_url} alt={member.name} className="h-full w-full object-cover" /> : <Icon name="User" className="h-14 w-14 text-slate-600 md:h-16 md:w-16" />}
                </div>
              </div>
            </div>
            {verified && <span className="absolute bottom-1.5 left-1.5 grid h-7 w-7 place-items-center rounded-full border-2 border-ink-900 bg-brand-500 text-ink-950"><Icon name="Check" className="h-4 w-4" /></span>}
          </div>
          <h3 className="text-lg font-extrabold text-slate-100 md:text-xl">{member.name}</h3>
          <p className="mt-1 text-sm font-bold text-brand-400">{member.role}</p>
          {member.bio && <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-400 md:text-sm">{member.bio}</p>}
          {links.length > 0 && (
            <div className="mt-auto flex flex-wrap items-center justify-center gap-2 pt-6">
              {links.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="btn-ghost group/btn !px-3 !py-2 text-xs">
                  <Icon name={l.icon} className="h-3.5 w-3.5 transition group-hover/btn:text-brand-400" /><span>{l.label}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Reveal>
  );
}

export function AboutPage() {
  const { navigate } = useRouter();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, role, image_url, bio, sort_order, created_at')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) { setError('تعذّر تحميل بيانات الفريق.'); setTeam([]); } else { setTeam((data as TeamMember[]) ?? []); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const founder = team.find((m) => m.sort_order === 0) ?? team[0] ?? null;
  const assistant = team.find((m) => m.sort_order === 1) ?? null;
  const staff = team.filter((m) => m !== founder && m !== assistant);

  const founderLinks: SocialLink[] = [
    { href: 'https://github.com/saif-alakhrass', icon: 'Github', label: 'GitHub' },
    { href: 'https://www.linkedin.com/', icon: 'Linkedin', label: 'LinkedIn' },
    { href: 'mailto:saif.alakhrass@example.com', icon: 'Mail', label: 'تواصل معي' },
  ];
  const assistantLinks: SocialLink[] = [
    { href: 'https://github.com/', icon: 'Github', label: 'GitHub' },
    { href: 'https://www.linkedin.com/', icon: 'Linkedin', label: 'LinkedIn' },
    { href: 'mailto:assistant@example.com', icon: 'Mail', label: 'تواصل' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="relative overflow-hidden card mb-14 p-8 text-center md:p-16">
        <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -right-16 -bottom-16 h-56 w-56 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(40rem_20rem_at_50%_-20%,rgba(52,189,130,0.12),transparent_70%)]" />
        <div className="relative">
          <Reveal y={20}><span className="badge mb-5 border border-brand-500/30 bg-brand-500/15 text-brand-300"><Icon name="Sparkles" className="h-3.5 w-3.5" /> منصة الطلاب الذكية</span></Reveal>
          <Reveal delay={80} y={24}><h1 className="text-3xl font-extrabold leading-tight text-slate-100 md:text-5xl">عن منصة <span className="text-brand-400">JPU-IT Hub</span></h1></Reveal>
          <Reveal delay={160} y={20}><p className="mx-auto mt-4 max-w-2xl text-slate-400 md:text-lg">نُمكّن طلاب كلية تكنولوجيا المعلومات في جامعة جرش من خلال تجميع الموارد الأكاديمية في مكان واحد — ملخصات، امتحانات سابقة، سلايدات، وكتب — يرفعها الطلاب أنفسهم ويراجعها المشرفون لضمان جودة محتوى يعود بالنفع على الجميع.</p></Reveal>
          <Reveal delay={240} y={16}><div className="mt-7 flex flex-wrap items-center justify-center gap-3"><button onClick={() => navigate('/')} className="btn-primary"><Icon name="BookOpen" className="h-4 w-4" /> تصفّح المواد</button><a href="#story" className="btn-ghost"><Icon name="ArrowLeft" className="h-4 w-4" /> قصتنا</a></div></Reveal>
        </div>
      </section>
      <section className="mb-16 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon="BookOpen" value={80} label="مادة دراسية" delay={0} />
        <StatCard icon="FileText" value={4} label="أقسام لكل مادة" delay={100} />
        <StatCard icon="Users" value={2} label="تخصصين مدعومين" delay={200} />
        <StatCard icon="ShieldCheck" value={100} suffix="%" label="محتوى مُراجَع" delay={300} />
      </section>
      <section id="story" className="mb-16 scroll-mt-24">
        <Reveal className="mb-10 text-center"><span className="badge mb-3 border border-white/5 bg-ink-800 text-brand-300"><Icon name="Quote" className="h-3.5 w-3.5" /> قصتنا</span><h2 className="text-2xl font-extrabold text-slate-100 md:text-4xl">من أين بدأنا؟</h2></Reveal>
        <Reveal delay={80} y={28}><div className="card mx-auto max-w-3xl p-7 text-center md:p-10"><p className="text-base leading-loose text-slate-300 md:text-lg">انطلقت فكرة المنصة من حاجة بسيطة يعيشها كل طالب: البحث عن ملخص قبل الامتحان، أو سلايدات أستاذ معيّن، أو نموذج امتحان سابق — في ظلّ تشتّت المصادر بين مجموعات الواتساب ومحركات البحث. فكان <span className="font-bold text-brand-400">JPU-IT Hub</span>: مكانٌ واحد منظّم، يبنيه الطلاب بأنفسهم، وتُراجَع فيه الملفات قبل نشرها ليبقى المحتوى موثوقًا ونظيفًا. اليوم نغطّي تخصصي علم الحاسوب والأمن السيبراني، ونطمح لأكثر.</p></div></Reveal>
      </section>
      <section className="mb-16">
        <Reveal className="mb-10 text-center"><span className="badge mb-3 border border-white/5 bg-ink-800 text-accent-400"><Icon name="Target" className="h-3.5 w-3.5" /> ركائزنا</span><h2 className="text-2xl font-extrabold text-slate-100 md:text-4xl">على ماذا نبني؟</h2></Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          <PillarCard icon="Telescope" title="رؤيتنا" accent="brand" delay={0}>أن نكون المرجع الأوّل لطلاب تكنولوجيا المعلومات في جامعة جرش — منصّة يثق بها الطالب ويجد فيها كل ما يحتاجه بضغطة زر، فيوفّر وقته ويركّز على تعلّمه.</PillarCard>
          <PillarCard icon="Rocket" title="رسالتنا" accent="accent" delay={120}>تسهيل الوصول إلى الموارد الأكاديمية وتنظيمها، وتمكين الطلاب من المشاركة في بناء قاعدة معرفة جماعية مراجَعة، تخدم الجيل الحالي والأجيال القادمة من الطلاب.</PillarCard>
          <PillarCard icon="Gift" title="ما نقدّمه للطلاب" accent="brand" delay={240}>أربعة أقسام لكل مادة: تلاخيص وشروحات، امتحانات وسنوات سابقة، صور ومسودات، وسلايدات وكتب — مع نظام رفع بسيط ومراجعة تضمن جودة المحتوى المنشور.</PillarCard>
        </div>
      </section>
      <section className="mb-16">
        <Reveal className="mb-8 text-center"><h2 className="text-2xl font-extrabold text-slate-100 md:text-3xl">مزايا تجدها فقط هنا</h2></Reveal>
        <div className="grid gap-5 sm:grid-cols-2">
          <FeatureRow icon="Layers" title="تنظيم حسب التخصص والمادة" desc="تصفّح حسب علم الحاسوب أو الأمن السيبراني، ثم ادخل المادة لتجد أقسامها الأربعة جاهزة." delay={0} />
          <FeatureRow icon="ShieldCheck" title="محتوى مُراجَع وموثوق" desc="كل ملف يمرّ على فريق المراجعة قبل نشره، فلا تجد إلا محتوى مفيدًا ونظيفًا." delay={80} />
          <FeatureRow icon="Users" title="مجتمع طلابي" desc="الطلاب هم من يبنون المنصة — ارفع ملخصك وساعد غيرك، واكسب ثقة المشرفين." delay={160} />
          <FeatureRow icon="Zap" title="وصول سريع وبسيط" desc="بحث فوري، تصفية بالتخصص، ومعاينة مباشرة للملفات دون تحميل ما لا تحتاجه." delay={240} />
        </div>
      </section>
      <section className="mb-14">
        <Reveal className="mb-8 text-center"><span className="badge mb-3 border border-brand-500/30 bg-brand-500/15 text-brand-300"><Icon name="Code" className="h-3.5 w-3.5" /> فريق العمل</span><h2 className="text-2xl font-extrabold text-slate-100 md:text-4xl">مطوّرو المنصة</h2><p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">الفريق الذي يقف خلف بناء المنصة وتطويرها والإشراف على محتواها.</p></Reveal>
        {loading ? (
          <div className="card mx-auto max-w-2xl p-12 text-center"><Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" /><p className="mt-3 text-sm text-slate-400">جارٍ تحميل بيانات الفريق…</p></div>
        ) : error ? (
          <div className="card mx-auto max-w-2xl p-10 text-center"><Icon name="AlertCircle" className="mx-auto h-8 w-8 text-danger-400" /><p className="mt-3 text-sm text-danger-400">{error}</p></div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-1 md:grid-cols-2">
            {founder && <PersonCard member={founder} verified links={founderLinks} delay={0} />}
            {assistant && <PersonCard member={assistant} links={assistantLinks} delay={120} />}
          </div>
        )}
      </section>
      {staff.length > 0 && (
        <section className="mb-16">
          <Reveal className="mb-8 text-center"><span className="badge mb-3 border border-white/5 bg-ink-800 text-accent-400"><Icon name="Users" className="h-3.5 w-3.5" /> الكادر</span><h2 className="text-2xl font-extrabold text-slate-100 md:text-3xl">فريق المنصة</h2></Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((m, i) => <PersonCard key={m.id} member={m} delay={i * 80} />)}
          </div>
        </section>
      )}
      <Reveal y={24}>
        <div className="card relative overflow-hidden p-8 text-center md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(30rem_16rem_at_50%_50%,rgba(52,189,130,0.12),transparent_70%)]" />
          <div className="relative">
            <h2 className="text-2xl font-extrabold text-slate-100 md:text-3xl">جاهز للبدء؟</h2>
            <p className="mx-auto mt-2 max-w-lg text-slate-400">تصفّح المواد، ارفع ملخصك، وكن جزءًا من مجتمع يبني قاعدة المعرفة لطلاب الجامعة.</p>
            <button onClick={() => navigate('/')} className="btn-primary mt-6"><Icon name="BookOpen" className="h-4 w-4" /> ابدأ التصفّح الآن</button>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
