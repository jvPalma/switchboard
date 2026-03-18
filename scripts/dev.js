const { execSync, spawn } = require('child_process');
const esbuild = require('esbuild');
const path = require('path');

const sharedOptions = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  tsconfig: 'tsconfig.json',
  alias: {
    '@shared': path.resolve(__dirname, '../src/shared'),
    '@main': path.resolve(__dirname, '../src/main'),
    '@renderer': path.resolve(__dirname, '../src/renderer'),
    '@db': path.resolve(__dirname, '../src/db'),
  },
};

const nodeExternal = [
  'electron',
  'better-sqlite3',
  'node-pty',
  'electron-log',
  'electron-updater',
  'electron-reloader',
];

async function dev() {
  const mainCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/main/index.ts'],
    outfile: 'dist/main.js',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: nodeExternal,
  });

  const preloadCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/renderer/api/preload.ts'],
    outfile: 'dist/preload.js',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron'],
  });

  const rendererCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/renderer/index.ts'],
    outfile: 'public/app.bundle.js',
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
  });

  const workerCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/workers/scan-projects.ts'],
    outfile: 'dist/workers/scan-projects.js',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: nodeExternal,
  });

  await Promise.all([
    mainCtx.watch(),
    preloadCtx.watch(),
    rendererCtx.watch(),
    workerCtx.watch(),
  ]);

  console.log('Watching for changes...');

  // Initial build of codemirror bundle
  execSync('node scripts/build.js codemirror', { stdio: 'inherit' });

  // Launch Electron
  const electron = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    env: { ...process.env, SWITCHBOARD_DEV: '1' },
  });

  electron.on('close', () => {
    mainCtx.dispose();
    preloadCtx.dispose();
    rendererCtx.dispose();
    workerCtx.dispose();
    process.exit(0);
  });
}

dev().catch((err) => {
  console.error(err);
  process.exit(1);
});
