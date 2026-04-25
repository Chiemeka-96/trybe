/**
 * Client-side rate limiter using a token bucket algorithm.
 * Protects against rapid repeated actions (spam clicks, mass submissions).
 * Persists state across page refreshes via localStorage.
 */

export const RateActions = {
  // Auth
  authSignIn: 'auth:signIn',
  authSignUp: 'auth:signUp',

  // Sensitive writes (have their own dedicated bucket + the shared writes bucket)
  postsCreate: 'posts:create',
  messagesSend: 'messages:send',

  // Normal writes (share the writes bucket)
  postsLike: 'posts:like',
  postsSave: 'posts:save',
  postsComment: 'posts:comment',
  collabsSave: 'collabs:save',
  profileFollow: 'profile:follow',

  // Reads
  profilesSearch: 'profiles:search',
} as const;

export type RateAction = (typeof RateActions)[keyof typeof RateActions];

type BucketName =
  | 'auth'
  | 'writes'
  | 'reads'
  | 'messages:send'
  | 'posts:create';

type BucketConfig = {
  limit: number;
  intervalMs: number;
};

type BucketState = {
  tokens: number;
  updatedAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  action: RateAction;
  bucket: BucketName;
  limit: number;
  intervalMs: number;
  remaining: number;
  retryAfterMs: number;
  resetAt: number;
};

export class RateLimitError extends Error {
  public readonly result: RateLimitResult;

  constructor(result: RateLimitResult) {
    super(
      `Rate limited (${result.bucket}). Try again ${formatRetryAfter(result.retryAfterMs)}.`
    );
    this.name = 'RateLimitError';
    this.result = result;
  }
}

// ── Bucket configurations ──────────────────────────────────────────────
const BUCKETS: Record<BucketName, BucketConfig> = {
  auth: { limit: 5, intervalMs: 60_000 },
  writes: { limit: 30, intervalMs: 60_000 },
  reads: { limit: 60, intervalMs: 60_000 },
  'messages:send': { limit: 10, intervalMs: 60_000 },
  'posts:create': { limit: 5, intervalMs: 60_000 },
};

/**
 * Map each action to the bucket(s) it consumes.
 * Sensitive actions consume both their specific bucket AND the shared writes bucket.
 */
const ACTION_BUCKETS: Record<RateAction, BucketName[]> = {
  [RateActions.authSignIn]: ['auth'],
  [RateActions.authSignUp]: ['auth'],

  [RateActions.messagesSend]: ['messages:send', 'writes'],
  [RateActions.postsCreate]: ['posts:create', 'writes'],

  [RateActions.postsLike]: ['writes'],
  [RateActions.postsSave]: ['writes'],
  [RateActions.postsComment]: ['writes'],
  [RateActions.collabsSave]: ['writes'],
  [RateActions.profileFollow]: ['writes'],

  [RateActions.profilesSearch]: ['reads'],
};

// ── Internal state ─────────────────────────────────────────────────────
const STORAGE_KEY = 'trybe:rateLimiter:v1';
const PRUNE_AFTER_MS = 24 * 60 * 60_000;
const MAX_MEMORY_ENTRIES = 100; // Cap in-memory entries to prevent unbounded growth

const memory = new Map<string, BucketState>();
let hydrated = false;
let lastPruneAt = 0;

function nowMs() {
  return Date.now();
}

function scopeKey(userId?: string | null) {
  return userId || 'anon';
}

function makeKey(userScope: string, bucket: BucketName) {
  return `${userScope}::${bucket}`;
}

// ── localStorage persistence ───────────────────────────────────────────
function safeReadStorage(): Record<string, BucketState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, BucketState>;
  } catch {
    return null;
  }
}

function safeWriteStorage(obj: Record<string, BucketState>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Silently ignore (private mode, quota, etc.)
  }
}

function hydrateOnce() {
  if (hydrated) return;
  hydrated = true;

  const persisted = safeReadStorage();
  if (!persisted) return;

  const n = nowMs();
  for (const [k, v] of Object.entries(persisted)) {
    if (!v || typeof v.tokens !== 'number' || typeof v.updatedAt !== 'number') continue;
    if (n - v.updatedAt > PRUNE_AFTER_MS) continue;
    memory.set(k, v);
  }
}

function persist() {
  const n = nowMs();
  const out: Record<string, BucketState> = {};

  for (const [k, v] of memory.entries()) {
    if (n - v.updatedAt > PRUNE_AFTER_MS) continue;
    out[k] = v;
  }

  safeWriteStorage(out);
}

/** Prune stale entries from memory at most once per minute */
function pruneMemory() {
  const n = nowMs();
  if (n - lastPruneAt < 60_000) return;
  lastPruneAt = n;

  const staleKeys: string[] = [];
  for (const [k, v] of memory.entries()) {
    if (n - v.updatedAt > PRUNE_AFTER_MS) staleKeys.push(k);
  }
  for (const k of staleKeys) memory.delete(k);

  // Hard cap: if memory is still too large, remove oldest entries
  if (memory.size > MAX_MEMORY_ENTRIES) {
    const sorted = [...memory.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const toRemove = sorted.slice(0, memory.size - MAX_MEMORY_ENTRIES);
    for (const [k] of toRemove) memory.delete(k);
  }
}

function getState(fullKey: string, capacity: number): BucketState {
  const existing = memory.get(fullKey);
  if (!existing) {
    const init: BucketState = { tokens: capacity, updatedAt: nowMs() };
    memory.set(fullKey, init);
    return init;
  }
  return existing;
}

// ── Token bucket evaluation ────────────────────────────────────────────
type EvalResult = {
  allowed: boolean;
  after: BucketState;
  remaining: number;
  retryAfterMs: number;
  resetAt: number;
};

function evalConsume(
  state: BucketState,
  cfg: BucketConfig,
  cost: number,
  t: number
): EvalResult {
  const capacity = cfg.limit;
  const refillRatePerMs = cfg.limit / cfg.intervalMs;

  const elapsed = Math.max(0, t - state.updatedAt);
  const refilledTokens = Math.min(capacity, state.tokens + elapsed * refillRatePerMs);

  if (refilledTokens >= cost) {
    const remaining = refilledTokens - cost;
    return {
      allowed: true,
      after: { tokens: remaining, updatedAt: t },
      remaining,
      retryAfterMs: 0,
      resetAt: t,
    };
  }

  const needed = cost - refilledTokens;
  const retryAfterMs = Math.ceil(needed / refillRatePerMs);
  return {
    allowed: false,
    after: { tokens: refilledTokens, updatedAt: t },
    remaining: 0,
    retryAfterMs,
    resetAt: t + retryAfterMs,
  };
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Check + consume tokens for the given action.
 * Returns a result object with `allowed`, remaining tokens, and retry info.
 */
export function checkRateLimit(
  action: RateAction,
  opts?: { userId?: string | null; cost?: number }
): RateLimitResult {
  hydrateOnce();
  pruneMemory(); // Periodic memory cleanup

  const cost = Math.max(1, opts?.cost ?? 1);
  const userScope = scopeKey(opts?.userId);
  const buckets = ACTION_BUCKETS[action] ?? [];
  const t = nowMs();

  if (buckets.length === 0) {
    return {
      allowed: true,
      action,
      bucket: 'writes',
      limit: BUCKETS.writes.limit,
      intervalMs: BUCKETS.writes.intervalMs,
      remaining: BUCKETS.writes.limit,
      retryAfterMs: 0,
      resetAt: t,
    };
  }

  // Two-phase: evaluate all buckets first, only commit if all pass
  const evaluated: Array<{
    bucket: BucketName;
    cfg: BucketConfig;
    fullKey: string;
    eval: EvalResult;
  }> = [];

  for (const bucket of buckets) {
    const cfg = BUCKETS[bucket];
    const fullKey = makeKey(userScope, bucket);
    const state = getState(fullKey, cfg.limit);
    const e = evalConsume(state, cfg, cost, t);
    evaluated.push({ bucket, cfg, fullKey, eval: e });

    if (!e.allowed) {
      return {
        allowed: false,
        action,
        bucket,
        limit: cfg.limit,
        intervalMs: cfg.intervalMs,
        remaining: 0,
        retryAfterMs: e.retryAfterMs,
        resetAt: e.resetAt,
      };
    }
  }

  // All buckets passed — commit the new state
  for (const item of evaluated) {
    memory.set(item.fullKey, item.eval.after);
  }
  persist();

  const minRemaining = Math.min(...evaluated.map((x) => x.eval.remaining));
  const primary = evaluated[0];

  return {
    allowed: true,
    action,
    bucket: primary.bucket,
    limit: primary.cfg.limit,
    intervalMs: primary.cfg.intervalMs,
    remaining: minRemaining,
    retryAfterMs: 0,
    resetAt: t,
  };
}

/**
 * Wrapper that rate-limits an async function.
 * Throws RateLimitError when blocked.
 */
export async function withRateLimit<T>(
  action: RateAction,
  fn: () => Promise<T>,
  opts?: { userId?: string | null; cost?: number }
): Promise<T> {
  const res = checkRateLimit(action, opts);
  if (!res.allowed) throw new RateLimitError(res);
  return await fn();
}

/** Format retry time into a human-readable string */
export function formatRetryAfter(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `in ${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `in ${m}m ${rem}s` : `in ${m}m`;
}
