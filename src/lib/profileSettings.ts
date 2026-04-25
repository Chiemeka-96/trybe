import type { ProfileSettings, ProfileLayout, FeaturedItem } from '../types';

export const ACCENT_PRESETS = [
  { label: 'Trybe Green', value: '#16A34A' },
  { label: 'Ocean Blue', value: '#2563EB' },
  { label: 'Royal Purple', value: '#7C3AED' },
  { label: 'Sunset Orange', value: '#EA580C' },
  { label: 'Rose Pink', value: '#E11D48' },
  { label: 'Amber Gold', value: '#D97706' },
  { label: 'Teal', value: '#0D9488' },
  { label: 'Slate', value: '#475569' },
] as const;

export const LAYOUT_OPTIONS: { value: ProfileLayout; label: string; description: string }[] = [
  { value: 'classic', label: 'Classic', description: 'Clean & minimal with featured work in a row' },
  { value: 'grid', label: 'Grid', description: 'Dense grid showcasing more work at a glance' },
  { value: 'showcase', label: 'Showcase', description: 'Hero-style with a spotlight on your best work' },
];

export const MAX_FEATURED = 6;

const DEFAULT_SETTINGS: ProfileSettings = {
  version: 1,
  layout: 'classic',
  accentColor: '#16A34A',
  featured: [],
  sections: {
    showStats: true,
    bioPosition: 'top',
  },
};

export function getProfileSettings(raw: unknown): ProfileSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };

  const obj = raw as Record<string, unknown>;

  const layout = ['classic', 'grid', 'showcase'].includes(obj.layout as string)
    ? (obj.layout as ProfileLayout)
    : DEFAULT_SETTINGS.layout;

  const accentColor =
    typeof obj.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(obj.accentColor)
      ? obj.accentColor
      : DEFAULT_SETTINGS.accentColor;

  const featured = Array.isArray(obj.featured)
    ? (obj.featured as FeaturedItem[])
        .filter(
          (f) =>
            f &&
            typeof f === 'object' &&
            ['post', 'collab'].includes(f.type) &&
            typeof f.id === 'string'
        )
        .slice(0, MAX_FEATURED)
    : [];

  const sections =
    obj.sections && typeof obj.sections === 'object'
      ? {
          showStats:
            typeof (obj.sections as Record<string, unknown>).showStats === 'boolean'
              ? ((obj.sections as Record<string, unknown>).showStats as boolean)
              : DEFAULT_SETTINGS.sections.showStats,
          bioPosition: ['top', 'side'].includes(
            (obj.sections as Record<string, unknown>).bioPosition as string
          )
            ? ((obj.sections as Record<string, unknown>).bioPosition as 'top' | 'side')
            : DEFAULT_SETTINGS.sections.bioPosition,
        }
      : { ...DEFAULT_SETTINGS.sections };

  return {
    version: 1,
    layout,
    accentColor,
    featured,
    sections,
  };
}
