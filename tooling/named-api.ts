/**
 * The names a document gives of figatellultimate's API, checked against the code: the packages and entries it names,
 * the names its code imports from them, the generated modules and the CLI commands. Read by the tests of the agent
 * skills (`skills.test.ts`) and of the example's documentation (`example-docs.test.ts`): a reader, a person or an
 * agent, follows a document to the letter, so a name it gives that no longer exists sends them astray.
 *
 *     a document ──> `@figatellultimate/x/y`    ──> a package and one of its entries (`package.json` `exports`)
 *                ──> `import { a } from '…'`    ──> an export of that package (its sources)
 *                ──> `#figatellultimate/x`      ──> a generated module
 *                ──> `figatellultimate <cmd>`   ──> a command of the CLI
 *
 * Key design decisions:
 *     - The names read from the text, not from a list kept beside it: a document rewritten is checked as written.
 *     - An export found in its package's sources (an exported declaration, or a name in an export list): cheaper than
 *       the compiler, and enough to tell a renamed or removed name.
 *
 * Limitations: a function's signature or an option's name in prose is not checked, only the names above.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PACKAGES = join(ROOT, 'packages');

/** The generated modules every project has. */
const GENERATED = ['urls', 'locales', 'navigation', 'taxonomies', 'terms', 'messages'];

/** The CLI's commands. */
const COMMANDS = ['build', 'check', 'watch', 'search', 'migrate'];

/** A package's entries (`.`, `./scripts`…) and every name its sources export. */
interface PackageApi {
  readonly entries: readonly string[];
  readonly exported: ReadonlySet<string>;
}

/** A package's API, read from its manifest and its sources. */
function packageOf(folder: string): [string, PackageApi] {
  const manifest: unknown = JSON.parse(readFileSync(join(PACKAGES, folder, 'package.json'), 'utf8'));
  const name: unknown = typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'name') : undefined;
  const exports: unknown =
    typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'exports') : undefined;
  const sources = readdirSync(join(PACKAGES, folder, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !path.includes('__tests__'))
    .map((path) => readFileSync(join(PACKAGES, folder, 'src', path), 'utf8'));
  const exported = new Set<string>();

  for (const source of sources) {
    for (const [, declared] of source.matchAll(
      /export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type)\s+(\w+)/g,
    ))
      if (declared !== undefined) exported.add(declared);

    for (const [, list] of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g))
      for (const item of (list ?? '').split(','))
        exported.add(
          item
            .replace(/^\s*type\s+/, '')
            .split(/\s+as\s+/)
            .at(-1)
            ?.trim() ?? '',
        );
  }

  return [
    typeof name === 'string' ? name : folder,
    { entries: typeof exports === 'object' && exports !== null ? Object.keys(exports) : [], exported },
  ];
}

const packages = new Map(
  readdirSync(PACKAGES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => packageOf(entry.name)),
);

/** What a document names, and what of it does not exist. */
export interface NamedApi {
  /** How many of each it names: a precondition, so that a document naming nothing never passes for one in order. */
  readonly counts: {
    readonly packages: number;
    readonly imports: number;
    readonly modules: number;
    readonly commands: number;
  };
  /** Each name that does not exist, as `kind: name`. */
  readonly missing: readonly string[];
}

/**
 * The names a document gives of the API, and those that do not exist.
 *
 * @param text - The document's text.
 * @param modules - The generated modules it may name beyond every project's (a collection's, `*`, `<collection>`).
 * @returns The counts of what it names, and every missing package, entry, export, generated module or command.
 *
 * @example
 * namedApi(readFileSync('skills/use-figatellultimate/SKILL.md', 'utf8'), ['<collection>']).missing; // []
 */
export function namedApi(text: string, modules: readonly string[] = []): NamedApi {
  const named = [...text.matchAll(/@figatellultimate\/([a-z0-9-]+)(\/[a-z0-9.-]+)?/g)];
  const imports = [
    ...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(@figatellultimate\/[a-z0-9-]+)(?:\/[a-z0-9.-]+)?'/g),
  ];
  const generated = [...text.matchAll(/#figatellultimate\/([*<>a-zA-Z-]+)/g)].map(([, module]) => module ?? '');
  const commands = [...text.matchAll(/`figatellultimate ([a-z-]+)/g)].map(([, command]) => command ?? '');
  const missing = [
    // A package by its name alone (it exists), or one of its entries (`@figatellultimate/next16/build`).
    ...named.flatMap(([, name, entry]) => {
      const found = packages.get(`@figatellultimate/${name ?? ''}`);

      return found === undefined || (entry !== undefined && !found.entries.includes(`.${entry}`))
        ? [`package: @figatellultimate/${name ?? ''}${entry ?? ''}`]
        : [];
    }),
    ...imports.flatMap(([, list, name]) =>
      (list ?? '')
        .split(',')
        .map((item) => item.replace(/^\s*type\s+/, '').trim())
        .filter((item) => item !== '' && packages.get(name ?? '')?.exported.has(item) !== true)
        .map((item) => `export: ${name ?? ''} ${item}`),
    ),
    ...generated.filter((module) => ![...GENERATED, ...modules].includes(module)).map((module) => `module: ${module}`),
    ...commands.filter((command) => !COMMANDS.includes(command)).map((command) => `command: ${command}`),
  ];

  return {
    counts: { packages: named.length, imports: imports.length, modules: generated.length, commands: commands.length },
    missing: [...new Set(missing)],
  };
}
