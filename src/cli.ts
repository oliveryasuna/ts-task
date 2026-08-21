import type {AnyDep, AnyTask, CacheEntry, CacheStore, Config, Logger, Option} from './types';
import chalk from 'chalk';
import {watch} from 'chokidar';
import {Option as CliOption, Command, CommanderError} from 'commander';
import crypto from 'node:crypto';
import {parseArgs} from 'node:util';
import pLimit from 'p-limit';
import stringify from 'safe-stable-stringify';
import {x} from 'tinyexec';
import {version} from '../package.json' with {type: 'json'};
import {loadConfig, type LoadedConfig} from './load-config';

const VERSION = version;

//==================================================
// Logging
//==================================================

const makeLogger = ((
  scope: string,
  verbose: boolean
): Logger => {
  const write = ((line: string): boolean => process.stderr.write(`${chalk.dim(`[${scope}]`)} ${line}\n`));
  const fmt = ((
    m: string,
    r: unknown[]
  ): string => ((r.length === 0) ? m : `${m} ${r.map(String).join(' ')}`));

  return {
    debug: ((m, ...r) => (void (verbose && write(chalk.dim(fmt(m, r)))))),
    info: ((m, ...r) => write(fmt(m, r))),
    warn: ((m, ...r) => write(chalk.yellow(fmt(m, r)))),
    error: ((m, ...r) => write(chalk.red(fmt(m, r))))
  };
});

const report = ((error: unknown): void => {
  const message = ((error instanceof Error) ? error.message : String(error));
  process.stderr.write(`${chalk.red('error')} ${message.replace(/^error:\s*/, '')}\n`);
});

//==================================================
// Graph
//==================================================

interface Node {
  readonly id: string;
  /** Short human-facing name. Never the raw input serialization. */
  readonly label: string;
  readonly task: AnyTask;
  readonly input: unknown;
  readonly deps: (readonly AnyDep[]);
}

const makeNode = ((
  task: AnyTask,
  input: unknown
): Node => {
  // stringify() is key-sorted, cycle-safe, and distinguishes Maps and Sets.
  // A hand-rolled JSON.stringify replacer gets all three wrong, and its key
  // comparator is locale-sensitive -- which makes cache keys machine-dependent.
  const stamp = ((input === undefined) ? undefined : (task.identity?.(input) ?? stringify(input)));
  const id = ((stamp === undefined) ? task.id : `${task.id}#${stamp}`);
  const label =
    ((stamp === undefined) ? task.id : `${task.id}(${task.identity ? stamp : hash(id).slice(0, 7)})`);
  return {
    id: id,
    label: label,
    task: task,
    input: input,
    deps: task.deps
  };
});

const toNode = ((dep: AnyDep): Node => makeNode(dep.task, dep.input));

const walk = ((roots: (readonly Node[])): Map<string, Node> => {
  const nodes = (new Map<string, Node>());
  const onPath = (new Set<string>());

  const visit = ((
    node: Node,
    trail: (readonly string[])
  ): void => {
    if(onPath.has(node.id)) {
      throw (new Error(`Dependency cycle: ${[
        ...trail,
        node.id
      ].join(' -> ')}`));
    }
    if(nodes.has(node.id)) {
      return;
    }
    onPath.add(node.id);
    for(const dep of node.deps) {
      visit(
        toNode(dep),
        [
          ...trail,
          node.id
        ]
      );
    }
    onPath.delete(node.id);
    nodes.set(node.id, node);
  });

  for(const root of roots) {
    visit(root, []);
  }

  return nodes;
});

//==================================================
// Execution
//==================================================

interface RunOptions {
  readonly cwd: string;
  readonly options: Readonly<Record<string, unknown>>;
  readonly concurrency: number;
  readonly cache: (CacheStore | undefined);
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly signal: AbortSignal;
}

type Policy = NonNullable<AnyTask['cache']>;

const encode = ((
  p: Policy,
  v: unknown
): string => (p.codec ? p.codec.encode(v) : (stringify(v ?? null) ?? 'null')));
const decode = ((
  p: Policy,
  e: CacheEntry
): unknown => (p.codec ? p.codec.decode(e.value) : JSON.parse(e.value)));

const hash = ((...parts: string[]): string => crypto.createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32));

const execute = (async(
  roots: (readonly Node[]),
  opts: RunOptions
): Promise<void> => {
  const limit = pLimit(opts.concurrency);
  const pending = (new Map<string, Promise<unknown>>());

  const runNode = (async(node: Node): Promise<unknown> => {
    const existing = pending.get(node.id);
    if(existing) {
      return existing;
    }

    const promise = (async(): Promise<any> => {
      const deps: Record<string, unknown> = {};
      await Promise.all(
        node.deps.map(async(dep) => {
          deps[dep.key] = (await runNode(toNode(dep)));
        })
      );
      opts.signal.throwIfAborted();

      const log = makeLogger(node.label, opts.verbose);
      const base = {
        taskId: node.task.id,
        input: node.input,
        deps: deps,
        options: opts.options,
        cwd: opts.cwd,
        env: process.env
      };

      const policy = node.task.cache;
      const key = ((policy && opts.cache) ? hash(node.id, (await policy.key(base as never))) : undefined);

      if(key && policy && opts.cache) {
        const entry = (await opts.cache.get(key));
        if(entry && (policy.validate ? (await policy.validate(entry, (base as never))) : true)) {
          log.debug('cache hit');
          return decode(policy, entry);
        }
      }

      if(opts.dryRun) {
        log.info(chalk.dim('would run'));
        return;
      }

      return limit(async() => {
        const started = Date.now();
        log.debug('start');
        const out = (await node.task.run({
          ...base,
          signal: opts.signal,
          log: log,
          exec: (async(cmd: string, args: (readonly string[]) = []) => {
            const r = (await x(
              cmd,
              [...args],
              {
                signal: opts.signal,
                nodeOptions: {cwd: opts.cwd}
              }
            ));
            return {
              code: (r.exitCode ?? 0),
              stdout: r.stdout,
              stderr: r.stderr
            };
          })
        } as never));
        log.info(chalk.green(`done in ${Date.now() - started}ms`));

        if(key && policy && opts.cache) {
          await opts.cache.set(
            key,
            {
              value: encode(policy, out),
              meta: {
                taskId: node.task.id,
                createdAt: Date.now()
              }
            }
          );
        }
        return out;
      });
    })();

    pending.set(node.id, promise);
    return promise;
  });

  await Promise.all(roots.map(async root => runNode(root)));
});

//==================================================
// Options
//==================================================

// A task options becomes a commander Option. `attributeName()` is commander's
// own camel-casing, so we ask it rather than reimplementing the rule and
// drifting from it (`--dry-run` -> `dryRun`).

interface Declared {
  readonly name: string;
  readonly attr: string;
  readonly option: Option<unknown>;
}

const declare = ((
  name: string,
  option: Option<unknown>
): {
  cli: CliOption;
  declared: Declared;
} => {
  const flags = [
    option.short ? `-${option.short}, ` : '',
    `--${name}`,
    (option.kind === 'boolean') ? '' : ' <value>'
  ].join('');
  const cli = (new CliOption(flags, option.description));

  if(option.defaultValue !== undefined) {
    cli.default(option.defaultValue);
  }

  return {
    cli: cli,
    declared: {
      name: name,
      attr: cli.attributeName(),
      option: option
    }
  };
});

/**
 * Parsing covers every task's options, because argv must parse before task
 * selection is known. Required-ness is checked only against the subgraph that
 * will actually run, so an unrelated task's required option never blocks an
 * unrelated invocation.
 */
const resolveOptions = ((
  nodes: Iterable<Node>,
  declared: ReadonlyMap<string, Declared>,
  raw: Record<string, unknown>
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const missing: string[] = [];

  for(const node of nodes) {
    for(const name of Object.keys(node.task.options)) {
      const entry = declared.get(name);
      if(!entry) {
        continue;
      }
      const value = raw[entry.attr];
      if(value === undefined) {
        if(entry.option.isRequired) {
          missing.push(name);
        } else {
          out[name] = entry.option.defaultValue;
        }
      } else {
        out[name] =
          ((entry.option.kind === 'boolean') ? (value === true) : entry.option.parse(String(value)));
      }
    }
  }

  if(missing.length > 0) {
    throw (new Error(`Missing required option(s): ${missing.map(n => `--${n}`).join(', ')}`));
  }
  return out;
});

//==================================================
// Entry
//==================================================

/**
 * Enough of argv to locate the config. commander cannot do this pass, because
 * the option set it would need is defined by the config this pass finds.
 * `strict: false` so unknown flags here are ignored rather than fatal --
 * commander rejects them properly once it has the real spec.
 */
const preParse = ((): {
  config?: string;
  cwd?: string;
  watch: boolean;
} => {
  const {values} = parseArgs({
    args: process.argv.slice(2),
    options: {
      config: {
        type: 'string',
        short: 'c'
      },
      cwd: {type: 'string'},
      watch: {
        type: 'boolean',
        short: 'w'
      }
    },
    allowPositionals: true,
    strict: false
  });

  return {
    ...(values.config ? {config: String(values.config)} : {}),
    ...(values.cwd ? {cwd: String(values.cwd)} : {}),
    watch: (values.watch === true)
  };
});

const buildProgram = ((config?: Config<readonly AnyTask[]>): {
  program: Command;
  declared: Map<string, Declared>;
} => {
  const program = (new Command())
    .name('tstask')
    .description('A task runner configured in TypeScript')
    .version(VERSION, '-v, --version')
    .argument('[tasks...]', 'Tasks to run')
    .option('-c, --config <path>', 'Path to the config file')
    .option('--cwd <dir>', 'Working directory')
    .option('-l, --list', 'List available tasks')
    .option('-w, --watch', 'Re-run on source changes')
    .option('--dry-run', 'Print the plan without running')
    .option('--no-cache', 'Ignore the configured cache store')
    .option('-j, --concurrency <n>', 'Max tasks at once')
    .option('--verbose', 'Debug logging');

  const declared = (new Map<string, Declared>());
  if(config) {
    // eslint-disable-next-line unicorn/no-useless-undefined -- Intentional.
    for(const node of walk(config.tasks.map(t => makeNode(t, undefined))).values()) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- Bug with rule.
      const options = (Object.entries(node.task.options) as Array<[string, Option<unknown>]>);
      // eslint-disable-next-line @stylistic/array-bracket-newline, @stylistic/array-element-newline -- Clean.
      for(const [name, option] of options) {
        if(declared.has(name)) {
          continue;
        }

        const {cli, declared: entry} = declare(name, option);
        program.addOption(cli);
        declared.set(name, entry);
      }
    }
  }

  // We print errors ourselves; commander's default writes a bare `error:` line
  // to stderr before throwing, which would double up.
  program.exitOverride();
  program.configureOutput({writeErr: (() => {})});

  return {
    program: program,
    declared: declared
  };
});

//==================================================
// Run
//==================================================

interface RunTasksOptions {
  readonly config: Config<(readonly AnyTask[])>;
  readonly root: string;
  readonly declared: ReadonlyMap<string, Declared>;
  readonly flags: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
}

/**
 * Resolve a set of requested task ids against a config and run them once.
 * Extracted from `main` so anything holding a loaded config (watch, and later
 * plugin-contributed commands) can trigger a run by id without re-deriving the
 * option map or concurrency policy.
 */
const runTasks = (async(
  requested: (readonly string[]),
  opts: RunTasksOptions
): Promise<void> => {
  const byId = (new Map(opts.config.tasks.map(t => [
    t.id,
    t
  ])));
  const roots = requested.map((id) => {
    const task = byId.get(id);
    if(!task) {
      throw (new Error(`Unknown task "${id}". Run with --list to see available tasks.`));
    }
    // eslint-disable-next-line unicorn/no-useless-undefined -- Intentional.
    return makeNode(task, undefined);
  });

  const options = resolveOptions(walk(roots).values(), opts.declared, opts.flags);

  await execute(
    roots,
    {
      cwd: opts.root,
      options: options,
      concurrency: (opts.flags.concurrency
        ? Number(opts.flags.concurrency)
        // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Intentional.
        : Math.max(1, ((globalThis.navigator?.hardwareConcurrency ?? 4) - 1))),
      // commander maps `--no-cache` to `cache: false`.
      cache: ((opts.flags.cache === false) ? undefined : opts.config.cache),
      dryRun: (opts.flags.dryRun === true),
      verbose: (opts.flags.verbose === true),
      signal: opts.signal
    }
  );
});

//==================================================
// Main
//==================================================

const main = (async(): Promise<number> => {
  const pre = preParse();

  let loaded: (LoadedConfig<Config<readonly AnyTask[]>> | undefined);
  let loadError: unknown;
  try {
    loaded = (await loadConfig<Config<readonly AnyTask[]>>({
      ...(pre.cwd ? {cwd: pre.cwd} : {}),
      ...(pre.config ? {configPath: pre.config} : {}),
      reloadable: pre.watch
    }));
  } catch(err) {
    // Deferred: `--help` must still work in a directory with no config.
    loadError = err;
  }

  const {program, declared} = buildProgram(loaded?.config);

  let tasks: string[] = [];
  let flags: Record<string, unknown> = {};
  program.action((positionals: string[], opts: Record<string, unknown>) => {
    tasks = positionals;
    flags = opts;
  });

  await program.parseAsync(process.argv);

  if(loadError) {
    throw loadError;
  }
  if(!loaded) {
    throw (new Error('Config was not loaded.'));
  }
  const {config, root} = loaded;

  if(flags.list === true) {
    for(const task of config.tasks) {
      const names = Object.keys(task.options);
      const suffix = ((names.length > 0) ? chalk.dim(`  [${names.map(n => `--${n}`).join(' ')}]`) : '');
      const marker = ((task.id === config.defaultTask) ? chalk.green(' (default)') : '');
      process.stdout.write(`${task.id.padEnd(24)}${task.description ?? ''}${suffix}${marker}\n`);
    }
    return 0;
  }

  const requested = ((tasks.length > 0) ? tasks : (config.defaultTask ? [config.defaultTask] : []));
  if(requested.length === 0) {
    throw (new Error('No task given and no defaultTask configured.'));
  }

  const controller = (new AbortController());
  const abort = ((): void => {
    controller.abort(new Error('Interrupted'));
  });
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);

  const runOnce = (async(): Promise<void> =>
    runTasks(
      requested,
      {
        config: config,
        root: root,
        declared: declared,
        flags: flags,
        signal: controller.signal
      }
    ));

  if(flags.watch !== true) {
    await runOnce();
    return 0;
  }

  await runOnce().catch(report);
  const watcher = watch(
    root,
    {
      ignoreInitial: true,
      // eslint-disable-next-line regexp/no-unused-capturing-group -- Intentional.
      ignored: ((path: string): boolean => /(^|[/\\])(node_modules|\.git|dist)([/\\]|$)/.test(path))
    }
  );
  let timer: (NodeJS.Timeout | undefined);
  watcher.on(
    'all',
    (() => {
      clearTimeout(timer);
      timer = setTimeout((() => void runOnce().catch(report)), 100);
    })
  );
  watcher.on('error', report);
  controller.signal.addEventListener('abort', (() => void watcher.close()));
  await (new Promise<void>(resolve => controller.signal.addEventListener('abort', (() => resolve()))));

  return 0;
});

try {
  process.exitCode = (await main());
} catch(err) {
  // commander throws for --help and --version too; those are successful exits.
  if(err instanceof CommanderError) {
    if(err.exitCode !== 0) {
      report(err);
    }
    process.exitCode = err.exitCode;
  } else {
    report(err);
    process.exitCode = 1;
  }
}
