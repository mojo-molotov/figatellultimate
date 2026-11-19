/**
 * The ports: what core needs from the outside, as interfaces; adapters implement them (`@figatellultimate/fs-node`,
 * `@figatellultimate/content-collections`).
 *
 *     PathLister     lists a content folder's files, as POSIX paths
 *     ContentSource  the delegated content pipeline: documents validated by the user's schema, its diagnostics, its
 * watch
 *     Environment    whether drafts and test content are kept, injected, never read from `process`
 *
 * Key design decision: core does no I/O and knows no tool; the delegated tool stays replaceable behind
 * `ContentSource`, and core needs neither DOM nor Node types (`AbortSignalLike`).
 */
import type { Diagnostic } from '../shared/diagnostics.js';
import type { Result } from '../shared/result.js';

/**
 * The part of `AbortSignal` core relies on. Core targets ES2022 without DOM or Node types, and any real
 * `AbortSignal` satisfies this interface.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  throwIfAborted(): void;
}

/** Why a directory could not be listed (the caller turns it into a `cannot-list-directory` diagnostic). */
export interface ListError {
  readonly reason: string;
}

/** Port: lists the files of a directory, recursively, as POSIX paths relative to it. */
export interface PathLister {
  list(
    directory: string,
    options?: { readonly signal?: AbortSignalLike | undefined },
  ): Promise<Result<readonly string[], ListError>>;
}

/** A document delivered by the delegated tool, already validated by the user's schema. */
export interface SourceDocument {
  readonly collection: string;
  /** Collection-relative POSIX path: the join key with figatellultimate's descriptors. */
  readonly sourcePath: string;
  /** Validated (and possibly transformed) frontmatter; figatellultimate only reads the fields it is told about. */
  readonly data: Readonly<Record<string, unknown>>;
  readonly body: string;
}

/** One item of the delegated tool's stream: a document, or a diagnostic about a file. */
export type SourceEvent =
  | { readonly kind: 'document'; readonly document: SourceDocument }
  | { readonly kind: 'diagnostic'; readonly diagnostic: Diagnostic };

/** A type-only import needed by a `TypeSource`; the specifier is relative to the generated file. */
export interface TypeImport {
  readonly moduleSpecifier: string;
  readonly defaultImport?: string | undefined;
  readonly namedImports?: readonly string[] | undefined;
}

/** How generated types refer to a collection's data type, at type level only ("Data types"). */
export interface TypeSource {
  /** Type-only imports, structured (the codegen builds them as declarations). */
  readonly imports: readonly TypeImport[];
  /** A type expression for the collection's data (frontmatter, without the tool's own fields). */
  readonly type: string;
}

/** Port: the delegated content pipeline. Its errors come back as figatellultimate diagnostics. */
export interface ContentSource {
  /** Project-relative POSIX directory of each collection: the single declaration of where files live. */
  directories(): Promise<Readonly<Record<string, string>>>;
  /**
   * Documents and diagnostics, as a stream. `paths` is what figatellultimate just listed on disk, per collection
   * (collection-relative POSIX paths; a collection whose listing failed is absent): a stateful source reconciles
   * with it before delivering, so that a missed watcher event cannot leave it out of date.
   */
  documents(options?: {
    readonly signal?: AbortSignalLike | undefined;
    readonly paths?: Readonly<Record<string, readonly string[]>> | undefined;
  }): AsyncIterable<SourceEvent>;
  /** Optional: calls `onChange` after each content change, until stopped. */
  watch?(onChange: () => void): Promise<{ stop(): Promise<void> }>;
  /**
   * Optional: the data type of a collection, for generated types. `fromDirectory` is the absolute directory of the
   * generated file, so that import specifiers can be made relative (no absolute path in generated code).
   */
  typeSource?(collection: string, fromDirectory: string): TypeSource | undefined;
}

/** Injected environment: never read from `process`. */
export interface Environment {
  readonly drafts: 'include' | 'exclude';
  readonly testContent: 'include' | 'exclude';
}
