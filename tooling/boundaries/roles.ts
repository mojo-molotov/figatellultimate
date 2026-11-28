// prettier-ignore
/**
 * Package roles: the single source of the boundary rules, enforced twice (ESLint for editor feedback,
 * dependency-cruiser as a whole-graph guard in CI), on shipped code only (tests may wire several adapters together).
 *
 * Every package declares its role in its `package.json`: `{ "figatellultimate": { "role": "core" } }`.
 *
 *     role     may import                                  must not import                             runs on
 *     ───────  ──────────────────────────────────────────  ──────────────────────────────────────────  ───────────────
 *     core     own files, allow-listed pure deps           other @figatellultimate pkg, Node, process  anywhere (ES22)
 *     runtime  core, runtime                               adapter, tooling, Node, process             browser, edge
 *     adapter  core, runtime, its integration target       tooling, other adapters                     target runtime
 *     tooling  everything                                  (nothing)                                   Node ≥ 24
 *
 * Inside `@figatellultimate/core`, folders are layers, lowest first, each importing only those below it:
 *     shared ──> declarations ──> paths ──> messages ──> content ──> config.ts, index.ts
 *
 * Key design decisions:
 *     - The core is pure (ports and adapters): no I/O, no framework; everything touching the outside world is an
 *       adapter implementing a port the core defines.
 *     - Rules are written once per role, so that a new package is covered by declaring its role; a package without a
 *       valid role makes both configurations throw, so none escapes the rules.
 *     - No import cycles, no internal barrels; every package keeps its root for its entry points.
 *
 * Invariants (`boundaries.test.ts`): each rule fires in both ESLint and dependency-cruiser on a negative fixture
 * (`__tests__/fixtures/`), and a clean control file stays clean, so that a rule set reporting everything cannot pass.
 *
 * Limitation: `no-restricted-globals` catches `process` but not `globalThis.process`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';

/** Role of a workspace package, declared in its `package.json` under `figatellultimate.role`. */
export type Role = 'core' | 'runtime' | 'adapter' | 'tooling';

const ROLES: readonly Role[] = ['core', 'runtime', 'adapter', 'tooling'];

/** A workspace package, as the boundary checks see it: its name, its folder and its role. */
export interface WorkspacePackage {
  /** npm name, e.g. `@figatellultimate/core`. */
  readonly name: string;
  /** POSIX path relative to the workspace root, e.g. `packages/core`. */
  readonly dir: string;
  readonly role: Role;
}

/** Which roles a role may import (besides itself as a package). */
const ALLOWED_ROLE_IMPORTS: Readonly<Record<Role, readonly Role[]>> = {
  core: [],
  runtime: ['core', 'runtime'],
  adapter: ['core', 'runtime'],
  tooling: ['core', 'runtime', 'adapter', 'tooling'],
};

/** Roles whose code must run anywhere (browser, edge, workers): no Node builtins, no `process`. */
export const UNIVERSAL_ROLES: readonly Role[] = ['core', 'runtime'];

/** Node builtin specifiers, both `node:x` and bare `x` forms. */
export const NODE_BUILTINS: readonly string[] = [
  ...new Set(builtinModules.flatMap((m) => (m.startsWith('node:') ? [m] : [m, `node:${m}`]))),
];

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.some((role) => role === value);
}

/**
 * Lists the packages under `<root>/packages`, with their declared role. An undeclared role would silently escape the
 * boundary rules, so it throws.
 *
 * @param root - The workspace root.
 * @returns Each package with its name, folder and role.
 * @throws {Error} When a package has no valid role.
 */
export function discoverPackages(root: string): WorkspacePackage[] {
  return readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = `packages/${entry.name}`;
      const manifest: unknown = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
      const name = readString(manifest, 'name');
      const role = readRole(manifest);

      if (name === undefined || role === undefined) {
        throw new Error(
          `${dir}/package.json must declare a "name" and a "figatellultimate.role" (${ROLES.join(' | ')}).`,
        );
      }

      return { name, dir, role };
    });
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined;

  const field: unknown = Reflect.get(value, key);

  return typeof field === 'string' ? field : undefined;
}

function readRole(manifest: unknown): Role | undefined {
  if (typeof manifest !== 'object' || manifest === null || !('figatellultimate' in manifest)) return undefined;

  const role: unknown = readString(manifest.figatellultimate, 'role');

  return isRole(role) ? role : undefined;
}

/**
 * Packages that `pkg` must not import, according to its role.
 *
 * @param pkg - The importing package.
 * @param all - Every workspace package.
 * @returns The packages whose role its role may not import.
 */
export function forbiddenPackagesFor(pkg: WorkspacePackage, all: readonly WorkspacePackage[]): WorkspacePackage[] {
  const allowed = ALLOWED_ROLE_IMPORTS[pkg.role];

  return all.filter((other) => other.name !== pkg.name && !allowed.includes(other.role));
}
