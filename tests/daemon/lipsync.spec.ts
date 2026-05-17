import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

const runNpmCommandMock = vi.fn(async ({ logDir }: any) => {
  await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, 'lipsync-runware.log');
  await fs.writeFile(logPath, 'ok', 'utf8');
  return { logPath, displayCommand: 'npm run -s lipsync:runware -- ...' };
});

vi.mock('../../scripts/daemon/helpers/video/run-npm-command', () => ({
  runNpmCommand: runNpmCommandMock,
}));

describe('runLipsyncRunware', () => {
  let baseDir: string;
  let charactersWorkspace: string;
  let logDir: string;
  let imagePath: string;
  let audioPath: string;
  let runLipsyncRunware: typeof import('../../scripts/daemon/helpers/lipsync').runLipsyncRunware;
  let runLipsyncRunpod: typeof import('../../scripts/daemon/helpers/lipsync').runLipsyncRunpod;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-lipsync-'));
    charactersWorkspace = path.join(baseDir, 'chars');
    logDir = path.join(baseDir, 'logs');
    imagePath = path.join(baseDir, 'character.png');
    audioPath = path.join(baseDir, 'voice.wav');
    await fs.mkdir(charactersWorkspace, { recursive: true });
    await fs.writeFile(imagePath, 'image', 'utf8');
    await fs.writeFile(audioPath, 'audio', 'utf8');
    runNpmCommandMock.mockReset();
    vi.resetModules();
    ({ runLipsyncRunware, runLipsyncRunpod } = await import('../../scripts/daemon/helpers/lipsync'));
  });

  afterEach(async () => {
    delete process.env.DAEMON_USE_FAKE_CLI;
    await fs.rm(baseDir, { recursive: true, force: true }).catch(() => {});
  });

  it('runs minimal runware CLI args and resolves output file', async () => {
    runNpmCommandMock.mockImplementationOnce(async ({ logDir: runLogDir, cwd }: any) => {
      await fs.mkdir(runLogDir, { recursive: true });
      const logPath = path.join(runLogDir, 'lipsync-runware.log');
      await fs.writeFile(logPath, 'ok', 'utf8');
      const outDir = path.join(cwd, 'tmp', 'lipsync-runware');
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, `lipsync-${Date.now()}.mp4`), 'video', 'utf8');
      return { logPath, displayCommand: 'npm run -s lipsync:runware -- ...' };
    });

    const result = await runLipsyncRunware({
      projectId: 'p1',
      charactersWorkspace,
      commandsWorkspaceRoot: baseDir,
      logDir,
      audioPath,
      imagePath,
      prompt: 'emotion: neutral',
    });

    expect(runNpmCommandMock).toHaveBeenCalledTimes(1);
    const args: string[] = runNpmCommandMock.mock.calls[0][0].args;
    expect(args).toEqual([
      'run',
      '-s',
      'lipsync:runware',
      '--',
      '--image',
      path.resolve(imagePath),
      '--audio',
      path.resolve(audioPath),
      '--prompt',
      'emotion: neutral',
    ]);
    expect(args).not.toContain('--model');
    expect(args).not.toContain('--output');
    await expect(fs.access(result.outputPath)).resolves.toBeUndefined();
    expect(result.logPath.endsWith('.log')).toBe(true);
  });

  it('creates dummy output in fake CLI mode when command does not generate file', async () => {
    process.env.DAEMON_USE_FAKE_CLI = '1';
    runNpmCommandMock.mockResolvedValueOnce({
      logPath: path.join(logDir, 'lipsync-runware.log'),
      displayCommand: 'npm run -s lipsync:runware -- ...',
    });

    const result = await runLipsyncRunware({
      projectId: 'p2',
      charactersWorkspace,
      commandsWorkspaceRoot: baseDir,
      logDir,
      audioPath,
      imagePath,
      prompt: 'emotion: angry',
    });

    expect(result.outputPath).toContain(path.join('tmp', 'lipsync-runware'));
    await expect(fs.access(result.outputPath)).resolves.toBeUndefined();
  });

  it('fails fast when prompt is empty', async () => {
    await expect(runLipsyncRunware({
      projectId: 'p3',
      charactersWorkspace,
      commandsWorkspaceRoot: baseDir,
      logDir,
      audioPath,
      imagePath,
      prompt: '   ',
    })).rejects.toThrow('videoGeneration.lipsyncPrompt is required');
    expect(runNpmCommandMock).not.toHaveBeenCalled();
  });

  it('fails when runware output file is not produced in non-fake mode', async () => {
    delete process.env.DAEMON_USE_FAKE_CLI;
    runNpmCommandMock.mockResolvedValueOnce({
      logPath: path.join(logDir, 'lipsync-runware.log'),
      displayCommand: 'npm run -s lipsync:runware -- ...',
    });

    await expect(runLipsyncRunware({
      projectId: 'p4',
      charactersWorkspace,
      commandsWorkspaceRoot: baseDir,
      logDir,
      audioPath,
      imagePath,
      prompt: 'emotion: neutral',
    })).rejects.toThrow('did not produce an output video');
  });

  it('runs runpod CLI with an explicit output file', async () => {
    runNpmCommandMock.mockImplementationOnce(async ({ logDir: runLogDir, args }: any) => {
      await fs.mkdir(runLogDir, { recursive: true });
      const logPath = path.join(runLogDir, 'lipsync-runpod.log');
      await fs.writeFile(logPath, 'ok', 'utf8');
      const outputPath = args[args.indexOf('--output') + 1];
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, 'video', 'utf8');
      return { logPath, displayCommand: 'npm run -s lipsync:runpod -- ...' };
    });

    const result = await runLipsyncRunpod({
      projectId: 'p5',
      charactersWorkspace,
      commandsWorkspaceRoot: baseDir,
      logDir,
      audioPath,
      imagePath,
    });

    expect(runNpmCommandMock).toHaveBeenCalledTimes(1);
    const args: string[] = runNpmCommandMock.mock.calls[0][0].args;
    expect(args).toEqual([
      'run',
      '-s',
      'lipsync:runpod',
      '--',
      '--image',
      path.resolve(imagePath),
      '--audio',
      path.resolve(audioPath),
      '--output',
      expect.stringContaining(path.join('tmp', 'lipsync-runpod', 'lipsync-')),
    ]);
    await expect(fs.access(result.outputPath)).resolves.toBeUndefined();
    expect(result.command).toBe('npm run -s lipsync:runpod -- ...');
  });
});
