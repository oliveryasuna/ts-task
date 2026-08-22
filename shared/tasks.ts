import {type as input, opt, task} from '../packages/ts-task/src';
import {sh} from './helpers';

/**
 * Not registered in `tasks` directly: it declares an input, and there is no
 * `.with()` on a command line. It reaches the graph through `build` and
 * `verify` instead.
 */
const typecheck = task({
  name: 'typecheck',
  description: 'Type-check with tsc',
  // An input rather than an option: which project to check is decided by the
  // dependent, in TypeScript, not by whoever is at the terminal.
  input: input<{project: string;}>(),
  identity: (i => i.project),
  run: (async(ctx) => {
    await sh(
      ctx,
      'tsc',
      [
        '--noEmit',
        '--project',
        ctx.input.project
      ]
    );
    ctx.log.info(`${ctx.input.project} type-checks`);
  })
});

const lint = task({
  name: 'lint',
  description: 'Run ESLint',
  options: {
    fix: opt.boolean().describe('Apply autofixes').alias('f'),
    // Hyphenated keys are fine; the CLI renders them as --max-warnings.
    'max-warnings': opt.number().default(0).describe('Warnings tolerated before failing')
  },
  run: (async(ctx) => {
    await sh(
      ctx,
      'eslint',
      [
        ...(ctx.options.fix ? ['--fix'] : []),
        '--max-warnings',
        String(ctx.options['max-warnings'])
      ]
    );
    ctx.log.info(ctx.options.fix ? 'linted and fixed' : 'lint clean');
  })
});

const build = task({
  name: 'build',
  description: 'Bundle with tsdown',
  deps: [typecheck.with({project: 'tsconfig.build.json'})],
  run: (async(ctx) => {
    await sh(ctx, 'tsdown');
    ctx.log.info('bundled');
  })
});

const verify = task({
  name: 'verify',
  description: 'Verify the project',
  deps: [
    lint,
    typecheck.with({project: 'tsconfig.config.json'}),
    build
  ],
  run: ((ctx) => {
    ctx.log.info('all checks passed');
  })
});

/** What CI runs. Nothing reachable from here mutates the working tree. */
const ci = task({
  name: 'ci',
  description: 'Everything CI checks',
  deps: [
    lint,
    build
  ],
  run: ((ctx) => {
    ctx.log.info('all checks passed');
  })
});

export {
  typecheck,
  lint,
  build,
  verify,
  ci
};
