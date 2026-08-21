import type {CachePolicy, CodecRequirement} from './caching-incrementality';
import type {Dep, DepDiagnostics, DepList, DepOutputs} from './dependency-references';
import type {LastSegment, Qualify} from './namespacing';
import type {OptionsSpec, OptionValues} from './options';
import type {InputType} from './task-inputs';

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

export type {
  Logger,
  ExecResult,
  TaskContext,
  Task,
  AnyTask,
  TaskDef,
  TaskFactory,
  Namespace
};
