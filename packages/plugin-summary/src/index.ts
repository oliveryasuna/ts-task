import type {Plugin} from '@oliveryasuna/ts-task';
import chalk from 'chalk';

type Status = ('ok' | 'cached' | 'failed');

interface Row {
  readonly label: string;
  readonly durationMs: number;
  readonly status: Status;
}

const fmtDuration = ((ms: number): string => ((ms < 1000) ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`));

const cell = ((row: Row): string => {
  if(row.status === 'cached') {
    return chalk.dim('cache hit');
  }
  if(row.status === 'failed') {
    return chalk.red('failed');
  }

  return chalk.green(fmtDuration(row.durationMs));
});

/**
 * A plugin whose reporter prints a per-task summary (timings, cache hits,
 * failures) after each run. It only observes, so it never affects execution,
 * and it stays quiet on a dry run since nothing actually ran.
 *
 * Cache hits arrive via `onCacheHit` (the task short-circuits without running,
 * so there is no duration for them); everything else is timed by `onTaskEnd`.
 */
// eslint-disable-next-line max-lines-per-function -- Clean.
const summaryReporter = ((): Plugin => {
  let rows: Row[] = [];
  let dryRun = false;

  return {
    name: 'summary',
    reporter: {
      onRunStart: ((e): void => {
        rows = [];
        dryRun = e.dryRun;
      }),
      onCacheHit: ((e): void => {
        rows.push({
          label: e.label,
          durationMs: 0,
          status: 'cached'
        });
      }),
      onTaskEnd: ((e): void => {
        rows.push({
          label: e.label,
          durationMs: e.durationMs,
          status: 'ok'
        });
      }),
      onTaskError: ((e): void => {
        rows.push({
          label: e.label,
          durationMs: 0,
          status: 'failed'
        });
      }),
      onRunEnd: ((e): void => {
        if(dryRun || (rows.length === 0)) {
          return;
        }

        const width = Math.max(...rows.map(r => r.label.length));
        const divider = chalk.dim('─'.repeat(width + 16));

        process.stderr.write(`${chalk.dim('summary')}\n${divider}\n`);
        for(const row of rows) {
          process.stderr.write(`  ${row.label.padEnd(width)}  ${cell(row)}\n`);
        }
        process.stderr.write(`${divider}\n`);

        const ok = rows.filter(r => (r.status === 'ok')).length;
        const cached = rows.filter(r => (r.status === 'cached')).length;
        const failed = rows.filter(r => (r.status === 'failed')).length;
        const parts = [
          `${ok} ok`,
          ...((cached > 0) ? [`${cached} cached`] : []),
          ...((failed > 0) ? [chalk.red(`${failed} failed`)] : []),
          `${fmtDuration(e.durationMs)} total`
        ];
        process.stderr.write(`  ${parts.join('  ')}\n`);
      })
    }
  };
});

export {
  summaryReporter
};
