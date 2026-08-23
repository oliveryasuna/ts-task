import {summaryReporter} from '@oliveryasuna/ts-task-summary';
import {lintDefFactory, typecheckDef, verifyDefFactory} from 'shared/tasks';
import {mergeTasks} from './packages/plugin-merge-tasks/src';
import {defineConfig, task} from './packages/ts-task/src';
import {sh} from './shared/helpers';

const typecheck = task(typecheckDef);

const lint = task(lintDefFactory());

const formatPkg = task({
  name: 'format-pkg',
  description: 'Normalize package.json field order with syncpack',
  run: (async(ctx) => {
    await sh(ctx, 'syncpack', ['format']);
    ctx.log.info('package.json formatted');
  })
});

const verify = task(verifyDefFactory({
  deps: [
    lint,
    typecheck.with({project: 'tsconfig.config.json'})
  ]
}));

export default defineConfig({
  plugins: [
    summaryReporter(),
    (await mergeTasks(
      'packages/plugin-merge-tasks/tasks.config.ts',
      'packages/plugin-summary/tasks.config.ts',
      'packages/ts-task/tasks.config.ts'
    ))
  ],
  tasks: [
    formatPkg,
    verify
  ],
  defaultTask: 'verify'
});
