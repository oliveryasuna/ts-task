# plugin-merge-tasks

A ts-task plugin that merges tasks from other config files.

## Install

```sh
bun add --global @oliveryasuna/ts-task-merge-tasks

# or pnpm
pnpm add --global @oliveryasuna/ts-task-merge-tasks

# or npm
npm install --global @oliveryasuna/ts-task-merge-tasks

# or yarn
yarn add --global @oliveryasuna/ts-task-merge-tasks
```

## Usage

A common use case is to merge tasks in a monorepo. ts-task becomes a lightweight monorepo orchestrator.

```ts
// `tasks.config.ts`
import {defineConfig} from '@oliveryasuna/ts-task';
import {mergeTasks} from '@oliveryasuna/ts-task-merge-tasks';

export default defineConfig({
  plugins: [await mergeTasks(
    'packages/webapp/tasks.config.ts',
    'packages/api/tasks.config.ts',
    'packages/shared/tasks.config.ts'
  )]
});


// `packages/webapp/tasks.config.ts`
import {defineConfig} from '@oliveryasuna/ts-task';
import {mergeTasks} from '@oliveryasuna/ts-task-merge-tasks';
import {build as sharedBuild} from '../shared/tasks.config';

const build = namespace('webapp').task({
  //...
  deps: [sharedBuild]
});
const lint = namespace('webapp').task(...);
const test = namespace('webapp').task(...);

export default defineConfig({tasks: [build, lint, test]});


// `packages/api/tasks.config.ts`
import {defineConfig} from '@oliveryasuna/ts-task';
import {mergeTasks} from '@oliveryasuna/ts-task-merge-tasks';
import {build as sharedBuild} from '../shared/tasks.config';

const build = namespace('api').task({
  //...
  deps: [sharedBuild]
});
const lint = namespace('api').task(...);
const test = namespace('api').task(...);

export default defineConfig({tasks: [build, lint, test]});
export {build};


// `packages/shared/tasks.config.ts`
import {defineConfig} from '@oliveryasuna/ts-task';
import {mergeTasks} from '@oliveryasuna/ts-task-merge-tasks';

const build = namespace('shared').task(...);
const lint = namespace('shared').task(...);
const test = namespace('shared').task(...);

export default defineConfig({tasks: [build, lint, test]});
```

Execute the tasks with:

```sh
# From the root of the monorepo
tt webapp:build
```
