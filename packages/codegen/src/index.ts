/**
 * The code generator: turns a validated assembly into the typed modules of `.figatellultimate/`, imported by the app
 * through its `package.json` `imports`: `#figatellultimate/<module>` maps to `./.figatellultimate/<module>/index.js`.
 *
 * Generated layout:
 *     .figatellultimate/
 *       locales/        the locale union, the default locale, each locale's metadata
 *       <collection>/   index (light items, getX, findX, findXByUrl, listX, facets, folder pages), types, entries/...
 *       urls/           findByUrl, mountedUrls, metadataFields, urlOf, segmentsOf: one catch-all route for all
 *       navigation/     one tree per locale
 *       taxonomies/     each taxonomy's terms and data
 *       terms/          term pages: findXTermByUrl, xTermUrl
 *       messages/       the message types, the skeleton, a lazy loader per locale
 *
 * Key design decisions:
 *     - Generated per collection and named after it (`getBlogPost`, `BlogPost`): the library stays collection-
 *       agnostic, only the generator knows names.
 *     - Resolved types: a nested lookup table (segments, then slug or path, then the locales an entry exists in) and
 *       generic getters, never one union of every entry (a union of tuples failed at 2,000 posts, "union type too
 *       complex"; the table typechecks 50,000 in a fraction of a second). Getters accept existing entries only, with
 *       dependent narrowing; the full `Locale` union requires the entry in every locale.
 *     - `getX` (strict, typed by the content) and `findX` (from URL strings, guarded) share one untyped lookup, so no
 *       narrowing is paid twice.
 *     - Light indexes imported statically, one data module per entry imported lazily: a route only loads what it
 *       displays.
 *     - JavaScript and declarations, as little as needed: indexes as `.js` + `.d.ts`, types as `.d.ts`, entries as
 *       `.js` only (an app's typecheck never reaches them). Plain Node runs the output.
 *     - Built as ts-morph declarations on an in-memory file system, then transpiled file by file: no string templates
 *       patched with regular expressions, no program, deterministic.
 *     - Messages typed by a lookup table of keys to ICU arguments, and scoped translators by subtree: cheap at tens of
 *       thousands of keys.
 *     - Folder and term pages are mounted like entries: `findByUrl` finds them, `mountedUrls` lists them, with their
 *       neutral data; the app renders them.
 *
 * Invariants:
 *     - Pure and deterministic: byte-identical output for the same input, whatever the documents' order; no absolute
 *       path in generated code (`emit.test.ts`).
 *     - Type guarantees: invalid calls fail to compile, at scale too (`*.test-d.ts`, an app compiled in memory, a
 *       2,000-post table).
 *     - The generated JavaScript runs (`runtime.test.ts`, `folders-runtime.test.ts`, `terms-runtime.test.ts`,
 *       `seo-runtime.test.ts`, `url-helpers-runtime.test.ts`), the messages compile (`messages.test.ts`).
 *
 * Limitations:
 *     - `listX` takes independent optional segment filters, not dependent narrowing like `getX`.
 *     - List functions are named after the collection's key (`listBlog`), never a guessed English plural.
 */
export { emit, type EmitInput } from './emit.js';
export type { GeneratedFile } from './render.js';
