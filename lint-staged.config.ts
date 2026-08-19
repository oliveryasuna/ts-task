import type {Configuration} from 'lint-staged';

export default ({
  '*': ['secretlint "**/*"']
  // TODO: Add linting for the packages.
  // eslint-disable-next-line custom/comment-length-limit -- Temporary.
  // 'packages/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,json,md,html,css,scss}': ['bun run ./packages/cli/src/index.ts run :lint --affected']
} satisfies Configuration);
