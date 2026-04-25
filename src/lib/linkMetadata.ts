/**
 * Link metadata fetcher — calls the Supabase Edge Function
 * with in-memory caching to avoid redundant network calls.
 */
import { supabase } from './supabase';
import type { LinkMetadata } from '../types';

const SUPABASE_URL = 'https://flforzblmdaysxaylate.supabase.co';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/fetch-link-metadata`;

// In-memory cache for current session (avoids re-fetching same URL)
const memoryCache = new Map<string, LinkMetadata>();
// Track in-flight requests to prevent duplicate fetches
const pendingRequests = new Map<string, Promise<LinkMetadata | null>>();

/**
 * Fetch link metadata for a URL.
 * Returns cached data if available, otherwise calls the edge function.
 * Returns null on error (caller should show domain-only fallback).
 */
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
  // Check memory cache first
  const cached = memoryCache.get(url);
  if (cached) return cached;

  // Check if there's already a pending request for this URL
  const pending = pendingRequests.get(url);
  if (pending) return pending;

  const request = (async (): Promise<LinkMetadata | null> => {
    try {
      // Get session token for edge function auth
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        // Fallback: try reading from DB cache directly (public read)
        const { data } = await supabase
          .from('link_metadata')
          .select('*')
          .eq('url', url)
          .maybeSingle();
        if (data) {
          memoryCache.set(url, data as LinkMetadata);
          return data as LinkMetadata;
        }
        return null;
      }

      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) return null;

      const result = await response.json();
      const metadata = result.data as LinkMetadata;

      if (metadata) {
        memoryCache.set(url, metadata);
      }

      return metadata;
    } catch {
      return null;
    } finally {
      pendingRequests.delete(url);
    }
  })();

  pendingRequests.set(url, request);
  return request;
}

/**
 * Clear the in-memory metadata cache (useful for testing)
 */
export function clearMetadataCache(): void {
  memoryCache.clear();
}
