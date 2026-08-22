import { lazy, Suspense } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/hooks/useAuth';
import { Navbar } from '@/components/Navbar';
import { Icon } from '@/components/Icon';
import { ScrollRestoration } from '@/components/ScrollRestoration';
import { useRouter } from '@/lib/router';

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })));
const SubjectPage = lazy(() => import('@/pages/SubjectPage').then((module) => ({ default: module.SubjectPage })));
const AuthPage = lazy(() => import('@/pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const AdminPage = lazy(() => import('@/pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const AboutPage = lazy(() => import('@/pages/AboutPage').then((module) => ({ default: module.AboutPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const FAQPage = lazy(() => import('@/pages/FAQPage').then((module) => ({ default: module.FAQPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));

export default function App() {
  const { navigate } = useRouter();

  return (
    <AuthProvider>
      <ScrollRestoration />
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/subject/:id" element={<SubjectPage />} />
              <Route path="/admin" element={<AdminRoute />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="border-t border-white/5 py-6 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
          <div>JPU-IT Hub · جامعة جرش - كلية الـ IT · {new Date().getFullYear()}</div>
          <button onClick={() => navigate('/faq')} className="text-slate-400 hover:text-brand-400 transition font-bold mt-1">الأسئلة الشائعة (FAQ)</button>
        </footer>
      </div>
    </AuthProvider>
  );
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
