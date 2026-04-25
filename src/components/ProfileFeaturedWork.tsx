import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Star, Heart, MessageCircle, ExternalLink, ArrowRight } from 'lucide-react';
import type { ProfileSettings, FeaturedItem, Post, CollabPost } from '../types';
import EmbedRenderer from './EmbedRenderer';
import LinkedText from './LinkedText';
import { classifyUrl } from '../lib/urlUtils';

interface ProfileFeaturedWorkProps {
  settings: ProfileSettings;
  posts: Post[];
  collabs: CollabPost[];
  accentColor: string;
}

export default function ProfileFeaturedWork({
  settings,
  posts,
  collabs,
  accentColor,
}: ProfileFeaturedWorkProps) {
  const resolvedItems = useMemo(() => {
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const collabMap = new Map(collabs.map((c) => [c.id, c]));

    return settings.featured
      .map((f) => {
        if (f.type === 'post') {
          const post = postMap.get(f.id);
          return post ? { ...f, data: post } : null;
        }
        const collab = collabMap.get(f.id);
        return collab ? { ...f, data: collab } : null;
      })
      .filter(Boolean) as (FeaturedItem & { data: Post | CollabPost })[];
  }, [settings.featured, posts, collabs]);

  if (resolvedItems.length === 0) return null;

  const { layout } = settings;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="mb-8"
    >
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <Star size={15} style={{ color: accentColor }} className="fill-current" />
        <h3 className="text-sm font-bold text-gray-800">Featured Work</h3>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* Showcase layout: hero first + smaller grid */}
      {layout === 'showcase' && resolvedItems.length > 0 && (
        <div className="space-y-4">
          <FeaturedHeroCard item={resolvedItems[0]} accentColor={accentColor} />
          {resolvedItems.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              {resolvedItems.slice(1).map((item, i) => (
                <FeaturedSmallCard key={item.id} item={item} accentColor={accentColor} index={i} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grid layout: 3-col grid */}
      {layout === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {resolvedItems.map((item, i) => (
            <FeaturedSmallCard key={item.id} item={item} accentColor={accentColor} index={i} />
          ))}
        </div>
      )}

      {/* Classic layout: horizontal scroll */}
      {layout === 'classic' && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {resolvedItems.map((item, i) => (
            <div key={item.id} className="min-w-[240px] max-w-[280px] shrink-0">
              <FeaturedSmallCard item={item} accentColor={accentColor} index={i} />
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ─── Hero Card (Showcase first item) ─── */
function FeaturedHeroCard({
  item,
  accentColor,
}: {
  item: FeaturedItem & { data: Post | CollabPost };
  accentColor: string;
}) {
  const isPost = item.type === 'post';
  const post = isPost ? (item.data as Post) : null;
  const collab = !isPost ? (item.data as CollabPost) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-3xl border border-gray-100/80 bg-white shadow-soft group"
    >
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-3xl"
        style={{ backgroundColor: accentColor }}
      />
      <div className="p-5 sm:p-6">
        {post && (
          <>
            <p className="text-gray-800 leading-relaxed text-sm">
              <LinkedText text={post.content} />
            </p>
            {post.embed_url && (
              <div className="mt-3">
                <EmbedRenderer embed={classifyUrl(post.embed_url)} />
              </div>
            )}
            <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Heart size={12} /> {post.like_count || 0}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle size={12} /> {post.comment_count || 0}
              </span>
            </div>
          </>
        )}
        {collab && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: accentColor }}
              >
                {collab.type === 'creator_listing' ? 'Creator' : 'Opportunity'}
              </span>
              {collab.budget && (
                <span className="text-xs text-gray-400">{collab.budget}</span>
              )}
            </div>
            <h4 className="font-bold text-gray-900 text-base">{collab.title}</h4>
            <p className="text-gray-600 text-sm mt-1 leading-relaxed line-clamp-3">
              {collab.description}
            </p>
            {collab.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {collab.tags.map((tag) => (
                  <span key={tag} className="tag-pill text-[10px]">{tag}</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Small Card (Grid / Classic) ─── */
function FeaturedSmallCard({
  item,
  accentColor,
  index,
}: {
  item: FeaturedItem & { data: Post | CollabPost };
  accentColor: string;
  index: number;
}) {
  const isPost = item.type === 'post';
  const post = isPost ? (item.data as Post) : null;
  const collab = !isPost ? (item.data as CollabPost) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="relative overflow-hidden rounded-2xl border border-gray-100/80 bg-white shadow-soft hover:shadow-soft-md transition-all duration-300 group"
    >
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ backgroundColor: accentColor }}
      />
      {post && (
        <div className="p-3.5">
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">
            {post.content}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <Heart size={10} /> {post.like_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle size={10} /> {post.comment_count || 0}
            </span>
          </div>
        </div>
      )}
      {collab && (
        <div className="p-3.5">
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white inline-block mb-2"
            style={{ backgroundColor: accentColor }}
          >
            {collab.type === 'creator_listing' ? 'Creator' : 'Opportunity'}
          </span>
          <h4 className="font-bold text-gray-900 text-xs leading-snug">{collab.title}</h4>
          <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{collab.description}</p>
          {collab.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {collab.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 font-medium">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
