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
    (makeOption({
      ...base,
      isRequired: true
    }) as OptionBuilder<Exclude<T, undefined>>)),
  default: (value =>
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

  return (self as AnyTask);
});

const task = (<
  const Id extends string,
  const Deps extends DepList = (readonly []),
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Intentional.
  Opts extends OptionsSpec = {},
  In = void,
  Out = void
>(def: (TaskDef<Id, Out, Deps, Opts, In> & DepDiagnostics<Deps>)): Task<Id, Awaited<Out>, Deps, Opts, In> =>
  ((build(def, '') as unknown) as Task<Id, Awaited<Out>, Deps, Opts, In>));

const namespace = (<const TPrefix extends string>(prefix: TPrefix): Namespace<TPrefix> => ({
  prefix: prefix,
  task: (((def: any) => build(def, prefix)) as TaskFactory<TPrefix>),
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
  defineConfig
};
export type {
  ResolvedConfig
} from './config';
export {
  resolveConfig
} from './config';
export * from './types';
