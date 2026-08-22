// A reporter observes execution. Every hook is optional and may be sync or
// async; the runner awaits each one. A reporter is an observer only: the runner
// isolates hook failures, so returning or throwing from a hook never changes
// what runs. The runner ships a default reporter that renders the human-facing
// log (`start`, `done in Nms`, `cache hit`); plugins contribute their own.

interface TaskEvent {
  readonly taskId: string;
  /** Human-facing node label. Never the raw input serialization. */
  readonly label: string;
  readonly input: unknown;
}

interface Reporter {
  onRunStart?(e: {
    roots: (readonly string[]);
    dryRun: boolean;
  }): unknown;
  onTaskStart?(e: TaskEvent): unknown;
  onTaskEnd?(e: (
    TaskEvent
    & {
      durationMs: number;
      output: unknown;
    })): unknown;
  onTaskError?(e: (TaskEvent & {error: unknown;})): unknown;
  onCacheHit?(e: TaskEvent): unknown;
  onCacheMiss?(e: TaskEvent): unknown;
  onRunEnd?(e: {
    ok: boolean;
    durationMs: number;
  }): unknown;
}

export type {
  TaskEvent,
  Reporter
};
