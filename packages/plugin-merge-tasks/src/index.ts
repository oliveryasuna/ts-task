import type {AnyTask, Config, Plugin} from '@oliveryasuna/ts-task';
import {inDir, loadConfig, resolveConfig} from '@oliveryasuna/ts-task';

type SubConfig = Config<(readonly AnyTask[])>;

/**
 * Load one or more `tasks.config.*` files and contribute all of their tasks to
 * the current config. Each path is loaded and resolved (its own plugins folded
 * in), and the resulting tasks are merged in as-is -- no namespacing, so a task
 * id that collides across files is rejected by the runner's duplicate-id check.
 *
 * Async, because it reads config files. Call it with `await` in your config:
 *
 * ```ts
 * export default defineConfig({
 *   plugins: [await mergeTasks('../a/tasks.config.ts', '../b/tasks.config.ts')],
 *   tasks: []
 * });
 * ```
 *
 * Paths are resolved relative to the working directory; pass absolute paths
 * (e.g. `path.resolve(import.meta.dirname, '...')`) if you want them stable
 * regardless of where `tstask` runs.
 *
 * Each merged task runs in its own config file's directory (via `inDir`), not
 * the parent config's, so a task like `tsc --project tsconfig.json` resolves
 * against the package it came from.
 */
const mergeTasks = (async(
  ...paths: (readonly string[])
): Promise<Plugin> => {
  const perFile = (await Promise.all(
    paths.map(async(configPath): Promise<(readonly AnyTask[])> => {
      try {
        const loaded = (await loadConfig<SubConfig>({configPath: configPath}));

        // `loaded.root` is the config file's directory (absolute), so each task
        // executes there rather than in the parent config's directory.
        return resolveConfig(loaded.config).tasks.map(t => inDir(loaded.root, t));
      } catch(err) {
        const message = ((err instanceof Error) ? err.message : String(err));
        throw (new Error(`merge-tasks: ${configPath}: ${message}`));
      }
    })
  ));

  return {
    name: 'merge-tasks',
    tasks: perFile.flat()
  };
});

export {
  mergeTasks
};
