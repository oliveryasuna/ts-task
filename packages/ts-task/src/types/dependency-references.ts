import type {OUT, PENDING} from './markers';
import type {AnyTask} from './tasks';

// `Dep` is what may appear in a task's `deps` array. A `Task` is itself a `Dep`
// (structurally), so a task with no input can be listed directly. A task that
// declares an input carries a non-`never` PENDING marker until `.with()` clears
// it; `task()` rejects any deps list containing a pending entry.
//
// PENDING is a covariant phantom *property*, not a contravariant method
// parameter, so union distribution over the deps tuple is reliable. Encoding
// boundness in the parameter type of `with()` would be unsound here, since
// TypeScript compares method parameters bivariantly.

interface Dep<
  TKey extends string = string,
  TOut = unknown,
  TPending = never
> {
  readonly key: TKey;
  readonly taskId: string;
  readonly input: unknown;
  /**
   * Back-reference to the task this edge points at. Non-enumerable at runtime
   * (a task's own `task` property points to itself, which would otherwise make
   * every task cyclic under `console.log` and `JSON.stringify`).
   *
   * The executor needs this: a dep only carries an id, and the task it names
   * may not appear in `config.tasks` (intermediate tasks are commonly
   * referenced without being registered as CLI entry points).
   */
  readonly task: AnyTask;

  readonly [OUT]: TOut;
  readonly [PENDING]: TPending;
  /** Rebinds the `ctx.deps` property name for this edge only. */
  as<K extends string>(key: K): Dep<K, TOut, TPending>;
}

type AnyDep = Dep<string, any, any>;
type DepList = (readonly AnyDep[]);

type KeyOf<D> = (D extends Dep<(infer K), any, any> ? K : never);
type OutputOf<D> = (D extends Dep<any, (infer O), any> ? O : never);

/**
 * Dependency results, keyed by dep key (last ID segment, or the `.as()` alias).
 */
type DepOutputs<TDeps extends DepList> = {
  readonly [D in TDeps[number] as D['key']]: D[typeof OUT];
};

/**
 * Union of IDs of deps that declare an input but were listed without `.with()`.
 */
type PendingDeps<TDeps extends DepList> = TDeps[number][typeof PENDING];

/** Union of dep keys used more than once within one deps list. */
type DuplicateKeys<
  TDeps extends DepList,
  Seen extends string = never
> =
  (TDeps extends (readonly [
    (infer H extends AnyDep),
    ...(infer R extends DepList)
  ])
    ? (
      (H['key'] extends Seen ? H['key'] : never)
      | DuplicateKeys<R, (Seen | H['key'])>
      )
    : never);

/**
 * Intersected onto the *def object* rather than onto `Deps` itself. Placing a
 * conditional in `Deps`' own inference position collapses the tuple elements
 * to `never` before the check can run.
 */
type DepDiagnostics<Deps extends DepList> =
  (([PendingDeps<Deps>] extends [never]
    ? unknown
    : {
        readonly __unboundDependency: `Dependency "${PendingDeps<Deps> & string}" declares an input; call .with(...)`;
      }) &
      ([DuplicateKeys<Deps>] extends [never]
        ? unknown
        : {
            readonly __duplicateDependencyKey: `Two dependencies resolve to key "${DuplicateKeys<Deps>}"; disambiguate with .as(...)`;
          }));

export type {
  Dep,
  AnyDep,
  DepList,
  KeyOf,
  OutputOf,
  DepOutputs,
  PendingDeps,
  DuplicateKeys,
  DepDiagnostics
};
