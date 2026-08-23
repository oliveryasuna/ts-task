import {summaryReporter} from '@oliveryasuna/ts-task-summary';
import {lintDefFactory, typecheckDef, verifyDefFactory} from 'shared/tasks';
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
  plugins: [summaryReporter()],
  tasks: [
    formatPkg,
    verify
  ],
  defaultTask: 'verify'
});
