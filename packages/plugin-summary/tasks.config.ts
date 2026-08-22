import {defineConfig, task} from '@oliveryasuna/ts-task';
import {build, ci, lint, verify} from '../../shared/tasks';
import {summaryReporter} from './src';

const prepack = task({
  name: 'prepack',
  description: 'Prepare the package for publication',
  deps: [
    verify
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
