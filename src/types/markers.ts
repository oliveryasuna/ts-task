/*
 * Phantom markers.
 */

// These carry type information that has no runtime representation. They are
// `unique symbol` keys rather than plain properties so they cannot collide with
// user data and do not show up in autocomplete on the value side.

const OUT = Symbol('ts-task.out');
const PENDING = Symbol('ts-task.pending');
const INPUT = Symbol('ts-task.input');

export {
  OUT,
  PENDING,
  INPUT
};
