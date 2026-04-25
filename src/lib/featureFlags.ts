/**
 * Feature flags for TRYBE
 * Centralized config for toggling features on/off without major rewrites.
 */

export const featureFlags = {
  /**
   * Enable image uploads for posts and collab listings.
   * Set to `true` to re-enable image upload functionality.
   * Profile avatars are always enabled regardless of this flag.
   */
  enable_post_images: false,
  enable_collab_images: false,
} as const;
