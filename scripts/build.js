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

async function buildMain() {
  await esbuild.build({
    ...sharedOptions,
    entryPoints: ['src/main/index.ts'],
    outfile: 'dist/main.js',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: nodeExternal,
  });
}

async function buildPreload() {
  await esbuild.build({
    ...sharedOptions,
    entryPoints: ['src/renderer/api/preload.ts'],
    outfile: 'dist/preload.js',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron'],
  });
}

async function buildRenderer() {
  await esbuild.build({
    ...sharedOptions,
    entryPoints: ['src/renderer/index.ts'],
    outfile: 'public/app.bundle.js',
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
  });
}

async function buildWeb() {
  await esbuild.build({
    ...sharedOptions,
    entryPoints: ['src/web/index.ts'],
    outfile: 'dist/web.js',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: nodeExternal,
  });
}

async function buildWorker() {
  await esbuild.build({
    ...sharedOptions,
    entryPoints: ['src/workers/scan-projects.ts'],
    outfile: 'dist/workers/scan-projects.js',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: nodeExternal,
  });
}

async function buildCodeMirror() {
  await esbuild.build({
    entryPoints: ['public/codemirror-setup.js'],
    outfile: 'public/codemirror-bundle.js',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    minify: true,
    logLevel: 'info',
  });
}

const target = process.argv[2] || 'all';

const builds = {
  main: buildMain,
  preload: buildPreload,
  renderer: buildRenderer,
  web: buildWeb,
  worker: buildWorker,
  codemirror: buildCodeMirror,
  all: async () => {
    await Promise.all([
      buildMain(),
      buildPreload(),
      buildRenderer(),
      buildWeb(),
      buildWorker(),
      buildCodeMirror(),
    ]);
  },
};

const buildFn = builds[target];
if (!buildFn) {
  console.error(`Unknown build target: ${target}`);
  console.error(`Available: ${Object.keys(builds).join(', ')}`);
  process.exit(1);
}

buildFn().catch((err) => {
  console.error(err);
  process.exit(1);
});
