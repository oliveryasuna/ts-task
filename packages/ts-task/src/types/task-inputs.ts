import type {INPUT} from './markers';

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

export type {
  InputType
};
