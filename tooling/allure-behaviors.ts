/**
 * What an Allure report says about each test, deduced from where it lives: its behavior (epic, feature, story), its
 * layer of the testing pyramid, its severity and its tags. Pure: the reporter (`allure.ts`) gives each test's file,
 * family, package role and outermost `describe`, and writes the labels returned.
 *
 *     test file ──> its package ──> BEHAVIORS[package] ──> epic (a product domain), severity, layer
 *               ├─> the package's npm name            ──> feature
 *               ├─> its outermost describe (or file)  ──> story
 *               └─> family, role, type test           ──> layer overrides, tags
 *
 * Key design decisions:
 *     - Deduced, never written in tests: a test says what it checks, the repository says what it belongs to. One table
 *       instead of a call in each of a hundred test files, which would drift.
 *     - Epics are product domains (content model, search, design system…), not architecture roles: a reader looks for
 *       a capability; the role stays a tag.
 *     - Four layers, base first: `unit` (pure code, properties, type tests), `component` (React components, in
 *       happy-dom or in real browsers), `integration` (adapters and tooling in process, with the real tools they drive),
 *       `e2e` (the built command line in real processes, the watch lab). A package's own layer applies to its scenario
 *       tests; a type test is always `unit`, a `.tsx` test always `component`, and the families running real
 *       processes or browsers set theirs.
 *     - The pyramid is the product's, read across every package: with ports and adapters, a package sits in one layer
 *       (the core is pure, an adapter drives its tool), so a package alone would be one level; the mix of packages is
 *       the shape. Each package's own tests stay a filter away (its feature). Rejected: a layer per test, which only
 *       the test could tell (an annotation in each, or a file-name convention).
 *     - The repository's own checks (typography of every content file, workspace and boundary rules, documentation)
 *       are `checks`, outside the pyramid: they test the repository, not the product, and one per content file once
 *       doubled the integration layer.
 *     - Severity per package: `critical` for the pipeline every site depends on (core, codegen, the command line),
 *       `normal` otherwise. Rejected: a severity on each test, which nothing could deduce.
 *
 * Invariants (`__tests__/allure.test.ts`): the table covers every workspace package and names no other; every package
 * is in a layer of the pyramid, the repository's checks alone outside it; the layer, story, severity and tags of each
 * kind of test.
 *
 * Limitation: no tag tells a fast-check property from an example test of the same file: only the test's code knows.
 */
import type { Role } from './boundaries/roles.ts';

/** The test families, each run by its own vitest configuration. */
export type TestFamily = 'scenarios' | 'cli' | 'browsers' | 'lab';

/** The layers of the testing pyramid, base first: the order Allure draws them in. */
export const LAYERS = ['unit', 'component', 'integration', 'e2e'] as const;

/** A package's place in the report: its product domain, its severity and the layer of its scenario tests. */
export interface Behavior {
  readonly epic: string;
  /** Allure's severities used here. */
  readonly severity: 'critical' | 'normal';
  /** A layer of the testing pyramid, or `checks`: the repository's own, which the pyramid does not draw. */
  readonly layer: (typeof LAYERS)[number] | 'checks';
}

const CONTENT = 'Content model';
const CODEGEN = 'Code generation';
const MESSAGES = 'Messages and i18n';
const CLI = 'Command line';
const SITE = 'Site and navigation';
const FACETS = 'Faceted collections';
const SEARCH = 'Search';
const DESIGN = 'Design system';

/** Each package folder's behavior, and `tooling` for the repository's own checks. */
export const BEHAVIORS = {
  core: { epic: CONTENT, severity: 'critical', layer: 'unit' },
  'fs-node': { epic: CONTENT, severity: 'normal', layer: 'integration' },
  'content-collections': { epic: CONTENT, severity: 'normal', layer: 'integration' },
  codegen: { epic: CODEGEN, severity: 'critical', layer: 'integration' },
  messages: { epic: MESSAGES, severity: 'normal', layer: 'unit' },
  'use-intl': { epic: MESSAGES, severity: 'normal', layer: 'integration' },
  cli: { epic: CLI, severity: 'critical', layer: 'integration' },
  site: { epic: SITE, severity: 'normal', layer: 'unit' },
  toc: { epic: SITE, severity: 'normal', layer: 'unit' },
  next16: { epic: SITE, severity: 'normal', layer: 'integration' },
  facets: { epic: FACETS, severity: 'normal', layer: 'unit' },
  'facets-react': { epic: FACETS, severity: 'normal', layer: 'component' },
  search: { epic: SEARCH, severity: 'normal', layer: 'unit' },
  'search-react': { epic: SEARCH, severity: 'normal', layer: 'component' },
  pagefind: { epic: SEARCH, severity: 'normal', layer: 'integration' },
  // A popup's dismissal, pure, shared by the design system's selects (the page select, the search's sort).
  dismiss: { epic: DESIGN, severity: 'normal', layer: 'unit' },
  ui: { epic: DESIGN, severity: 'normal', layer: 'component' },
  effects: { epic: DESIGN, severity: 'normal', layer: 'component' },
  themes: { epic: DESIGN, severity: 'normal', layer: 'integration' },
  tooling: { epic: 'Repository checks', severity: 'normal', layer: 'checks' },
} as const satisfies Readonly<Record<string, Behavior>>;

/** An Allure label. */
export interface Label {
  readonly name: string;
  readonly value: string;
}

/** What the reporter knows of a test. */
export interface TestPlace {
  readonly family: TestFamily;
  /** The test file, POSIX, relative to the repository's root. */
  readonly file: string;
  /** Its outermost `describe`, if any. */
  readonly describe?: string | undefined;
  /** Its package's role; none for the repository's own checks. */
  readonly role?: Role | undefined;
}

/** The package folder a test file belongs to (`packages/<folder>/…`), or `tooling`. */
const folderOf = (file: string): string => /^packages\/([^/]+)\//.exec(file)?.[1] ?? 'tooling';

const isBehaviorKey = (key: string): key is keyof typeof BEHAVIORS => Object.hasOwn(BEHAVIORS, key);

/** The file's name without its test suffix and extension: a story for tests outside any `describe`. */
const fileStory = (file: string): string =>
  (file.split('/').at(-1) ?? file).replace(/(\.[a-z]+)*\.(test-d|test)\.tsx?$/, '');

const isTypeTest = (file: string): boolean => /\.test-d\.tsx?$/.test(file);

function layerOf(place: TestPlace, behavior: Behavior): Behavior['layer'] {
  if (place.family === 'cli' || place.family === 'lab') return 'e2e';

  if (isTypeTest(place.file)) return 'unit';

  if (place.family === 'browsers' || place.file.endsWith('.tsx')) return 'component';

  return behavior.layer;
}

/**
 * The Allure labels of a test, from where it lives.
 *
 * @param place - Its family, file, outermost `describe` and package role.
 * @returns Its epic, feature, story, layer, severity and tags (family, role, `types` for a type test).
 * @throws {Error} When the file's package has no behavior: a new package must be given its place in the report.
 *
 * @example
 * labelsOf({ family: 'scenarios', file: 'packages/core/src/__tests__/config.test.ts', describe: 'defineConfig' });
 * // epic 'Content model', feature '@figatellultimate/core', story 'defineConfig', layer 'unit', severity 'critical'…
 */
export function labelsOf(place: TestPlace): Label[] {
  const folder = folderOf(place.file);

  if (!isBehaviorKey(folder)) {
    throw new Error(`packages/${folder} has no behavior in tooling/allure-behaviors.ts: give it an epic and a layer.`);
  }

  const behavior: Behavior = BEHAVIORS[folder];
  const tags: string[] = [place.family, ...(place.role === undefined ? [] : [place.role])];

  if (isTypeTest(place.file)) tags.push('types');

  return [
    { name: 'epic', value: behavior.epic },
    { name: 'feature', value: folder === 'tooling' ? 'tooling' : `@figatellultimate/${folder}` },
    { name: 'story', value: place.describe ?? fileStory(place.file) },
    { name: 'layer', value: layerOf(place, behavior) },
    { name: 'severity', value: behavior.severity },
    ...tags.map((tag) => ({ name: 'tag', value: tag })),
  ];
}
