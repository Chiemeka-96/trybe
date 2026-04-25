import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import CollabCard from '../components/CollabCard';
import type { CollabPost } from '../types';
import {
  Plus, Search, Sparkles, Briefcase, X, Zap, Users, TrendingUp,
  MapPin, Loader2, Link as LinkIcon,
  Crosshair, Trash2, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createNotification } from '../lib/notifications';
import { checkRateLimit, RateActions, formatRetryAfter } from '../lib/rateLimiter';
import { toast } from '../store/toastStore';

type TabType = 'creators' | 'opportunities';

export default function CollabBoard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [collabs, setCollabs] = useState<CollabPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('creators');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Create/Edit form state
  const [editingCollab, setEditingCollab] = useState<CollabPost | null>(null);
  const [type, setType] = useState<'creator_listing' | 'opportunity'>('creator_listing');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [budget, setBudget] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationCountry, setLocationCountry] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<CollabPost | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCollabs = useCallback(async () => {
    setLoading(true);
    try {
      // Cap at 200 results to prevent unbounded fetches at 50K+ users
      const { data, error } = await supabase
        .from('collab_posts')
        .select('*, profiles(*)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      if (data) setCollabs(data);
    } catch {
      // Silently handle — collabs will remain empty
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCollabs();
  }, [fetchCollabs]);

  // Filtered collabs
  const filteredCollabs = useMemo(() => {
    return collabs.filter((c) => {
      if (activeTab === 'creators' && c.type !== 'creator_listing') return false;
      if (activeTab === 'opportunities' && c.type !== 'opportunity') return false;

      if (selectedTags.length > 0 && !selectedTags.some((tag) => c.tags.includes(tag))) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)) ||
          c.profiles?.username?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (locationFilter.trim()) {
        const lf = locationFilter.toLowerCase();
        const locMatch =
          (c.location_city && c.location_city.toLowerCase().includes(lf)) ||
          (c.location_country && c.location_country.toLowerCase().includes(lf));
        if (!locMatch) return false;
      }

      return true;
    });
  }, [collabs, activeTab, selectedTags, searchQuery, locationFilter]);

  const creatorCount = useMemo(() => collabs.filter((c) => c.type === 'creator_listing').length, [collabs]);
  const opportunityCount = useMemo(() => collabs.filter((c) => c.type === 'opportunity').length, [collabs]);

  const tabTags = useMemo(() => {
    const typeFilter = activeTab === 'creators' ? 'creator_listing' : 'opportunity';
    const tagSet = new Set<string>();
    collabs
      .filter((c) => c.type === typeFilter)
      .forEach((c) => c.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [collabs, activeTab]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  useEffect(() => {
    setSelectedTags([]);
  }, [activeTab]);

  const hasActiveFilters = selectedTags.length > 0 || searchQuery.trim().length > 0 || locationFilter.trim().length > 0;

  const clearFilters = () => {
    setSelectedTags([]);
    setSearchQuery('');
    setLocationFilter('');
  };

  // ─── Geolocation ───
  const detectLocation = () => {
    if (!navigator.geolocation) return;
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeoCoords({ lat: latitude, lng: longitude });
        // Reverse geocode with a free service
        try {
          const resp = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await resp.json();
          if (data.city) setLocationCity(data.city);
          if (data.countryName) setLocationCountry(data.countryName);
        } catch {
          // Silently fail — user can enter manually
        }
        setDetectingLocation(false);
      },
      () => {
        setDetectingLocation(false);
      },
      { timeout: 10000 }
    );
  };

  // ─── Reset form ───
  const resetForm = () => {
    setType('creator_listing');
    setTitle('');
    setDescription('');
    setTags('');
    setBudget('');
    setLocationCity('');
    setLocationCountry('');
    setExternalUrl('');
    setGeoCoords(null);
    setEditingCollab(null);
  };

  // ─── Open edit ───
  const openEdit = (collab: CollabPost) => {
    setEditingCollab(collab);
    setType(collab.type);
    setTitle(collab.title);
    setDescription(collab.description);
    setTags(collab.tags.join(', '));
    setBudget(collab.budget || '');
    setLocationCity(collab.location_city || '');
    setLocationCountry(collab.location_country || '');
    setExternalUrl(collab.external_url || '');
    setGeoCoords(
      collab.latitude && collab.longitude ? { lat: collab.latitude, lng: collab.longitude } : null
    );
    setShowCreate(true);
  };

  // ─── Create / Update ───
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const rl = checkRateLimit(RateActions.collabsSave, { userId: user.id });
    if (!rl.allowed) {
      toast.error(`Too many updates. Try again ${formatRetryAfter(rl.retryAfterMs)}.`, 'Rate limit');
      return;
    }
    setSaving(true);

    const tagList = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

    const payload = {
      type,
      title: title.trim().slice(0, 100),
      description: description.trim().slice(0, 1000),
      tags: tagList.slice(0, 10),
      budget: budget.trim().slice(0, 50) || null,
      location_city: locationCity.trim().slice(0, 100) || null,
      location_country: locationCountry.trim().slice(0, 100) || null,
      latitude: geoCoords?.lat || null,
      longitude: geoCoords?.lng || null,
      image_url: null,
      external_url: externalUrl.trim().slice(0, 500) || null,
    };

    try {
      const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'Request timed out. Please try again.' } }), 15_000)
      );

      if (editingCollab) {
        const updatePromise = supabase
          .from('collab_posts')
          .update(payload)
          .eq('id', editingCollab.id);
        const { error: updateErr } = await Promise.race([updatePromise, timeoutPromise]);
        if (updateErr) {
          toast.error(updateErr.message || 'Failed to update listing.', 'Error');
          return;
        }
      } else {
        const insertPromise = supabase.from('collab_posts').insert({
          user_id: user.id,
          ...payload,
        });
        const { error: insertErr } = await Promise.race([insertPromise, timeoutPromise]);
        if (insertErr) {
          toast.error(insertErr.message || 'Failed to create listing.', 'Error');
          return;
        }
      }

      setShowCreate(false);
      resetForm();
      fetchCollabs();
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong. Please try again.', 'Error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ───
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await supabase.from('collab_posts').delete().eq('id', deleteTarget.id);
      setDeleteTarget(null);
      fetchCollabs();
    } catch {
      toast.error('Failed to delete listing. Please try again.', 'Error');
    } finally {
      setDeleting(false);
    }
  };

  const handleApply = (collab: CollabPost) => {
    if (user && collab.user_id !== user.id) {
      createNotification({
        userId: collab.user_id,
        actorId: user.id,
        type: 'collab_request',
        referenceId: collab.id,
        content: collab.title.slice(0, 80),
      });
    }
    navigate(`/messages?to=${collab.user_id}`);
  };

  return (
    <div className="py-6">
      {/* ─── Hero Section ─── */}
      <div className="relative mb-8 overflow-hidden">
        <div className="absolute -inset-6 bg-gradient-to-br from-trybe-100/60 via-trybe-50/40 to-white dark:from-trybe-950/40 dark:via-trybe-950/20 dark:to-gray-950 rounded-[2rem] -z-10" />
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-trybe-200/30 dark:from-trybe-800/20 to-transparent rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-purple-100/20 dark:from-purple-900/10 to-transparent rounded-full blur-2xl -z-10" />

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-trybe-400 to-trybe-600 shadow-glow-green">
                <Zap size={17} className="text-white" />
              </span>
              Collab Board
            </h1>
            <p className="section-subtitle mt-1.5">Find your next creative partner or dream project</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowCreate(true); }}
            className="btn-primary flex items-center gap-2 text-sm shrink-0"
          >
            <Plus size={16} /> New Listing
          </button>
        </div>

        {/* ─── Stats Row ─── */}
        <div className="flex gap-3 mb-6">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white/80 dark:bg-gray-900/80 rounded-2xl border border-gray-100/80 dark:border-gray-800/80 shadow-sm dark:shadow-none">
            <Users size={14} className="text-purple-500" />
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{creatorCount} Creators</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white/80 dark:bg-gray-900/80 rounded-2xl border border-gray-100/80 dark:border-gray-800/80 shadow-sm dark:shadow-none">
            <TrendingUp size={14} className="text-blue-500" />
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{opportunityCount} Opportunities</span>
          </div>
        </div>

        {/* ─── Search + Location Filter ─── */}
        <div className="flex gap-2.5 mb-1">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, skill, username..."
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white/90 dark:bg-gray-900/90 border border-gray-200/80 dark:border-gray-700/80 shadow-soft dark:shadow-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:border-trybe-400 focus:ring-4 focus:ring-trybe-100/50 dark:focus:ring-trybe-900/30 outline-none transition-all duration-300"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="relative w-48">
            <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="Filter by location"
              className="w-full pl-10 pr-4 py-3.5 rounded-2xl bg-white/90 dark:bg-gray-900/90 border border-gray-200/80 dark:border-gray-700/80 shadow-soft dark:shadow-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:border-trybe-400 focus:ring-4 focus:ring-trybe-100/50 dark:focus:ring-trybe-900/30 outline-none transition-all duration-300"
            />
            {locationFilter && (
              <button
                onClick={() => setLocationFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Segmented Toggle ─── */}
      <div className="relative flex bg-gray-100/80 dark:bg-gray-800/80 rounded-2xl p-1 mb-5 border border-gray-200/50 dark:border-gray-700/50">
        <motion.div
          className="absolute top-1 bottom-1 rounded-[0.875rem] bg-white dark:bg-gray-900 shadow-soft-md dark:shadow-none"
          animate={{
            left: activeTab === 'creators' ? '4px' : '50%',
            width: 'calc(50% - 4px)',
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
        <button
          onClick={() => setActiveTab('creators')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-3 rounded-[0.875rem] text-sm font-semibold transition-colors duration-200 ${
            activeTab === 'creators' ? 'text-purple-700 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Sparkles size={15} />
          Creators
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
            activeTab === 'creators' ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400' : 'bg-gray-200/80 dark:bg-gray-700/80 text-gray-500 dark:text-gray-400'
          }`}>
            {creatorCount}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('opportunities')}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-3 rounded-[0.875rem] text-sm font-semibold transition-colors duration-200 ${
            activeTab === 'opportunities' ? 'text-blue-700 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Briefcase size={15} />
          Opportunities
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
            activeTab === 'opportunities' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400' : 'bg-gray-200/80 dark:bg-gray-700/80 text-gray-500 dark:text-gray-400'
          }`}>
            {opportunityCount}
          </span>
        </button>
      </div>

      {/* ─── Tag Filtering ─── */}
      {tabTags.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Filter by skill</span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs font-semibold text-trybe-600 dark:text-trybe-400 hover:text-trybe-700 transition-colors flex items-center gap-1"
              >
                <X size={12} /> Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {tabTags.map((tag) => {
              const isActive = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
                    isActive
                      ? 'bg-trybe-500 text-white border-trybe-500 shadow-sm'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200/80 dark:border-gray-700/80 hover:border-trybe-300 dark:hover:border-trybe-600 hover:text-trybe-600 dark:hover:text-trybe-400 hover:bg-trybe-50/50 dark:hover:bg-trybe-950/30'
                  }`}
                >
                  {tag}
                  {isActive && <X size={10} className="ml-0.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Results ─── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="collab-card p-6 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-200/80 dark:bg-gray-700/80 rounded-2xl" />
                <div>
                  <div className="h-3 w-20 bg-gray-200/80 dark:bg-gray-700/80 rounded-full mb-2" />
                  <div className="h-2.5 w-14 bg-gray-100/80 dark:bg-gray-800/80 rounded-full" />
                </div>
              </div>
              <div className="h-5 w-48 bg-gray-200/80 dark:bg-gray-700/80 rounded-full mb-3" />
              <div className="h-3 w-full bg-gray-100/80 dark:bg-gray-800/80 rounded-full mb-1.5" />
              <div className="h-3 w-3/4 bg-gray-100/80 dark:bg-gray-800/80 rounded-full" />
            </div>
          ))}
        </div>
      ) : filteredCollabs.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
          <div className="w-[72px] h-[72px] rounded-3xl bg-gradient-to-br from-trybe-50 to-trybe-100/80 dark:from-trybe-950/60 dark:to-trybe-900/40 flex items-center justify-center mx-auto mb-5 shadow-sm dark:shadow-none">
            <span className="text-3xl">{hasActiveFilters ? '🔍' : '🤝'}</span>
          </div>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-1.5 text-lg">
            {hasActiveFilters ? 'No matches found' : 'No listings yet'}
          </h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 max-w-xs mx-auto">
            {hasActiveFilters
              ? 'Try adjusting your filters or search to find what you\'re looking for'
              : `Be the first to post a ${activeTab === 'creators' ? 'creator listing' : 'project opportunity'}!`
            }
          </p>
          {hasActiveFilters ? (
            <button onClick={clearFilters} className="btn-outline text-sm">
              Clear filters
            </button>
          ) : (
            <button onClick={() => { resetForm(); setShowCreate(true); }} className="btn-primary text-sm">
              <Plus size={16} className="inline mr-1.5" />
              Create listing
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredCollabs.map((c, i) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
              >
                <CollabCard
                  collab={c}
                  isOwn={user?.id === c.user_id}
                  onApply={handleApply}
                  onEdit={openEdit}
                  onDelete={(collab) => setDeleteTarget(collab)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ─── Results count ─── */}
      {!loading && filteredCollabs.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6 font-medium">
          Showing {filteredCollabs.length} of {collabs.length} listings
        </p>
      )}

      {/* ─── Create / Edit Modal ─── */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => { setShowCreate(false); resetForm(); }}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 sm:p-8 shadow-soft-xl dark:shadow-none dark:border dark:border-gray-800"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {editingCollab ? 'Edit Listing' : 'New Listing'}
                </h2>
                <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-all duration-200">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                {/* Type selector */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setType('creator_listing')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all duration-300 ${
                      type === 'creator_listing'
                        ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-2 border-purple-300 dark:border-purple-700 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Sparkles size={16} /> Creator
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('opportunity')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all duration-300 ${
                      type === 'opportunity'
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-2 border-blue-300 dark:border-blue-700 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Briefcase size={16} /> Opportunity
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                    className="input-field"
                    placeholder={type === 'creator_listing' ? 'e.g. Freelance Video Editor — 3yr experience' : 'e.g. Looking for a graphic designer for brand refresh'}
                    required
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
                    className="input-field min-h-[120px] resize-none"
                    placeholder="Tell people more about what you're offering or looking for..."
                    required
                    maxLength={1000}
                  />
                </div>

                {/* ─── Location ─── */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                    <MapPin size={14} className="text-trybe-500" /> Location (optional)
                  </label>
                  <div className="flex gap-2.5">
                    <input
                      value={locationCity}
                      onChange={(e) => setLocationCity(e.target.value)}
                      className="input-field flex-1"
                      placeholder="City"
                    />
                    <input
                      value={locationCountry}
                      onChange={(e) => setLocationCountry(e.target.value)}
                      className="input-field flex-1"
                      placeholder="Country"
                    />
                    <button
                      type="button"
                      onClick={detectLocation}
                      disabled={detectingLocation}
                      className="shrink-0 px-3.5 py-2 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800 hover:bg-trybe-50 dark:hover:bg-trybe-950/40 hover:border-trybe-300 text-gray-500 hover:text-trybe-600 transition-all duration-300 flex items-center gap-1.5 text-xs font-medium"
                      title="Detect my location"
                    >
                      {detectingLocation ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Crosshair size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {/* ─── External URL ─── */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                    <LinkIcon size={14} className="text-trybe-500" /> External Link (optional)
                  </label>
                  <input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    className="input-field"
                    placeholder="https://youtube.com/..., portfolio link, etc."
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">YouTube, TikTok, Instagram links will auto-embed</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Skills / Tags</label>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value.slice(0, 200))}
                    className="input-field"
                    placeholder="design, video editing, photography"
                    maxLength={200}
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Separate with commas</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Budget (optional)</label>
                  <input
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="input-field"
                    placeholder="$500, Negotiable, etc."
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary w-full disabled:opacity-50 text-base py-3 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {editingCollab ? 'Saving...' : 'Publishing...'}
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      {editingCollab ? 'Save Changes' : 'Publish listing'}
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Delete Confirmation Modal ─── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm p-6 sm:p-8 shadow-soft-xl dark:shadow-none dark:border dark:border-gray-800 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Delete Listing?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                Are you sure you want to delete "<strong>{deleteTarget.title}</strong>"? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-3 rounded-2xl border-2 border-gray-200/80 dark:border-gray-700/80 text-gray-600 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
