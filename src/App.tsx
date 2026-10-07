import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/hooks/useAuth';
import { Navbar } from '@/components/Navbar';
import { Icon } from '@/components/Icon';
import { ScrollRestoration } from '@/components/ScrollRestoration';
import { HomePage } from '@/pages/HomePage';
import { GettingStartedGuide } from '@/components/GettingStartedGuide';

const loadSubjectPage = () => import('@/pages/SubjectPage');
const loadAuthPage = () => import('@/pages/AuthPage');
const loadAboutPage = () => import('@/pages/AboutPage');
const loadProfilePage = () => import('@/pages/ProfilePage');
const loadFaqPage = () => import('@/pages/FaqPage');

const SubjectPage = lazy(() => loadSubjectPage().then((module) => ({ default: module.SubjectPage })));
const AuthPage = lazy(() => loadAuthPage().then((module) => ({ default: module.AuthPage })));
const AdminPage = lazy(() => import('@/pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const AboutPage = lazy(() => loadAboutPage().then((module) => ({ default: module.AboutPage })));
const ProfilePage = lazy(() => loadProfilePage().then((module) => ({ default: module.ProfilePage })));
const FaqPage = lazy(() => loadFaqPage().then((module) => ({ default: module.FaqPage })));
const StudentAssistantPage = lazy(() => import('@/pages/StudentAssistantPage').then((module) => ({ default: module.StudentAssistantPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));

export default function App() {
  return (
    <AuthProvider>
      <PublicRoutePreloader />
      <ScrollRestoration />
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <GettingStartedGuide />
        <main className="flex-1">
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/subject/:id" element={<SubjectPage />} />
              <Route path="/admin" element={<AdminRoute />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/assistant" element={<StudentAssistantPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="border-t border-white/5 py-6 text-center text-xs text-slate-500">
          <p>JPU-IT Hub · جامعة جرش - كلية الـ IT · {new Date().getFullYear()}</p>
          <Link to="/faq" className="mt-2 inline-flex items-center gap-1 text-slate-400 transition hover:text-brand-300">
            <Icon name="HelpCircle" className="h-3.5 w-3.5" /> الأسئلة الشائعة
          </Link>
        </footer>
      </div>
    </AuthProvider>
  );
}

function PublicRoutePreloader() {
  useEffect(() => {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || connection?.effectiveType?.includes('2g')) return;

    // Route chunks total only a few dozen KiB. Fetch them after the first
    // screen is stable so mobile navigation does not flash the Suspense shell.
    const timer = window.setTimeout(() => {
      void Promise.allSettled([
        loadSubjectPage(),
        loadAuthPage(),
        loadAboutPage(),
        loadProfilePage(),
        loadFaqPage(),
      ]);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}

function AdminRoute() {
  const { loading, isAdmin } = useAuth();
  if (loading) return <PageLoading />;

  // Do not render the lazy component for anyone else. This keeps the admin
  // chunk and its dashboard queries out of the network path for public users.
  return isAdmin ? <AdminPage /> : <Navigate to="/" replace />;
}

function PageLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="جارٍ تحميل الصفحة">
      <Icon name="Loader2" className="h-8 w-8 animate-spin text-brand-400" />
    </div>
  );
}
