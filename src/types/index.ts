export type ProfileLayout = 'classic' | 'grid' | 'showcase';

export interface FeaturedItem {
  type: 'post' | 'collab';
  id: string;
}

export interface ProfileSettings {
  version: number;
  layout: ProfileLayout;
  accentColor: string;
  featured: FeaturedItem[];
  sections: {
    showStats: boolean;
    bioPosition: 'top' | 'side';
  };
}

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  skills: string[];
  links: { label: string; url: string }[];
  profile_settings?: ProfileSettings | Record<string, unknown>;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  /** @deprecated Image uploads removed — field kept for legacy data compatibility */
  image_url?: string | null;
  embed_url: string | null;
  created_at: string;
  profiles?: Profile;
  likes?: { id: string; user_id: string }[];
  comments?: Comment[];
  saves?: { id: string; user_id: string }[];
  like_count?: number;
  comment_count?: number;
  is_liked?: boolean;
  is_saved?: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: Profile;
}

export interface CollabPost {
  id: string;
  user_id: string;
  type: 'creator_listing' | 'opportunity';
  title: string;
  description: string;
  tags: string[];
  budget: string | null;
  location_city: string | null;
  location_country: string | null;
  latitude: number | null;
  longitude: number | null;
  /** @deprecated Image uploads removed — field kept for legacy data compatibility */
  image_url?: string | null;
  external_url: string | null;
  created_at: string;
  profiles?: Profile;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface LinkMetadata {
  id?: string;
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
  favicon: string | null;
  domain: string;
  fetched_at?: string;
  expires_at?: string;
}

export type NotificationType = 'like' | 'comment' | 'collab_request' | 'message' | 'follow';

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  type: NotificationType;
  reference_id: string | null;
  content: string | null;
  read: boolean;
  created_at: string;
  actor?: Profile;
}
