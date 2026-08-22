import {summaryReporter} from '@oliveryasuna/ts-task-summary';
import {build, lint, verify} from '../../shared/tasks';
import {defineConfig} from './src';

export default defineConfig({
  plugins: [summaryReporter()],
  tasks: [
    lint,
    build,
    verify
  ],
  defaultTask: 'verify'
});
