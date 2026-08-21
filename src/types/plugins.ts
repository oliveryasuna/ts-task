import type {CacheStore} from './caching-incrementality';
import type {Reporter} from './reporting';
import type {AnyTask} from './tasks';

// A plugin extends or modifies a run. Every field but `name` is optional, and
// contributions are folded into the effective run by `resolveConfig` in a
// deterministic order. Tasks contributed here are NOT compile-time checked
// against the authored `tasks` tuple (`DuplicateIds` / `PendingDeps` only see
// that literal), so their ids and inputs are validated at resolve time instead.

/** Extends or modifies a run. */
interface Plugin {
  readonly name: string;
  /** Tasks the plugin contributes to the graph. */
  readonly tasks?: (readonly AnyTask[]);
  /** An execution observer, run alongside the runner's default reporter. */
  readonly reporter?: Reporter;
  /** A default cache store. An explicit `config.cache` takes precedence. */
  readonly cache?: CacheStore;
}

export type {
  Plugin
};
