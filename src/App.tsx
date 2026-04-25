import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './layouts/Layout';
import Auth from './pages/Auth';
import ToastHost from './components/ToastHost';
import { Loader2 } from 'lucide-react';

// Lazy load pages for code splitting
const Home = lazy(() => import('./pages/Home'));
const CollabBoard = lazy(() => import('./pages/CollabBoard'));
const CreatePost = lazy(() => import('./pages/CreatePost'));
const Messages = lazy(() => import('./pages/Messages'));
const Notifications = lazy(() => import('./pages/Notifications'));
const ProfilePage = lazy(() => import('./pages/Profile'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-trybe-500" size={24} />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore();
  if (!initialized) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function App() {
  const { initialize, initialized, user } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initialize().then(() => setReady(true));
  }, [initialize]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/80 dark:bg-gray-950 transition-colors duration-300">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-trybe-400 to-trybe-600 flex items-center justify-center mx-auto mb-4 shadow-glow-green animate-pulse">
            <Loader2 className="animate-spin text-white" size={22} />
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">Loading trybe...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ToastHost />
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Suspense fallback={<PageLoader />}><Home /></Suspense>} />
          <Route path="/collab" element={<Suspense fallback={<PageLoader />}><CollabBoard /></Suspense>} />
          <Route path="/create" element={<Suspense fallback={<PageLoader />}><CreatePost /></Suspense>} />
          <Route path="/notifications" element={<Suspense fallback={<PageLoader />}><Notifications /></Suspense>} />
          <Route path="/messages" element={<Suspense fallback={<PageLoader />}><Messages /></Suspense>} />
          <Route path="/profile/:username" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
