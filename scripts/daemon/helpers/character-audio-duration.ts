import { execFile } from 'node:child_process';
import path from 'path';
import { promisify } from 'node:util';
import { log } from './logger';
import { CHARACTER_PROJECT_TARGET_DURATION_SECONDS } from '@/shared/constants/character-project';

const execFileAsync = promisify(execFile);

export const CHARACTER_AUDIO_MAX_SECONDS = CHARACTER_PROJECT_TARGET_DURATION_SECONDS;
export const CHARACTER_AUDIO_TARGET_SECONDS = 19.98;
export const CHARACTER_AUDIO_SPEED_SAFETY_MULTIPLIER = 1.001;
export const CHARACTER_AUDIO_MAX_CLAMP_ATTEMPTS = 3;

export type CharacterAudioClampResult = {
  path: string;
  originalDurationSeconds: number;
  finalDurationSeconds: number;
  processed: boolean;
  attempts: number;
};

type ClampOptions = {
  projectId: string;
  languageCode: string;
  inputPath: string;
};

export async function clampCharacterAudioDuration(options: ClampOptions): Promise<CharacterAudioClampResult> {
  const originalDurationSeconds = await probeAudioDurationSeconds(options.inputPath);
  if (originalDurationSeconds <= CHARACTER_AUDIO_MAX_SECONDS) {
    return {
      path: options.inputPath,
      originalDurationSeconds,
      finalDurationSeconds: originalDurationSeconds,
      processed: false,
      attempts: 0,
    };
  }

  let currentPath = options.inputPath;
  let currentDurationSeconds = originalDurationSeconds;
  let lastOutputPath = options.inputPath;

  for (let attempt = 1; attempt <= CHARACTER_AUDIO_MAX_CLAMP_ATTEMPTS; attempt += 1) {
    const speed = calculateSpeedFactor(currentDurationSeconds);
    const outputPath = buildAttemptPath(options.inputPath, attempt);
    await speedUpAudio(currentPath, outputPath, speed);
    const finalDurationSeconds = await probeAudioDurationSeconds(outputPath);

    log.info('Character audio duration clamp attempt completed', {
      projectId: options.projectId,
      languageCode: options.languageCode,
      attempt,
      inputPath: currentPath,
      outputPath,
      originalDurationSeconds,
      previousDurationSeconds: currentDurationSeconds,
      finalDurationSeconds,
      speed,
    });

    lastOutputPath = outputPath;
    if (finalDurationSeconds <= CHARACTER_AUDIO_MAX_SECONDS) {
      return {
        path: outputPath,
        originalDurationSeconds,
        finalDurationSeconds,
        processed: true,
        attempts: attempt,
      };
    }

    currentPath = outputPath;
    currentDurationSeconds = finalDurationSeconds;
  }

  throw new Error(
    `Character audio is still longer than ${CHARACTER_AUDIO_MAX_SECONDS}s after ${CHARACTER_AUDIO_MAX_CLAMP_ATTEMPTS} clamp attempts: ${lastOutputPath}`,
  );
}

export async function probeAudioDurationSeconds(inputPath: string): Promise<number> {
  const result = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);
  const raw = `${result.stdout ?? ''}`.trim();
  const duration = Number.parseFloat(raw);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to read audio duration for ${inputPath}: ${raw || 'empty ffprobe output'}`);
  }
  return duration;
}

function calculateSpeedFactor(durationSeconds: number): number {
  return (durationSeconds / CHARACTER_AUDIO_TARGET_SECONDS) * CHARACTER_AUDIO_SPEED_SAFETY_MULTIPLIER;
}

async function speedUpAudio(inputPath: string, outputPath: string, speed: number) {
  const filter = buildAtempoFilter(speed);
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-filter:a',
    filter,
    '-vn',
    outputPath,
  ]);
}

function buildAtempoFilter(speed: number): string {
  if (!Number.isFinite(speed) || speed <= 1) {
    throw new Error(`Invalid audio speed factor: ${speed}`);
  }

  const factors: number[] = [];
  let remaining = speed;
  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }
  factors.push(remaining);
  return factors.map((factor) => `atempo=${formatAtempoFactor(factor)}`).join(',');
}

function formatAtempoFactor(value: number): string {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function buildAttemptPath(inputPath: string, attempt: number): string {
  const parsed = path.parse(inputPath);
  const ext = parsed.ext || '.wav';
  return path.join(parsed.dir, `${parsed.name}.character-20s-attempt-${attempt}${ext}`);
}
