import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Link2, X, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { checkRateLimit, RateActions, formatRetryAfter } from '../lib/rateLimiter';
import { toast } from '../store/toastStore';

const MAX_CHARS = 196;
const SUBMIT_TIMEOUT_MS = 15_000;

export default function CreatePost() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [showEmbed, setShowEmbed] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !content.trim() || posting) return;

    setPosting(true);
    setError('');

    const rl = checkRateLimit(RateActions.postsCreate, { userId: user.id });
    if (!rl.allowed) {
      const msg = `You're posting too fast. Try again ${formatRetryAfter(rl.retryAfterMs)}.`;
      setError(msg);
      toast.error(msg, 'Rate limit');
      setPosting(false);
      return;
    }

    try {
      // Race the insert against a timeout to prevent permanent freeze
      const insertPromise = supabase.from('posts').insert({
        user_id: user.id,
        content: content.trim(),
        image_url: null,
        embed_url: embedUrl.trim() || null,
      });

      const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'Request timed out. Please try again.' } }), SUBMIT_TIMEOUT_MS)
      );

      const { error: insertErr } = await Promise.race([insertPromise, timeoutPromise]);

      if (insertErr) {
        setError(insertErr.message);
        return;
      }

      navigate('/');
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong. Please try again.';
      setError(msg);
      toast.error(msg, 'Error');
    } finally {
      setPosting(false);
    }
  }, [user, content, embedUrl, posting, navigate]);

  const charsLeft = MAX_CHARS - content.length;

  return (
    <div className="py-6">
      <h1 className="section-title mb-8">Create Post</h1>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="card p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Text */}
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
              className="input-field min-h-[160px] resize-none text-base leading-relaxed"
              placeholder="What's on your mind? Share something with your trybe..."
              required
            />
            <span className={`absolute bottom-3 right-3 text-xs font-semibold ${charsLeft < 20 ? 'text-red-500' : 'text-gray-300 dark:text-gray-600'}`}>
              {charsLeft}
            </span>
          </div>

          {/* Embed URL */}
          <AnimatePresence>
            {showEmbed && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="relative">
                  <input
                    value={embedUrl}
                    onChange={(e) => setEmbedUrl(e.target.value)}
                    className="input-field text-sm pr-10"
                    placeholder="Paste a YouTube, TikTok, or Instagram URL..."
                  />
                  {embedUrl && (
                    <button
                      type="button"
                      onClick={() => setEmbedUrl('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 ml-1">YouTube, TikTok, and Instagram links will auto-embed in your post</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/40 px-4 py-2.5 rounded-2xl"
              >
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100/80 dark:border-gray-800/80">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setShowEmbed(!showEmbed)}
                className={`p-2.5 rounded-xl transition-all duration-300 flex items-center gap-1.5 text-sm font-medium ${showEmbed ? 'text-trybe-600 dark:text-trybe-400 bg-trybe-50 dark:bg-trybe-950/60' : 'text-gray-400 dark:text-gray-500 hover:text-trybe-600 dark:hover:text-trybe-400 hover:bg-trybe-50 dark:hover:bg-trybe-950/60'}`}
              >
                <Link2 size={20} />
                <span className="hidden sm:inline">Add link</span>
              </button>
            </div>
            <button
              type="submit"
              disabled={posting || !content.trim()}
              className="btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              {posting && <Loader2 size={16} className="animate-spin" />}
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
