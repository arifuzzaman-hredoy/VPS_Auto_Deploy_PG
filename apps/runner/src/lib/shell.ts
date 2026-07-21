import { spawn } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type RunCommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  onOutput?: (stream: 'stdout' | 'stderr', text: string) => void | Promise<void>;
};

function redact(value: string): string {
  return value
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1********@')
    .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1********')
    .replace(/(DEPLOY_TOKEN=)[^\s]+/gi, '$1********')
    .replace(/https:\/\/x-access-token:[^@\s]+@github\.com/gi, 'https://x-access-token:********@github.com');
}

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 3000).unref();
        }, options.timeoutMs)
      : undefined;

    const handleChunk = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
      const text = chunk.toString();
      if (stream === 'stdout') stdout += text;
      else stderr += text;
      void options.onOutput?.(stream, redact(text));
    };

    child.stdout.on('data', (chunk: Buffer) => handleChunk('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => handleChunk('stderr', chunk));
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ stdout, stderr });
      else {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        reject(new Error(`${command} ${args.join(' ')} failed with ${reason}: ${redact(stderr || stdout).trim()}`));
      }
    });
  });
}
