import { useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Palette, LayoutGrid, Star, GripVertical, X, Plus, Sparkles, Grid3X3, Monitor } from 'lucide-react';
import {
  ACCENT_PRESETS,
  LAYOUT_OPTIONS,
  MAX_FEATURED,
  getProfileSettings,
} from '../lib/profileSettings';
import type { ProfileSettings, FeaturedItem, Post, CollabPost } from '../types';

interface ProfileCustomizerProps {
  settings: ProfileSettings;
  posts: Post[];
  collabs: CollabPost[];
  onSave: (settings: ProfileSettings) => void;
  saving: boolean;
}

const LAYOUT_ICONS: Record<string, React.ReactNode> = {
  classic: <Monitor size={18} />,
  grid: <Grid3X3 size={18} />,
  showcase: <Sparkles size={18} />,
};

export default function ProfileCustomizer({
  settings,
  posts,
  collabs,
  onSave,
  saving,
}: ProfileCustomizerProps) {
  const [layout, setLayout] = useState(settings.layout);
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [featured, setFeatured] = useState<FeaturedItem[]>(settings.featured);
  const [showStats, setShowStats] = useState(settings.sections.showStats);
  const [activeSection, setActiveSection] = useState<'layout' | 'color' | 'featured'>('layout');

  const handleSave = () => {
    onSave({
      version: 1,
      layout,
      accentColor,
      featured,
      sections: { showStats, bioPosition: settings.sections.bioPosition },
    });
  };

  const addFeatured = (type: 'post' | 'collab', id: string) => {
    if (featured.length >= MAX_FEATURED) return;
    if (featured.some((f) => f.id === id)) return;
    setFeatured([...featured, { type, id }]);
  };

  const removeFeatured = (id: string) => {
    setFeatured(featured.filter((f) => f.id !== id));
  };

  const getFeaturedLabel = (item: FeaturedItem) => {
    if (item.type === 'post') {
      const post = posts.find((p) => p.id === item.id);
      return post ? post.content.slice(0, 50) + (post.content.length > 50 ? '…' : '') : 'Deleted post';
    }
    const collab = collabs.find((c) => c.id === item.id);
    return collab ? collab.title : 'Deleted collab';
  };

  const availablePosts = posts.filter((p) => !featured.some((f) => f.id === p.id));
  const availableCollabs = collabs.filter((c) => !featured.some((f) => f.id === c.id));

  const sections = [
    { key: 'layout' as const, icon: <LayoutGrid size={15} />, label: 'Layout' },
    { key: 'color' as const, icon: <Palette size={15} />, label: 'Theme' },
    { key: 'featured' as const, icon: <Star size={15} />, label: 'Featured' },
  ];

  return (
    <div className="space-y-5">
      {/* Section tabs */}
      <div className="flex gap-2">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-300 ${
              activeSection === s.key
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-gray-100/80 text-gray-500 hover:bg-gray-200/80 hover:text-gray-700'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Layout selector */}
        {activeSection === 'layout' && (
          <motion.div
            key="layout"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <p className="text-xs text-gray-400 font-medium">Choose how your profile displays</p>
            <div className="grid grid-cols-3 gap-2.5">
              {LAYOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLayout(opt.value)}
                  className={`relative p-3.5 rounded-2xl border-2 transition-all duration-300 text-left group ${
                    layout === opt.value
                      ? 'border-gray-900 bg-gray-50 shadow-sm'
                      : 'border-gray-200/80 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div
                    className={`mb-2 transition-colors ${
                      layout === opt.value ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                  >
                    {LAYOUT_ICONS[opt.value]}
                  </div>
                  <div className="text-xs font-semibold text-gray-800">{opt.label}</div>
                  <div className="text-[10px] text-gray-400 leading-snug mt-0.5">{opt.description}</div>
                  {layout === opt.value && (
                    <motion.div
                      layoutId="layoutCheck"
                      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center"
                    >
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </motion.div>
                  )}
                </button>
              ))}
            </div>

            {/* Show stats toggle */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-medium text-gray-600">Show follower/post stats</span>
              <button
                onClick={() => setShowStats(!showStats)}
                className={`w-10 h-6 rounded-full transition-all duration-300 relative ${
                  showStats ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    showStats ? 'left-5' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </motion.div>
        )}

        {/* Color picker */}
        {activeSection === 'color' && (
          <motion.div
            key="color"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <p className="text-xs text-gray-400 font-medium">Pick an accent color for your profile</p>
            <div className="flex flex-wrap gap-2.5">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setAccentColor(preset.value)}
                  className="group relative"
                  title={preset.label}
                >
                  <div
                    className={`w-9 h-9 rounded-xl transition-all duration-300 ${
                      accentColor === preset.value
                        ? 'ring-2 ring-offset-2 ring-gray-900 scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: preset.value }}
                  />
                  {accentColor === preset.value && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <svg width="14" height="11" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
            {/* Preview bar */}
            <div
              className="h-2 rounded-full mt-3 transition-colors duration-500"
              style={{ backgroundColor: accentColor }}
            />
          </motion.div>
        )}

        {/* Featured work picker */}
        {activeSection === 'featured' && (
          <motion.div
            key="featured"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <p className="text-xs text-gray-400 font-medium">
              Pin up to {MAX_FEATURED} posts or collabs to showcase ({featured.length}/{MAX_FEATURED})
            </p>

            {/* Current featured - reorderable */}
            {featured.length > 0 && (
              <Reorder.Group axis="y" values={featured} onReorder={setFeatured} className="space-y-1.5">
                {featured.map((item) => (
                  <Reorder.Item
                    key={item.id}
                    value={item}
                    className="flex items-center gap-2 bg-gray-50/80 rounded-xl px-3 py-2.5 cursor-grab active:cursor-grabbing group"
                  >
                    <GripVertical size={14} className="text-gray-300 group-hover:text-gray-400 shrink-0" />
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        item.type === 'post'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="text-xs text-gray-700 flex-1 truncate">
                      {getFeaturedLabel(item)}
                    </span>
                    <button
                      onClick={() => removeFeatured(item.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}

            {/* Add from posts */}
            {featured.length < MAX_FEATURED && availablePosts.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Add from posts
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {availablePosts.slice(0, 10).map((post) => (
                    <button
                      key={post.id}
                      onClick={() => addFeatured('post', post.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-gray-50 transition-colors group"
                    >
                      <Plus size={12} className="text-gray-300 group-hover:text-trybe-500 shrink-0 transition-colors" />
                      <span className="text-xs text-gray-600 truncate">
                        {post.content.slice(0, 60)}{post.content.length > 60 ? '…' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add from collabs */}
            {featured.length < MAX_FEATURED && availableCollabs.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Add from collabs
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {availableCollabs.slice(0, 10).map((collab) => (
                    <button
                      key={collab.id}
                      onClick={() => addFeatured('collab', collab.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-gray-50 transition-colors group"
                    >
                      <Plus size={12} className="text-gray-300 group-hover:text-trybe-500 shrink-0 transition-colors" />
                      <span className="text-xs text-gray-600 truncate">{collab.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {featured.length === 0 && availablePosts.length === 0 && availableCollabs.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">
                Create some posts or collabs first to feature them here.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary text-sm w-full flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Saving…
          </>
        ) : (
          <>
            <Sparkles size={14} />
            Save Customization
          </>
        )}
      </button>
    </div>
  );
}
