import { Link } from 'react-router-dom';
import { Tag, DollarSign, Sparkles, Briefcase, ArrowRight, MapPin, Edit2, Trash2, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import EmbedRenderer from './EmbedRenderer';
import LinkedText from './LinkedText';
import { classifyUrl, extractUrls } from '../lib/urlUtils';
import type { CollabPost } from '../types';

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

interface CollabCardProps {
  collab: CollabPost;
  isOwn?: boolean;
  onApply?: (collab: CollabPost) => void;
  onEdit?: (collab: CollabPost) => void;
  onDelete?: (collab: CollabPost) => void;
}

export default function CollabCard({ collab, isOwn, onApply, onEdit, onDelete }: CollabCardProps) {
  const isCreator = collab.type === 'creator_listing';

  // Parse embeds from external_url or description URLs
  const embeds = (() => {
    const urls: string[] = [];
    if (collab.external_url) urls.push(collab.external_url);
    const descUrls = extractUrls(collab.description);
    descUrls.forEach((u) => { if (!urls.includes(u)) urls.push(u); });
    return urls.slice(0, 1).map(classifyUrl); // show at most 1 embed
  })();

  const locationStr = [collab.location_city, collab.location_country].filter(Boolean).join(', ');

  return (
    <div className="collab-card p-5 sm:p-6 group flex flex-col h-full">
      {/* ─── Header: Avatar + User + Badge ─── */}
      <div className="flex items-center gap-3 mb-4">
        <Link to={`/profile/${collab.profiles?.username}`} className="shrink-0">
          <div className="avatar w-10 h-10 text-xs">
            {collab.profiles?.avatar_url ? (
              <img src={collab.profiles.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              collab.profiles?.username?.[0]?.toUpperCase() || '?'
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            to={`/profile/${collab.profiles?.username}`}
            className="text-sm font-semibold text-gray-800 dark:text-gray-200 hover:text-trybe-600 dark:hover:text-trybe-400 transition-colors duration-200 truncate block"
          >
            @{collab.profiles?.username}
          </Link>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">{timeAgo(collab.created_at)}</p>
        </div>

        {/* Owner actions */}
        {isOwn && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit?.(collab)}
              className="p-2 rounded-xl text-gray-400 hover:text-trybe-600 hover:bg-trybe-50 dark:hover:bg-trybe-950/60 transition-all duration-200"
              title="Edit"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => onDelete?.(collab)}
              className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all duration-200"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0 ${
          isCreator
            ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200/60 dark:border-purple-800/40'
            : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40'
        }`}>
          {isCreator ? <Sparkles size={10} /> : <Briefcase size={10} />}
          {isCreator ? 'Creator' : 'Opportunity'}
        </span>
      </div>

      {/* ─── Title ─── */}
      <h3 className="font-bold text-[15px] text-gray-900 dark:text-gray-100 mb-2 leading-snug group-hover:text-trybe-700 dark:group-hover:text-trybe-400 transition-colors duration-300 line-clamp-2">
        {collab.title}
      </h3>

      {/* ─── Location ─── */}
      {locationStr && (
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={12} className="text-trybe-500 shrink-0" />
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{locationStr}</span>
        </div>
      )}

      {/* ─── Description (with linked text) ─── */}
      <div className="text-gray-500 dark:text-gray-400 text-sm mb-4 leading-relaxed flex-1">
        <div className="line-clamp-3">
          <LinkedText text={collab.description} />
        </div>
      </div>

      {/* ─── Embed ─── */}
      {embeds.length > 0 && (
        <div className="mb-4">
          {embeds.map((embed, i) => (
            <EmbedRenderer key={i} embed={embed} />
          ))}
        </div>
      )}

      {/* ─── External URL (non-embeddable) ─── */}
      {collab.external_url && embeds.every(e => e.type === 'unknown') && (
        <a
          href={collab.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-trybe-600 dark:text-trybe-400 hover:underline mb-4"
        >
          <ExternalLink size={12} />
          {collab.external_url.length > 50 ? collab.external_url.slice(0, 47) + '...' : collab.external_url}
        </a>
      )}

      {/* ─── Tags ─── */}
      {collab.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {collab.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 border border-gray-200/50 dark:border-gray-700/50">
              <Tag size={9} />{tag}
            </span>
          ))}
          {collab.tags.length > 4 && (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100/80 dark:bg-gray-800/80 text-gray-400 dark:text-gray-500">
              +{collab.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* ─── Footer: Budget + CTA ─── */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100/80 dark:border-gray-800/80 mt-auto">
        {collab.budget ? (
          <span className="flex items-center gap-1 text-sm font-bold text-trybe-700 dark:text-trybe-400 bg-trybe-50/60 dark:bg-trybe-950/60 px-3 py-1.5 rounded-xl">
            <DollarSign size={14} />{collab.budget}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Open budget</span>
        )}

        {!isOwn && (
          <button
            onClick={() => onApply?.(collab)}
            className={`group/btn flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-2xl transition-all duration-300 active:scale-[0.97] ${
              isCreator
                ? 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-sm hover:shadow-md'
                : 'bg-gradient-to-r from-trybe-500 to-trybe-600 hover:from-trybe-600 hover:to-trybe-700 text-white shadow-sm hover:shadow-glow-green'
            }`}
          >
            {isCreator ? 'Collaborate' : 'Apply'}
            <ArrowRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform duration-200" />
          </button>
        )}
      </div>
    </div>
  );
}
