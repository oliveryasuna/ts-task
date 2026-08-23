import type {Configuration} from 'lint-staged';

export default ({
  '*': ((): string => 'secretlint "**/*"'),
  'packages/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,json,md,html,css,scss}': ((): string[] => [
    'bun ./packages/ts-task/src/cli.ts -c ./tasks.config.ts verify',
    'bun ./packages/ts-task/src/cli.ts -c ./packages/plugin-merge-tasks/tasks.config.ts plugin-merge-tasks:verify',
    'bun ./packages/ts-task/src/cli.ts -c ./packages/plugin-summary/tasks.config.ts plugin-summary:verify',
    'bun ./packages/ts-task/src/cli.ts -c ./packages/ts-task/tasks.config.ts ts-task:verify'
  ])
} satisfies Configuration);
