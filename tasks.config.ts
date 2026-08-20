import type {ExecResult, Logger} from './src';
import {defineConfig, type as input, opt, task} from './src';

//==================================================
// Helpers
//==================================================

/**
 * ctx.exec resolves rather than rejects on a non-zero exit, so every command
 * needs an explicit check. Output is buffered, so it is only surfaced on
 * failure (otherwise a passing lint would dump its whole report).
 */
const sh = (async(
  ctx: {exec(c: string, a?: (readonly string[])): Promise<ExecResult>;
    log: Logger;},
  command: string,
  args: (readonly string[]) = []
): Promise<ExecResult> => {
  const result = (await ctx.exec(command, args));
  if(result.code !== 0) {
    if(result.stdout.trim()) {
      ctx.log.info(result.stdout.trimEnd());
    }
    if(result.stderr.trim()) {
      ctx.log.error(result.stderr.trimEnd());
    }

    // eslint-disable-next-line @stylistic/array-bracket-newline, @stylistic/array-element-newline -- Clean.
    throw (new Error(`${[command, ...args].join(' ')} exited ${result.code}`));
  }

  return result;
});

//==================================================
// Tasks
//==================================================

const checkBun = task({
  name: 'check-bun',
  description: 'Verify the Bun version',
  run: (async(ctx) => {
    await sh(
      ctx,
      'bun',
      [
        'run',
        './check-bun-version.ts'
      ]
    );
  })
});

/**
 * Not registered in `tasks` below: it declares an input, and there is no
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
  deps: [checkBun],
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

const formatPkg = task({
  name: 'format-pkg',
  description: 'Normalize package.json field order with syncpack',
  run: (async(ctx) => {
    await sh(ctx, 'syncpack', ['format']);
    ctx.log.info('package.json formatted');
  })
});

const build = task({
  name: 'build',
  description: 'Bundle with tsdown',
  deps: [typecheck.with({project: 'tsconfig.json'})],
  run: (async(ctx) => {
    await sh(ctx, 'tsdown');
    ctx.log.info('bundled');
  })
});

/** What CI runs. Nothing reachable from here mutates the working tree. */
const verify = task({
  name: 'verify',
  description: 'Everything CI checks',
  deps: [
    lint,
    build
  ],
  run: ((ctx) => {
    ctx.log.info('all checks passed');
  })
});

export default defineConfig({
  tasks: [
    checkBun,
    lint,
    formatPkg,
    build,
    verify
  ],
  defaultTask: 'verify'
});
