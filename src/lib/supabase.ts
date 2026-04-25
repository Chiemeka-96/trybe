import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://flforzblmdaysxaylate.supabase.co';
const supabaseAnonKey = 'sb_publishable_PzEmtKJag_OOmvoaLmEYkg_55J15IOi';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10, // Throttle realtime events under heavy load
    },
  },
  global: {
    headers: {
      'x-client-info': 'trybe-web',
    },
  },
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const getPublicUrl = (bucket: string, path: string) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

/**
 * Retry wrapper with exponential backoff for DB operations.
 * At 50K concurrent users, transient failures (connection limits, timeouts) are expected.
 * Use for critical write operations.
 */
export async function withRetry<T>(
  fn: () => Promise<{ data: T | null; error: any }>,
  opts?: { maxRetries?: number; baseDelayMs?: number }
): Promise<{ data: T | null; error: any }> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelay = opts?.baseDelayMs ?? 200;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();

    if (!result.error) return result;

    // Don't retry client errors (4xx), only transient server/network errors
    const code = result.error?.code;
    const status = result.error?.status ?? result.error?.statusCode;
    const isTransient =
      !status || status >= 500 || status === 429 ||
      code === 'PGRST301' || // connection timeout
      code === '40001' ||    // serialization failure
      code === '53300';      // too many connections

    if (!isTransient || attempt === maxRetries) return result;

    // Exponential backoff with jitter
    const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
    await new Promise((r) => setTimeout(r, delay));
  }

  // Should never reach here, but TypeScript needs it
  return fn();
}
