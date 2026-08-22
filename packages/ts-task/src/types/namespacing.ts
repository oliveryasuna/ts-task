// A task's `id` may be qualified with ':' (e.g., `build:compile`). The ID is
// what `the CLI and the graph use. The *dep key* (property name under which a
// dependency's output appears in `ctx.deps`) defaults to the last segment of
// the ID, so namespacing never forces bracket access:
//
//  ctx.deps.compile    // not ctx.deps['build:compile']
//
// Two dependencies whose IDs share a last segment collide; resolve with
// `.as('someOtherKey')`, which is enforced at compile-time.

type LastSegment<S extends string> = (S extends `${string}:${infer Rest}` ? LastSegment<Rest> : S);

type Qualify<
  TPrefix extends string,
  TId extends string
> = (TPrefix extends '' ? TId : `${TPrefix}:${TId}`);

export type {
  LastSegment,
  Qualify
};
