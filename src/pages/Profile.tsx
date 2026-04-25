import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { validateAndCompressImage, formatFileSize } from '../lib/imageUtils';
import { getProfileSettings } from '../lib/profileSettings';
import PostCard from '../components/PostCard';
import CollabCard from '../components/CollabCard';
import FollowListModal from '../components/FollowListModal';
import ProfileCustomizer from '../components/ProfileCustomizer';
import ProfileFeaturedWork from '../components/ProfileFeaturedWork';
import type { Profile, Post, CollabPost, ProfileSettings } from '../types';
import { Edit2, X, Check, UserPlus, UserMinus, ExternalLink, Camera, Loader2, AlertCircle, Sparkles, Settings2, Upload, ImageIcon, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createNotification } from '../lib/notifications';
import { checkRateLimit, RateActions, formatRetryAfter } from '../lib/rateLimiter';
import { toast } from '../store/toastStore';

const PROFILE_PAGE_SIZE = 15;

export default function ProfilePage() {
  const { username } = useParams();
  const { user, profile: myProfile, refreshProfile } = useAuthStore();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [collabs, setCollabs] = useState<CollabPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [tab, setTab] = useState<'posts' | 'collabs'>('posts');
  const [followListType, setFollowListType] = useState<'followers' | 'following' | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  // Mutex to prevent follow race condition
  const followingRef = useRef(false);

  // Edit fields
  const [editBio, setEditBio] = useState('');
  const [editSkills, setEditSkills] = useState('');
  const [editLinks, setEditLinks] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingCustom, setSavingCustom] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<{
    file: File;
    preview: string;
    originalSize: number;
    finalSize: number;
  } | null>(null);

  // Infinite scroll state for posts
  const [postsPage, setPostsPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const postsFetchingRef = useRef(false);

  // Infinite scroll state for collabs
  const [collabsPage, setCollabsPage] = useState(0);
  const [hasMoreCollabs, setHasMoreCollabs] = useState(true);
  const [loadingMoreCollabs, setLoadingMoreCollabs] = useState(false);
  const collabsFetchingRef = useRef(false);

  const isOwn = user?.id === profile?.id;
  const settings = getProfileSettings(profile?.profile_settings);
  const accentColor = settings.accentColor;

  const fetchProfile = useCallback(async () => {
    if (!username) return;
    setLoading(true);

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (!prof) {
      setLoading(false);
      return;
    }

    setProfile(prof);
    setEditBio(prof.bio || '');
    setEditSkills(prof.skills?.join(', ') || '');
    setEditLinks(
      (prof.links as any[])?.map((l: any) => `${l.label}: ${l.url}`).join('\n') || ''
    );

    // Parallel fetch: first page of posts, first page of collabs, follow status, counts
    const postsPromise = supabase
      .from('posts')
      .select('*, profiles(*), likes(id, user_id), comments(id), saves(id, user_id)')
      .eq('user_id', prof.id)
      .order('created_at', { ascending: false })
      .range(0, PROFILE_PAGE_SIZE - 1);

    const collabsPromise = supabase
      .from('collab_posts')
      .select('*, profiles(*)')
      .eq('user_id', prof.id)
      .order('created_at', { ascending: false })
      .range(0, PROFILE_PAGE_SIZE - 1);

    const postCountPromise = supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', prof.id);

    const followerCountPromise = supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', prof.id);

    const followingCountPromise = supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', prof.id);

    const followStatusPromise = (user && user.id !== prof.id)
      ? supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', prof.id).single()
      : Promise.resolve({ data: null });

    const [postsRes, collabsRes, postCountRes, followerRes, followingRes, followStatusRes] = await Promise.all([
      postsPromise, collabsPromise, postCountPromise, followerCountPromise, followingCountPromise, followStatusPromise,
    ]);

    // O(1) enrichment using Set-based lookups (critical at 50K+ users)
    const enrichedPosts = (postsRes.data || []).map((p: any) => {
      const likeUserIds = new Set((p.likes || []).map((l: any) => l.user_id));
      const saveUserIds = new Set((p.saves || []).map((s: any) => s.user_id));
      return {
        ...p,
        like_count: p.likes?.length || 0,
        comment_count: p.comments?.length || 0,
        is_liked: user ? likeUserIds.has(user.id) : false,
        is_saved: user ? saveUserIds.has(user.id) : false,
      };
    });
    setPosts(enrichedPosts);
    setPostsPage(0);
    setHasMorePosts((postsRes.data?.length || 0) === PROFILE_PAGE_SIZE);

    setCollabs(collabsRes.data || []);
    setCollabsPage(0);
    setHasMoreCollabs((collabsRes.data?.length || 0) === PROFILE_PAGE_SIZE);

    setIsFollowing(!!followStatusRes.data);
    setPostCount(postCountRes.count || 0);
    setFollowerCount(followerRes.count || 0);
    setFollowingCount(followingRes.count || 0);

    setLoading(false);
  }, [username, user]);

  const loadMorePosts = useCallback(async () => {
    if (loadingMorePosts || !hasMorePosts || postsFetchingRef.current || !profile) return;
    postsFetchingRef.current = true;
    setLoadingMorePosts(true);

    const nextPage = postsPage + 1;
    const from = nextPage * PROFILE_PAGE_SIZE;
    const to = from + PROFILE_PAGE_SIZE - 1;

    const { data } = await supabase
      .from('posts')
      .select('*, profiles(*), likes(id, user_id), comments(id), saves(id, user_id)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    // O(1) enrichment using Set-based lookups
    const enriched = (data || []).map((p: any) => {
      const likeUserIds = new Set((p.likes || []).map((l: any) => l.user_id));
      const saveUserIds = new Set((p.saves || []).map((s: any) => s.user_id));
      return {
        ...p,
        like_count: p.likes?.length || 0,
        comment_count: p.comments?.length || 0,
        is_liked: user ? likeUserIds.has(user.id) : false,
        is_saved: user ? saveUserIds.has(user.id) : false,
      };
    });

    setPosts(prev => [...prev, ...enriched]);
    setPostsPage(nextPage);
    setHasMorePosts((data?.length || 0) === PROFILE_PAGE_SIZE);
    setLoadingMorePosts(false);
    postsFetchingRef.current = false;
  }, [postsPage, hasMorePosts, loadingMorePosts, profile, user]);

  const loadMoreCollabs = useCallback(async () => {
    if (loadingMoreCollabs || !hasMoreCollabs || collabsFetchingRef.current || !profile) return;
    collabsFetchingRef.current = true;
    setLoadingMoreCollabs(true);

    const nextPage = collabsPage + 1;
    const from = nextPage * PROFILE_PAGE_SIZE;
    const to = from + PROFILE_PAGE_SIZE - 1;

    const { data } = await supabase
      .from('collab_posts')
      .select('*, profiles(*)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    setCollabs(prev => [...prev, ...(data || [])]);
    setCollabsPage(nextPage);
    setHasMoreCollabs((data?.length || 0) === PROFILE_PAGE_SIZE);
    setLoadingMoreCollabs(false);
    collabsFetchingRef.current = false;
  }, [collabsPage, hasMoreCollabs, loadingMoreCollabs, profile]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMorePostsRef = useRef(loadMorePosts);
  loadMorePostsRef.current = loadMorePosts;
  const loadMoreCollabsRef = useRef(loadMoreCollabs);
  loadMoreCollabsRef.current = loadMoreCollabs;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          if (tabRef.current === 'posts') {
            loadMorePostsRef.current();
          } else {
            loadMoreCollabsRef.current();
          }
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab]); // Only re-create when tab changes, not on data length changes

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleFollow = async () => {
    if (!user || !profile || followingRef.current) return;
    const rl = checkRateLimit(RateActions.profileFollow, { userId: user.id });
    if (!rl.allowed) {
      toast.error(`Too many follow actions. Try again ${formatRetryAfter(rl.retryAfterMs)}.`, 'Rate limit');
      return;
    }
    followingRef.current = true;
    const wasFollowing = isFollowing;
    const prevCount = followerCount;
    try {
      if (wasFollowing) {
        setIsFollowing(false);
        setFollowerCount((c) => Math.max(0, c - 1));
        const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', profile.id);
        if (error) { setIsFollowing(wasFollowing); setFollowerCount(prevCount); }
      } else {
        setIsFollowing(true);
        setFollowerCount((c) => c + 1);
        const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: profile.id });
        if (error) {
          setIsFollowing(wasFollowing);
          setFollowerCount(prevCount);
        } else {
          createNotification({
            userId: profile.id,
            actorId: user.id,
            type: 'follow',
          });
        }
      }
    } finally {
      followingRef.current = false;
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !profile) return;
    setSaving(true);

    const skills = editSkills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const links = editLinks
      .split('\n')
      .map((l) => {
        const parts = l.split(':');
        if (parts.length < 2) return null;
        const label = parts[0].trim();
        const url = parts.slice(1).join(':').trim();
        return label && url ? { label, url } : null;
      })
      .filter(Boolean);

    await supabase
      .from('profiles')
      .update({
        bio: editBio.trim(),
        skills,
        links,
      })
      .eq('id', user.id);

    setEditing(false);
    setSaving(false);
    refreshProfile();
    fetchProfile();
  };

  const handleSaveCustomization = async (newSettings: ProfileSettings) => {
    if (!user || !profile) return;
    setSavingCustom(true);

    await supabase
      .from('profiles')
      .update({ profile_settings: newSettings as any })
      .eq('id', user.id);

    setSavingCustom(false);
    setCustomizing(false);
    refreshProfile();
    fetchProfile();
  };

  // Step 1: User selects file → compress → show preview
  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setAvatarError('');
    setAvatarPreview(null);

    const result = await validateAndCompressImage(file);

    if (!result.ok) {
      setAvatarError(result.error);
      if (avatarRef.current) avatarRef.current.value = '';
      return;
    }

    // Show preview for confirmation
    setAvatarPreview({
      file: result.file,
      preview: result.preview,
      originalSize: result.originalSize,
      finalSize: result.finalSize,
    });
  };

  // Step 2: User confirms → upload compressed image
  const handleAvatarConfirmUpload = async () => {
    if (!avatarPreview || !user) return;

    setUploadingAvatar(true);
    setAvatarError('');

    const processedFile = avatarPreview.file;
    const ext = processedFile.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${user.id}/avatar.${ext}`;

    // Delete old avatar files (both webp and jpg) before uploading new one
    try {
      const { data: existingFiles } = await supabase.storage.from('avatars').list(user.id);
      if (existingFiles?.length) {
        const filesToDelete = existingFiles.map((f) => `${user.id}/${f.name}`);
        await supabase.storage.from('avatars').remove(filesToDelete);
      }
    } catch {
      // Non-critical — old files will just stay orphaned
    }

    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, processedFile, {
      upsert: true,
      contentType: processedFile.type,
    });

    if (uploadErr) {
      setAvatarError('Upload failed: ' + uploadErr.message);
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);

    await supabase
      .from('profiles')
      .update({ avatar_url: urlData.publicUrl + '?t=' + Date.now() })
      .eq('id', user.id);

    // Clean up preview
    if (avatarPreview.preview) URL.revokeObjectURL(avatarPreview.preview);
    setAvatarPreview(null);
    setUploadingAvatar(false);
    if (avatarRef.current) avatarRef.current.value = '';
    refreshProfile();
    fetchProfile();
  };

  // Cancel preview
  const handleAvatarCancelPreview = () => {
    if (avatarPreview?.preview) URL.revokeObjectURL(avatarPreview.preview);
    setAvatarPreview(null);
    if (avatarRef.current) avatarRef.current.value = '';
  };

  const handleCollabApply = (collab: CollabPost) => {
    navigate(`/messages?to=${collab.user_id}`);
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 size={24} className="animate-spin text-trybe-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20 text-center">
        <h2 className="text-xl font-bold text-gray-700">User not found</h2>
        <p className="text-gray-400 mt-1.5">This profile doesn't exist.</p>
      </div>
    );
  }

  return (
    <div className="py-6" style={{ ['--accent' as any]: accentColor }}>
      {/* Profile header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="card p-6 sm:p-8 mb-8 relative overflow-hidden">
        {/* Accent top bar */}
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-3xl" style={{ backgroundColor: accentColor }} />

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6">
          {/* Avatar */}
          <div className="relative group">
            <div className="avatar w-20 h-20 text-2xl ring-4 ring-white shadow-soft-md">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                profile.username[0]?.toUpperCase()
              )}
            </div>
            {isOwn && (
              <>
                <input
                  type="file"
                  ref={avatarRef}
                  onChange={handleAvatarSelect}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => avatarRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 bg-black/30 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300"
                >
                  {uploadingAvatar ? (
                    <Loader2 size={18} className="text-white animate-spin" />
                  ) : (
                    <Camera size={18} className="text-white" />
                  )}
                </button>
              </>
            )}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">@{profile.username}</h2>
            {profile.bio && <p className="text-gray-600 dark:text-gray-400 text-sm mt-1.5 leading-relaxed">{profile.bio}</p>}

            {/* Avatar error */}
            <AnimatePresence>
              {avatarError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/40 px-3 py-2 rounded-xl mt-2"
                >
                  <AlertCircle size={12} className="shrink-0" />
                  {avatarError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Avatar preview confirmation */}
            <AnimatePresence>
              {avatarPreview && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 bg-white dark:bg-gray-800/90 border border-gray-200/80 dark:border-gray-700/80 rounded-2xl p-4 shadow-soft"
                >
                  <div className="flex items-center gap-4">
                    {/* Preview image */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden ring-2 ring-trybe-500/30 shrink-0">
                      <img src={avatarPreview.preview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5 flex items-center gap-1.5">
                        <ImageIcon size={12} className="text-trybe-500" />
                        Image compressed
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="line-through">{formatFileSize(avatarPreview.originalSize)}</span>
                        <ArrowDown size={10} className="text-trybe-500" />
                        <span className="font-semibold text-trybe-600 dark:text-trybe-400">{formatFileSize(avatarPreview.finalSize)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleAvatarConfirmUpload}
                      disabled={uploadingAvatar}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-xl bg-trybe-500 hover:bg-trybe-600 text-white transition-all duration-300 disabled:opacity-50"
                    >
                      {uploadingAvatar ? (
                        <><Loader2 size={12} className="animate-spin" /> Uploading...</>
                      ) : (
                        <><Upload size={12} /> Use this photo</>
                      )}
                    </button>
                    <button
                      onClick={handleAvatarCancelPreview}
                      disabled={uploadingAvatar}
                      className="text-xs font-medium py-2 px-3 rounded-xl text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all duration-300"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {settings.sections.showStats && (
              <div className="flex items-center justify-center sm:justify-start gap-5 mt-4 text-sm">
                <button onClick={() => setFollowListType('followers')} className="text-gray-500 dark:text-gray-400 hover:text-trybe-600 dark:hover:text-trybe-400 transition-colors cursor-pointer group">
                  <strong className="text-gray-900 dark:text-gray-100 font-bold group-hover:text-trybe-600 dark:group-hover:text-trybe-400 transition-colors">{followerCount}</strong> followers
                </button>
                <button onClick={() => setFollowListType('following')} className="text-gray-500 dark:text-gray-400 hover:text-trybe-600 dark:hover:text-trybe-400 transition-colors cursor-pointer group">
                  <strong className="text-gray-900 dark:text-gray-100 font-bold group-hover:text-trybe-600 dark:group-hover:text-trybe-400 transition-colors">{followingCount}</strong> following
                </button>
                <span className="text-gray-500 dark:text-gray-400"><strong className="text-gray-900 dark:text-gray-100 font-bold">{postCount}</strong> posts</span>
              </div>
            )}

            {/* Skills */}
            {profile.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4 justify-center sm:justify-start">
                {profile.skills.map((s) => (
                  <span key={s} className="tag-pill text-xs">{s}</span>
                ))}
              </div>
            )}

            {/* Links */}
            {(profile.links as any[])?.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3 justify-center sm:justify-start">
                {(profile.links as any[]).map((l: any, i: number) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium group transition-colors"
                    style={{ color: accentColor }}
                  >
                    <ExternalLink size={10} className="group-hover:scale-110 transition-transform" />{l.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 shrink-0">
            {isOwn ? (
              <>
                <button
                  onClick={() => { setEditing(!editing); if (customizing) setCustomizing(false); }}
                  className="btn-outline text-sm py-2.5 px-5 flex items-center gap-1.5"
                >
                  {editing ? <X size={14} /> : <Edit2 size={14} />}
                  {editing ? 'Cancel' : 'Edit'}
                </button>
                <button
                  onClick={() => { setCustomizing(!customizing); if (editing) setEditing(false); }}
                  className={`text-sm py-2.5 px-5 rounded-2xl font-semibold flex items-center gap-1.5 transition-all duration-300 ${
                    customizing
                      ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                      : 'border-2 border-gray-200/80 dark:border-gray-700/80 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {customizing ? <X size={14} /> : <Settings2 size={14} />}
                  {customizing ? 'Close' : 'Customize'}
                </button>
              </>
            ) : user && (
              <button
                onClick={handleFollow}
                className={`text-sm py-2.5 px-5 rounded-2xl font-semibold flex items-center gap-1.5 transition-all duration-300 ${
                  isFollowing
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500'
                    : 'btn-primary'
                }`}
              >
                {isFollowing ? <><UserMinus size={14} /> Unfollow</> : <><UserPlus size={14} /> Follow</>}
              </button>
            )}
          </div>
        </div>

        {/* Edit form */}
        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 pt-6 border-t border-gray-100/80 dark:border-gray-800/80 space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Bio</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value.slice(0, 300))}
                  className="input-field min-h-[80px] resize-none text-sm"
                  placeholder="Tell people about yourself..."
                  maxLength={300}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Skills (comma-separated)</label>
                <input
                  value={editSkills}
                  onChange={(e) => setEditSkills(e.target.value.slice(0, 200))}
                  className="input-field text-sm"
                  placeholder="design, video, photography"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Links (one per line: Label: URL)</label>
                <textarea
                  value={editLinks}
                  onChange={(e) => setEditLinks(e.target.value)}
                  className="input-field min-h-[60px] resize-none text-sm"
                  placeholder={"Portfolio: https://mysite.com\nTwitter: https://twitter.com/me"}
                />
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Customization panel */}
        <AnimatePresence>
          {customizing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 pt-6 border-t border-gray-100/80 dark:border-gray-800/80"
            >
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={15} style={{ color: accentColor }} />
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Customize Profile</h3>
              </div>
              <ProfileCustomizer
                settings={settings}
                posts={posts}
                collabs={collabs}
                onSave={handleSaveCustomization}
                saving={savingCustom}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Follow List Modal */}
      <FollowListModal
        profileId={profile.id}
        type={followListType || 'followers'}
        isOpen={!!followListType}
        onClose={() => setFollowListType(null)}
      />

      {/* Featured Work */}
      {settings.featured.length > 0 && (
        <ProfileFeaturedWork
          settings={settings}
          posts={posts}
          collabs={collabs}
          accentColor={accentColor}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-2.5 mb-6">
        {(['posts', 'collabs'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-300 ${
              tab === t
                ? 'text-white shadow-sm'
                : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border border-gray-200/80 dark:border-gray-700/80 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200 shadow-sm dark:shadow-none'
            }`}
            style={tab === t ? { backgroundColor: accentColor } : undefined}
          >
            {t === 'posts' ? `Posts (${postCount})` : `Collabs (${collabs.length}${hasMoreCollabs ? '+' : ''})`}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'posts' ? (
        posts.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">No posts yet</p>
        ) : (
          <>
            <div className="space-y-5">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onUpdate={fetchProfile} />
              ))}
            </div>

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-px" />

            {loadingMorePosts && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-gray-500 font-medium py-6"
              >
                <Loader2 size={16} className="animate-spin text-trybe-500" />
                Loading more posts...
              </motion.div>
            )}

            {!hasMorePosts && posts.length > PROFILE_PAGE_SIZE && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-xs text-gray-300 dark:text-gray-600 mt-8 mb-2 font-medium"
              >
                No more posts ✨
              </motion.p>
            )}
          </>
        )
      ) : (
        collabs.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">No collab listings yet</p>
        ) : (
          <>
            <div className="space-y-5">
              {collabs.map((c) => (
                <CollabCard key={c.id} collab={c} onApply={handleCollabApply} />
              ))}
            </div>

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-px" />

            {loadingMoreCollabs && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-gray-500 font-medium py-6"
              >
                <Loader2 size={16} className="animate-spin text-trybe-500" />
                Loading more collabs...
              </motion.div>
            )}

            {!hasMoreCollabs && collabs.length > PROFILE_PAGE_SIZE && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-xs text-gray-300 dark:text-gray-600 mt-8 mb-2 font-medium"
              >
                No more collabs ✨
              </motion.p>
            )}
          </>
        )
      )}
    </div>
  );
}
