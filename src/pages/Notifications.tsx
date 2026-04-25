import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../store/notificationStore';
import { useAuthStore } from '../store/authStore';
import { Heart, MessageCircle, Users, Bell, Mail, UserPlus, Check, CheckCheck, Trash2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Notification, NotificationType } from '../types';
import { supabase } from '../lib/supabase';

const NOTIF_PAGE_SIZE = 20;

/* ─── Icon + color per notification type ─── */
const typeConfig: Record<NotificationType, { icon: typeof Heart; color: string; bg: string; label: string }> = {
  like: { icon: Heart, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/40', label: 'liked your post' },
  comment: { icon: MessageCircle, color: 'text-trybe-500', bg: 'bg-trybe-50 dark:bg-trybe-950/40', label: 'commented on your post' },
  collab_request: { icon: Users, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/40', label: 'sent a collab request' },
  message: { icon: Mail, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/40', label: 'sent you a message' },
  follow: { icon: UserPlus, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/40', label: 'started following you' },
};

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NotificationItem({ notification, onTap }: { notification: Notification; onTap: () => void }) {
  const config = typeConfig[notification.type];
  const Icon = config.icon;
  const navigate = useNavigate();

  const handleClick = () => {
    onTap();
    // Navigate based on type
    if (notification.type === 'message' && notification.actor?.id) {
      navigate(`/messages?to=${notification.actor.id}`);
    } else if (notification.type === 'follow' && notification.actor?.username) {
      navigate(`/profile/${notification.actor.username}`);
    } else if ((notification.type === 'like' || notification.type === 'comment') && notification.reference_id) {
      navigate('/');
    } else if (notification.type === 'collab_request') {
      navigate('/collab');
    }
  };

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all duration-200 rounded-2xl ${
        notification.read ? 'bg-transparent hover:bg-gray-50/60 dark:hover:bg-gray-800/40' : 'bg-trybe-50/40 dark:bg-trybe-950/30 hover:bg-trybe-50/60 dark:hover:bg-trybe-950/50'
      }`}
    >
      {/* Type icon */}
      <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon size={18} className={config.color} fill={notification.type === 'like' ? 'currentColor' : 'none'} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
          <span className="font-semibold text-gray-900 dark:text-gray-100">@{notification.actor?.username || 'someone'}</span>
          {' '}{config.label}
        </p>
        {notification.content && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{notification.content}</p>
        )}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{timeAgo(notification.created_at)}</p>
      </div>

      {/* Unread dot */}
      {!notification.read && (
        <div className="w-2.5 h-2.5 rounded-full bg-trybe-500 shrink-0 mt-2" />
      )}
    </motion.button>
  );
}

export default function Notifications() {
  const { notifications: storeNotifs, unreadCount, loading: storeLoading, fetchNotifications, markAsRead, markAllAsRead, clearAll } = useNotificationStore();
  const { user } = useAuthStore();

  // Local pagination state for infinite scroll
  const [displayedNotifs, setDisplayedNotifs] = useState<Notification[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const fetchingRef = useRef(false);

  useEffect(() => {
    fetchNotifications().then(() => setInitialLoad(false));
  }, [fetchNotifications]);

  // Paginate from the store's full list
  const loadPage = useCallback((resetPage = false) => {
    const currentPage = resetPage ? 0 : page;
    const start = 0;
    const end = (currentPage + 1) * NOTIF_PAGE_SIZE;
    const sliced = storeNotifs.slice(start, end);
    setDisplayedNotifs(sliced);
    setHasMore(end < storeNotifs.length);
    if (resetPage) setPage(0);
  }, [storeNotifs, page]);

  // When store data changes, reset pagination view
  useEffect(() => {
    loadPage(true);
  }, [storeNotifs]);

  const loadMoreNotifs = useCallback(() => {
    if (loadingMore || !hasMore || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingMore(true);

    const nextPage = page + 1;
    const end = (nextPage + 1) * NOTIF_PAGE_SIZE;
    const sliced = storeNotifs.slice(0, end);
    setDisplayedNotifs(sliced);
    setPage(nextPage);
    setHasMore(end < storeNotifs.length);
    setLoadingMore(false);
    fetchingRef.current = false;
  }, [page, storeNotifs, hasMore, loadingMore]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMoreNotifs);
  loadMoreRef.current = loadMoreNotifs;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreRef.current();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayedNotifs.length]);

  const todayNotifs = displayedNotifs.filter(n => {
    const diff = (Date.now() - new Date(n.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return diff < 1;
  });
  const earlierNotifs = displayedNotifs.filter(n => {
    const diff = (Date.now() - new Date(n.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 1;
  });

  return (
    <div className="py-4 sm:py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 px-1">
        <div>
          <h1 className="section-title">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 text-xs font-medium text-trybe-600 dark:text-trybe-400 hover:text-trybe-700 dark:hover:text-trybe-300 bg-trybe-50 dark:bg-trybe-950/60 hover:bg-trybe-100/80 dark:hover:bg-trybe-900/60 px-3 py-1.5 rounded-full transition-all duration-200"
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
          )}
          {displayedNotifs.length > 0 && (
            <button
              onClick={clearAll}
              className="p-2 rounded-xl text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50/80 dark:hover:bg-red-950/40 transition-all duration-200"
              title="Clear all"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {initialLoad && storeNotifs.length === 0 ? (
        <div className="space-y-3 px-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3 p-3 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-gray-200/80 dark:bg-gray-700/80 shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 w-48 bg-gray-200/80 dark:bg-gray-700/80 rounded-full" />
                <div className="h-2.5 w-20 bg-gray-100/80 dark:bg-gray-800/80 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : displayedNotifs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <Bell size={28} className="text-gray-300 dark:text-gray-600" />
          </div>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-1 text-base">All caught up!</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500">You have no notifications right now</p>
        </motion.div>
      ) : (
        <div className="space-y-1">
          {/* Today */}
          {todayNotifs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-4 pb-2">Today</p>
              <AnimatePresence mode="popLayout">
                {todayNotifs.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onTap={() => !n.read && markAsRead(n.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Earlier */}
          {earlierNotifs.length > 0 && (
            <div className={todayNotifs.length > 0 ? 'mt-4' : ''}>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-4 pb-2">Earlier</p>
              <AnimatePresence mode="popLayout">
                {earlierNotifs.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onTap={() => !n.read && markAsRead(n.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-px" />

          {/* Loading more indicator */}
          {loadingMore && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-gray-500 font-medium py-4"
            >
              <Loader2 size={16} className="animate-spin text-trybe-500" />
              Loading more...
            </motion.div>
          )}

          {/* End of notifications */}
          {!hasMore && displayedNotifs.length > NOTIF_PAGE_SIZE && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-xs text-gray-300 dark:text-gray-600 mt-6 mb-2 font-medium"
            >
              That's everything ✨
            </motion.p>
          )}
        </div>
      )}
    </div>
  );
}
