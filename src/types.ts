//==================================================
// Phantom markers
//==================================================

// These carry type information that has no runtime representation. They are
// `unique symbol` keys rather than plain properties so they cannot collide with
// user data and do not show up in autocomplete on the value side.

declare const OUT: (unique symbol);
declare const PENDING: (unique symbol);
declare const INPUT: (unique symbol);

//==================================================
// Options (global flags)
//==================================================

/**
 * An option/flag declaration.
 *
 * `T` is the *resolved* value type; optionality is encoded as `T | undefined`
 * rather than a separate `required` type parameter, which keeps
 * {@link OptionValues} a plain homomorphic mapped type.
 */
interface Option<T> {
  readonly kind: ('string' | 'number' | 'boolean');
  readonly description?: string;
  readonly short?: string;
  readonly defaultValue?: T;
  readonly isRequired?: boolean;
  /**
   * Raw argv token -> value.
   *
   * `undefined` raw means the flag was absent.
   */
  // eslint-disable-next-line @typescript-eslint/method-signature-style -- Intentional.
  readonly parse: ((raw: string) => T);
}

type OptionsSpec = Readonly<Record<string, Option<any>>>;

type ValueOf<O> = (O extends Option<infer T> ? T : never);

type OptionValues<O extends OptionsSpec> = {
  readonly [K in (keyof O)]: ValueOf<O[K]>;
};

/**
 * Fluent builders: each transition narrows `T` by removing `undefined`.
 */
interface OptionBuilder<T> extends Option<T> {
  describe(text: string): OptionBuilder<T>;
  alias(short: string): OptionBuilder<T>;
  required(): OptionBuilder<Exclude<T, undefined>>;
  default(value: Exclude<T, undefined>): OptionBuilder<Exclude<T, undefined>>;
}

//==================================================
// Task inputs
//==================================================

// An input is a value supplied by the *dependent*, in TypeScript, at the point
// the dependency is declared. It is distinct from an option, which comes from
// argv and is global to the invocation.
//
// The shape is declared type-only via `type<T>()` (see `index.ts`). There is no
// parsing step, because the value never crosses a string boundary. Rather, it
// is written in one config file and type-checked there. Runtime validation, if
// wanted, belongs in `run`.

interface InputType<T> {
  readonly [INPUT]: T;
}

//==================================================
// Namespacing
//==================================================

// A task's `id` may be qualified with ':' (e.g., `build:compile`). The ID is
// what `the CLI and the graph use. The *dep key* (property name under which a
// dependency's output appears in `ctx.deps`) defaults to the last segment of
// the ID, so namespacing never forces bracket access:
//
//  ctx.deps.compile    // not ctx.deps['build:compile']
//
// Two dependencies whose IDs share a last segment collide; resolve with
// `.as('someOtherKey')`, which is enforced at compile-time.

type LastSegment<S extends string> = (S extends `${string}:${infer Rest}` ? LastSegment<Rest> : S);

type Qualify<
  TPrefix extends string,
  TId extends string
> = (TPrefix extends '' ? TId : `${TPrefix}:${TId}`);

//==================================================
// Dependency references
//==================================================

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

//==================================================
// Caching / incrementality
//==================================================

// The runner supplies no cache. It supplies the seams:
//
//  - `CacheStore`  (config level) -- where entries live.
//  - `CachePolicy` (task level)   -- whether a task participates, what its
//                                    identity is, and how its output is
//                                    serialized.
//
// Both ar eoptional. A task with no policy always runs; a config with no store
// ignores every policy.

type JsonValue = (
  string
  | number
  | boolean
  | null
  | (readonly JsonValue[])
  | {readonly [k: string]: JsonValue;}
);

interface Codec<T> {
  encode(value: T): string;
  decode(raw: string): T;
}

interface CacheEntryMeta {
  readonly taskId: string;
  readonly createdAt: number;
}

interface CacheEntry {
  readonly value: string;
  readonly meta: CacheEntryMeta;
}

interface CacheStore {
  get(key: string): (Promise<CacheEntry | undefined> | CacheEntry | undefined);
  set(key: string, entry: CacheEntry): (Promise<void> | void);
  /**
   * Never called by the runner during a build. Present for user-initiated
   * cache clearing (a `--clear-cache` flag, a maintenance task). Entries
   * rejected by `CachePolicy.validate` are overwritten via `set`, not deleted.
   */
  delete?(key: string): (Promise<void> | void);

}

/**
 * Read-only view handled to cache hooks, before `run` has produced anything.
 */
interface CacheContext<
  TDeps extends DepList,
  TOpts extends OptionsSpec,
  TIn
> {
  readonly taskId: string;
  readonly input: TIn;
  readonly deps: DepOutputs<TDeps>;
  readonly options: OptionValues<TOpts>;
  readonly cwd: string;
  readonly env: Readonly<Record<string, (string | undefined)>>;
}

interface CachePolicy<
  TOut,
  TDeps extends DepList,
  TOpts extends OptionsSpec,
  TIn
> {
  /**
   * Content address for this invocation.
   *
   * The runner does not derive any part of this key. In particular, dependency
   * outputs are **not** folded in automatically: a task whose key ignores
   * `ctx.deps` will hit its cache even after a dependency produced a different
   * result. Cascading invalidation is opt-in and looks like this:
   *
   * ```ts
   * key: (ctx) => hash([ctx.taskId, ctx.input, ctx.deps.compile.bytes])
   * ```
   *
   * This is deliberate: many dependency outputs are irrelevant to a
   * consumer, and hashing them wholesale would defeat the cache. It does mean
   * an incomplete key is silently wrong rather than merely inefficient.
   *
   * Incorporate everything that can change the output: the input, the options
   * actually read by `run`, the relevant parts of `ctx.deps`, and out-of-band
   * state such as source file hashes or tool versions.
   */

  key(ctx: CacheContext<TDeps, TOpts, TIn>): (string | Promise<string>);
  /**
   * Incrementality hook. Runs only on a store hit, and is the place for mtime
   * or stat checks too expensive to fold into `key`.
   *
   * Returning `false` causes the task to re-run. The runner then writes the
   * fresh result with `CacheStore.set` under the same key; it does **not**
   * call `CacheStore.delete`. A store may therefore be append-only or
   * content-addressed without implementing eviction, and a rejected entry is
   * superseded rather than removed.
   */

  validate?(
    entry: CacheEntry,
    ctx: CacheContext<TDeps, TOpts, TIn>
  ): (boolean | Promise<boolean>);
  /** Required unless `Out` is JSON-representable. See `Task.cached`. */
  codec?: Codec<TOut>;
}

/** Enforces a codecd exactly when the output type is not JSON-representable. */
type CodecRequirement<TOut> =
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- Intentional.
  ([TOut] extends [JsonValue | void]
    ? {readonly codec?: Codec<TOut>;}
    : {readonly codec: Codec<TOut>;});

//==================================================
// Tasks
//==================================================

interface Logger {
  debug(
    msg: string,
    ...rest: unknown[]
  ): void;
  info(
    msg: string,
    ...rest: unknown[]
  ): void;
  warn(
    msg: string,
    ...rest: unknown[]
  ): void;
  error(
    msg: string,
    ...rest: unknown[]
  ): void;
}

interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface TaskContext<
  TDeps extends DepList,
  TOpts extends OptionsSpec,
  TIn
> {
  readonly input: TIn;
  readonly deps: DepOutputs<TDeps>;
  readonly options: OptionValues<TOpts>;
  readonly cwd: string;
  readonly env: Readonly<Record<string, (string | undefined)>>;
  readonly signal: AbortSignal;
  readonly log: Logger;
  exec(
    cmd: string,
    args?: (readonly string[])
  ): Promise<ExecResult>;
}

interface Task<
  TId extends string = string,
  TOut = unknown,
  TDeps extends DepList = DepList,
  TOpts extends OptionsSpec = OptionsSpec,
  TIn = void
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- Intentional.
> extends Dep<LastSegment<TId>, TOut, (TIn extends void ? never : TId)> {
  readonly id: TId;
  readonly description?: string;
  readonly deps: TDeps;
  readonly options: TOpts;
  readonly cache?: CachePolicy<TOut, TDeps, TOpts, TIn>;
  /**
   * True when the task declared an `input`. The type system stops an
   * input-declaring task being used as an unbound *dependency*, but a CLI
   * invocation is not a dependency edge and has no `.with()` to check, so
   * runners need this flag to reject it as an entry point.
   */
  readonly requiresInput: boolean;
  /**
   * Distinguishes graph nodes for the same task invoked with different inputs.
   * Defaults to JSON of the input; override when the input is not
   * JSON-representable or when only part of it affects the result.
   */
  // eslint-disable-next-line @typescript-eslint/method-signature-style -- Intentional.
  readonly identity?: (input: TIn) => string;
  // eslint-disable-next-line @typescript-eslint/method-signature-style -- Intentional.
  readonly run: (ctx: TaskContext<TDeps, TOpts, TIn>) => (TOut | Promise<TOut>);

  /** Binds an input, producing a dep edge usable in another task's `deps`. */
  with(input: TIn): Dep<LastSegment<TId>, TOut, never>;
  /**
   * Attaches a cache policy. A method rather than a `cache` field on the def
   * so that `Out` is already resolved when `CodecRequirement<Out>` is checked;
   * inside the def literal, `Out` is still being inferred from `run` and the
   * conditional would be deferred.
   */
  cached(
    policy: (
      CachePolicy<TOut, TDeps, TOpts, TIn>
      & CodecRequirement<TOut>
    ),
  ): Task<TId, TOut, TDeps, TOpts, TIn>;
}

type AnyTask = Task<string, any, any, any, any>;

interface TaskDef<
  TId extends string,
  TOut,
  TDeps extends DepList,
  TOpts extends OptionsSpec,
  TIn
> {
  readonly name: TId;
  readonly description?: string;
  readonly input?: InputType<TIn>;
  readonly deps?: TDeps;
  readonly options?: TOpts;
  // eslint-disable-next-line @typescript-eslint/method-signature-style -- Intentional.
  readonly identity?: (input: TIn) => string;
  // eslint-disable-next-line @typescript-eslint/method-signature-style -- Intentional.
  readonly run: (ctx: TaskContext<TDeps, TOpts, TIn>) => TOut;
}

interface TaskFactory<TPrefix extends string> {
  <
    const TId extends string,
    const TDeps extends DepList = (readonly []),
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Intentional.
    TOpts extends OptionsSpec = {},
    TIn = void,
    TOut = void
  >(
    def: (
      TaskDef<TId, TOut, TDeps, TOpts, TIn>
      & DepDiagnostics<TDeps>
    ),
  ): Task<Qualify<TPrefix, TId>, Awaited<TOut>, TDeps, TOpts, TIn>;
}

interface Namespace<TPrefix extends string> {
  readonly prefix: TPrefix;
  readonly task: TaskFactory<TPrefix>;
  namespace<const TChild extends string>(child: TChild): Namespace<Qualify<TPrefix, TChild>>;
}

//==================================================
// Config
//==================================================

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
  Option,
  OptionsSpec,
  ValueOf,
  OptionValues,
  OptionBuilder,
  InputType,
  LastSegment,
  Qualify,
  Dep,
  AnyDep,
  DepList,
  KeyOf,
  OutputOf,
  DepOutputs,
  PendingDeps,
  DuplicateKeys,
  DepDiagnostics,
  JsonValue,
  Codec,
  CacheEntryMeta,
  CacheEntry,
  CacheStore,
  CacheContext,
  CachePolicy,
  CodecRequirement,
  Logger,
  ExecResult,
  TaskContext,
  Task,
  AnyTask,
  TaskDef,
  TaskFactory,
  Namespace,
  DuplicateIds,
  Config
};
