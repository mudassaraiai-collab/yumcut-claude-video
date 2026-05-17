import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const prismaMock = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  job: { findFirst: vi.fn() },
  projectCharacterSelection: { findUnique: vi.fn() },
  characterVariation: { findUnique: vi.fn() },
  userCharacterVariation: { findFirst: vi.fn() },
  projectTemplateImage: { findMany: vi.fn() },
  templateVoice: { findMany: vi.fn() },
}));
const assertDaemonAuthMock = vi.hoisted(() => vi.fn());
const getAdminVoiceProviderSettingsMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/auth', () => ({ assertDaemonAuth: assertDaemonAuthMock }));
vi.mock('@/server/admin/voice-providers', () => ({
  getAdminVoiceProviderSettings: getAdminVoiceProviderSettingsMock,
}));

function baseProject() {
  return {
    id: 'project-1',
    userId: 'user-1',
    templateId: null,
    currentDaemonId: null,
    template: null,
    voiceId: null,
    voiceProvider: null,
    languageVoiceAssignments: null,
    languageVoiceProviders: null,
    contentTone: 'neutral',
  };
}

describe('daemon creation snapshot videoGeneration fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertDaemonAuthMock.mockResolvedValue('daemon-1');
    getAdminVoiceProviderSettingsMock.mockResolvedValue({ enabledProviders: ['minimax'] });
    prismaMock.project.findFirst.mockResolvedValue(baseProject());
    prismaMock.projectCharacterSelection.findUnique.mockResolvedValue(null);
    prismaMock.projectTemplateImage.findMany.mockResolvedValue([]);
    prismaMock.templateVoice.findMany.mockResolvedValue([]);
  });

  it('adds default lipsync_runware config for legacy character payloads', async () => {
    prismaMock.job.findFirst.mockResolvedValue({
      payload: { projectExperience: 'character', targetLanguage: 'en', languages: ['en'] },
    });
    const route = await import('@/app/api/daemon/projects/[projectId]/creation-snapshot/route');

    const res = await route.GET(new NextRequest('http://localhost/api/daemon/projects/project-1/creation-snapshot'), {
      params: Promise.resolve({ projectId: 'project-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectExperience).toBe('character');
    expect(body.videoGeneration).toEqual({
      mode: 'lipsync_runware',
      lipsyncPrompt: expect.any(String),
    });
  });

  it('does not add lipsync config to story payloads', async () => {
    prismaMock.job.findFirst.mockResolvedValue({
      payload: { projectExperience: 'story', targetLanguage: 'en', languages: ['en'] },
    });
    const route = await import('@/app/api/daemon/projects/[projectId]/creation-snapshot/route');

    const res = await route.GET(new NextRequest('http://localhost/api/daemon/projects/project-1/creation-snapshot'), {
      params: Promise.resolve({ projectId: 'project-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectExperience).toBe('story');
    expect(body.videoGeneration).toBeNull();
  });

  it('preserves low-quality runpod character video config', async () => {
    prismaMock.job.findFirst.mockResolvedValue({
      payload: {
        projectExperience: 'character',
        targetLanguage: 'en',
        languages: ['en'],
        characterVideoQuality: 'low',
        videoGeneration: { mode: 'lipsync_runpod' },
      },
    });
    const route = await import('@/app/api/daemon/projects/[projectId]/creation-snapshot/route');

    const res = await route.GET(new NextRequest('http://localhost/api/daemon/projects/project-1/creation-snapshot'), {
      params: Promise.resolve({ projectId: 'project-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.characterVideoQuality).toBe('low');
    expect(body.videoGeneration).toEqual({ mode: 'lipsync_runpod' });
  });

  it('passes character creation settings flags to daemon snapshot', async () => {
    prismaMock.job.findFirst.mockResolvedValue({
      payload: {
        projectExperience: 'character',
        targetLanguage: 'en',
        languages: ['en'],
        includeDefaultMusic: false,
        addOverlay: false,
        includeCallToAction: true,
        watermarkEnabled: false,
        captionsEnabled: true,
        autoApproveScript: true,
        autoApproveAudio: true,
      },
    });
    const route = await import('@/app/api/daemon/projects/[projectId]/creation-snapshot/route');

    const res = await route.GET(new NextRequest('http://localhost/api/daemon/projects/project-1/creation-snapshot'), {
      params: Promise.resolve({ projectId: 'project-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectExperience).toBe('character');
    expect(body.includeDefaultMusic).toBe(false);
    expect(body.addOverlay).toBe(false);
    expect(body.includeCallToAction).toBe(true);
    expect(body.watermarkEnabled).toBe(false);
    expect(body.captionsEnabled).toBe(true);
    expect(body.autoApproveScript).toBe(true);
    expect(body.autoApproveAudio).toBe(true);
  });
});
