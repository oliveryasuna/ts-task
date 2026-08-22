import type {CacheStore} from './caching-incrementality';
import type {Plugin} from './plugins';
import type {AnyTask} from './tasks';

/** Union of task IDs registered more than once, or `never`. */
type DuplicateIds<
  TTasks extends (readonly AnyTask[]),
  Seen extends string = never
> =
  (TTasks extends (readonly [
    (infer H extends AnyTask),
    ...(infer R extends (readonly AnyTask[]))
  ])
    ? (
      (H['id'] extends Seen ? H['id'] : never)
      | DuplicateIds<R, (Seen | H['id'])>
      )
    : never);

interface Config<TTasks extends (readonly AnyTask[])> {
  /**
   * Plugins folded into the run by `resolveConfig`. Their contributions (tasks,
   * reporters, a cache store) are validated at resolve time, not compile time.
   */
  readonly plugins?: (readonly Plugin[]);
  readonly tasks: TTasks;
  readonly defaultTask?: TTasks[number]['id'];
  readonly cache?: CacheStore;
}

export type {
  DuplicateIds,
  Config
};
