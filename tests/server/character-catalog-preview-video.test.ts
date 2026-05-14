import { describe, expect, it } from 'vitest';

import { normalizePreviewVideoUrl, resolveCatalogPreviewVideo } from '@/server/character-catalog';

describe('character catalog preview video helpers', () => {
  it('normalizes stored relative public video paths to root-relative URLs', () => {
    expect(normalizePreviewVideoUrl('characters/brainrot/arcadopus/preview/preview.mp4'))
      .toBe('/characters/brainrot/arcadopus/preview/preview.mp4');
    expect(normalizePreviewVideoUrl('public/characters/brainrot/arcadopus/preview/preview.mp4'))
      .toBe('/characters/brainrot/arcadopus/preview/preview.mp4');
  });

  it('uses uploaded database video before static catalog overrides', () => {
    expect(resolveCatalogPreviewVideo({
      dbUrl: 'characters/brainrot/matteo/preview/preview.mp4',
      dbHasAudio: false,
      override: {
        previewVideoUrl: '/characters/brainrot/matteo/static-preview.mp4',
        previewVideoHasAudio: true,
      },
    })).toEqual({
      previewVideoUrl: '/characters/brainrot/matteo/preview/preview.mp4',
      previewVideoHasAudio: false,
    });
  });

  it('falls back to static catalog overrides when no uploaded video exists', () => {
    expect(resolveCatalogPreviewVideo({
      dbUrl: null,
      dbHasAudio: true,
      override: {
        previewVideoUrl: '/characters/brainrot/matteo/static-preview.mp4',
        previewVideoHasAudio: false,
      },
    })).toEqual({
      previewVideoUrl: '/characters/brainrot/matteo/static-preview.mp4',
      previewVideoHasAudio: false,
    });
  });
});
