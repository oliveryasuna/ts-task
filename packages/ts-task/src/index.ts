import type {
  AnyDep,
  AnyTask,
  CacheStore,
  Config,
  DepDiagnostics,
  DepList,
  DuplicateIds,
  InputType,
  Namespace,
  Option,
  OptionBuilder,
  OptionsSpec,
  PendingDeps,
  Plugin,
  Task,
  TaskDef,
  TaskFactory
} from './types';

//==================================================
// Options
//==================================================

const makeOption = (<T>(base: Option<T>): OptionBuilder<T> => ({
  ...base,
  describe: (description =>
    makeOption({
      ...base,
      description: description
    })),
  alias: (short =>
    makeOption({
      ...base,
      short: short
    })),
  required: (() =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
    (makeOption({
      ...base,
      isRequired: true
    }) as OptionBuilder<Exclude<T, undefined>>)),
  default: (value =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
    (makeOption({
      ...base,
      defaultValue: value
    }) as OptionBuilder<Exclude<T, undefined>>))
}));

const opt = ({
  string: ((): OptionBuilder<string | undefined> =>
    makeOption<string | undefined>({
      kind: 'string',
      isRequired: false,
      parse: (r => r)
    })),
  number: ((): OptionBuilder<number | undefined> =>
    makeOption<number | undefined>({
      kind: 'number',
      isRequired: false,
      parse: Number
    })),
  boolean: ((): OptionBuilder<boolean> =>
    makeOption<boolean>({
      kind: 'boolean',
      isRequired: false,
      defaultValue: false,
      parse: (r => (r !== 'false'))
    }))
} as const);

//==================================================
// Task inputs
//==================================================

/**
 * Declares the input shape of a task.
 *
 * Type-only; returns an opaque marker.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
const type = (<T>(): InputType<T> => ({} as InputType<T>));

//==================================================
// Tasks
//==================================================

const makeDep = ((
  task: any,
  key: string,
  input: unknown
): AnyDep => {
  const dep = {
    taskId: task.id,
    key: key,
    input: input,
    as: ((k: string): AnyDep => makeDep(task, k, input))
  };

  Object.defineProperty(
    dep,
    'task',
    {
      value: task,
      enumerable: false
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
  return ((dep as unknown) as AnyDep);
});

const build = ((
  def: any,
  prefix: string,
  cache?: unknown
): AnyTask => {
  const id = ((prefix === '') ? def.name : `${prefix}:${def.name}`);
  const key = id.slice(id.lastIndexOf(':') + 1);
  const self: any = {
    id: id,
    key: key,
    taskId: id,
    input: undefined,
    description: def.description,
    deps: (def.deps ?? []),
    options: (def.options ?? {}),
    identity: def.identity,
    requiresInput: (def.input !== undefined),
    cache: cache,
    cwd: def.cwd,
    run: def.run,
    // eslint-disable-next-line unicorn/no-useless-undefined -- Intentional.
    as: ((k: string) => makeDep(self, k, undefined)),
    with: ((input: unknown) => makeDep(self, key, input)),
    cached: ((policy: unknown): AnyTask => build(def, prefix, policy))
  };

  Object.defineProperty(
    self,
    'task',
    {
      value: self,
      enumerable: false
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
  return (self as AnyTask);
});

/**
 * Rebuild a task with its `run` wrapped, for use inside a plugin `transform`.
 * A plain spread would drop the non-enumerable self-reference and leave `with`
 * / `as` / `cached` pointing at the original, so this reconstructs the task:
 * new edges made from it (and `.cached(...)`) carry the wrapper.
 *
 * Note: this wraps the task's own `run`. Existing dependency edges resolve
 * through their own back-reference, so wrapping a task does not retroactively
 * rewrap places that already depend on it; it takes effect for entry points and
 * for edges created from the returned task.
 *
 * TODO: consider making this generic (`<T extends AnyTask>(task: T, ...): T`),
 * like `inDir`, so a wrapped task can be dropped straight into a `deps` array
 * without tripping the `__unboundDependency` diagnostic (an `AnyTask` return
 * has a `PENDING` slot of `any`, which the check reads as unbound). Not urgent
 * while `wrapRun` is only used inside `transform`, where the context is `AnyTask[]`.
 */
const wrapRun = ((
  task: AnyTask,
  wrap: ((run: AnyTask['run']) => AnyTask['run'])
): AnyTask => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
  const key = ((task as any).key as string);
  const self: any = {
    id: task.id,
    key: key,
    taskId: task.taskId,
    input: task.input,
    description: task.description,
    deps: task.deps,
    options: task.options,
    identity: task.identity,
    requiresInput: task.requiresInput,
    cache: task.cache,
    cwd: task.cwd,
    run: wrap(task.run),
    // eslint-disable-next-line unicorn/no-useless-undefined -- Intentional.
    as: ((k: string) => makeDep(self, k, undefined)),
    with: ((input: unknown) => makeDep(self, key, input)),
    // Cache off the original (unwrapped) task, then re-wrap, so both the cache
    // policy and the wrapper survive.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
    cached: ((policy: unknown): AnyTask => wrapRun(task.cached(policy as never), wrap))
  };

  Object.defineProperty(
    self,
    'task',
    {
      value: self,
      enumerable: false
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
  return (self as AnyTask);
});

/**
 * Return a copy of `task` and its whole dependency closure whose `run`s execute
 * in `dir` (both `ctx.cwd` and `ctx.exec`), resolved relative to the run root;
 * an absolute path is used as-is. Tasks in the closure that already set their
 * own `cwd` keep it. Use it to depend on another package's task and have it run
 * in that package's directory rather than the current config's.
 *
 * Like `wrapRun`, this is a rebuild: it walks deps transitively and rewires
 * every edge to the copies, so the whole imported subgraph relocates together.
 */
// eslint-disable-next-line max-lines-per-function -- Clean.
const inDir = (<T extends AnyTask>(
  dir: string,
  task: T
): T => {
  const memo = (new Map<AnyTask, AnyTask>());

  const clone = ((t: AnyTask): AnyTask => {
    const existing = memo.get(t);
    if(existing) {
      return existing;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
    const key = ((t as any).key as string);
    const self: any = {
      id: t.id,
      key: key,
      taskId: t.taskId,
      input: t.input,
      description: t.description,
      // Rewired below, after `self` is memoized, so dependency cycles resolve.
      deps: [],
      options: t.options,
      identity: t.identity,
      requiresInput: t.requiresInput,
      cache: t.cache,
      // A task's own explicit cwd wins; otherwise it relocates to `dir`.
      cwd: (t.cwd ?? dir),
      run: t.run,
      // eslint-disable-next-line unicorn/no-useless-undefined -- Intentional.
      as: ((k: string) => makeDep(self, k, undefined)),
      with: ((input: unknown) => makeDep(self, key, input)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
      cached: ((policy: unknown): AnyTask => clone(t.cached(policy as never)))
    };

    Object.defineProperty(
      self,
      'task',
      {
        value: self,
        enumerable: false
      }
    );
    memo.set(t, self);

    self.deps = t.deps.map((dep: AnyDep) => makeDep(clone(dep.task), dep.key, dep.input));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
    return (self as AnyTask);
  });

  // The clone has the same id, deps, and options as `task`, so it is a `T` --
  // only its `run` cwd differs, which is not reflected in the type.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
  return ((clone(task) as unknown) as T);
});

const task = (<
  const Id extends string,
  const Deps extends DepList = (readonly []),
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Intentional.
  Opts extends OptionsSpec = {},
  In = void,
  Out = void
>(def: (TaskDef<Id, Out, Deps, Opts, In> & DepDiagnostics<Deps>)): Task<Id, Awaited<Out>, Deps, Opts, In> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
  ((build(def, '') as unknown) as Task<Id, Awaited<Out>, Deps, Opts, In>));

const namespace = (<const TPrefix extends string>(prefix: TPrefix): Namespace<TPrefix> => ({
  prefix: prefix,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
  task: (((def: any) => build(def, prefix)) as TaskFactory<TPrefix>),
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Safe.
  namespace: (child => (namespace(`${prefix}:${child}` as any) as any))
}));

//==================================================
// Config
//==================================================

const defineConfig = (<const T extends (readonly AnyTask[])>(
  config: (
    {
    /**
     * The CLI entry points. A task that declares an `input` cannot be one:
     * there is no `.with()` on a command line, so its `ctx.input` would be
     * `undefined`. Reference it from a dependent instead -- it stays reachable
     * in the graph without being registered here.
     */
      readonly tasks: T;
      readonly defaultTask?: T[number]['id'];
      readonly cache?: CacheStore;
      readonly plugins?: (readonly Plugin[]);
    }
    & ([DuplicateIds<T>] extends [never]
      ? unknown
      : {readonly __duplicateTaskId: `Duplicate task id: ${DuplicateIds<T>}`;}) &
      ([PendingDeps<T>] extends [never]
        ? unknown
        : {readonly __taskRequiresInput: `Task "${PendingDeps<T> & string}" declares an input and cannot be a CLI entry point; remove it from tasks`;}))
): Config<T> => config);

export {
  opt,
  type,
  task,
  namespace,
  wrapRun,
  inDir,
  defineConfig
};
export type {
  ResolvedConfig
} from './config';
export {
  resolveConfig
} from './config';
export * from './types';
