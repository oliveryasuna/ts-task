import {summaryReporter} from '@oliveryasuna/ts-task-summary';
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildDefFactory, ciDefFactory, lintDefFactory, typecheckDef, verifyDefFactory} from '../../shared/tasks';
import {defineConfig, namespace} from './src';

const typecheck = namespace('ts-task').task(typecheckDef);

const build = namespace('ts-task').task(buildDefFactory({deps: [typecheck.with({project: 'tsconfig.build.json'})]}));

const lint = namespace('ts-task').task(lintDefFactory());

const copyReadme = namespace('ts-task').task({
  name: 'copy-readme',
  description: 'Copy the README.md file from the repo root',
  run: (async(ctx) => {
    const sourcePath = path.resolve(ctx.cwd, '../../README.md');
    const targetPath = path.resolve(ctx.cwd, 'README.md');
    await fs.copyFile(sourcePath, targetPath);
  })
});

const verify = namespace('ts-task').task(verifyDefFactory({
  deps: [
    lint,
    typecheck.with({project: 'tsconfig.build.json'}),
    build
  ]
}));

const ci = namespace('ts-task').task(ciDefFactory({deps: [verify]}));

const prepack = namespace('ts-task').task({
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
    build,
    lint,
    verify,
    ci,
    prepack
  ],
  defaultTask: 'ts-task:verify'
});
export {
  build
};
