/**
 * URL detection and embed classification utilities
 */

// Regex to detect URLs in text
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export type EmbedType = 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'unknown';

/** High-level category for card selection logic */
export type EmbedCategory = 'video' | 'social' | 'generic';

export interface ParsedEmbed {
  type: EmbedType;
  category: EmbedCategory;
  originalUrl: string;
  embedUrl: string | null;
  videoId?: string;
}

/**
 * Get the high-level category for an embed type
 */
function getCategory(type: EmbedType): EmbedCategory {
  switch (type) {
    case 'youtube':
    case 'tiktok':
      return 'video';
    case 'instagram':
    case 'twitter':
      return 'social';
    default:
      return 'generic';
  }
}

/**
 * Extract all URLs from a text string
 */
export function extractUrls(text: string): string[] {
  return text.match(URL_REGEX) || [];
}

/**
 * Parse a YouTube URL and extract the video ID
 */
function parseYouTube(url: URL): string | null {
  if (url.hostname.includes('youtube.com') && url.searchParams.get('v')) {
    return url.searchParams.get('v');
  }
  if (url.hostname === 'youtu.be') {
    return url.pathname.slice(1).split('/')[0] || null;
  }
  if (url.hostname.includes('youtube.com') && url.pathname.startsWith('/shorts/')) {
    return url.pathname.split('/')[2] || null;
  }
  if (url.hostname.includes('youtube.com') && url.pathname.startsWith('/embed/')) {
    return url.pathname.split('/')[2] || null;
  }
  return null;
}

/**
 * Parse a TikTok URL and extract the video ID
 */
function parseTikTok(url: URL): string | null {
  const videoMatch = url.pathname.match(/\/video\/(\d+)/);
  if (videoMatch) return videoMatch[1];
  if (url.hostname === 'vm.tiktok.com') {
    return url.pathname.slice(1).split('/')[0] || null;
  }
  return null;
}

/**
 * Parse an Instagram URL and extract the post shortcode
 */
function parseInstagram(url: URL): string | null {
  const match = url.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (match) return match[2];
  return null;
}

/**
 * Parse a Twitter/X URL and extract the tweet ID
 */
function parseTwitter(url: URL): string | null {
  // twitter.com/user/status/ID  or  x.com/user/status/ID
  const match = url.pathname.match(/\/status\/(\d+)/);
  if (match) return match[1];
  return null;
}

/**
 * Classify a URL and return embed info
 */
export function classifyUrl(rawUrl: string): ParsedEmbed {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();

    // YouTube
    if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
      const videoId = parseYouTube(url);
      if (videoId) {
        return {
          type: 'youtube',
          category: 'video',
          originalUrl: rawUrl,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          videoId,
        };
      }
    }

    // TikTok
    if (hostname.includes('tiktok.com')) {
      const videoId = parseTikTok(url);
      if (videoId) {
        return {
          type: 'tiktok',
          category: 'video',
          originalUrl: rawUrl,
          embedUrl: `https://www.tiktok.com/embed/v2/${videoId}`,
          videoId,
        };
      }
      return { type: 'tiktok', category: 'video', originalUrl: rawUrl, embedUrl: null };
    }

    // Instagram
    if (hostname.includes('instagram.com') || hostname === 'instagr.am') {
      const shortcode = parseInstagram(url);
      if (shortcode) {
        return {
          type: 'instagram',
          category: 'social',
          originalUrl: rawUrl,
          embedUrl: `https://www.instagram.com/p/${shortcode}/embed/`,
          videoId: shortcode,
        };
      }
    }

    // Twitter / X
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      const tweetId = parseTwitter(url);
      if (tweetId) {
        return {
          type: 'twitter',
          category: 'social',
          originalUrl: rawUrl,
          // Use the publish.twitter.com oEmbed approach — no direct iframe URL
          embedUrl: null,
          videoId: tweetId,
        };
      }
    }
  } catch {
    /* malformed URL — fall through */
  }

  return {
    type: 'unknown',
    category: 'generic',
    originalUrl: rawUrl,
    embedUrl: null,
  };
}

/**
 * Get all unique embeds from post text + embed_url field
 */
export function getPostEmbeds(content: string, embedUrl?: string | null): ParsedEmbed[] {
  const urls = new Set<string>();
  extractUrls(content).forEach((u) => urls.add(u));
  if (embedUrl) urls.add(embedUrl);
  return Array.from(urls).map(classifyUrl);
}

/**
 * Get domain name from URL for display
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/**
 * Replace URLs in text with React-renderable segments
 */
export interface TextSegment {
  type: 'text' | 'link';
  content: string;
}

export function segmentText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  const regex = new RegExp(URL_REGEX.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'link', content: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}
