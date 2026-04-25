import { supabase } from './supabase';
import type { NotificationType } from '../types';

/**
 * Create a notification for a user.
 * Silently skips if actor === recipient (no self-notifications).
 * Includes error handling to prevent cascading failures at scale.
 */
export async function createNotification({
  userId,
  actorId,
  type,
  referenceId,
  content,
}: {
  userId: string;
  actorId: string;
  type: NotificationType;
  referenceId?: string;
  content?: string;
}) {
  // Don't notify yourself
  if (userId === actorId) return;

  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      actor_id: actorId,
      type,
      reference_id: referenceId || null,
      content: content || null,
    });
  } catch {
    // Non-critical — notification failures should never break the main action
  }
}
