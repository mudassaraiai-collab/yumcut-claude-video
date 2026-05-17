import path from 'path';
import { promises as fs } from 'fs';
import { runNpmCommand } from './video/run-npm-command';
import { assertFileExists } from './video/assert-file-exists';

type RunLipsyncRunwareOptions = {
  projectId: string;
  charactersWorkspace: string;
  commandsWorkspaceRoot?: string | null;
  logDir: string;
  audioPath: string;
  imagePath: string;
  prompt: string;
};

type RunLipsyncRunwareResult = {
  logPath: string;
  command: string;
  outputPath: string;
};

type RunLipsyncRunpodOptions = {
  projectId: string;
  charactersWorkspace: string;
  commandsWorkspaceRoot?: string | null;
  logDir: string;
  audioPath: string;
  imagePath: string;
};

type RunLipsyncRunpodResult = {
  logPath: string;
  command: string;
  outputPath: string;
};

type VideoFileInfo = {
  path: string;
  mtimeMs: number;
};

const DEFAULT_RUNWARE_OUTPUT_DIR = path.join('tmp', 'lipsync-runware');
const DEFAULT_RUNPOD_OUTPUT_DIR = path.join('tmp', 'lipsync-runpod');
const FAKE_OUTPUT_BYTES = Buffer.from('DUMMY_LIPSYNC_VIDEO');

function useFakeVideoCli() {
  return process.env.DAEMON_FAKE_CLI === '1' || process.env.DAEMON_USE_FAKE_CLI === '1';
}

function normalizePrompt(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error('videoGeneration.lipsyncPrompt is required for lipsync_runware mode');
  }
  return value;
}

async function collectOutputVideos(outputDir: string): Promise<VideoFileInfo[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(outputDir);
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }

  const files: VideoFileInfo[] = [];
  for (const entry of entries) {
    if (!/^lipsync-.*\.mp4$/i.test(entry)) continue;
    const fullPath = path.join(outputDir, entry);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) continue;
      files.push({ path: fullPath, mtimeMs: stat.mtimeMs });
    } catch {
      // Ignore files deleted between readdir and stat.
    }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

function pickNewestAfterRun(before: VideoFileInfo[], after: VideoFileInfo[], startedAtMs: number): string | null {
  const beforeMap = new Map(before.map((item) => [item.path, item.mtimeMs]));
  for (const candidate of after) {
    const prevMtime = beforeMap.get(candidate.path);
    if (prevMtime === undefined) return candidate.path;
    if (candidate.mtimeMs > prevMtime + 1) return candidate.path;
    if (candidate.mtimeMs >= startedAtMs - 5) return candidate.path;
  }
  return null;
}

async function ensureFakeOutput(outputDir: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[.:]/g, '-');
  const outputPath = path.join(outputDir, `lipsync-${stamp}.mp4`);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, FAKE_OUTPUT_BYTES);
  return outputPath;
}

export async function runLipsyncRunware(options: RunLipsyncRunwareOptions): Promise<RunLipsyncRunwareResult> {
  const {
    projectId,
    charactersWorkspace,
    commandsWorkspaceRoot,
    logDir,
    audioPath,
    imagePath,
  } = options;
  const prompt = normalizePrompt(options.prompt);

  const resolvedAudioPath = path.resolve(audioPath);
  const resolvedImagePath = path.resolve(imagePath);
  await assertFileExists(resolvedAudioPath, 'lipsync audio');
  await assertFileExists(resolvedImagePath, 'lipsync character image');

  const outputDir = path.join(charactersWorkspace, DEFAULT_RUNWARE_OUTPUT_DIR);
  const before = await collectOutputVideos(outputDir);
  const startedAtMs = Date.now();

  const run = await runNpmCommand({
    projectId,
    cwd: charactersWorkspace,
    workspaceRoot: commandsWorkspaceRoot ?? null,
    args: [
      'run',
      '-s',
      'lipsync:runware',
      '--',
      '--image',
      resolvedImagePath,
      '--audio',
      resolvedAudioPath,
      '--prompt',
      prompt,
    ],
    logDir,
    logName: 'lipsync-runware',
  });

  const after = await collectOutputVideos(outputDir);
  let outputPath = pickNewestAfterRun(before, after, startedAtMs);
  if (!outputPath && useFakeVideoCli()) {
    outputPath = await ensureFakeOutput(outputDir);
  }
  if (!outputPath) {
    throw new Error(`lipsync:runware did not produce an output video in ${outputDir}`);
  }

  await assertFileExists(outputPath, 'lipsync output');
  return {
    logPath: run.logPath,
    command: run.displayCommand,
    outputPath,
  };
}

export async function runLipsyncRunpod(options: RunLipsyncRunpodOptions): Promise<RunLipsyncRunpodResult> {
  const {
    projectId,
    charactersWorkspace,
    commandsWorkspaceRoot,
    logDir,
    audioPath,
    imagePath,
  } = options;

  const resolvedAudioPath = path.resolve(audioPath);
  const resolvedImagePath = path.resolve(imagePath);
  await assertFileExists(resolvedAudioPath, 'runpod lipsync audio');
  await assertFileExists(resolvedImagePath, 'runpod lipsync character image');

  const outputDir = path.join(charactersWorkspace, DEFAULT_RUNPOD_OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[.:]/g, '-');
  let outputPath = path.join(outputDir, `lipsync-${stamp}.mp4`);

  const run = await runNpmCommand({
    projectId,
    cwd: charactersWorkspace,
    workspaceRoot: commandsWorkspaceRoot ?? null,
    args: [
      'run',
      '-s',
      'lipsync:runpod',
      '--',
      '--image',
      resolvedImagePath,
      '--audio',
      resolvedAudioPath,
      '--output',
      outputPath,
    ],
    logDir,
    logName: 'lipsync-runpod',
  });

  if (useFakeVideoCli()) {
    try {
      await assertFileExists(outputPath, 'runpod lipsync output');
    } catch {
      outputPath = await ensureFakeOutput(outputDir);
    }
  }

  await assertFileExists(outputPath, 'runpod lipsync output');
  return {
    logPath: run.logPath,
    command: run.displayCommand,
    outputPath,
  };
}
