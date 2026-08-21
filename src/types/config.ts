import type {CacheStore} from './caching-incrementality';
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
  readonly tasks: TTasks;
  readonly defaultTask?: TTasks[number]['id'];
  readonly cache?: CacheStore;
}

export type {
  DuplicateIds,
  Config
};
