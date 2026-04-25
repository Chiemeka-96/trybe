import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { useThemeStore } from '../store/themeStore';
import { useEffect, useState, useRef } from 'react';
import { Home, Users, PlusCircle, MessageCircle, User, LogOut, Sparkles, Bell, MoreVertical, Settings2, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Layout() {
  const { profile, signOut } = useAuthStore();
  const { unreadCount, startRealtime } = useNotificationStore();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Start real-time notification subscriptions (with polling fallback)
  useEffect(() => {
    if (!profile?.id) return;
    const stop = startRealtime(profile.id);
    return stop;
  }, [startRealtime, profile?.id]);

  // Close mobile menu when tapping outside
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleTap = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleTap);
    document.addEventListener('touchstart', handleTap);
    return () => {
      document.removeEventListener('mousedown', handleTap);
      document.removeEventListener('touchstart', handleTap);
    };
  }, [mobileMenuOpen]);

  const handleSignOut = async () => {
    setMobileMenuOpen(false);
    await signOut();
    navigate('/auth');
  };

  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/collab', icon: Users, label: 'Collab' },
    { to: '/create', icon: PlusCircle, label: 'Post' },
    { to: '/notifications', icon: Bell, label: 'Alerts', badge: unreadCount },
    { to: '/messages', icon: MessageCircle, label: 'DMs' },
    { to: `/profile/${profile?.username || ''}`, icon: User, label: 'Me' },
  ];

  const isDark = theme === 'dark';

  return (
    <div className="min-h-screen bg-gray-50/80 dark:bg-gray-950 transition-colors duration-300">
      {/* Desktop top bar — glassmorphism */}
      <header className="hidden md:flex fixed top-0 left-0 right-0 h-16 glass border-b border-gray-100/60 dark:border-gray-800/60 z-50 items-center justify-between px-8 shadow-soft dark:shadow-none">
        <NavLink to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-trybe-400 to-trybe-600 flex items-center justify-center shadow-glow-green">
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-trybe-600 to-trybe-500 bg-clip-text text-transparent tracking-tight">
            trybe
          </span>
        </NavLink>
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium transition-all duration-300 ${
                  label === 'Collab'
                    ? isActive
                      ? 'bg-gradient-to-r from-trybe-500 to-trybe-600 text-white shadow-glow-green'
                      : 'bg-trybe-50 dark:bg-trybe-950 text-trybe-600 dark:text-trybe-400 ring-1 ring-trybe-200 dark:ring-trybe-800 hover:ring-trybe-300 dark:hover:ring-trybe-700 hover:bg-trybe-100/80 dark:hover:bg-trybe-900/80 hover:shadow-glow-green'
                    : isActive
                      ? 'bg-trybe-50 dark:bg-trybe-950/80 text-trybe-600 dark:text-trybe-400 shadow-sm dark:shadow-none'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                }`
              }
            >
              <Icon size={18} />
              {label}
              {(badge || 0) > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900 animate-scale-in">
                  {badge! > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
          ))}

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            className="ml-2 p-2.5 rounded-2xl text-gray-400 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all duration-300"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button
            onClick={handleSignOut}
            className="ml-1 p-2.5 rounded-2xl text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all duration-300"
          >
            <LogOut size={18} />
          </button>
        </nav>
      </header>

      {/* ─── Mobile top header ─── */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 glass border-b border-gray-100/60 dark:border-gray-800/60 z-50 flex items-center justify-between px-4 shadow-soft dark:shadow-none safe-area-top">
        <NavLink to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-trybe-400 to-trybe-600 flex items-center justify-center shadow-glow-green">
            <Sparkles size={13} className="text-white" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-trybe-600 to-trybe-500 bg-clip-text text-transparent tracking-tight">
            trybe
          </span>
        </NavLink>

        {/* Right side: profile + menu */}
        <div className="flex items-center gap-2" ref={menuRef}>
          <NavLink
            to={`/profile/${profile?.username || ''}`}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-2xl hover:bg-gray-100/80 dark:hover:bg-gray-800/60 transition-all active:scale-95"
          >
            <div className="avatar w-7 h-7 text-[10px] ring-1">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                profile?.username?.[0]?.toUpperCase() || '?'
              )}
            </div>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 max-w-[80px] truncate">
              @{profile?.username}
            </span>
          </NavLink>

          {/* Menu toggle */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className={`p-2 rounded-xl transition-all duration-200 active:scale-90 ${
              mobileMenuOpen ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            <MoreVertical size={18} />
          </button>

          {/* Dropdown menu */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute top-full right-3 mt-2 w-56 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100/80 dark:border-gray-800/80 shadow-soft-lg dark:shadow-none overflow-hidden z-50"
              >
                <div className="p-1.5">
                  <NavLink
                    to={`/profile/${profile?.username || ''}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors active:bg-gray-100 dark:active:bg-gray-700"
                  >
                    <User size={16} className="text-gray-400 dark:text-gray-500" />
                    My Profile
                  </NavLink>
                  <NavLink
                    to={`/profile/${profile?.username || ''}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors active:bg-gray-100 dark:active:bg-gray-700"
                  >
                    <Settings2 size={16} className="text-gray-400 dark:text-gray-500" />
                    Settings
                  </NavLink>

                  {/* Dark mode toggle in mobile menu */}
                  <button
                    onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors active:bg-gray-100 dark:active:bg-gray-700"
                  >
                    {isDark ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-gray-400" />}
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                  </button>

                  <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-800" />
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors active:bg-red-100 dark:active:bg-red-900/40"
                  >
                    <LogOut size={16} />
                    Log Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Main Content — adjusted padding for mobile header */}
      <main className="pb-24 md:pb-8 md:pt-24 pt-[72px] max-w-2xl mx-auto px-4 sm:px-6">
        <Outlet />
      </main>

      {/* ─── Mobile bottom nav — glassmorphism ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-gray-100/60 dark:border-gray-800/60 z-50 safe-area-bottom shadow-soft dark:shadow-none">
        <div className="flex items-center justify-around py-1.5 px-1">
          {navItems.slice(0, 5).map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all duration-300 relative min-w-[52px] ${
                  label === 'Collab'
                    ? isActive
                      ? 'text-white bg-gradient-to-t from-trybe-600 to-trybe-500 shadow-glow-green scale-105'
                      : 'text-trybe-500 dark:text-trybe-400'
                    : isActive
                      ? 'text-trybe-600 dark:text-trybe-400 bg-trybe-50/80 dark:bg-trybe-950/60'
                      : 'text-gray-400 dark:text-gray-500'
                }`
              }
            >
              {label === 'Collab' && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-trybe-400 rounded-full animate-pulse-soft ring-2 ring-white dark:ring-gray-900" />
              )}
              {label === 'Alerts' && (badge || 0) > 0 && (
                <span className="absolute -top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900">
                  {badge! > 9 ? '9+' : badge}
                </span>
              )}
              <Icon size={20} strokeWidth={2} />
              <span className="text-[10px] font-semibold">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
