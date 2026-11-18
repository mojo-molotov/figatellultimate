/**
 * The naming rule of segments and slugs: `^[a-z0-9][-a-z0-9]*$`, tested on the name as written.
 *
 * Key design decision: uppercase is rejected, never lowercased: the URL always matches the path exactly, and two
 * names differing only by case (which collide on macOS and Windows) cannot exist. A leading `_` or `$` is
 * impossible, which leaves `$` free for a node's own fields in the message keys.
 */
/** Naming rule for every segment and slug. Tested on the name as is: uppercase is rejected. */
const NAME_PATTERN = /^[a-z0-9][-a-z0-9]*$/;

/**
 * Whether a name follows the naming rule.
 *
 * @param name - A segment or slug, as written.
 * @returns Whether it is lowercase letters, digits and hyphens, not starting with a hyphen.
 */
export function isValidName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

/**
 * Closest valid name, used as a fix suggestion; `''` when nothing can be kept.
 *
 * @param name - An invalid name.
 * @returns The closest valid one, `''` when nothing can be kept.
 *
 * @example
 * sanitizeName('My Post'); // 'my-post'
 */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}
