/*
 * Options (global flags).
 */

/**
 * An option/flag declaration.
 *
 * `T` is the *resolved* value type; optionality is encoded as `T | undefined`
 * rather than a separate `required` type parameter, which keeps
 * {@link OptionValues} a plain homomorphic mapped type.
 */
interface Option<T> {
  readonly kind: ('string' | 'number' | 'boolean');
  readonly description?: string;
  readonly short?: string;
  readonly defaultValue?: T;
  readonly isRequired?: boolean;
  /**
   * Raw argv token -> value.
   *
   * `undefined` raw means the flag was absent.
   */
  // eslint-disable-next-line @typescript-eslint/method-signature-style -- Intentional.
  readonly parse: ((raw: string) => T);
}

type OptionsSpec = Readonly<Record<string, Option<any>>>;

type ValueOf<O> = (O extends Option<infer T> ? T : never);

type OptionValues<O extends OptionsSpec> = {
  readonly [K in (keyof O)]: ValueOf<O[K]>;
};

/**
 * Fluent builders: each transition narrows `T` by removing `undefined`.
 */
interface OptionBuilder<T> extends Option<T> {
  describe(text: string): OptionBuilder<T>;
  alias(short: string): OptionBuilder<T>;
  required(): OptionBuilder<Exclude<T, undefined>>;
  default(value: Exclude<T, undefined>): OptionBuilder<Exclude<T, undefined>>;
}

export type {
  Option,
  OptionsSpec,
  ValueOf,
  OptionValues,
  OptionBuilder
};
