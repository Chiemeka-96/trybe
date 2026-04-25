import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeToNewPosts, subscribeToPostDeletes } from '../lib/realtime';
import { useAuthStore } from '../store/authStore';
import PostCard from '../components/PostCard';
import SuggestedUsers from '../components/SuggestedUsers';
import type { Post } from '../types';
import { RefreshCw, Loader2, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PAGE_SIZE = 20;

export default function Home() {
  const { user } = useAuthStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const [newPostCount, setNewPostCount] = useState(0);

  const enrichPosts = useCallback((data: any[]) => {
    // Use Set for O(1) lookups instead of O(n) .some() per post
    const userId = user?.id;
    return data.map((p: any) => {
      const likeUserIds = new Set((p.likes || []).map((l: any) => l.user_id));
      const saveUserIds = new Set((p.saves || []).map((s: any) => s.user_id));
      return {
        ...p,
        like_count: p.likes?.length || 0,
        comment_count: p.comments?.length || 0,
        is_liked: userId ? likeUserIds.has(userId) : false,
        is_saved: userId ? saveUserIds.has(userId) : false,
      };
    });
  }, [user]);

  // AbortController ref for cancelling stale feed requests
  const abortRef = useRef<AbortController | null>(null);
  // Track in-flight fetch to prevent duplicate requests
  const fetchingRef = useRef(false);
  // Track known post IDs for realtime deduplication
  const knownPostIdsRef = useRef(new Set<string>());

  const fetchPosts = useCallback(async (reset = true) => {
    if (fetchingRef.current && !reset) return; // Don't stack load-more calls
    
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchingRef.current = true;

    if (reset) {
      setLoading(true);
      pageRef.current = 0;
      setNewPostCount(0);
    } else {
      setLoadingMore(true);
    }

    const from = pageRef.current * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
        *,
        profiles(*),
        likes(id, user_id),
        comments(id),
        saves(id, user_id)
      `)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error || controller.signal.aborted) {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
        fetchingRef.current = false;
        return;
      }

      const enriched = enrichPosts(data || []);

    if (reset) {
      setPosts(enriched);
      knownPostIdsRef.current = new Set(enriched.map((p: Post) => p.id));
    } else {
      setPosts(prev => [...prev, ...enriched]);
      enriched.forEach((p: Post) => knownPostIdsRef.current.add(p.id));
    }

    setHasMore((data?.length || 0) === PAGE_SIZE);
    setLoading(false);
    setLoadingMore(false);
    fetchingRef.current = false;
    } catch {
      // Network error — reset loading states to avoid stuck UI
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
      fetchingRef.current = false;
    }
  }, [enrichPosts]);

  // Stable callback for PostCard — prevents re-creating function on every render
  const handlePostUpdate = useCallback(() => fetchPosts(true), [fetchPosts]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || fetchingRef.current) return;
    pageRef.current += 1;
    fetchPosts(false);
  }, [fetchPosts, loadingMore, hasMore]);

  useEffect(() => {
    fetchPosts();
    // Cleanup: cancel in-flight request on unmount
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchPosts]);

  // Infinite scroll: IntersectionObserver on sentinel element
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreRef.current();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []); // Stable observer — only create once, uses ref for latest loadMore

  // Real-time: subscribe to new posts
  useEffect(() => {
    const unsubscribeNew = subscribeToNewPosts((newPost: any) => {
      // Don't count our own posts or posts we already know about
      if (newPost.user_id === user?.id) {
        // Our own post — just refresh the feed
        fetchPosts();
        return;
      }
      if (knownPostIdsRef.current.has(newPost.id)) return;
      setNewPostCount(prev => prev + 1);
    });

    const unsubscribeDelete = subscribeToPostDeletes((oldPost: any) => {
      // Remove deleted post from view immediately
      setPosts(prev => prev.filter(p => p.id !== oldPost.id));
      knownPostIdsRef.current.delete(oldPost.id);
    });

    return () => {
      unsubscribeNew();
      unsubscribeDelete();
    };
  }, [user?.id, fetchPosts]);

  const handleLoadNewPosts = () => {
    setNewPostCount(0);
    fetchPosts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Feed</h1>
          <p className="section-subtitle mt-1">What's your trybe up to?</p>
        </div>
        <button
          onClick={() => fetchPosts()}
          className="p-2.5 rounded-2xl text-gray-400 dark:text-gray-500 hover:text-trybe-600 dark:hover:text-trybe-400 hover:bg-trybe-50 dark:hover:bg-trybe-950/60 transition-all duration-300 hover:shadow-sm dark:hover:shadow-none"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Real-time new posts banner */}
      <AnimatePresence>
        {newPostCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            onClick={handleLoadNewPosts}
            className="w-full mb-5 py-3 px-4 rounded-2xl bg-gradient-to-r from-trybe-500 to-trybe-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-glow-green hover:shadow-glow-green-md transition-all duration-300 active:scale-[0.98]"
          >
            <ArrowUp size={16} className="animate-bounce" />
            {newPostCount === 1 ? '1 new post' : `${newPostCount} new posts`} — tap to refresh
          </motion.button>
        )}
      </AnimatePresence>

      {/* Suggested Users */}
      <SuggestedUsers />

      {/* Posts */}
      {loading ? (
        <div className="space-y-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-2xl bg-gray-200/80 dark:bg-gray-700/80" />
                <div className="space-y-2">
                  <div className="h-3 w-24 bg-gray-200/80 dark:bg-gray-700/80 rounded-full" />
                  <div className="h-2 w-16 bg-gray-100/80 dark:bg-gray-800/80 rounded-full" />
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="h-3 w-full bg-gray-100/80 dark:bg-gray-800/80 rounded-full" />
                <div className="h-3 w-3/4 bg-gray-100/80 dark:bg-gray-800/80 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
          <div className="w-18 h-18 rounded-3xl bg-trybe-50 dark:bg-trybe-950/60 flex items-center justify-center mx-auto mb-5 shadow-sm dark:shadow-none" style={{ width: 72, height: 72 }}>
            <span className="text-3xl">✨</span>
          </div>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-1.5 text-lg">No posts yet</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500">Be the first to share something!</p>
        </motion.div>
      ) : (
        <>
          <div className="space-y-5">
            {posts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.5), duration: 0.35 }}
              >
                <PostCard post={post} onUpdate={handlePostUpdate} />
              </motion.div>
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-px" />

          {/* Loading indicator */}
          {loadingMore && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-gray-500 font-medium py-6"
            >
              <Loader2 size={16} className="animate-spin text-trybe-500" />
              Loading more posts...
            </motion.div>
          )}

          {/* End of feed message */}
          {!hasMore && posts.length > PAGE_SIZE && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-xs text-gray-300 dark:text-gray-600 mt-8 mb-2 font-medium"
            >
              You're all caught up ✨
            </motion.p>
          )}
        </>
      )}
    </div>
  );
}
