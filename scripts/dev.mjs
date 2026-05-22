import { spawn } from 'node:child_process';

const processes = [];
const shouldOpenBrowser = process.argv.includes('--open');
let openedBrowser = false;

function openExternalBrowser(url) {
  if (!shouldOpenBrowser || openedBrowser) {
    return;
  }

  openedBrowser = true;
  const opener =
    process.platform === 'win32'
      ? { command: 'cmd', args: ['/c', 'start', '""', url] }
      : process.platform === 'darwin'
        ? { command: 'open', args: [url] }
        : { command: 'xdg-open', args: [url] };

  const child = spawn(opener.command, opener.args, {
    stdio: 'ignore',
    detached: true,
    shell: false,
  });
  child.unref();
  console.log(`Opened Tron World in your system browser: ${url}`);
}

function run(name, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: options.captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  processes.push(child);

  if (options.captureOutput) {
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      const localUrl = text.match(/Local:\s+(http:\/\/[^\s]+)/)?.[1];
      if (localUrl) {
        openExternalBrowser(localUrl);
      }
    });

    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });
  }

  child.on('exit', (code, signal) => {
    if (signal) {
      return;
    }
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}.`);
      shutdown(code);
    }
  });
}

function shutdown(code = 0) {
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('backend', 'node', ['server/runtimeBackend.mjs']);
run('vite', 'vite', ['--host', '127.0.0.1'], { captureOutput: shouldOpenBrowser });
