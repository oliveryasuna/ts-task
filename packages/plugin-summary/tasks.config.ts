import {defineConfig} from '@oliveryasuna/ts-task';
import {build, lint, verify} from '../../shared/tasks';
import {summaryReporter} from './src';

export default defineConfig({
  plugins: [summaryReporter()],
  tasks: [
    lint,
    build,
    verify
  ],
  defaultTask: 'verify'
});
