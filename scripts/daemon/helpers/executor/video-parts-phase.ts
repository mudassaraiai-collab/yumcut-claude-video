import path from 'path';
import { readFileSync } from 'fs';
import { promises as fs } from 'fs';
import { ProjectStatus } from '@/shared/constants/status';
import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { normalizeContentTone, type ContentTone } from '@/shared/constants/content-tone';
import { log } from '../logger';
import { getLanguageProgress, getTranscriptionSnapshot, setStatus, updateLanguageProgress, markLanguageFailure } from '../db';
import { renderVideoParts } from '../video';
import { isDummyScriptWorkspace, writeDummyMainVideo, writeDummyMergedVideo } from '../dummy-fallbacks';
import type { DaemonConfig } from '../config';
import type { CreationSnapshot } from './types';
import { determineEffectName, resolveProjectLanguagesFromSnapshot } from './project-utils';
import { createHandledError } from './error';
import { ensureProjectScaffold, ensureLanguageWorkspace, ensureLanguageLogDir, ensureTemplateWorkspace } from '../language-workspace';
import { isCustomTemplateData } from '@/shared/templates/custom-data';
import { refreshTemplateImagesFromStorage } from '../template-images';
import { resolveCharacterImagePath } from '../character-cache';
import { runLipsyncRunpod, runLipsyncRunware } from '../lipsync';
import type { CharacterVideoGenerationMode } from '@/shared/constants/character-video-quality';

type VideoPartsPhaseArgs = {
  projectId: string;
  cfg: CreationSnapshot;
  jobPayload: Record<string, unknown>;
  daemonConfig: DaemonConfig;
};

const VIDEO_TONE_PROMPTS_ROOT = path.resolve(__dirname, '../../assets/video-generation-tone-prompts');
const VIDEO_TONE_PROMPT_FILES = {
  angry: path.join(VIDEO_TONE_PROMPTS_ROOT, 'tone-angry.md'),
  playful: path.join(VIDEO_TONE_PROMPTS_ROOT, 'tone-playful.md'),
  normal: path.join(VIDEO_TONE_PROMPTS_ROOT, 'tone-normal.md'),
} as const;

let cachedVideoTonePrompts: {
  angry: string;
  playful: string;
  normal: string;
} | null = null;

export async function handleVideoPartsPhase({ projectId, cfg, jobPayload, daemonConfig }: VideoPartsPhaseArgs) {
  const projectScaffold = await ensureProjectScaffold(projectId);
  const agentWorkspace = projectScaffold.workspaceRoot;
  const videoPartsLogs: Record<string, string | null> = {};
  const mainVideoPaths: Record<string, string | null> = {};
  const workspaceByLanguage: Record<string, string> = {};
  const customTemplate = isCustomTemplateData(cfg.template?.customData);
  const templateWorkspace = customTemplate
    ? await ensureTemplateWorkspace(projectId, cfg.template?.code ?? null, cfg.template?.id ?? null).catch(() => null)
    : null;
  const recreateVideo = Boolean((jobPayload as any)?.recreateVideo || (jobPayload as any)?.reason === 'video_recreate');
  let projectLanguages: string[] = [];
  let pendingLanguages: string[] = [];
  let effectName: string | null = null;
  let includeCallToAction = true;
  let voiceExternalId: string | null = null;
  let videoGenerationMode: string | null = null;
  let lastAttempt: {
    languageCode: string | null;
    workspaceRoot: string | null;
    metadataJsonPath: string | null;
    logDir: string | null;
  } = { languageCode: null, workspaceRoot: null, metadataJsonPath: null, logDir: null };
  let lastAttemptLogPath: string | null = null;
  let lastAttemptCommand: string | null = null;

  try {
    projectLanguages = resolveProjectLanguagesFromSnapshot(cfg);
    const primaryLanguage = projectLanguages[0] ?? DEFAULT_LANGUAGE;
    const primaryInfo = await ensureLanguageWorkspace(projectId, primaryLanguage);
    const progress = await getLanguageProgress(projectId);
    const disabledLanguages = new Set(progress.progress.filter((row) => row.disabled).map((row) => row.languageCode));
    const activeLanguages = projectLanguages.filter((code) => !disabledLanguages.has(code));
    if (activeLanguages.length === 0) {
      throw new Error('No active languages available for video parts generation');
    }
    pendingLanguages = projectLanguages.filter((code) => {
      if (disabledLanguages.has(code)) return false;
      const entry = progress.progress.find((row) => row.languageCode === code);
      return !entry || !entry.videoPartsDone;
    });

    if (pendingLanguages.length === 0) {
      await setStatus(projectId, ProjectStatus.ProcessVideoMain, 'Video parts rendered', {
        videoPartsWorkspace: primaryInfo.languageWorkspace,
        videoPartsWorkspaceRoot: agentWorkspace,
        effectName: determineEffectName(projectId, cfg.template ?? null),
        completedLanguages: activeLanguages,
        failedLanguages: Array.from(disabledLanguages),
      });
      return;
    }

    effectName = determineEffectName(projectId, cfg.template ?? null);
    includeCallToAction = (cfg as any).includeCallToAction ?? true;
    voiceExternalId = (cfg as any).voiceId ?? null;
    const payloadVideoConfig = (jobPayload as any)?.videoGeneration as Record<string, unknown> | null | undefined;
    const snapshotVideoConfig = (cfg as any)?.videoGeneration as Record<string, unknown> | null | undefined;
    videoGenerationMode = normalizeMode(payloadVideoConfig?.mode) ?? normalizeMode(snapshotVideoConfig?.mode);
    const videoGeneration = resolveVideoGenerationConfig(cfg, jobPayload);
    videoGenerationMode = videoGeneration.mode ?? videoGenerationMode;
    if (customTemplate && recreateVideo && templateWorkspace) {
      await refreshTemplateImagesFromStorage({
        projectId,
        templateWorkspace: templateWorkspace.templateWorkspace,
        templateImages: (cfg as any).templateImages ?? [],
      });
    }

    const sharedImagesDir = await (async () => {
      const candidates = [
        path.join(agentWorkspace, 'template-images'),
        templateWorkspace ? path.join(templateWorkspace.templateWorkspace, 'images') : null,
        path.join(agentWorkspace, 'qwen-image-edit', 'prepared'),
        path.join(agentWorkspace, 'prepared'),
        path.join(agentWorkspace, 'images'),
        path.join(agentWorkspace, 'comics-vertical', 'prepared'),
        path.join(agentWorkspace, 'comics-vertical', 'images'),
        path.join(primaryInfo.languageWorkspace, 'qwen-image-edit', 'prepared'),
        path.join(primaryInfo.languageWorkspace, 'comics-vertical', 'prepared'),
        path.join(primaryInfo.languageWorkspace, 'comics-vertical', 'images'),
        path.join(primaryInfo.languageWorkspace, 'images'),
      ];
      for (const candidate of candidates) {
        if (!candidate) continue;
        try {
          const stat = await fs.stat(candidate);
          if (stat.isDirectory()) return candidate;
        } catch {
          // ignore missing candidate
        }
      }
      return null;
    })();
    const transcriptionSnapshot = await getTranscriptionSnapshot(projectId);
    const audioLocalPaths = (jobPayload as any)?.audioLocalPaths as Record<string, string | null> | undefined;
    const characterImagePath = videoGeneration.mode
      ? await resolveVideoCharacterImagePath({
          projectId,
          absoluteImagePath: cfg.characterSelection?.absoluteImagePath ?? null,
          imageUrl: cfg.characterSelection?.imageUrl ?? null,
        })
      : null;
    if (recreateVideo) {
      for (const languageCode of pendingLanguages) {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        const effectDir = path.join(workspaceRoot, 'video-basic-effects');
        const mergeDir = path.join(workspaceRoot, 'video-merge-layers');
        try { await fs.rm(effectDir, { recursive: true, force: true }); } catch {}
        try { await fs.rm(mergeDir, { recursive: true, force: true }); } catch {}
      }
    }
    for (const languageCode of pendingLanguages) {
      try {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        workspaceByLanguage[languageCode] = workspaceRoot;
        const metadataDir = path.join(workspaceRoot, 'metadata');
        const sentenceMetadataPath = path.join(metadataDir, 'transcript-sentences.json');
        const legacyMetadataPath = path.join(metadataDir, 'transcript-blocks.json');
        const metadataJsonPath = await pickMetadataPath({
          preferSentence: customTemplate,
          sentencePath: sentenceMetadataPath,
          legacyPath: legacyMetadataPath,
          languageCode,
        });

        const logDir = await ensureLanguageLogDir(languageInfo, 'video-parts');
        lastAttempt = {
          languageCode,
          workspaceRoot,
          metadataJsonPath,
          logDir,
        };
        lastAttemptLogPath = null;
        lastAttemptCommand = null;

        let partsResult: { logPath: string | null; command: string | null; mainVideoPath: string };
        if (videoGeneration.mode) {
          const voiceover = transcriptionSnapshot.finalVoiceovers?.[languageCode] ?? null;
          let audioLocalPath = audioLocalPaths?.[languageCode] ?? voiceover?.localPath ?? null;
          if (!audioLocalPath && languageCode === primaryLanguage) {
            audioLocalPath = transcriptionSnapshot.localPath;
          }
          if (!audioLocalPath) {
            throw new Error(`Voiceover audio not available locally for language ${languageCode}`);
          }
          const lipsyncResult = videoGeneration.mode === 'lipsync_runware'
            ? await runLipsyncRunware({
                projectId,
                charactersWorkspace: daemonConfig.charactersWorkspace,
                commandsWorkspaceRoot: agentWorkspace,
                logDir,
                audioPath: audioLocalPath,
                imagePath: characterImagePath!,
                prompt: videoGeneration.lipsyncPrompt,
              })
            : await runLipsyncRunpod({
                projectId,
                charactersWorkspace: daemonConfig.charactersWorkspace,
                commandsWorkspaceRoot: agentWorkspace,
                logDir,
                audioPath: audioLocalPath,
                imagePath: characterImagePath!,
              });
          const mainVideoPath = path.join(workspaceRoot, 'video-basic-effects', 'final', 'simple.1080p.mp4');
          await fs.mkdir(path.dirname(mainVideoPath), { recursive: true });
          await fs.copyFile(lipsyncResult.outputPath, mainVideoPath);
          partsResult = {
            logPath: lipsyncResult.logPath,
            command: lipsyncResult.command,
            mainVideoPath,
          };
        } else {
          partsResult = await renderVideoParts({
            projectId,
            workspaceRoot,
            commandsWorkspaceRoot: agentWorkspace,
            logDir,
            scriptWorkspaceV2: daemonConfig.scriptWorkspaceV2,
            metadataJsonPath,
            effectName,
            includeCallToAction,
            targetLanguage: languageCode,
            voiceExternalId,
            imagesDir: sharedImagesDir ?? undefined,
            clean: true,
            scriptMode: daemonConfig.scriptMode,
            isTemplateV2: customTemplate,
          });
        }
        videoPartsLogs[languageCode] = partsResult.logPath;
        mainVideoPaths[languageCode] = partsResult.mainVideoPath;
        lastAttemptLogPath = partsResult.logPath ?? null;
        lastAttemptCommand = partsResult.command ?? null;
        try {
          await updateLanguageProgress(projectId, { languageCode, videoPartsDone: true });
        } catch (err: any) {
          log.warn('Failed to persist video parts progress', {
            projectId,
            languageCode,
            error: err?.message || String(err),
          });
        }
      } catch (languageErr: any) {
        const logPathFromError = typeof languageErr?.logPath === 'string' ? languageErr.logPath : null;
        const commandFromError = typeof languageErr?.command === 'string' ? languageErr.command : null;
        lastAttemptLogPath = logPathFromError ?? lastAttemptLogPath;
        lastAttemptCommand = commandFromError ?? lastAttemptCommand;
        log.error('Video parts rendering failed for language', {
          projectId,
          languageCode,
          error: languageErr?.message || String(languageErr),
          metadataJsonPath: lastAttempt.metadataJsonPath,
          workspace: lastAttempt.workspaceRoot,
          logDir: lastAttempt.logDir,
          logPath: logPathFromError ?? lastAttemptLogPath ?? null,
          command: commandFromError ?? lastAttemptCommand ?? null,
        });
        videoPartsLogs[languageCode] = logPathFromError ?? null;
        delete mainVideoPaths[languageCode];
        await markLanguageFailure(projectId, languageCode, 'video_parts', languageErr?.message || String(languageErr));
      }
    }

    const updatedProgress = await getLanguageProgress(projectId);
    const failedLanguageList = updatedProgress.progress.filter((row) => row.disabled).map((row) => row.languageCode);
    const activeProgress = updatedProgress.progress.filter((row) => !row.disabled);
    if (activeProgress.length === 0) {
      throw new Error('Video parts generation left no active languages');
    }
    const remaining = updatedProgress.aggregate.videoParts.remaining;
    const completedLanguages = activeProgress.filter((row) => row.videoPartsDone).map((row) => row.languageCode);
    if (remaining.length > 0) {
      await setStatus(projectId, ProjectStatus.ProcessVideoPartsGeneration, 'Video parts rendering in progress', {
        videoPartsWorkspace: primaryInfo.languageWorkspace,
        videoPartsWorkspaceRoot: agentWorkspace,
        videoPartsLogs,
        mainVideoPaths,
        effectName,
        completedLanguages,
        pendingLanguages: remaining,
        videoPartsWorkspacesByLanguage: workspaceByLanguage,
        failedLanguages: failedLanguageList,
      });
    } else {
      await setStatus(projectId, ProjectStatus.ProcessVideoMain, 'Video parts rendered', {
        videoPartsWorkspace: primaryInfo.languageWorkspace,
        videoPartsWorkspaceRoot: agentWorkspace,
        videoPartsLogs,
        mainVideoPaths,
        effectName,
        completedLanguages,
        videoPartsWorkspacesByLanguage: workspaceByLanguage,
        failedLanguages: failedLanguageList,
      });
    }
  } catch (err: any) {
    const isDummyWorkspace = isDummyScriptWorkspace(daemonConfig.scriptWorkspaceV2);
    if (isDummyWorkspace && !videoGenerationMode) {
      const fallbackLanguages = projectLanguages.length > 0 ? projectLanguages : resolveProjectLanguagesFromSnapshot(cfg);
      const primaryLanguage = fallbackLanguages[0] ?? DEFAULT_LANGUAGE;
      const fallbackEffect = determineEffectName(projectId, cfg.template ?? null);
      const videoPartsLogs: Record<string, string | null> = {};
      const mainVideoPaths: Record<string, string> = {};
      const workspaceByLanguage: Record<string, string> = {};

      for (const languageCode of fallbackLanguages) {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        workspaceByLanguage[languageCode] = workspaceRoot;
        const fallbackFile = await writeDummyMainVideo(workspaceRoot);
        await writeDummyMergedVideo(workspaceRoot);
        videoPartsLogs[languageCode] = null;
        mainVideoPaths[languageCode] = fallbackFile;
        try {
          await updateLanguageProgress(projectId, { languageCode, videoPartsDone: true });
        } catch (updateErr: any) {
          log.warn('Failed to persist video parts progress in fallback', {
            projectId,
            languageCode,
            error: updateErr?.message || String(updateErr),
          });
        }
      }

      log.warn('Video parts placeholder applied after failure in test workspace', {
        projectId,
        error: err?.message || String(err),
      });
      await setStatus(projectId, ProjectStatus.ProcessVideoMain, 'Video parts rendered', {
        videoPartsWorkspace: primaryLanguage ? (await ensureLanguageWorkspace(projectId, primaryLanguage)).languageWorkspace : agentWorkspace,
        videoPartsWorkspaceRoot: agentWorkspace,
        videoPartsLogs,
        mainVideoPaths,
        effectName: fallbackEffect,
        completedLanguages: fallbackLanguages,
        pendingLanguages: [],
        videoPartsWorkspacesByLanguage: workspaceByLanguage,
      });
      return;
    }
    const failedLanguage = lastAttempt.languageCode ?? null;
    const logPathFromError = typeof err?.logPath === 'string' ? err.logPath : null;
    const commandFromError = typeof err?.command === 'string' ? err.command : null;
    const completedLanguages = Object.entries(mainVideoPaths)
      .filter(([, value]) => Boolean(value))
      .map(([code]) => code);

    log.error('Video parts rendering failed', {
      projectId,
      error: err?.message || String(err),
      failedLanguage,
      metadataJsonPath: lastAttempt.metadataJsonPath,
      workspace: lastAttempt.workspaceRoot,
      logDir: lastAttempt.logDir,
      logPath: logPathFromError ?? lastAttemptLogPath ?? (failedLanguage ? videoPartsLogs[failedLanguage] ?? null : null),
      command: commandFromError ?? lastAttemptCommand,
      pendingLanguages,
      completedLanguages,
      effectName,
      includeCallToAction,
      voiceExternalId,
      videoGenerationMode,
    });
    await setStatus(projectId, ProjectStatus.Error, 'Video parts rendering failed', {
      failedLanguage,
      logPath: logPathFromError ?? lastAttemptLogPath ?? null,
      command: commandFromError ?? lastAttemptCommand ?? null,
      metadataJsonPath: lastAttempt.metadataJsonPath ?? null,
      workspace: lastAttempt.workspaceRoot ?? null,
      logDir: lastAttempt.logDir ?? null,
      pendingLanguages,
      completedLanguages,
    });
    throw createHandledError('Video parts rendering failed', err);
  }
}

async function pickMetadataPath(params: {
  preferSentence: boolean;
  sentencePath: string;
  legacyPath: string;
  languageCode: string;
}): Promise<string> {
  const { preferSentence, sentencePath, legacyPath, languageCode } = params;
  if (preferSentence) {
    try {
      await fs.access(sentencePath);
      return sentencePath;
    } catch {
      throw new Error(`Sentence metadata missing for ${languageCode} at ${sentencePath}`);
    }
  }
  try {
    await fs.access(legacyPath);
    return legacyPath;
  } catch {
    throw new Error(`Metadata file missing for ${languageCode} at ${legacyPath}`);
  }
}

function resolveVideoGenerationConfig(cfg: CreationSnapshot, jobPayload: Record<string, unknown>): {
  mode: CharacterVideoGenerationMode | null;
  lipsyncPrompt: string;
} {
  const snapshotConfig = (cfg as any)?.videoGeneration as Record<string, unknown> | null | undefined;
  const payloadConfig = (jobPayload as any)?.videoGeneration as Record<string, unknown> | null | undefined;
  const mode = normalizeMode(payloadConfig?.mode) ?? normalizeMode(snapshotConfig?.mode);
  const promptValue = typeof payloadConfig?.lipsyncPrompt === 'string'
    ? payloadConfig.lipsyncPrompt
    : typeof snapshotConfig?.lipsyncPrompt === 'string'
      ? snapshotConfig.lipsyncPrompt
      : '';

  if (!mode) {
    return { mode: null, lipsyncPrompt: '' };
  }
  if (mode === 'lipsync_runpod') {
    return { mode, lipsyncPrompt: '' };
  }
  const basePrompt = promptValue.trim();
  if (!basePrompt) {
    throw new Error('videoGeneration.lipsyncPrompt is required for lipsync_runware mode');
  }
  const tone = normalizeContentTone((jobPayload as any)?.contentTone ?? (cfg as any)?.contentTone);
  const toneSuffix = tonePromptSuffix(tone);
  const lipsyncPrompt = [basePrompt, toneSuffix].filter((part) => part.length > 0).join(' ');
  return { mode, lipsyncPrompt };
}

function tonePromptSuffix(tone: ContentTone): string {
  const prompts = loadVideoTonePrompts();
  switch (tone) {
    case 'playful':
      return prompts.playful;
    case 'angry':
      return prompts.angry;
    case 'neutral':
    default:
      return prompts.normal;
  }
}

function loadVideoTonePrompts() {
  if (cachedVideoTonePrompts) return cachedVideoTonePrompts;

  const readPrompt = (filePath: string) => {
    const value = readFileSync(filePath, 'utf8').replace(/\r/g, '').trim();
    if (!value) throw new Error(`Video tone prompt file is empty: ${filePath}`);
    return value;
  };

  cachedVideoTonePrompts = {
    angry: readPrompt(VIDEO_TONE_PROMPT_FILES.angry),
    playful: readPrompt(VIDEO_TONE_PROMPT_FILES.playful),
    normal: readPrompt(VIDEO_TONE_PROMPT_FILES.normal),
  };
  return cachedVideoTonePrompts;
}

function normalizeMode(value: unknown): CharacterVideoGenerationMode | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized === 'lipsync_runware' || normalized === 'lipsync_runpod'
    ? normalized
    : null;
}

async function resolveVideoCharacterImagePath(params: {
  projectId: string;
  absoluteImagePath: string | null;
  imageUrl: string | null;
}): Promise<string> {
  const { projectId, absoluteImagePath, imageUrl } = params;
  if (absoluteImagePath && absoluteImagePath.trim().length > 0) {
    try {
      const stats = await fs.stat(absoluteImagePath);
      if (stats.isFile()) return absoluteImagePath;
    } catch {
      // Fall through to URL-based resolver.
    }
  }

  const resolved = await resolveCharacterImagePath({ projectId, imageUrl });
  if (!resolved) {
    throw new Error('Character image is required for lipsync mode');
  }
  return resolved;
}
