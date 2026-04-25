import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { createNotification } from '../lib/notifications';
import { checkRateLimit, RateActions, formatRetryAfter } from '../lib/rateLimiter';
import { toast } from '../store/toastStore';
import type { Profile } from '../types';
import { X, UserPlus, UserMinus, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FollowListModalProps {
  profileId: string;
  type: 'followers' | 'following';
  isOpen: boolean;
  onClose: () => void;
}

export default function FollowListModal({ profileId, type, isOpen, onClose }: FollowListModalProps) {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [myFollowingIds, setMyFollowingIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  // Mutex per-user to prevent follow race condition
  const followMutex = useRef<Set<string>>(new Set());

  const fetchList = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);

    let followData: any[] = [];

    if (type === 'followers') {
      const { data } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', profileId);
      followData = data || [];
    } else {
      const { data } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', profileId);
      followData = data || [];
    }

    const ids = followData.map((f: any) =>
      type === 'followers' ? f.follower_id : f.following_id
    );

    if (ids.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', ids);

    setUsers(profiles || []);

    // Fetch which of these the current user follows
    if (user) {
      const { data: myFollows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', ids);

      setMyFollowingIds(new Set((myFollows || []).map((f: any) => f.following_id)));
    }

    setLoading(false);
  }, [isOpen, profileId, type, user]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleToggleFollow = async (targetId: string) => {
    if (!user || targetId === user.id || followMutex.current.has(targetId)) return;
    // Rate limit check (prevents spam at scale)
    const rl = checkRateLimit(RateActions.profileFollow, { userId: user.id });
    if (!rl.allowed) {
      toast.error(`Too many follow actions. Try again ${formatRetryAfter(rl.retryAfterMs)}.`, 'Rate limit');
      return;
    }
    followMutex.current.add(targetId);
    setTogglingIds((prev) => new Set(prev).add(targetId));

    try {
      if (myFollowingIds.has(targetId)) {
        setMyFollowingIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
        if (error) {
          setMyFollowingIds((prev) => new Set(prev).add(targetId));
        }
      } else {
        setMyFollowingIds((prev) => new Set(prev).add(targetId));
        const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId });
        if (error) {
          setMyFollowingIds((prev) => {
            const next = new Set(prev);
            next.delete(targetId);
            return next;
          });
        } else {
          createNotification({
            userId: targetId,
            actorId: user.id,
            type: 'follow',
          });
        }
      }
    } finally {
      followMutex.current.delete(targetId);
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-3xl w-full max-w-md max-h-[70vh] flex flex-col shadow-soft-xl border border-gray-100/80 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100/80">
              <h3 className="text-lg font-bold text-gray-900 capitalize">{type}</h3>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-300"
              >
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={22} className="animate-spin text-trybe-500" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-gray-400">
                    {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {users.map((p) => {
                    const isMe = user?.id === p.id;
                    const amFollowing = myFollowingIds.has(p.id);
                    const toggling = togglingIds.has(p.id);

                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gray-50/80 transition-all duration-200 group"
                      >
                        <Link
                          to={`/profile/${p.username}`}
                          onClick={onClose}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          <div className="avatar w-10 h-10 text-sm shrink-0 ring-2 ring-white shadow-sm group-hover:shadow-glow-green transition-shadow duration-300">
                            {p.avatar_url ? (
                              <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              p.username[0]?.toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate group-hover:text-trybe-600 transition-colors">
                              @{p.username}
                            </p>
                            {p.bio && (
                              <p className="text-xs text-gray-400 truncate">{p.bio}</p>
                            )}
                            {p.skills?.length > 0 && (
                              <div className="flex gap-1 mt-0.5">
                                {p.skills.slice(0, 3).map((s) => (
                                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-trybe-50 text-trybe-600 font-medium">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </Link>

                        {user && !isMe && (
                          <button
                            onClick={() => handleToggleFollow(p.id)}
                            disabled={toggling}
                            className={`shrink-0 text-xs font-semibold py-2 px-4 rounded-xl transition-all duration-300 flex items-center gap-1 ${
                              amFollowing
                                ? 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-500'
                                : 'bg-gradient-to-r from-trybe-500 to-trybe-600 text-white hover:shadow-glow-green active:scale-[0.97]'
                            }`}
                          >
                            {toggling ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : amFollowing ? (
                              <><UserMinus size={12} /> Unfollow</>
                            ) : (
                              <><UserPlus size={12} /> Follow</>
                            )}
                          </button>
                        )}

                        {isMe && (
                          <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg">You</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
