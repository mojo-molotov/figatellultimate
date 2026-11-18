/**
 * "Did you mean" suggestions for closed lists (locales, terms, keys, options): the edit distance, merged with
 * prefix matches.
 */
const DISTANCE_THRESHOLD = 4;

/**
 * Damerau-Levenshtein distance (optimal string alignment: insertions, deletions, substitutions, adjacent
 * transpositions).
 *
 * @param a - A string.
 * @param b - Another string.
 * @returns The number of edits between them.
 *
 * @example
 * damerauLevenshtein('nmae', 'name'); // 1
 */
export function damerauLevenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[] = Array.from({ length: rows * cols }, (_, index) => {
    const i = Math.floor(index / cols);
    const j = index % cols;

    return i === 0 ? j : j === 0 ? i : 0;
  });
  const at = (i: number, j: number): number => d[i * cols + j] ?? 0;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }

      d[i * cols + j] = best;
    }
  }

  return at(a.length, b.length);
}

/**
 * "Did you mean": candidates at the best Damerau-Levenshtein distance (≤ 4, with a length pre-filter),
 * merged with candidates starting with the input. Sorted and deduplicated, so the output never depends on input order.
 *
 * @param input - What the author wrote.
 * @param candidates - What exists.
 * @returns The closest candidates, sorted; empty when nothing is close.
 *
 * @example
 * suggest('patch-note', ['patch-notes', 'tutorials']); // ['patch-notes']
 */
export function suggest(input: string, candidates: readonly string[]): readonly string[] {
  const scored = [...new Set(candidates)].map((candidate) => ({
    candidate,
    distance:
      Math.abs(candidate.length - input.length) > DISTANCE_THRESHOLD
        ? Number.POSITIVE_INFINITY
        : damerauLevenshtein(input, candidate),
    isPrefixMatch: input.length > 0 && candidate.startsWith(input),
  }));
  const best = Math.min(...scored.map((s) => s.distance));

  return scored
    .filter((s) => s.isPrefixMatch || (s.distance <= DISTANCE_THRESHOLD && s.distance === best))
    .sort((x, y) => x.distance - y.distance || x.candidate.localeCompare(y.candidate, 'en'))
    .map((s) => s.candidate);
}
