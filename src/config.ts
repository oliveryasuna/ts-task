import type {AnyTask, CacheStore, Config, Reporter} from './types';
import {createJiti, type Jiti} from 'jiti';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

//==================================================
// Loading
//==================================================

const CONFIG_NAMES = ([
  'tasks.config.ts',
  'tasks.config.mts',
  'tasks.config.js',
  'tasks.config.mjs'
] as const);

interface LoadOptions {
  /** Directory to start searching from. Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /** Explicit config path; skips discovery. */
  readonly configPath?: string;
  /**
   * Disables jiti's module cache so a re-load picks up edits. Set for
   * `--watch`. Leave false for one-shot runs; the cache is what makes repeat
   * imports cheap.
   */
  readonly reloadable?: boolean;
}

interface LoadedConfig<T = unknown> {
  readonly config: T;
  readonly path: string;
  readonly root: string;
}

const exists = (async(p: string): Promise<boolean> => {
  try {
    await fs.access(p);

    return true;
  } catch{
    return false;
  }
});

const discover = (async(cwd: string): Promise<string> => {
  for(const name of CONFIG_NAMES) {
    const candidate = path.resolve(cwd, name);
    if(await exists(candidate)) {
      return candidate;
    }
  }

  throw (new Error(`No config found in ${cwd}. Expected one of: ${CONFIG_NAMES.join(', ')}`));
});

const makeJiti = ((
  from: string,
  reloadable: boolean
): Jiti =>
  createJiti(
    url.pathToFileURL(from).href,
    {
      // The config is imported once and its exports are read as a graph, not
      // accessed in a hot loop (the interop Proxy buys nothing and obscures
      // stack traces. We control the import site, so handle default ourselves).
      interopDefault: false,
      // Persistent transpile cache. Keyed by etag; safe to leave on.
      fsCache: true,
      // Watch mode needs a fresh module instance per reload.
      moduleCache: !reloadable,
      // Config files legitimately use repo path aliases; discovery walks up
      // from the config's own directory.
      tsconfigPaths: true,
      sourceMaps: true

    }
  ));

const loadConfig = (async<T = unknown>(options: LoadOptions = {}): Promise<LoadedConfig<T>> => {
  const cwd = (options.cwd ?? process.cwd());
  const p = (options.configPath ? path.resolve(cwd, options.configPath) : (await discover(cwd)));
  const root = path.dirname(p);

  const jiti = makeJiti(p, (options.reloadable ?? false));
  const config = (await jiti.import<T>(p, {default: true}));

  if((config === null) || (typeof config !== 'object')) {
    throw (new Error(`${p} must default-export a config object.`));
  }

  return {
    config: config,
    path: p,
    root: root
  };
});

//==================================================
// Resolving
//==================================================

interface ResolvedConfig {
  readonly tasks: (readonly AnyTask[]);
  readonly defaultTask?: string;
  readonly cache?: CacheStore;
  readonly reporters: (readonly Reporter[]);
}

/**
 * Fold a config's plugins into the effective run: merge contributed tasks, pick
 * the cache store, collect plugin reporters, and enforce at runtime the
 * invariants `defineConfig` can only check for hand-written tasks.
 *
 * Deterministic order: authored tasks first, then each plugin's tasks in plugin
 * order. `transform` (a later step) runs after this merge.
 */
const resolveConfig = ((config: Config<(readonly AnyTask[])>): ResolvedConfig => {
  const plugins = (config.plugins ?? []);

  const tasks = [
    ...config.tasks,
    ...plugins.flatMap(p => (p.tasks ?? []))
  ];

  // The compile-time `DuplicateIds` guard only sees the authored tuple, so a
  // collision introduced by a plugin task surfaces here instead.
  const seen = (new Set<string>());
  for(const t of tasks) {
    if(seen.has(t.id)) {
      throw (new Error(`Duplicate task id: ${t.id}`));
    }
    seen.add(t.id);
  }

  // Entry points cannot declare an input; there is no `.with()` on a command
  // line. `PendingDeps` enforces this at compile time for authored tasks.
  for(const t of tasks) {
    if(t.requiresInput) {
      throw (new Error(`Task "${t.id}" declares an input and cannot be a CLI entry point; remove it from tasks`));
    }
  }

  return {
    tasks: tasks,
    defaultTask: config.defaultTask,
    // An explicit config store wins; otherwise the first plugin that offers one.
    cache: (config.cache ?? plugins.find(p => p.cache)?.cache),
    reporters: plugins.flatMap(p => (p.reporter ? [p.reporter] : []))
  };
});

export type {
  LoadOptions,
  LoadedConfig,
  ResolvedConfig
};
export {
  loadConfig,
  resolveConfig
};
