/**
 * A record built from its keys, typed exactly.
 */
/**
 * An object with one value per key, built from the keys themselves: the one place where core tells the type checker
 * what it cannot prove (that an object filled key by key from `keys` has every key of `K`), so that callers never do.
 *
 * @param keys - The keys.
 * @param value - Each key's value.
 * @returns A frozen record with every key.
 */
export function recordFrom<const K extends string, V>(
  keys: readonly K[],
  value: (key: K) => V,
): Readonly<Record<K, V>> {
  const record: Partial<Record<K, V>> = {};

  for (const key of keys) record[key] = value(key);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- filled with every key just above.
  return Object.freeze(record as Record<K, V>);
}
