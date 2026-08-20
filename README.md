# ts-task

[![npm](https://img.shields.io/npm/v/@oliveryasuna/ts-task?logo=npm)](https://www.npmjs.com/package/@oliveryasuna/ts-task)

A task runner you configure in TypeScript, where the types actually reach across task boundaries.

Most task runners hand you YAML, or JSON, or a pile of untyped JavaScript. That's fine until one task depends on another and you want to pass something between them. Suddenly you're threading strings through a config the type checker knows nothing about, and a typo in a dependency name or a task's option only shows up when you run the thing. `ts-task` puts the whole build graph in a normal `.ts` file, so a task's dependencies, its inputs, and its CLI options are all just types. Wire a dependency up wrong, forget to bind an input, name two options the same thing, and it's a red squiggle in your editor rather than a surprise at the terminal.

This was originally written to build my own projects, and it turned out clean enough that I figured someone else might want it. I hope you find it useful too!

> [!NOTE]
> In case you're allergic to AI, rest easy knowing this project was handwritten (I wrote this in a day, so let me know if there are any issues). Documentation was AI-assisted.

## Install

```sh
bun add --global @oliveryasuna/ts-task

# or pnpm
pnpm add --global @oliveryasuna/ts-task

# or npm
npm install --global @oliveryasuna/ts-task

# or yarn
yarn add --global @oliveryasuna/ts-task
```

The runner itself ships as an ESM binary and runs on Node 22+ or Bun. Your config file is TypeScript and gets transpiled on the fly, so there's no build step between editing `tasks.config.ts` and running it.

## The idea

You put your tasks in a `tasks.config.ts` at the root of your project and default-export a config. Each task has a `name`, an optional `description`, and a `run` function that does the work:

```ts
import {defineConfig, task} from '@oliveryasuna/ts-task';

const lint = task({
  name: 'lint',
  description: 'Run ESLint',
  run: async(ctx) => {
    const result = await ctx.exec('eslint', ['.']);
    if(result.code !== 0) {
      throw new Error(`eslint exited ${result.code}`);
    }
    ctx.log.info('lint clean');
  }
});

export default defineConfig({
  tasks: [lint],
  defaultTask: 'lint'
});
```

Then run it:

```sh
tstask lint      # or just `tstask`, since lint is the default task
# aliases: tt, ts-task
```

`ctx` is where the work happens. It carries `exec` for running commands, `log` for scoped output, `cwd`, `env`, an `AbortSignal`, and (once you add them) the resolved `deps`, `input`, and `options`. One thing worth knowing up front: `ctx.exec` resolves on a non-zero exit instead of throwing, and it buffers output rather than streaming it. That's so a task can inspect the exit code and decide for itself, but it means you have to check `result.code` yourself, like above. In practice you'll write a little `sh` helper once and reuse it.

## Dependencies

List other tasks in `deps` and the runner makes sure they finish first. A task with no input goes in the array directly:

```ts
const build = task({
  name: 'build',
  deps: [lint],
  run: async(ctx) => {
    await ctx.exec('tsdown');
    ctx.log.info('bundled');
  }
});
```

The dependency graph is walked once, so a task that shows up as a dependency of three different tasks still runs exactly once, and its result is shared. Independent tasks run concurrently, capped at one less than your core count by default (tune it with `-j`). A cycle is caught before anything runs and reported with the path that closed the loop.

A dependency's output lands in `ctx.deps`, keyed by the task's name:

```ts
const compile = task({
  name: 'compile',
  run: async() => ({bytes: 4096})
});

const report = task({
  name: 'report',
  deps: [compile],
  run: (ctx) => {
    ctx.log.info(`compiled ${ctx.deps.compile.bytes} bytes`);
  }
});
```

`ctx.deps.compile` is fully typed as `{bytes: number}`, inferred straight from `compile`'s `run`. Nothing is stringly-typed here.

## Inputs and options

These are the two ways to feed a task, and the difference between them is the whole point, so it's worth being precise.

An **option** comes from the command line and is global to the run. You declare it with `opt`, and it becomes a real CLI flag:

```ts
const lint = task({
  name: 'lint',
  options: {
    fix: opt.boolean().describe('Apply autofixes').alias('f'),
    'max-warnings': opt.number().default(0).describe('Warnings tolerated before failing')
  },
  run: async(ctx) => {
    const args = ctx.options.fix ? ['--fix'] : [];
    // ctx.options.fix is boolean, ctx.options['max-warnings'] is number
  }
});
```

An **input** comes from the *dependent* task, in TypeScript, at the point the dependency is wired up. It never touches the command line and it's never parsed from a string. You declare its shape with `type`, and a task that has one is bound with `.with(...)`:

```ts
import {defineConfig, task, type as input, opt} from '@oliveryasuna/ts-task';

const typecheck = task({
  name: 'typecheck',
  input: input<{project: string}>(),
  run: async(ctx) => {
    await ctx.exec('tsc', ['--noEmit', '--project', ctx.input.project]);
  }
});

const build = task({
  name: 'build',
  deps: [typecheck.with({project: 'tsconfig.json'})],
  run: async(ctx) => { /* ... */ }
});
```

So: whoever's at the terminal picks options; the config author picks inputs. A task that declares an input can't be a command-line entry point, because there's no `.with()` on a command line and its `ctx.input` would be empty. The type checker won't let you list it in `tasks` for that reason, and it won't let you list it as a dependency without binding it either. `typecheck` above stays perfectly reachable through `build`, it just isn't something you type at the shell.

## Namespaces

Task IDs can be qualified with `:`, like `build:compile`, which keeps related tasks grouped without long unwieldy names. The key a dependency shows up under in `ctx.deps` defaults to the last segment, so namespacing never forces you into bracket access:

```ts
import {namespace} from '@oliveryasuna/ts-task';

const build = namespace('build');

const compile = build.task({name: 'compile', run: /* ... */});
// its id is 'build:compile', and a dependent reads ctx.deps.compile
```

If two dependencies happen to share a last segment, rename one edge with `.as('somethingElse')`. That collision is caught at compile time too, with a message telling you which key clashed.

## Caching

The runner doesn't ship a cache. What it ships is the two seams a cache needs, and you decide how much of it you want.

A **`CacheStore`** at the config level is where entries live. A **cache policy**, attached to a task with `.cached(...)`, decides whether that task participates, what its cache key is, and how its output is serialized. A task with no policy always runs; a config with no store ignores every policy. So you can opt in one task at a time.

```ts
const build = task({
  name: 'build',
  run: async(ctx) => ({hash: 'abc123'})
}).cached({
  key: (ctx) => JSON.stringify([ctx.taskId, sourceFileHash()]),
  validate: (entry) => stillFresh(entry)  // optional, runs on a hit
});
```

The one thing to keep in mind: the runner never derives any part of your key for you. In particular, a dependency's output is *not* folded in automatically. If a task's result depends on what `compile` produced, you have to put the relevant piece of `ctx.deps.compile` into the key yourself. This is deliberate, since most dependency outputs are irrelevant to a given consumer and hashing all of them wholesale would defeat the cache, but it does mean an incomplete key is silently wrong rather than merely slow. Put everything that can change the output into the key: the input, the options `run` actually reads, the relevant parts of `ctx.deps`, and any out-of-band state like source hashes or tool versions.

## Running

```sh
tstask                 # run the default task
tstask build verify    # run several
tstask --list          # list every task, its options, and which one is default
tstask build --watch   # re-run when files under the config's directory change
tstask build --dry-run # print the plan without running anything
```

The flags you always have:

- `-c, --config <path>`: point at a config file instead of discovering one
- `--cwd <dir>`: working directory to resolve from
- `-l, --list`: list available tasks
- `-w, --watch`: re-run on source changes (debounced, ignores `node_modules`, `.git`, and `dist`)
- `--dry-run`: print the plan without running
- `--no-cache`: ignore the configured cache store for this run
- `-j, --concurrency <n>`: cap how many tasks run at once
- `--verbose`: debug logging
- `-v, --version`

Every option your tasks declare shows up as a flag alongside these. `Ctrl-C` aborts cleanly: the signal is threaded into every `run` and every `exec`, so in-flight commands get told to stop rather than being orphaned.

The config file is discovered by walking for `tasks.config.ts` (or `.mts`, `.js`, `.mjs`) from your working directory. It's imported through [jiti](https://github.com/unjs/jiti), so a TypeScript config just works with no separate compile step, and path aliases from your `tsconfig.json` are respected.

## Contributing

Fully AI-generated pull requests are not accepted. You can use AI, but it should be verified and cleaned up by a human. Only Opus 4.6+ (high-effort) and Codex 5.4+ (extra high) are accepted models. Preferably created with Opus and verified by Codex. *This blurb is adapted from [Ink](https://github.com/vadimdemedes/ink).*

I think that's a reasonable ask for a small library like this one. If you think it's too strict, open an issue and tell me why.

## License

MIT © Oliver Yasuna
