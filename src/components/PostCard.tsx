import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Bookmark, Trash2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { getPostEmbeds } from '../lib/urlUtils';
import { EmbedStack } from './EmbedRenderer';
import LinkedText from './LinkedText';
import type { Post, Comment } from '../types';
import { createNotification } from '../lib/notifications';
import { checkRateLimit, RateActions, formatRetryAfter } from '../lib/rateLimiter';
import { toast } from '../store/toastStore';

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface PostCardProps {
  post: Post;
  onUpdate?: () => void;
}

export default function PostCard({ post, onUpdate }: PostCardProps) {
  const { user } = useAuthStore();
  const [liked, setLiked] = useState(post.is_liked || false);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [saved, setSaved] = useState(post.is_saved || false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  // Mutex refs to prevent race conditions on rapid clicks
  const likingRef = useRef(false);
  const savingRef = useRef(false);

  // Detect all embeddable URLs from post content + embed_url field
  const embeds = useMemo(
    () => getPostEmbeds(post.content, post.embed_url),
    [post.content, post.embed_url]
  );

  const handleLike = async () => {
    if (!user || likingRef.current) return;
    const rl = checkRateLimit(RateActions.postsLike, { userId: user.id });
    if (!rl.allowed) {
      toast.error(`Too many actions. Try again ${formatRetryAfter(rl.retryAfterMs)}.`, 'Slow down');
      return;
    }
    likingRef.current = true;
    const wasLiked = liked;
    const prevCount = likeCount;
    try {
      if (wasLiked) {
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
        const { error } = await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id);
        if (error) { setLiked(wasLiked); setLikeCount(prevCount); }
      } else {
        setLiked(true);
        setLikeCount((c) => c + 1);
        const { error } = await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
        if (error) {
          setLiked(wasLiked);
          setLikeCount(prevCount);
        } else if (post.user_id !== user.id) {
          createNotification({
            userId: post.user_id,
            actorId: user.id,
            type: 'like',
            referenceId: post.id,
            content: post.content.slice(0, 80),
          });
        }
      }
    } finally {
      likingRef.current = false;
    }
  };

  const handleSave = async () => {
    if (!user || savingRef.current) return;
    const rl = checkRateLimit(RateActions.postsSave, { userId: user.id });
    if (!rl.allowed) {
      toast.error(`Too many actions. Try again ${formatRetryAfter(rl.retryAfterMs)}.`, 'Slow down');
      return;
    }
    savingRef.current = true;
    const wasSaved = saved;
    try {
      if (wasSaved) {
        setSaved(false);
        const { error } = await supabase.from('saves').delete().eq('post_id', post.id).eq('user_id', user.id);
        if (error) setSaved(wasSaved);
      } else {
        setSaved(true);
        const { error } = await supabase.from('saves').insert({ post_id: post.id, user_id: user.id });
        if (error) setSaved(wasSaved);
      }
    } finally {
      savingRef.current = false;
    }
  };

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const { data } = await supabase
        .from('comments')
        .select('*, profiles(*)')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true })
        .limit(50); // Cap comments per post to prevent payload explosion at scale
      setComments(data || []);
    } catch {
      // Silently handle — comments section will remain empty
    } finally {
      setLoadingComments(false);
    }
  };

  const toggleComments = () => {
    if (!showComments) loadComments();
    setShowComments(!showComments);
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !commentText.trim() || submittingComment) return;
    const rl = checkRateLimit(RateActions.postsComment, { userId: user.id });
    if (!rl.allowed) {
      toast.error(`Too many comments. Try again ${formatRetryAfter(rl.retryAfterMs)}.`, 'Slow down');
      return;
    }
    setSubmittingComment(true);
    const commentContent = commentText.trim().slice(0, 500); // Max 500 chars for comments
    try {
      const { error } = await supabase.from('comments').insert({
        post_id: post.id,
        user_id: user.id,
        content: commentContent,
      });
      if (!error) {
        if (post.user_id !== user.id) {
          createNotification({
            userId: post.user_id,
            actorId: user.id,
            type: 'comment',
            referenceId: post.id,
            content: commentContent.slice(0, 80),
          });
        }
        setCommentText('');
        loadComments();
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  const deletePost = async () => {
    if (!user || user.id !== post.user_id || deleting) return;
    setDeleting(true);
    try {
      await supabase.from('posts').delete().eq('id', post.id);
      setShowDeleteConfirm(false);
      onUpdate?.();
    } catch {
      toast.error('Failed to delete post. Please try again.', 'Error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="card p-5 sm:p-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/profile/${post.profiles?.username}`}>
          <div className="avatar w-10 h-10 text-sm">
            {post.profiles?.avatar_url ? (
              <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              post.profiles?.username?.[0]?.toUpperCase() || '?'
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${post.profiles?.username}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-trybe-600 dark:hover:text-trybe-400 transition-colors duration-200">
            @{post.profiles?.username}
          </Link>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{timeAgo(post.created_at)}</p>
        </div>
        {user?.id === post.user_id && (
          <button onClick={() => setShowDeleteConfirm(true)} className="p-2 rounded-xl text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50/80 dark:hover:bg-red-950/40 transition-all duration-300">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-4 bg-red-50/80 dark:bg-red-950/40 border border-red-200/60 dark:border-red-800/40 rounded-2xl"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-red-500" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">Delete this post?</span>
            </div>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mb-3">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={deletePost}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content — URLs are auto-linked, text-first typography */}
      <LinkedText
        text={post.content}
        className="text-gray-800 dark:text-gray-200 text-[15px] leading-relaxed mb-4 whitespace-pre-wrap"
      />

      {/* Embeds — dynamic card selection: video → embed, hero → OG image, compact stack */}
      <EmbedStack embeds={embeds} />

      {/* Actions */}
      <div className="flex items-center gap-1 pt-3 border-t border-gray-100/80 dark:border-gray-800/80">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
            liked ? 'text-red-500 bg-red-50/80 dark:bg-red-950/40' : 'text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50/80 dark:hover:bg-red-950/40'
          }`}
        >
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} className={liked ? 'scale-110' : 'hover:scale-110'} style={{ transition: 'transform 0.2s' }} />
          {likeCount > 0 && likeCount}
        </button>
        <button
          onClick={toggleComments}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
            showComments ? 'text-trybe-600 dark:text-trybe-400 bg-trybe-50/80 dark:bg-trybe-950/40' : 'text-gray-400 dark:text-gray-500 hover:text-trybe-600 dark:hover:text-trybe-400 hover:bg-trybe-50/80 dark:hover:bg-trybe-950/40'
          }`}
        >
          <MessageCircle size={16} />
          {(post.comment_count || 0) > 0 && post.comment_count}
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
            saved ? 'text-amber-500 bg-amber-50/80 dark:bg-amber-950/40' : 'text-gray-400 dark:text-gray-500 hover:text-amber-500 hover:bg-amber-50/80 dark:hover:bg-amber-950/40'
          }`}
        >
          <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="mt-4 pt-4 border-t border-gray-100/80 dark:border-gray-800/80">
          {loadingComments ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-3">Loading...</p>
          ) : (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <div className="avatar w-7 h-7 text-[10px] ring-1">
                    {c.profiles?.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <Link to={`/profile/${c.profiles?.username}`} className="text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-trybe-600 dark:hover:text-trybe-400 transition-colors">@{c.profiles?.username}</Link>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{c.content}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 text-center">No comments yet</p>}
            </div>
          )}
          {user && (
            <form onSubmit={submitComment} className="flex gap-2 mt-3">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value.slice(0, 500))}
                placeholder="Write a comment..."
                className="input-field text-sm py-2.5"
                maxLength={500}
              />
              <button type="submit" disabled={!commentText.trim() || submittingComment} className="btn-primary text-sm px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed">{submittingComment ? '...' : 'Send'}</button>
            </form>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
