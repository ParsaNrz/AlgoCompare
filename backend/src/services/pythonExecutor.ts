import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SandboxExecutionResult, TestCase } from '../types';

interface ExecutePythonOptions {
  code: string;
  functionName: string | null;
  tests: TestCase[];
  timeoutMs?: number;
}

function getRunnerPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'sandbox', 'runner.py'),
    path.resolve(process.cwd(), 'src', 'sandbox', 'runner.py'),
    path.resolve(process.cwd(), 'backend', 'src', 'sandbox', 'runner.py')
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-sync
      require('node:fs').accessSync(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return candidates[0];
}

export async function executePython({
  code,
  functionName,
  tests,
  timeoutMs = 4000
}: ExecutePythonOptions): Promise<SandboxExecutionResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'algocompare-'));
  const inputPath = path.join(tempDir, 'input.json');
  const runnerPath = getRunnerPath();

  await fs.writeFile(
    inputPath,
    JSON.stringify({ code, functionName, tests: tests.map(({ id, args, label }) => ({ id, args, label })) }),
    'utf8'
  );

  return new Promise<SandboxExecutionResult>((resolve) => {
    const child = spawn('python3', [runnerPath, inputPath], {
      cwd: tempDir,
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        PYTHONNOUSERSITE: '1',
        PYTHONDONTWRITEBYTECODE: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 2_000_000) {
        timedOut = true;
        child.kill('SIGKILL');
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 200_000) {
        child.kill('SIGKILL');
      }
    });

    child.on('error', async (error) => {
      clearTimeout(timer);
      await fs.rm(tempDir, { recursive: true, force: true });
      resolve({
        ok: false,
        runtimeMs: 0,
        results: [],
        errorType: 'ExecutionError',
        message: `Could not start Python: ${error.message}`,
        stderr
      });
    });

    child.on('close', async () => {
      clearTimeout(timer);
      await fs.rm(tempDir, { recursive: true, force: true });

      if (timedOut) {
        resolve({
          ok: false,
          runtimeMs: timeoutMs,
          results: [],
          errorType: 'Timeout',
          message: `Execution timed out after ${timeoutMs} ms. The code may contain an infinite loop or may be too slow.`,
          stderr
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as SandboxExecutionResult;
        resolve({ ...parsed, stderr: stderr.trim() });
      } catch {
        resolve({
          ok: false,
          runtimeMs: 0,
          results: [],
          errorType: 'InvalidRunnerOutput',
          message: 'The Python sandbox did not return valid JSON.',
          stderr: `${stderr}\n${stdout.slice(0, 1000)}`.trim()
        });
      }
    });
  });
}
