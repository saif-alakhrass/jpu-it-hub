import { AuthProvider } from '@/context/AuthContext';
import { Navbar } from '@/components/Navbar';
import { useRouter } from '@/lib/router';
import { HomePage } from '@/pages/HomePage';
import { SubjectPage } from '@/pages/SubjectPage';
import { AuthPage } from '@/pages/AuthPage';
import { AdminPage } from '@/pages/AdminPage';

function Routes() {
  const { route } = useRouter();
  switch (route.path) {
    case '/subject/:id':
      return <SubjectPage subjectId={route.params.id} />;
    case '/admin':
      return <AdminPage />;
    case '/auth':
      return <AuthPage />;
    default:
      return <HomePage />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes />
        </main>
        <footer className="border-t border-white/5 py-6 text-center text-xs text-slate-500">
          JPU-IT Hub · جامعة جرش - كلية الـ IT · {new Date().getFullYear()}
        </footer>
      </div>
    </AuthProvider>
  );
}
