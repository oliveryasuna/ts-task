import type {DepList, DepOutputs} from './dependency-references';
import type {OptionsSpec, OptionValues} from './options';

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
  // eslint-disable-next-line @typescript-eslint/member-ordering -- Clean.
  codec?: Codec<TOut>;
}

/** Enforces a codecd exactly when the output type is not JSON-representable. */
type CodecRequirement<TOut> =
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- Intentional.
  ([TOut] extends [JsonValue | void]
    ? {readonly codec?: Codec<TOut>;}
    : {readonly codec: Codec<TOut>;});

export type {
  JsonValue,
  Codec,
  CacheEntryMeta,
  CacheEntry,
  CacheStore,
  CacheContext,
  CachePolicy,
  CodecRequirement
};
