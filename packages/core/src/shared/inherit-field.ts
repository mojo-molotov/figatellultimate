/**
 * The frontmatter field a translation names its source with (`inherit: fr`): reserved, never a field of the content.
 * Its own module, so that declarations and the content's resolution share it without importing each other.
 */

/** The reserved frontmatter field naming the locale a translation takes every field it leaves out from. */
export const INHERIT_FIELD = 'inherit';
