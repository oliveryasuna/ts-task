import {summaryReporter} from '@oliveryasuna/ts-task-summary';
import fs from 'node:fs/promises';
import path from 'node:path';
import {build, ci, lint, verify} from '../../shared/tasks';
import {defineConfig, task} from './src';

const copyReadme = task({
  name: 'copy-readme',
  description: 'Copy the README.md file from the repo root',
  run: (async(ctx) => {
    const sourcePath = path.resolve(ctx.cwd, '../../README.md');
    const targetPath = path.resolve(ctx.cwd, 'README.md');
    await fs.copyFile(sourcePath, targetPath);
  })
});

const prepack = task({
  name: 'prepack',
  description: 'Prepare the package for publication',
  deps: [
    verify,
    copyReadme
  ],
  run: ((ctx) => {
    ctx.log.info('package prepared for publication');
  })
});

export default defineConfig({
  plugins: [summaryReporter()],
  tasks: [
    lint,
    build,
    verify,
    ci,
    prepack
  ],
  defaultTask: 'verify'
});
