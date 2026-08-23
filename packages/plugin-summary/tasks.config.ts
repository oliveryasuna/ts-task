import {defineConfig, inDir, namespace} from '@oliveryasuna/ts-task';
import path from 'node:path';
import {buildDefFactory, ciDefFactory, lintDefFactory, typecheckDef, verifyDefFactory} from '../../shared/tasks';
import {build as tsTaskBuild} from '../ts-task/tasks.config';
import {summaryReporter} from './src';

const typecheck = namespace('plugin-summary').task(typecheckDef);

const build = namespace('plugin-summary').task(buildDefFactory({
  deps: [
    inDir(path.resolve(import.meta.dirname, '../ts-task'), tsTaskBuild),
    typecheck.with({project: 'tsconfig.build.json'})
  ]
}));

const lint = namespace('plugin-summary').task(lintDefFactory());

const verify = namespace('plugin-summary').task(verifyDefFactory({
  deps: [
    lint,
    typecheck.with({project: 'tsconfig.build.json'}),
    build
  ]
}));

const ci = namespace('plugin-summary').task(ciDefFactory({deps: [verify]}));

const prepack = namespace('plugin-summary').task({
  name: 'prepack',
  description: 'Prepare the package for publication',
  deps: [verify],
  run: ((ctx) => {
    ctx.log.info('package prepared for publication');
  })
});

export default defineConfig({
  plugins: [summaryReporter()],
  tasks: [
    build,
    lint,
    verify,
    ci,
    prepack
  ],
  defaultTask: 'plugin-summary:verify'
});
