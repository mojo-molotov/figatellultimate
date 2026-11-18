/**
 * The entry descriptor: the structure of an entry, deduced from its path. The frontmatter only holds editorial
 * content.
 */
/** The result of parsing a source path: everything core knows about an entry, from its path alone. */
export interface EntryDescriptor {
  readonly collection: string;
  /** POSIX path relative to the collection root, e.g. `'en/docs/setup.mdx'`. */
  readonly sourcePath: string;
  readonly locale: string;
  /** Whether the locale came from a folder or from the implicit notation. */
  readonly localeSource: 'folder' | 'implicit';
  /** Named segment values; a rest segment is joined with `/` (`''` when empty). */
  readonly segments: Readonly<Record<string, string>>;
  /** File name without extension; `'index'` for index files. */
  readonly slug: string;
  readonly isIndex: boolean;
  /** Locale-independent identity linking translations: segments + slug, index removed (`'docs/setup'`, `'docs'`, `''`). */
  readonly key: string;
  /** URL without locale prefix, with a leading slash (`'/blog/tech/ts/intro'`, `'/'`). */
  readonly route: string;
  /** Excluded from automatic mounting. */
  readonly reserved: boolean;
}
