import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { createNotification } from '../lib/notifications';
import { checkRateLimit, RateActions, formatRetryAfter } from '../lib/rateLimiter';
import { toast } from '../store/toastStore';
import type { Profile } from '../types';
import { UserPlus, Check, Sparkles, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SuggestedUsers() {
  const { user, profile: myProfile } = useAuthStore();
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Mutex to prevent follow race condition per-user
  const followingRef = useRef<Set<string>>(new Set());

  const fetchSuggestions = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Bound follows query to prevent unbounded fetch at 50K+ users
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .limit(1000);

    const followingIds = new Set((follows || []).map((f: any) => f.following_id));

    // Get all profiles except self and already followed
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user.id)
      .limit(50);

    const notFollowed = (allProfiles || []).filter(
      (p: Profile) => !followingIds.has(p.id)
    );

    // Score and rank suggestions
    const mySkills = new Set((myProfile?.skills || []).map((s: string) => s.toLowerCase()));
    const scored = notFollowed.map((p: Profile) => {
      let score = 0;
      // Shared skills boost
      const theirSkills = (p.skills || []).map((s: string) => s.toLowerCase());
      theirSkills.forEach((s: string) => {
        if (mySkills.has(s)) score += 3;
      });
      // Has bio = more complete profile
      if (p.bio) score += 1;
      // Has avatar = more complete profile
      if (p.avatar_url) score += 1;
      // Has skills listed
      if (p.skills?.length > 0) score += 1;
      // Randomize a bit to keep fresh
      score += Math.random() * 2;
      return { profile: p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    setSuggestions(scored.slice(0, 8).map((s) => s.profile));
    setLoading(false);
  }, [user, myProfile]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleFollow = async (profileId: string) => {
    if (!user || followingRef.current.has(profileId)) return;
    // Rate limit check (prevents spam at scale)
    const rl = checkRateLimit(RateActions.profileFollow, { userId: user.id });
    if (!rl.allowed) {
      toast.error(`Too many follow actions. Try again ${formatRetryAfter(rl.retryAfterMs)}.`, 'Rate limit');
      return;
    }
    followingRef.current.add(profileId);
    try {
      if (followedIds.has(profileId)) {
        // Unfollow
        setFollowedIds((prev) => {
          const next = new Set(prev);
          next.delete(profileId);
          return next;
        });
        const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', profileId);
        if (error) {
          setFollowedIds((prev) => new Set(prev).add(profileId));
        }
      } else {
        // Follow
        setFollowedIds((prev) => new Set(prev).add(profileId));
        const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: profileId });
        if (error) {
          setFollowedIds((prev) => {
            const next = new Set(prev);
            next.delete(profileId);
            return next;
          });
        } else {
          createNotification({
            userId: profileId,
            actorId: user.id,
            type: 'follow',
          });
        }
      }
    } finally {
      followingRef.current.delete(profileId);
    }
  };

  if (!user || (loading && suggestions.length === 0)) return null;
  if (!loading && suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-8"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-trybe-400 to-trybe-600 flex items-center justify-center shadow-sm">
            <Sparkles size={14} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Suggested for you</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">People you might like to follow</p>
          </div>
        </div>
        <button
          onClick={fetchSuggestions}
          className="p-2 rounded-xl text-gray-400 dark:text-gray-500 hover:text-trybe-600 dark:hover:text-trybe-400 hover:bg-trybe-50 dark:hover:bg-trybe-950/60 transition-all duration-300"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        <AnimatePresence mode="popLayout">
          {suggestions.map((p, i) => {
            const isFollowed = followedIds.has(p.id);
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="shrink-0 w-[150px]"
              >
                <div className="card p-4 flex flex-col items-center text-center h-full">
                  <Link to={`/profile/${p.username}`} className="group">
                    <div className="avatar w-14 h-14 text-lg mb-2.5 ring-2 ring-white dark:ring-gray-800 shadow-sm group-hover:shadow-glow-green transition-shadow duration-300">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        p.username[0]?.toUpperCase()
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate w-full group-hover:text-trybe-600 dark:group-hover:text-trybe-400 transition-colors">
                      @{p.username}
                    </h4>
                  </Link>

                  {p.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 justify-center">
                      {p.skills.slice(0, 2).map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-trybe-50 dark:bg-trybe-950/60 text-trybe-700 dark:text-trybe-300 font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => handleFollow(p.id)}
                    className={`mt-auto pt-3 w-full text-xs font-semibold py-2 rounded-xl transition-all duration-300 flex items-center justify-center gap-1 ${
                      isFollowed
                        ? 'bg-trybe-50 dark:bg-trybe-950/60 text-trybe-600 dark:text-trybe-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500'
                        : 'bg-gradient-to-r from-trybe-500 to-trybe-600 text-white hover:shadow-glow-green active:scale-[0.97]'
                    }`}
                  >
                    {isFollowed ? (
                      <><Check size={12} /> Following</>
                    ) : (
                      <><UserPlus size={12} /> Follow</>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
