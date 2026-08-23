import {defineConfig, inDir, namespace} from '@oliveryasuna/ts-task';
import path from 'node:path';
import {buildDefFactory, ciDefFactory, lintDefFactory, typecheckDef, verifyDefFactory} from '../../shared/tasks';
import {build as tsTaskBuild} from '../ts-task/tasks.config';

const typecheck = namespace('plugin-merge-tasks').task(typecheckDef);

const build = namespace('plugin-merge-tasks').task(buildDefFactory({
  deps: [
    inDir(path.resolve(import.meta.dirname, '../ts-task'), tsTaskBuild),
    typecheck.with({project: 'tsconfig.build.json'})
  ]
}));

const lint = namespace('plugin-merge-tasks').task(lintDefFactory());

const verify = namespace('plugin-merge-tasks').task(verifyDefFactory({
  deps: [
    lint,
    typecheck.with({project: 'tsconfig.build.json'}),
    build
  ]
}));

const ci = namespace('plugin-merge-tasks').task(ciDefFactory({deps: [verify]}));

const prepack = namespace('plugin-merge-tasks').task({
  name: 'prepack',
  description: 'Prepare the package for publication',
  deps: [verify],
  run: ((ctx) => {
    ctx.log.info('package prepared for publication');
  })
});

export default defineConfig({
  tasks: [
    build,
    lint,
    verify,
    ci,
    prepack
  ],
  defaultTask: 'plugin-merge-tasks:verify'
});
