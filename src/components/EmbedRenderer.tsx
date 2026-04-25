import { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Play, Camera, Globe, Twitter, ExternalLink as LinkIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ParsedEmbed } from '../lib/urlUtils';
import type { LinkMetadata } from '../types';
import { getDomain } from '../lib/urlUtils';
import { fetchLinkMetadata } from '../lib/linkMetadata';

/* ═══════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════ */

/** IntersectionObserver hook — returns [ref, isVisible] */
function useInView(options?: IntersectionObserverInit): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '200px', threshold: 0.1, ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, isVisible];
}

/* ═══════════════════════════════════════════
   SKELETON
   ═══════════════════════════════════════════ */

function EmbedSkeleton({ aspect = 'video' }: { aspect?: 'video' | 'card' | 'compact' }) {
  if (aspect === 'compact') {
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-2xl ring-1 ring-gray-100 dark:ring-gray-700 bg-white dark:bg-gray-800 animate-pulse">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full w-3/5" />
          <div className="h-2.5 bg-gray-50 dark:bg-gray-750 rounded-full w-2/5" />
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl ring-1 ring-gray-100 dark:ring-gray-700 bg-white dark:bg-gray-800 overflow-hidden animate-pulse ${aspect === 'video' ? 'aspect-video' : ''}`}>
      <div className={`w-full bg-gray-100 dark:bg-gray-700 ${aspect === 'video' ? 'h-full' : 'aspect-[1.91/1]'}`} />
      {aspect === 'card' && (
        <div className="p-4 space-y-2">
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full w-1/4" />
          <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full w-4/5" />
          <div className="h-3 bg-gray-50 dark:bg-gray-750 rounded-full w-3/5" />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   VIDEO EMBEDS (lazy + auto-play/pause)
   ═══════════════════════════════════════════ */

/** Lazy YouTube embed — loads iframe when in viewport, auto-play muted, pauses off-screen */
function LazyYouTubeEmbed({ embed }: { embed: ParsedEmbed }) {
  const [containerRef, isVisible] = useInView();
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Auto-play/pause via postMessage to YouTube iframe API
  useEffect(() => {
    if (!iframeRef.current || !loaded) return;
    try {
      const cmd = isVisible
        ? '{"event":"command","func":"playVideo","args":""}'
        : '{"event":"command","func":"pauseVideo","args":""}';
      iframeRef.current.contentWindow?.postMessage(cmd, '*');
    } catch { /* cross-origin, ignore */ }
  }, [isVisible, loaded]);

  return (
    <div ref={containerRef} className="rounded-2xl overflow-hidden aspect-video bg-black ring-1 ring-gray-100 dark:ring-gray-700 relative">
      {isVisible ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={`${embed.embedUrl}?enablejsapi=1&mute=1&autoplay=1&rel=0`}
            className="w-full h-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            title="YouTube video"
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-900">
          <Play size={40} className="text-white/50" />
        </div>
      )}
    </div>
  );
}

/** Lazy TikTok embed */
function LazyTikTokEmbed({ embed }: { embed: ParsedEmbed }) {
  const [containerRef, isVisible] = useInView();
  const [loaded, setLoaded] = useState(false);

  if (!embed.embedUrl) return <SmartLinkCard embed={embed} />;

  return (
    <div ref={containerRef} className="rounded-2xl overflow-hidden ring-1 ring-gray-100 dark:ring-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-center relative" style={{ minHeight: 400 }}>
      {isVisible ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-trybe-500 rounded-full animate-spin" />
            </div>
          )}
          <iframe
            src={embed.embedUrl}
            className="w-full max-w-[325px]"
            style={{ height: 580, border: 'none' }}
            allowFullScreen
            allow="encrypted-media"
            title="TikTok video"
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </>
      ) : (
        <div className="w-full flex items-center justify-center" style={{ height: 400 }}>
          <Play size={40} className="text-gray-300 dark:text-gray-600" />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SOCIAL EMBEDS
   ═══════════════════════════════════════════ */

/** Lazy Instagram embed */
function LazyInstagramEmbed({ embed }: { embed: ParsedEmbed }) {
  const [containerRef, isVisible] = useInView();
  const [loaded, setLoaded] = useState(false);

  return (
    <div ref={containerRef} className="rounded-2xl overflow-hidden ring-1 ring-gray-100 dark:ring-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-center relative" style={{ minHeight: 300 }}>
      {isVisible ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-pink-500 rounded-full animate-spin" />
            </div>
          )}
          <iframe
            src={embed.embedUrl!}
            className="w-full max-w-[400px]"
            style={{ height: 520, border: 'none' }}
            allowFullScreen
            title="Instagram post"
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </>
      ) : (
        <div className="w-full flex items-center justify-center" style={{ height: 300 }}>
          <Camera size={32} className="text-gray-300 dark:text-gray-600" />
        </div>
      )}
    </div>
  );
}

/** Twitter/X preview card — shows as rich link (no reliable free iframe embed) */
function TwitterCard({ embed }: { embed: ParsedEmbed }) {
  return <SmartLinkCard embed={embed} />;
}

/* ═══════════════════════════════════════════
   RICH LINK CARDS (OG metadata)
   ═══════════════════════════════════════════ */

/** Rich hero-style card with OG image, title, description, favicon */
function RichLinkPreview({ metadata, url }: { metadata: LinkMetadata; url: string }) {
  const hasImage = !!metadata.image;
  const [imgError, setImgError] = useState(false);

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group block rounded-2xl ring-1 ring-gray-100 dark:ring-gray-700 bg-white dark:bg-gray-800 hover:ring-gray-200 dark:hover:ring-gray-600 hover:shadow-soft overflow-hidden transition-all duration-300"
    >
      {hasImage && !imgError && (
        <div className="relative w-full aspect-[1.91/1] bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <img
            src={metadata.image!}
            alt={metadata.title || ''}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            loading="lazy"
            onError={() => setImgError(true)}
          />
          {/* Gradient overlay for readability */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          {metadata.favicon && (
            <img
              src={metadata.favicon}
              alt=""
              className="w-4 h-4 rounded-sm shrink-0"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate">
            {metadata.site_name || metadata.domain}
          </span>
        </div>
        {metadata.title && (
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug line-clamp-2 group-hover:text-trybe-600 dark:group-hover:text-trybe-400 transition-colors duration-200">
            {metadata.title}
          </h4>
        )}
        {metadata.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2 mt-1">
            {metadata.description}
          </p>
        )}
        {!metadata.title && !(hasImage && !imgError) && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
            {url.length > 60 ? url.slice(0, 57) + '...' : url}
          </p>
        )}
      </div>
    </motion.a>
  );
}

/** Compact link card for stacking multiple generic links */
function CompactLinkCard({ metadata, url }: { metadata: LinkMetadata | null; url: string }) {
  const domain = getDomain(url);

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="group flex items-center gap-3 p-3 rounded-xl ring-1 ring-gray-100 dark:ring-gray-700 bg-white dark:bg-gray-800 hover:ring-gray-200 dark:hover:ring-gray-600 hover:shadow-soft transition-all duration-300"
    >
      {/* Favicon / domain icon */}
      <div className="shrink-0 w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
        {metadata?.favicon ? (
          <img
            src={metadata.favicon}
            alt=""
            className="w-5 h-5 rounded-sm"
            loading="lazy"
            onError={(e) => {
              const parent = (e.target as HTMLImageElement).parentElement;
              if (parent) parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-400"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
            }}
          />
        ) : (
          <Globe size={16} className="text-gray-400 dark:text-gray-500" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 truncate group-hover:text-trybe-600 dark:group-hover:text-trybe-400 transition-colors">
          {metadata?.title || domain}
        </p>
        {metadata?.description && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{metadata.description}</p>
        )}
        {!metadata?.description && metadata?.title && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{domain}</p>
        )}
      </div>

      <ExternalLink size={12} className="shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-trybe-500 transition-colors" />
    </motion.a>
  );
}

/* ═══════════════════════════════════════════
   FALLBACK (minimal domain-only card)
   ═══════════════════════════════════════════ */

function MinimalLinkCard({ embed }: { embed: ParsedEmbed }) {
  const domain = getDomain(embed.originalUrl);

  const platformConfig: Record<string, { icon: typeof Globe; color: string; bg: string; label: string }> = {
    'youtube.com': { icon: Play, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', label: 'YouTube' },
    'youtu.be': { icon: Play, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', label: 'YouTube' },
    'tiktok.com': { icon: Play, color: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-100 dark:bg-gray-700', label: 'TikTok' },
    'instagram.com': { icon: Camera, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/30', label: 'Instagram' },
    'twitter.com': { icon: Twitter, color: 'text-sky-500 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-900/30', label: 'Twitter' },
    'x.com': { icon: Twitter, color: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-100 dark:bg-gray-700', label: 'X' },
  };

  const config = Object.entries(platformConfig).find(([key]) => domain.includes(key));
  const Icon = config ? config[1].icon : Globe;
  const color = config ? config[1].color : 'text-trybe-600 dark:text-trybe-400';
  const bg = config ? config[1].bg : 'bg-trybe-50/60 dark:bg-trybe-900/30';
  const label = config ? config[1].label : domain;

  const displayUrl = embed.originalUrl.length > 60
    ? embed.originalUrl.slice(0, 57) + '...'
    : embed.originalUrl;

  return (
    <motion.a
      href={embed.originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group flex items-center gap-4 p-4 rounded-2xl ring-1 ring-gray-100 dark:ring-gray-700 bg-white dark:bg-gray-800 hover:ring-gray-200 dark:hover:ring-gray-600 hover:shadow-soft transition-all duration-300"
    >
      <div className={`shrink-0 w-12 h-12 rounded-xl ${bg} flex items-center justify-center transition-transform duration-300 group-hover:scale-105`}>
        <Icon size={20} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-trybe-600 dark:group-hover:text-trybe-400 transition-colors duration-200">
          {label}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{displayUrl}</p>
      </div>
      <ExternalLink size={14} className="shrink-0 text-gray-300 dark:text-gray-500 group-hover:text-trybe-500 dark:group-hover:text-trybe-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300" />
    </motion.a>
  );
}

/* ═══════════════════════════════════════════
   SMART LINK CARD (fetches OG metadata)
   ═══════════════════════════════════════════ */

function SmartLinkCard({ embed, compact = false }: { embed: ParsedEmbed; compact?: boolean }) {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLinkMetadata(embed.originalUrl).then((data) => {
      if (!cancelled) {
        setMetadata(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [embed.originalUrl]);

  if (loading) {
    return <EmbedSkeleton aspect={compact ? 'compact' : 'card'} />;
  }

  // Compact mode for multi-link stacking
  if (compact) {
    return <CompactLinkCard metadata={metadata} url={embed.originalUrl} />;
  }

  // Rich hero card if we have metadata with title or image
  if (metadata && (metadata.title || metadata.image)) {
    return <RichLinkPreview metadata={metadata} url={embed.originalUrl} />;
  }

  // Domain-only fallback
  return <MinimalLinkCard embed={embed} />;
}

/* ═══════════════════════════════════════════
   SINGLE EMBED RENDERER
   ═══════════════════════════════════════════ */

function SingleEmbedRenderer({ embed, compact = false }: { embed: ParsedEmbed; compact?: boolean }) {
  switch (embed.type) {
    case 'youtube':
      return embed.embedUrl ? <LazyYouTubeEmbed embed={embed} /> : <MinimalLinkCard embed={embed} />;
    case 'tiktok':
      return embed.embedUrl ? <LazyTikTokEmbed embed={embed} /> : <SmartLinkCard embed={embed} compact={compact} />;
    case 'instagram':
      return embed.embedUrl ? <LazyInstagramEmbed embed={embed} /> : <SmartLinkCard embed={embed} compact={compact} />;
    case 'twitter':
      return <TwitterCard embed={embed} />;
    case 'unknown':
    default:
      return <SmartLinkCard embed={embed} compact={compact} />;
  }
}

/* ═══════════════════════════════════════════
   EMBED STACK — smart layout for multiple embeds
   ═══════════════════════════════════════════ */

interface EmbedStackProps {
  embeds: ParsedEmbed[];
}

/**
 * Smart embed stack — selects card type based on content:
 * - Single video: full embed card
 * - Single generic link: hero card (with OG image)
 * - Multiple embeds: first video/social gets full card, rest get compact cards
 */
export function EmbedStack({ embeds }: EmbedStackProps) {
  if (embeds.length === 0) return null;

  // Single embed — give it full treatment
  if (embeds.length === 1) {
    return (
      <div className="mb-4">
        <SingleEmbedRenderer embed={embeds[0]} />
      </div>
    );
  }

  // Multiple embeds — find the "hero" embed (first video or social)
  const heroIndex = embeds.findIndex((e) => e.category === 'video' || e.category === 'social');
  const heroEmbed = heroIndex >= 0 ? embeds[heroIndex] : null;
  const restEmbeds = embeds.filter((_, i) => i !== heroIndex);

  // If no hero, check if first generic has metadata potential — render it as hero
  const primaryEmbed = heroEmbed || embeds[0];
  const secondaryEmbeds = heroEmbed ? restEmbeds : embeds.slice(1);

  return (
    <div className="space-y-2 mb-4">
      {/* Primary / hero embed */}
      <SingleEmbedRenderer embed={primaryEmbed} />

      {/* Secondary embeds — compact stacked cards */}
      {secondaryEmbeds.length > 0 && (
        <div className="space-y-1.5">
          {secondaryEmbeds.map((embed, i) => (
            <SingleEmbedRenderer
              key={`${embed.originalUrl}-${i}`}
              embed={embed}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Main embed renderer — single embed dispatch (backward compat) */
export default function EmbedRenderer({ embed }: { embed: ParsedEmbed }) {
  return <SingleEmbedRenderer embed={embed} />;
}
