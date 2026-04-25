# trybe — Social + Professional Networking Platform

## Project Status
- **Type**: Fullstack React + Supabase web app
- **Stack**: React 18, TypeScript, Vite, Tailwind CSS, Supabase, Zustand, Framer Motion
- **Theme**: Green (#16A34A primary) + white/dark, premium modern design with dark mode support

## Architecture

### Frontend
- `src/App.tsx` — Router setup with protected routes + lazy-loaded pages (code splitting)
- `src/lib/supabase.ts` — Supabase client config
- `src/store/authStore.ts` — Zustand auth state (signup/login/profile)
- `src/store/notificationStore.ts` — Zustand notification state (fetch/poll/read/clear)
- `src/layouts/Layout.tsx` — Main app layout with glassmorphism nav
- `src/pages/Auth.tsx` — Login/Signup with confirm password + username validation (alphanumeric + underscores, 3-30 chars)
- `src/pages/Home.tsx` — Post feed with pagination (20 posts per page, load more)
- `src/pages/CollabBoard.tsx` — Collab marketplace with segmented Creators/Opportunities toggle, tag filters, search bar, 2-col grid
- `src/pages/CreatePost.tsx` — Create post (text + embed URL only; image upload removed)
- `src/pages/Notifications.tsx` — Notification feed (likes, comments, collabs, messages, follows)
- `src/pages/Messages.tsx` — 1-on-1 messaging system with sanitized search + 2000 char message limit
- `src/pages/Profile.tsx` — User profile with edit, follow, posts, collabs; bio max 300 chars, skills max 200 chars
- `src/components/PostCard.tsx` — Post card with like/comment/save + delete confirmation dialog (no image rendering)
- `src/components/CollabCard.tsx` — Collab listing card (uses `.collab-card` class); text/tags/embeds only, no images
- `src/components/SuggestedUsers.tsx` — Horizontally-scrollable suggested users carousel on Home feed; ranks by shared skills
- `src/components/FollowListModal.tsx` — Modal for viewing followers/following lists with inline follow/unfollow

### Backend (Supabase)
- **Project**: flforzblmdaysxaylate
- **Tables**: profiles, posts, comments, likes, saves, collab_posts, follows, messages, notifications, link_metadata
- **Storage**: avatars (public, 100KB max, MIME restricted to image/jpeg, image/png, image/webp, image/gif); post-images and collab-images buckets deprecated (no new uploads)
- **RLS**: Enabled on all tables with appropriate policies (authenticated role)
- **Indexes**: Full index coverage on user_id, created_at, post_id, sender_id, receiver_id, etc.
- **Trigger**: `on_auth_user_created` → `handle_new_user` auto-creates profiles on signup

### Key Decisions
- Posts limited to 196 characters (enforced both client-side and DB check constraint)
- Comments limited to 500 characters (client-side)
- Messages limited to 2000 characters (client-side)
- Bio limited to 300 characters, skills to 200 characters
- Collab title max 100 chars, description max 1000 chars, tags max 10 items
- Profile avatars max 100KB (enforced both client-side and Supabase bucket-level); `src/lib/imageUtils.ts` handles:
  - Center-crop to square + resize to 256×256
  - WebP-first format (JPEG fallback)
  - Progressive quality reduction (0.7 → 0.6 → 0.5 → 0.4)
  - Preview confirmation modal with original/compressed size display before upload
  - Old avatar files deleted before new upload (prevents orphaned files)
  - Filename sanitization (alphanumeric + safe chars only)
  - Hard error if compression can't reach ≤100KB
- `src/lib/featureFlags.ts` — centralized feature flags; `enable_post_images` and `enable_collab_images` both `false` (image upload removed from posts/collabs; can be re-enabled via flag)
- Collab Board is highlighted in nav with gradient + glow
- **Real-time subscriptions** via Supabase Realtime (postgres_changes):
  - Messages: instant delivery via `subscribeToMessages()`, fallback polling every 15s
  - Notifications: instant via `subscribeToNotifications()`, fallback polling every 30s
  - Home feed: new post indicator via `subscribeToNewPosts()` + delete sync via `subscribeToPostDeletes()`
- `src/lib/realtime.ts` — typed subscription helpers with auto-cleanup
- Messages: optimistic send, deduplication via `seenIdsRef` Set, multi-device sync via own-sent subscription
- Home feed: "N new posts — tap to refresh" banner appears for incoming posts from other users
- Notification store: `startRealtime(userId)` replaces `startPolling()`, uses realtime + 30s fallback
- Primary green: #16A34A (trybe-500), palette centered on this shade
- DM Sans font family
- Dark mode: Tailwind `darkMode: 'class'` strategy; `src/store/themeStore.ts` (Zustand) manages theme with localStorage persistence + system preference detection; toggle in desktop nav bar (Sun/Moon icon) and mobile kebab menu
- Premium design: soft shadows, rounded-3xl cards, glassmorphism nav, glow-green hover effects
- `.collab-card` CSS class provides distinct collab board styling with gradient border + green glow
- Custom shadow tokens: soft, soft-md, soft-lg, soft-xl, glow-green, glow-green-md
- `.avatar` CSS class for consistent avatar styling across app
- Smooth 300ms transitions throughout
- URL embed system: auto-detects YouTube, TikTok, Instagram, Twitter/X URLs in post content + embed_url field
  - `src/lib/urlUtils.ts` — URL detection, classification (video/social/generic categories), text segmentation
  - `src/components/EmbedRenderer.tsx` — Dynamic card selection engine with:
    - `LazyYouTubeEmbed` / `LazyTikTokEmbed` / `LazyInstagramEmbed`: IntersectionObserver lazy-loads iframes only when visible; YouTube auto-plays muted and pauses off-screen via postMessage API
    - `RichLinkPreview` (hero card): full OG image + title + description + favicon for single generic links
    - `CompactLinkCard`: condensed favicon + title row for stacking multiple generic links
    - `SmartLinkCard`: fetches OG metadata, picks hero vs compact vs fallback automatically
    - `EmbedStack`: smart multi-embed layout — video/social gets full card first, additional links stack compact
    - `EmbedSkeleton`: shimmer loading states for video, card, and compact layouts
    - Twitter/X URLs render as rich OG preview cards via SmartLinkCard
    - Graceful degradation: skeleton → rich card (if metadata found) → domain-only MinimalLinkCard (fallback)
  - `src/components/LinkedText.tsx` — Auto-linkifies URLs in post text
  - Unsupported URLs render as styled link preview cards with domain + icon
  - Link embeds are the primary rich-content format for posts (replaces image uploads)
- **Link metadata extraction system** (backend OG scraper):
  - `link_metadata` DB table caches URL metadata (title, description, og:image, site_name, favicon, domain) with 7-day TTL
  - `fetch-link-metadata` Supabase Edge Function: accepts URL, checks cache, fetches HTML, extracts OG/Twitter/meta tags, returns normalized metadata
  - `src/lib/linkMetadata.ts` — frontend helper with in-memory session cache + request deduplication
  - `src/components/EmbedRenderer.tsx` — `SmartLinkCard` auto-fetches OG metadata for unknown URLs, renders rich preview with image, title, description, favicon
  - Graceful degradation: shows loading skeleton → rich card (if metadata found) → plain domain card (fallback)
  - Edge function reads only first 50KB of HTML for performance; 8s timeout; service-role upsert for cache writes
- `src/lib/notifications.ts` — createNotification() helper for client-side notification triggers (skips self-notifications)
- Profile.tsx follower/following counts are clickable and open FollowListModal
- SuggestedUsers component: scores users by shared skills, complete profile, randomization; shows up to 8 suggestions on Home feed
- Package manager: npm
- Code splitting: Vite manual chunks (vendor, supabase, ui, state) + lazy-loaded pages

### Mobile Experience
- Mobile top header: glassmorphism bar with trybe logo, user avatar, and kebab menu (⋮)
- Kebab menu: dropdown with My Profile, Settings, and **Log Out** button (red, prominent)
- Mobile bottom nav: 5 items (Home, Collab, Post, Alerts, DMs) — reduced from 6 to avoid crowding
- "Me" tab removed from bottom nav since profile is accessible from the top header
- Safe area support: `safe-area-bottom` and `safe-area-top` CSS classes for notched devices
- Touch-optimized: `active:scale-95` and `active:scale-90` for tap feedback, `-webkit-tap-highlight-color: transparent`
- Menu auto-close on outside tap (mousedown + touchstart listeners)
- `pt-[72px]` main content padding accounts for fixed mobile header

### Security
- RLS on all tables — authenticated role only for write operations
- Notification policies restricted to authenticated role (not public)
- Username validation: alphanumeric + underscores, 3-30 characters
- Input length limits enforced on all user inputs
- Search inputs sanitized (SQL wildcards stripped)
- Post delete requires confirmation dialog
- Collab delete requires confirmation modal
- Storage: file listing restricted on collab-images bucket
- No console.log/debug statements in production code
- Avatar images validated for type and size before upload (profile only); Supabase bucket rejects >100KB and non-image MIME types
- Avatar display sizes: 40px (feed/lists), 80px (profile page), 28px (comments/nav header); all use same optimized 256×256 source

### Concurrency & Race Condition Hardening (50K Users)
- **Mutex guards** on all toggle operations (like, save, follow) using `useRef` locks
  - PostCard: `likingRef`, `savingRef` prevent double-tap race conditions
  - Profile: `followingRef` prevents follow/unfollow race
  - SuggestedUsers: per-user `followingRef` Set mutex + rate limiting
  - FollowListModal: per-user `followMutex` Set mutex + rate limiting
- **Optimistic rollback**: all toggle operations revert UI state on DB error
- **Double-submit prevention**: `sending` guard on message send, `submittingComment` on comments
- **Count floor protection**: `Math.max(0, c - 1)` prevents negative counts
- **Request deduplication**: AbortController cancels stale feed requests; `fetchingRef` prevents overlapping loads
- **Bounded queries**: conversation fetch limited to 200 messages; chat history limited to 200 messages; CollabBoard capped at 200 results; SuggestedUsers follows query capped at 1000
- **Search debounce**: 300ms debounce on Messages search to prevent query flood
- **Notification thundering herd prevention**: realtime appends directly instead of full re-fetch; deduplicates on append; pending retry queued when fetch is skipped
- **Username race condition**: catches DB unique constraint violation (23505) on concurrent signup
- **Stale closure fix**: Messages polling uses `activeChatRef` to avoid referencing old state
- **Parallel queries**: Profile page runs 6 DB queries via Promise.all instead of sequential awaits
- **O(1) enrichment**: Feed AND Profile use Set-based lookups for like/save status instead of O(n) .some()
- **Unique realtime channels**: channel names include counter + timestamp to prevent name collisions at scale
- **Realtime connection cap**: MAX_CHANNELS=10 per client prevents runaway subscriptions; double-cleanup idempotent
- **Optimistic message IDs**: use crypto.randomUUID() to prevent collisions under high concurrency
- **IntersectionObserver stability**: observers use stable deps (not data.length) to prevent churn under load
- **Retry with exponential backoff**: `withRetry()` helper in supabase.ts for transient failures (connection timeouts, too many connections, serialization failures)
- **Supabase realtime throttled**: eventsPerSecond=10 prevents event flooding
- **Comments pagination**: PostCard limits comments fetch to 50 per post to prevent payload explosion on popular threads
- **Stable callbacks**: Home feed uses memoized `handlePostUpdate` callback to prevent unnecessary PostCard re-renders
- **Rate limiting on ALL write surfaces**: SuggestedUsers follow, FollowListModal follow now rate-limited (previously unprotected)
- **Polling hardened for 50K users**: all polling intervals use scheduled setTimeout with random jitter (not setInterval) + visibility-aware pausing:
  - Messages: base 15s + 0-5s jitter; skips when tab hidden
  - Notifications: base 30s + 0-10s jitter; skips when tab hidden
- **Toast store capped**: max 5 toasts to prevent unbounded growth under load
- **Rate limiter memory pruning**: periodic pruning + MAX_MEMORY_ENTRIES=100 hard cap prevents memory leak
- **Auth ensureProfile optimized**: single atomic upsert instead of select-then-insert (halves DB round trips)
- **Notification helper error resilience**: try/catch prevents cascading failures from notification insert errors
- **Crash-safe submissions** (try/catch/finally + timeout protection):
  - CreatePost: `handleSubmit` wrapped in try/catch/finally with 15s timeout via Promise.race; `posting` flag always reset; double-submit guard
  - CollabBoard: `handleSave` and `handleDelete` wrapped in try/catch/finally with 15s timeout; `saving`/`deleting` flags always reset; toast errors on failure
  - PostCard: `deletePost` and `loadComments` wrapped in try/catch/finally; delete has double-click guard
  - Home feed: `fetchPosts` wrapped in try/catch; loading states reset on error
  - All submission handlers show user-visible error messages on uncaught exceptions
- **Stress test**: `stress-test.cjs` validates all 86 concurrency/performance/scale checks for 50K users

### Rate Limiting
- Client-side token bucket rate limiter in `src/lib/rateLimiter.ts`
- Per-user buckets persisted to localStorage (survives page refresh)
- Bucket limits: auth 5/min, writes 30/min, reads 60/min, messages:send 10/min, posts:create 5/min
- Sensitive actions (post create, message send) consume both their specific bucket and the shared writes bucket
- Integrated into: PostCard (like/save/comment), Messages (send + search), CreatePost (submit), CollabBoard (create/update), Profile (follow), Auth (login/signup)
- Toast notification system (`src/store/toastStore.ts` + `src/components/ToastHost.tsx`) shows user-friendly "try again in Xs" messages
- Two-phase bucket evaluation: all required buckets checked before committing tokens

### Performance
- Infinite scroll on Home feed (20 posts/page), Profile posts (15/page), Profile collabs (15/page), and Notifications (20/page) via IntersectionObserver with 300-400px rootMargin
- Profile page uses server-side post count for accurate stats display
- Code splitting with lazy-loaded pages (reduces initial bundle from 631KB to ~19KB entry + on-demand chunks)
- Lazy loading images with loading="lazy" attribute
- Database indexes on all frequently queried columns:
  - posts: user_id, created_at
  - comments: post_id, user_id
  - likes: user_id (plus existing composite unique on post_id+user_id)
  - saves: user_id (plus existing composite unique on post_id+user_id)
  - collab_posts: user_id, created_at, type
  - messages: sender_id, receiver_id, created_at, composite(sender_id, receiver_id, created_at)
  - follows: following_id (plus existing composite unique on follower_id+following_id)
  - notifications: user_id, created_at, composite(user_id, read)

### Collab Board enhancements
- Edit/Delete: owners see Edit + Delete buttons; delete has confirmation modal; RLS enforces ownership
- Geolocation: location_city, location_country, latitude, longitude fields; browser detection via BigDataCloud reverse geocode; manual entry supported
- Media: image upload removed (feature-flagged off); external_url field for link embeds
- Link embeds: YouTube/TikTok/Instagram auto-detected from external_url or description URLs; rendered via EmbedRenderer
- Location filter: dedicated MapPin input filters collabs by city or country
- `collab-images` Supabase storage bucket (public, 500KB limit, user-folder RLS)

### Profile customization system
- `profiles.profile_settings` JSONB column stores layout, accent color, featured items, and section toggles
- `src/lib/profileSettings.ts` — parser/defaults helper with ACCENT_PRESETS and LAYOUT_OPTIONS
- `src/components/ProfileCustomizer.tsx` — tabbed UI for layout (Classic/Grid/Showcase), accent color presets, and featured work picker with drag-to-reorder (Framer Motion Reorder)
- `src/components/ProfileFeaturedWork.tsx` — renders featured posts/collabs per layout: Classic (horizontal scroll), Grid (2-3 col), Showcase (hero + grid)
- Accent color applied via CSS variable `--accent` on profile container; profile header accent bar, links, and active tabs use it
- Featured items: max 6, mixed posts + collabs, ordered, silently drops deleted items
- Stats visibility toggle (showStats) hides follower/following/post counts
