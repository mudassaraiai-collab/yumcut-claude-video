import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

type ProgressRow = {
  languageCode: string;
  transcriptionDone: boolean;
  captionsDone: boolean;
  videoPartsDone: boolean;
  finalVideoDone: boolean;
  disabled?: boolean;
};

let progressState: ProgressRow[] = [];

function aggregateProgress(progress: ProgressRow[]) {
  const remaining = (field: keyof ProgressRow) => progress.filter((row) => !row[field]).map((row) => row.languageCode);
  return {
    transcription: { done: progress.length > 0 && remaining('transcriptionDone').length === 0, remaining: remaining('transcriptionDone') },
    captions: { done: progress.length > 0 && remaining('captionsDone').length === 0, remaining: remaining('captionsDone') },
    videoParts: { done: progress.length > 0 && remaining('videoPartsDone').length === 0, remaining: remaining('videoPartsDone') },
    finalVideo: { done: progress.length > 0 && remaining('finalVideoDone').length === 0, remaining: remaining('finalVideoDone') },
  };
}

const setStatus = vi.fn(async () => {});
const markLanguageFailure = vi.fn(async () => {});
const getCreationSnapshot = vi.fn(async () => ({}));
const getTranscriptionSnapshot = vi.fn(async (): Promise<any> => ({
  finalVoiceoverId: 'audio_1',
  localPath: null,
  storagePath: null,
  publicUrl: null,
  finalVoiceovers: {},
}));
const getLanguageProgress = vi.fn(async () => ({
  progress: progressState,
  aggregate: aggregateProgress(progressState),
}));
const updateLanguageProgress = vi.fn(async (_projectId: string, update: any) => {
  const languageCode = String(update.languageCode || 'en');
  const existing = progressState.find((row) => row.languageCode === languageCode);
  if (existing) {
    if (typeof update.videoPartsDone === 'boolean') existing.videoPartsDone = update.videoPartsDone;
  } else {
    progressState.push({
      languageCode,
      transcriptionDone: true,
      captionsDone: true,
      videoPartsDone: Boolean(update.videoPartsDone),
      finalVideoDone: false,
      disabled: false,
    });
  }
});

const runLipsyncRunware = vi.fn(async () => ({
  logPath: '/tmp/lipsync.log',
  command: 'npm run -s lipsync:runware -- ...',
  outputPath: '/tmp/lipsync.mp4',
}));

const runLipsyncRunpod = vi.fn(async () => ({
  logPath: '/tmp/lipsync-runpod.log',
  command: 'npm run -s lipsync:runpod -- ...',
  outputPath: '/tmp/lipsync-runpod.mp4',
}));

const renderVideoParts = vi.fn(async () => ({
  logPath: '/tmp/legacy.log',
  command: 'npm run -s video:basic-effects -- ...',
  mainVideoPath: '/tmp/legacy.mp4',
}));

vi.mock('../../scripts/daemon/helpers/db', () => ({
  getCreationSnapshot,
  getLanguageProgress,
  getTranscriptionSnapshot,
  setStatus,
  updateLanguageProgress,
  markLanguageFailure,
}));

vi.mock('../../scripts/daemon/helpers/lipsync', () => ({
  runLipsyncRunware,
  runLipsyncRunpod,
}));

vi.mock('../../scripts/daemon/helpers/video', () => ({
  renderVideoParts,
}));

describe('video parts lipsync mode', () => {
  let tmpRoot: string;
  let envPath: string;
  let executeForProject: typeof import('../../scripts/daemon/helpers/executor').executeForProject;
  let ProjectStatus: typeof import('@/shared/constants/status').ProjectStatus;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-video-parts-lipsync-'));
    envPath = path.join(tmpRoot, 'daemon.env');
    const scriptWorkspace = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_WORKSPACE');
    const scriptWorkspaceV2 = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_WORKSPACE_V2');
    const charactersWorkspace = path.resolve('tests/daemon/dummy-scripts/DAEMON_CHARACTERS_WORKSPACE');
    const captionWorkspace = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_CAPTION');
    const envContent = [
      'DAEMON_ID=daemon-video-parts-test',
      'DAEMON_API_BASE_URL=http://127.0.0.1:4000',
      'DAEMON_STORAGE_BASE_URL=http://127.0.0.1:5000',
      'DAEMON_API_PASSWORD=secret',
      'DAEMON_INTERVAL_MS=1000',
      'DAEMON_MAX_CONCURRENCY=1',
      'DAEMON_TASK_TIMEOUT_SECONDS=60',
      'DAEMON_REQUEST_TIMEOUT_MS=1000',
      'DAEMON_HEALTH_PATH=/api/daemon/health',
      'DAEMON_STORAGE_HEALTH_PATH=/api/storage/health',
      `DAEMON_SCRIPT_WORKSPACE=${scriptWorkspace}`,
      `DAEMON_SCRIPT_WORKSPACE_V2=${scriptWorkspaceV2}`,
      `DAEMON_CHARACTERS_WORKSPACE=${charactersWorkspace}`,
      `DAEMON_SCRIPT_CAPTION=${captionWorkspace}`,
      `DAEMON_PROJECTS_WORKSPACE=${tmpRoot}`,
      'DAEMON_AUDIO_DEFAULT_VOICE=Kore',
      'DAEMON_SCRIPT_MODE=fast',
    ].join('\n');
    await fs.writeFile(envPath, envContent, 'utf8');
    process.env.DAEMON_ENV_FILE = envPath;

    progressState = [{
      languageCode: 'en',
      transcriptionDone: true,
      captionsDone: true,
      videoPartsDone: false,
      finalVideoDone: false,
      disabled: false,
    }];
    setStatus.mockClear();
    updateLanguageProgress.mockClear();
    markLanguageFailure.mockClear();
    runLipsyncRunware.mockClear();
    runLipsyncRunpod.mockClear();
    renderVideoParts.mockClear();
    getTranscriptionSnapshot.mockReset();
    getCreationSnapshot.mockReset();

    vi.resetModules();
    ({ ProjectStatus } = await import('@/shared/constants/status'));
    ({ executeForProject } = await import('../../scripts/daemon/helpers/executor'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('uses lipsync runware for video parts and writes standard main video path', async () => {
    const projectId = 'project_lipsync';
    const languageWorkspace = path.join(tmpRoot, projectId, 'workspace', 'en');
    const metadataPath = path.join(languageWorkspace, 'metadata', 'transcript-blocks.json');
    const audioPath = path.join(tmpRoot, 'audio-en.wav');
    const imagePath = path.join(tmpRoot, 'character.png');
    const lipsyncOutputPath = path.join(tmpRoot, 'lipsync-out.mp4');
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify({ blocks: [{ id: 'b1' }] }), 'utf8');
    await fs.writeFile(audioPath, 'audio', 'utf8');
    await fs.writeFile(imagePath, 'image', 'utf8');
    await fs.writeFile(lipsyncOutputPath, 'video', 'utf8');

    getCreationSnapshot.mockResolvedValue({
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: true,
      useExactTextAsScript: false,
      durationSeconds: 30,
      targetLanguage: 'en',
      languages: ['en'],
      watermarkEnabled: true,
      captionsEnabled: true,
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      contentTone: 'neutral',
      videoGeneration: {
        mode: 'lipsync_runware',
        lipsyncPrompt: 'Keep expressions neutral and natural.',
      },
      characterSelection: {
        type: 'global',
        absoluteImagePath: imagePath,
        imageUrl: null,
      },
      template: null,
    });
    getTranscriptionSnapshot.mockResolvedValue({
      finalVoiceoverId: 'audio_1',
      localPath: audioPath,
      storagePath: '/audio/en.wav',
      publicUrl: 'https://example.com/audio/en.wav',
      finalVoiceovers: {
        en: {
          id: 'audio_1',
          path: '/audio/en.wav',
          publicUrl: 'https://example.com/audio/en.wav',
          localPath: audioPath,
        },
      },
    });
    runLipsyncRunware.mockResolvedValue({
      logPath: path.join(tmpRoot, 'lipsync.log'),
      command: 'npm run -s lipsync:runware -- ...',
      outputPath: lipsyncOutputPath,
    });

    await executeForProject(projectId, ProjectStatus.ProcessVideoPartsGeneration, {});

    expect(runLipsyncRunware).toHaveBeenCalledTimes(1);
    expect(runLipsyncRunware).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Emotion direction: neutral'),
    }));
    expect(renderVideoParts).not.toHaveBeenCalled();
    const mainVideoPath = path.join(languageWorkspace, 'video-basic-effects', 'final', 'simple.1080p.mp4');
    await expect(fs.access(mainVideoPath)).resolves.toBeUndefined();
    expect(updateLanguageProgress).toHaveBeenCalledWith(projectId, { languageCode: 'en', videoPartsDone: true });
    expect(setStatus).toHaveBeenCalledWith(
      projectId,
      ProjectStatus.ProcessVideoMain,
      'Video parts rendered',
      expect.objectContaining({
        completedLanguages: ['en'],
        mainVideoPaths: expect.objectContaining({ en: mainVideoPath }),
      }),
    );
  });

  it('fails when lipsync mode is enabled but lipsyncPrompt is missing', async () => {
    const projectId = 'project_lipsync_missing_prompt';
    const languageWorkspace = path.join(tmpRoot, projectId, 'workspace', 'en');
    const metadataPath = path.join(languageWorkspace, 'metadata', 'transcript-blocks.json');
    const audioPath = path.join(tmpRoot, 'audio-en.wav');
    const imagePath = path.join(tmpRoot, 'character.png');
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify({ blocks: [{ id: 'b1' }] }), 'utf8');
    await fs.writeFile(audioPath, 'audio', 'utf8');
    await fs.writeFile(imagePath, 'image', 'utf8');

    getCreationSnapshot.mockResolvedValue({
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: true,
      useExactTextAsScript: false,
      durationSeconds: 30,
      targetLanguage: 'en',
      languages: ['en'],
      watermarkEnabled: true,
      captionsEnabled: true,
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      videoGeneration: {
        mode: 'lipsync_runware',
        lipsyncPrompt: null,
      },
      characterSelection: {
        type: 'global',
        absoluteImagePath: imagePath,
        imageUrl: null,
      },
      template: null,
    });
    getTranscriptionSnapshot.mockResolvedValue({
      finalVoiceoverId: 'audio_1',
      localPath: audioPath,
      storagePath: '/audio/en.wav',
      publicUrl: 'https://example.com/audio/en.wav',
      finalVoiceovers: {
        en: {
          id: 'audio_1',
          path: '/audio/en.wav',
          publicUrl: 'https://example.com/audio/en.wav',
          localPath: audioPath,
        },
      },
    });

    await expect(
      executeForProject(projectId, ProjectStatus.ProcessVideoPartsGeneration, {}),
    ).rejects.toThrow();
    expect(runLipsyncRunware).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(
      projectId,
      ProjectStatus.Error,
      'Video parts rendering failed',
      expect.any(Object),
    );
  });

  it('uses lipsync runpod for low-quality video parts without requiring a prompt', async () => {
    const projectId = 'project_lipsync_runpod';
    const languageWorkspace = path.join(tmpRoot, projectId, 'workspace', 'en');
    const metadataPath = path.join(languageWorkspace, 'metadata', 'transcript-blocks.json');
    const audioPath = path.join(tmpRoot, 'audio-en.wav');
    const imagePath = path.join(tmpRoot, 'character.png');
    const lipsyncOutputPath = path.join(tmpRoot, 'lipsync-runpod-out.mp4');
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify({ blocks: [{ id: 'b1' }] }), 'utf8');
    await fs.writeFile(audioPath, 'audio', 'utf8');
    await fs.writeFile(imagePath, 'image', 'utf8');
    await fs.writeFile(lipsyncOutputPath, 'video', 'utf8');

    getCreationSnapshot.mockResolvedValue({
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: true,
      useExactTextAsScript: false,
      durationSeconds: 30,
      targetLanguage: 'en',
      languages: ['en'],
      watermarkEnabled: true,
      captionsEnabled: true,
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      contentTone: 'neutral',
      characterVideoQuality: 'low',
      videoGeneration: {
        mode: 'lipsync_runpod',
      },
      characterSelection: {
        type: 'global',
        absoluteImagePath: imagePath,
        imageUrl: null,
      },
      template: null,
    });
    getTranscriptionSnapshot.mockResolvedValue({
      finalVoiceoverId: 'audio_1',
      localPath: audioPath,
      storagePath: '/audio/en.wav',
      publicUrl: 'https://example.com/audio/en.wav',
      finalVoiceovers: {
        en: {
          id: 'audio_1',
          path: '/audio/en.wav',
          publicUrl: 'https://example.com/audio/en.wav',
          localPath: audioPath,
        },
      },
    });
    runLipsyncRunpod.mockResolvedValue({
      logPath: path.join(tmpRoot, 'lipsync-runpod.log'),
      command: 'npm run -s lipsync:runpod -- ...',
      outputPath: lipsyncOutputPath,
    });

    await executeForProject(projectId, ProjectStatus.ProcessVideoPartsGeneration, {});

    expect(runLipsyncRunpod).toHaveBeenCalledTimes(1);
    expect(runLipsyncRunpod).toHaveBeenCalledWith(expect.objectContaining({
      audioPath,
      imagePath,
    }));
    expect(runLipsyncRunware).not.toHaveBeenCalled();
    expect(renderVideoParts).not.toHaveBeenCalled();
    const mainVideoPath = path.join(languageWorkspace, 'video-basic-effects', 'final', 'simple.1080p.mp4');
    await expect(fs.access(mainVideoPath)).resolves.toBeUndefined();
  });

  it('injects angry tone into runware prompt for lipsync mode', async () => {
    const projectId = 'project_lipsync_angry_tone';
    const languageWorkspace = path.join(tmpRoot, projectId, 'workspace', 'en');
    const metadataPath = path.join(languageWorkspace, 'metadata', 'transcript-blocks.json');
    const audioPath = path.join(tmpRoot, 'audio-en.wav');
    const imagePath = path.join(tmpRoot, 'character.png');
    const lipsyncOutputPath = path.join(tmpRoot, 'lipsync-angry.mp4');
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify({ blocks: [{ id: 'b1' }] }), 'utf8');
    await fs.writeFile(audioPath, 'audio', 'utf8');
    await fs.writeFile(imagePath, 'image', 'utf8');
    await fs.writeFile(lipsyncOutputPath, 'video', 'utf8');

    getCreationSnapshot.mockResolvedValue({
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: true,
      useExactTextAsScript: false,
      durationSeconds: 30,
      targetLanguage: 'en',
      languages: ['en'],
      watermarkEnabled: true,
      captionsEnabled: true,
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      contentTone: 'angry',
      videoGeneration: {
        mode: 'lipsync_runware',
        lipsyncPrompt: 'Keep framing stable.',
      },
      characterSelection: {
        type: 'global',
        absoluteImagePath: imagePath,
        imageUrl: null,
      },
      template: null,
    });
    getTranscriptionSnapshot.mockResolvedValue({
      finalVoiceoverId: 'audio_1',
      localPath: audioPath,
      storagePath: '/audio/en.wav',
      publicUrl: 'https://example.com/audio/en.wav',
      finalVoiceovers: {
        en: {
          id: 'audio_1',
          path: '/audio/en.wav',
          publicUrl: 'https://example.com/audio/en.wav',
          localPath: audioPath,
        },
      },
    });
    runLipsyncRunware.mockResolvedValue({
      logPath: path.join(tmpRoot, 'lipsync-angry.log'),
      command: 'npm run -s lipsync:runware -- ...',
      outputPath: lipsyncOutputPath,
    });

    await executeForProject(projectId, ProjectStatus.ProcessVideoPartsGeneration, {});

    expect(runLipsyncRunware).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Emotion direction: angry'),
    }));
  });
});
