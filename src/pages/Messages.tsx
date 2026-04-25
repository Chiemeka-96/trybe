import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { subscribeToMessages } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import type { Profile, Message } from '../types';
import { Send, ArrowLeft, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createNotification } from '../lib/notifications';
import { checkRateLimit, RateActions, formatRetryAfter } from '../lib/rateLimiter';
import { toast } from '../store/toastStore';

export default function Messages() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<(Profile & { lastMessage?: string; lastTime?: string; unread?: number })[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(searchParams.get('to'));
  const [activeChatProfile, setActiveChatProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Limit to last 200 messages to avoid unbounded fetches under load
    const { data: msgs } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(*), receiver:profiles!messages_receiver_id_fkey(*)')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(200);

    if (msgs) {
      const convMap = new Map<string, any>();
      msgs.forEach((m: any) => {
        const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        const otherProfile = m.sender_id === user.id ? m.receiver : m.sender;
        if (!convMap.has(otherId)) {
          convMap.set(otherId, {
            ...otherProfile,
            lastMessage: m.content,
            lastTime: m.created_at,
            unread: m.receiver_id === user.id && !m.read ? 1 : 0,
          });
        } else if (m.receiver_id === user.id && !m.read) {
          const existing = convMap.get(otherId);
          existing.unread = (existing.unread || 0) + 1;
        }
      });
      setConversations(Array.from(convMap.values()));
    }

    setLoading(false);
  }, [user]);

  const fetchMessages = useCallback(async (otherId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true })
      .limit(200); // Cap message history to prevent unbounded fetches
    setMessages(data || []);

    // Mark as read
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', otherId)
      .eq('receiver_id', user.id);

    setTimeout(scrollToBottom, 100);
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat);
      supabase
        .from('profiles')
        .select('*')
        .eq('id', activeChat)
        .single()
        .then(({ data }) => setActiveChatProfile(data));
    }
  }, [activeChat, fetchMessages]);

  // Real-time message subscription — replaces polling
  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;

  // Track seen message IDs for deduplication
  const seenIdsRef = useRef(new Set<string>());
  useEffect(() => {
    seenIdsRef.current = new Set(messages.map(m => m.id));
  }, [messages]);

  useEffect(() => {
    if (!user) return;

    // Subscribe to incoming messages for this user
    const unsubscribe = subscribeToMessages(user.id, (newMsg: Message) => {
      // Deduplication check
      if (seenIdsRef.current.has(newMsg.id)) return;
      seenIdsRef.current.add(newMsg.id);

      // If we're in the chat with the sender, append the message directly
      if (activeChatRef.current && newMsg.sender_id === activeChatRef.current) {
        setMessages(prev => [...prev, newMsg]);
        setTimeout(scrollToBottom, 100);

        // Mark as read immediately since we're viewing the chat
        supabase
          .from('messages')
          .update({ read: true })
          .eq('id', newMsg.id)
          .then(() => {});
      }

      // Refresh conversation list
      fetchConversations();
    });

    // Fallback polling with jitter to prevent thundering herd at 50K+ users
    // Also pause when tab is hidden to save resources
    const BASE_POLL_MS = 15000;
    const JITTER_MS = 5000;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const schedulePoll = () => {
      const delay = BASE_POLL_MS + Math.random() * JITTER_MS;
      pollTimer = setTimeout(() => {
        // Skip polling if tab is hidden
        if (document.visibilityState === 'hidden') {
          schedulePoll();
          return;
        }
        if (activeChatRef.current) fetchMessages(activeChatRef.current);
        fetchConversations();
        schedulePoll();
      }, delay);
    };
    schedulePoll();

    return () => {
      unsubscribe();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [user, fetchMessages, fetchConversations]);

  // Also subscribe to our own sent messages being delivered (for multi-device)
  useEffect(() => {
    if (!user || !activeChat) return;

    // Also deduplicate the own-sent subscription channel name
    const channel = supabase
      .channel(`messages:sent:${user.id}:${activeChat}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.receiver_id !== activeChat) return;
          if (seenIdsRef.current.has(newMsg.id)) return;
          seenIdsRef.current.add(newMsg.id);
          setMessages(prev => [...prev, newMsg]);
          setTimeout(scrollToBottom, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeChat]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeChat || !newMessage.trim() || sending) return;
    const rl = checkRateLimit(RateActions.messagesSend, { userId: user.id });
    if (!rl.allowed) {
      toast.error(`You're sending messages too fast. Try again ${formatRetryAfter(rl.retryAfterMs)}.`, 'Rate limit');
      return;
    }
    setSending(true);
    const msgContent = newMessage.trim();
    const sanitized = msgContent.slice(0, 2000); // Max message length

    // Optimistic: add message to UI immediately
    // Use crypto.randomUUID to prevent ID collisions at high concurrency
    const optimisticId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? `temp-${crypto.randomUUID()}`
      : `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      sender_id: user.id,
      receiver_id: activeChat,
      content: sanitized,
      read: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage('');
    setTimeout(scrollToBottom, 50);

    try {
      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: activeChat,
        content: sanitized,
      });
      if (error) {
        // Remove optimistic message on failure
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        setNewMessage(sanitized);
        return;
      }
      // Notify the receiver
      createNotification({
        userId: activeChat,
        actorId: user.id,
        type: 'message',
        content: sanitized.slice(0, 80),
      });
      // The realtime subscription will handle adding the actual DB message
      // Remove the optimistic message so it's replaced by the real one
      setTimeout(() => {
        fetchMessages(activeChat);
      }, 500);
    } finally {
      setSending(false);
    }
  };

  // Debounced search to avoid hammering DB on fast typing
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const sanitizedQ = q.replace(/[%_\\]/g, '').trim();
    if (sanitizedQ.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      const rl = checkRateLimit(RateActions.profilesSearch, { userId: user?.id });
      if (!rl.allowed) {
        setSearchResults([]);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${sanitizedQ}%`)
        .neq('id', user?.id || '')
        .limit(5);
      setSearchResults(data || []);
    }, 300);
  };

  const startChat = (profile: Profile) => {
    setActiveChat(profile.id);
    setActiveChatProfile(profile);
    setSearchQuery('');
    setSearchResults([]);
    setSearchParams({ to: profile.id });
  };

  function timeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  // Mobile: show chat view or list view
  if (activeChat) {
    return (
      <div className="py-4 sm:py-6 flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Chat header */}
        <div className="flex items-center gap-3 pb-4 border-b border-gray-100/80 dark:border-gray-800/80">
          <button
            onClick={() => { setActiveChat(null); setSearchParams({}); }}
            className="p-2.5 rounded-2xl text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300"
          >
            <ArrowLeft size={18} />
          </button>
          <Link to={`/profile/${activeChatProfile?.username}`} className="flex items-center gap-2.5">
            <div className="avatar w-9 h-9 text-xs ring-1">
              {activeChatProfile?.avatar_url ? (
                <img src={activeChatProfile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                activeChatProfile?.username?.[0]?.toUpperCase() || '?'
              )}
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">@{activeChatProfile?.username}</span>
              <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
            </div>
          </Link>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${m.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[75%] px-4 py-3 text-sm leading-relaxed ${
                m.sender_id === user?.id
                  ? 'bg-gradient-to-br from-trybe-500 to-trybe-600 text-white rounded-2xl rounded-br-lg shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-lg shadow-soft dark:shadow-none border border-gray-100/60 dark:border-gray-700/60'
              }`}>
                <p>{m.content}</p>
                <p className={`text-[10px] mt-1.5 ${m.sender_id === user?.id ? 'text-white/60' : 'text-gray-400 dark:text-gray-500'}`}>
                  {timeAgo(m.created_at)}
                </p>
              </div>
            </motion.div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Send box */}
        <form onSubmit={sendMessage} className="flex gap-2 pt-3 border-t border-gray-100/80 dark:border-gray-800/80">
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value.slice(0, 2000))}
            className="input-field text-sm py-3"
            placeholder="Type a message..."
            maxLength={2000}
          />
          <button type="submit" className="btn-primary px-5" disabled={!newMessage.trim() || sending}>
            <Send size={16} />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="py-6">
      <h1 className="section-title mb-5">Messages</h1>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="input-field pl-10 text-sm"
          placeholder="Search users to message..."
        />
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100/80 dark:border-gray-800/80 shadow-soft-lg dark:shadow-none z-20 overflow-hidden"
            >
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => startChat(p)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200 text-left"
                >
                  <div className="avatar w-8 h-8 text-[10px] ring-1">
                    {p.username[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm font-medium dark:text-gray-200">@{p.username}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Conversations */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 animate-pulse flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gray-200/80 dark:bg-gray-700/80" />
              <div className="space-y-2 flex-1">
                <div className="h-3 w-24 bg-gray-200/80 dark:bg-gray-700/80 rounded-full" />
                <div className="h-2 w-40 bg-gray-100/80 dark:bg-gray-800/80 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
          <div className="w-18 h-18 rounded-3xl bg-trybe-50 dark:bg-trybe-950/60 flex items-center justify-center mx-auto mb-5 shadow-sm dark:shadow-none" style={{ width: 72, height: 72 }}>
            <span className="text-3xl">💬</span>
          </div>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-1.5 text-lg">No messages yet</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500">Search for someone to start chatting!</p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <motion.button
              key={conv.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => startChat(conv)}
              className="w-full card p-4 flex items-center gap-3 hover:shadow-soft-md transition-all duration-300 text-left group"
            >
              <div className="avatar w-11 h-11 text-sm ring-1 ring-gray-100 dark:ring-gray-800 group-hover:shadow-glow-green transition-shadow duration-300">
                {conv.avatar_url ? (
                  <img src={conv.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  conv.username[0]?.toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 group-hover:text-trybe-600 dark:group-hover:text-trybe-400 transition-colors">@{conv.username}</span>
                  {conv.lastTime && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(conv.lastTime)}</span>
                  )}
                </div>
                {conv.lastMessage && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{conv.lastMessage}</p>
                )}
              </div>
              {(conv.unread || 0) > 0 && (
                <span className="w-5 h-5 rounded-full bg-trybe-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900">
                  {conv.unread! > 9 ? '9+' : conv.unread}
                </span>
              )}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
