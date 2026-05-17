export const CHARACTER_VIDEO_QUALITIES = ['high', 'low'] as const;

export type CharacterVideoQuality = (typeof CHARACTER_VIDEO_QUALITIES)[number];

export const DEFAULT_CHARACTER_VIDEO_QUALITY: CharacterVideoQuality = 'high';

export const CHARACTER_VIDEO_GENERATION_MODES = ['lipsync_runware', 'lipsync_runpod'] as const;

export type CharacterVideoGenerationMode = (typeof CHARACTER_VIDEO_GENERATION_MODES)[number];

export const CHARACTER_VIDEO_QUALITY_LABELS: Record<CharacterVideoQuality, string> = {
  high: 'High-quality',
  low: 'Low-quality',
};

export const CHARACTER_VIDEO_QUALITY_TO_GENERATION_MODE: Record<CharacterVideoQuality, CharacterVideoGenerationMode> = {
  high: 'lipsync_runware',
  low: 'lipsync_runpod',
};

export const GENERATION_MODE_TO_CHARACTER_VIDEO_QUALITY: Record<CharacterVideoGenerationMode, CharacterVideoQuality> = {
  lipsync_runware: 'high',
  lipsync_runpod: 'low',
};

export function normalizeCharacterVideoQuality(value: unknown): CharacterVideoQuality {
  return value === 'low' ? 'low' : DEFAULT_CHARACTER_VIDEO_QUALITY;
}

export function normalizeCharacterVideoGenerationMode(value: unknown): CharacterVideoGenerationMode | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return CHARACTER_VIDEO_GENERATION_MODES.includes(normalized as CharacterVideoGenerationMode)
    ? normalized as CharacterVideoGenerationMode
    : null;
}

export function qualityForVideoGenerationMode(mode: CharacterVideoGenerationMode): CharacterVideoQuality {
  return GENERATION_MODE_TO_CHARACTER_VIDEO_QUALITY[mode];
}

