import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { subscribeToNotifications } from '../lib/realtime';
import type { Notification } from '../types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  _pendingRetry: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  startRealtime: (userId: string) => () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  _pendingRetry: false,

  fetchNotifications: async () => {
    // Prevent overlapping fetches; queue one retry if skipped
    if (get().loading) {
      set({ _pendingRetry: true });
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    set({ loading: true });

    const { data } = await supabase
      .from('notifications')
      .select('*, actor:profiles!notifications_actor_id_fkey(*)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const notifications = (data || []) as Notification[];
    const unreadCount = notifications.filter(n => !n.read).length;

    set({ notifications, unreadCount, loading: false });

    // If a fetch was requested while we were loading, do one more
    if (get()._pendingRetry) {
      set({ _pendingRetry: false });
      setTimeout(() => get().fetchNotifications(), 100);
    }
  },

  markAsRead: async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    set(state => ({
      notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllAsRead: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false);

    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  clearAll: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', session.user.id);

    set({ notifications: [], unreadCount: 0 });
  },

  startRealtime: (userId: string) => {
    // Initial fetch
    get().fetchNotifications();

    // Subscribe to real-time notifications — append directly to avoid thundering herd re-fetch
    const unsubscribeRealtime = subscribeToNotifications(userId, async (newNotif: any) => {
      // Enrich with actor profile
      const { data: actor } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', newNotif.actor_id)
        .single();

      const enriched = { ...newNotif, actor } as Notification;

      set((state) => {
        // Dedup: skip if already exists
        if (state.notifications.some((n) => n.id === enriched.id)) return state;
        return {
          notifications: [enriched, ...state.notifications],
          unreadCount: state.unreadCount + (enriched.read ? 0 : 1),
        };
      });
    });

    // Fallback polling with jitter to prevent thundering herd at 50K+ users
    // Pauses when tab is hidden to save resources
    const BASE_POLL_MS = 30000;
    const JITTER_MS = 10000;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const schedulePoll = () => {
      const delay = BASE_POLL_MS + Math.random() * JITTER_MS;
      pollTimer = setTimeout(() => {
        // Skip polling if tab is hidden
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          schedulePoll();
          return;
        }
        get().fetchNotifications();
        schedulePoll();
      }, delay);
    };
    schedulePoll();

    return () => {
      unsubscribeRealtime();
      if (pollTimer) clearTimeout(pollTimer);
    };
  },
}));
