import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';
import { createProjectSchema } from '@/server/validators/projects';

const prismaMock = {
  project: { findFirst: vi.fn() },
  job: { findFirst: vi.fn() },
  projectTemplateImage: { findMany: vi.fn() },
  character: { findUnique: vi.fn() },
  characterVariation: { findUnique: vi.fn() },
  userCharacter: { findFirst: vi.fn() },
  userCharacterVariation: { findFirst: vi.fn() },
};

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/api-user', () => ({ authenticateApiRequest: vi.fn() }));
vi.mock('@/server/admin/image-editor', () => ({
  getAdminImageEditorSettings: vi.fn(),
}));

import { authenticateApiRequest } from '@/server/api-user';
import { getAdminImageEditorSettings } from '@/server/admin/image-editor';

describe('project experience routing payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateApiRequest).mockResolvedValue({ userId: 'user-1', source: 'session' } as any);
    vi.mocked(getAdminImageEditorSettings).mockResolvedValue({ enabled: false });
    prismaMock.projectTemplateImage.findMany.mockResolvedValue([]);
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      title: 'Demo',
      prompt: 'Prompt',
      rawScript: null,
      status: ProjectStatus.Done,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      languages: ['en'],
      scripts: [],
      audios: [],
      videos: [],
      statusLog: [{ status: ProjectStatus.Done, extra: {} }],
      selection: null,
      template: null,
    });
  });

  it('defaults to story experience when payload does not specify mode', async () => {
    prismaMock.job.findFirst.mockResolvedValue({ payload: { durationSeconds: 60, languages: ['en'] } });
    const route = await import('@/app/api/projects/[projectId]/route');
    const req = new NextRequest('http://localhost/api/projects/p1');

    const res = await route.GET(req, { params: Promise.resolve({ projectId: 'p1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creation?.projectExperience).toBe('story');
  });

  it('returns character experience when payload marker is provided', async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      title: 'Demo',
      prompt: 'Prompt',
      rawScript: null,
      status: ProjectStatus.Done,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      languages: ['en'],
      scripts: [],
      audios: [],
      videos: [
        {
          id: 'video-final',
          path: 'projects/p1/video/final.mp4',
          publicUrl: 'https://cdn.test/final.mp4',
          isFinal: true,
          variant: null,
          languageCode: 'en',
        },
        {
          id: 'video-raw',
          path: 'projects/p1/video/raw.mp4',
          publicUrl: 'https://cdn.test/raw.mp4',
          isFinal: false,
          variant: 'raw',
          languageCode: 'en',
        },
      ],
      statusLog: [{ status: ProjectStatus.Done, extra: {} }],
      selection: null,
      template: null,
    });
    prismaMock.job.findFirst.mockResolvedValue({
      payload: {
        durationSeconds: 60,
        languages: ['en'],
        projectExperience: 'character',
      },
    });
    const route = await import('@/app/api/projects/[projectId]/route');
    const req = new NextRequest('http://localhost/api/projects/p1');

    const res = await route.GET(req, { params: Promise.resolve({ projectId: 'p1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creation?.projectExperience).toBe('character');
    expect(body.languageVariants?.[0]).toEqual(expect.objectContaining({
      finalVideoPath: 'https://cdn.test/final.mp4',
      rawVideoPath: 'https://cdn.test/raw.mp4',
    }));
  });
});

describe('createProjectSchema projectExperience', () => {
  it('accepts story and character markers', () => {
    const story = createProjectSchema.safeParse({ prompt: 'Story prompt', durationSeconds: 30, projectExperience: 'story' });
    const character = createProjectSchema.safeParse({ prompt: 'Character prompt', durationSeconds: 20, projectExperience: 'character' });

    expect(story.success).toBe(true);
    expect(character.success).toBe(true);
  });

  it('keeps stricter minimum for story payloads', () => {
    const storyTooShort = createProjectSchema.safeParse({ prompt: 'Story prompt', durationSeconds: 14, projectExperience: 'story' });
    expect(storyTooShort.success).toBe(false);
  });

  it('rejects unsupported markers', () => {
    const invalid = createProjectSchema.safeParse({ prompt: 'Prompt', durationSeconds: 30, projectExperience: 'legacy' });

    expect(invalid.success).toBe(false);
  });

  it('accepts slug-based character project payload', () => {
    const result = createProjectSchema.safeParse({
      prompt: 'Prompt',
      durationSeconds: 30,
      projectExperience: 'character',
      characterSlug: 'ada-mentor',
    });
    expect(result.success).toBe(true);
  });

  it('accepts public character video quality and rejects conflicting internal mode', () => {
    const low = createProjectSchema.safeParse({
      prompt: 'Prompt',
      durationSeconds: 20,
      projectExperience: 'character',
      characterVideoQuality: 'low',
    });
    const conflict = createProjectSchema.safeParse({
      prompt: 'Prompt',
      durationSeconds: 20,
      projectExperience: 'character',
      characterVideoQuality: 'low',
      videoGeneration: { mode: 'lipsync_runware' },
    });

    expect(low.success).toBe(true);
    expect(conflict.success).toBe(false);
  });

  it('rejects malformed character slug', () => {
    const result = createProjectSchema.safeParse({
      prompt: 'Prompt',
      durationSeconds: 30,
      characterSlug: 'Ada Mentor',
    });
    expect(result.success).toBe(false);
  });

  it('accepts supported content tones and rejects unknown ones', () => {
    const valid = createProjectSchema.safeParse({
      prompt: 'Prompt',
      durationSeconds: 30,
      contentTone: 'playful',
    });
    const invalid = createProjectSchema.safeParse({
      prompt: 'Prompt',
      durationSeconds: 30,
      contentTone: 'extreme',
    });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
