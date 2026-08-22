import {summaryReporter} from '@oliveryasuna/ts-task-summary';
import {defineConfig, task} from './packages/ts-task/src';
import {sh} from './shared/helpers';
import {lint, typecheck} from './shared/tasks';

//==================================================
// Tasks
//==================================================

const formatPkg = task({
  name: 'format-pkg',
  description: 'Normalize package.json field order with syncpack',
  run: (async(ctx) => {
    await sh(ctx, 'syncpack', ['format']);
    ctx.log.info('package.json formatted');
  })
});

const verify = task({
  name: 'verify',
  description: 'Verify the project',
  deps: [
    lint,
    typecheck.with({project: 'tsconfig.config.json'})
  ],
  run: (async(ctx) => {
    ctx.log.info('Project verified');
  })
});

export default defineConfig({
  plugins: [summaryReporter()],
  tasks: [
    formatPkg,
    verify
  ],
  defaultTask: 'verify'
});
