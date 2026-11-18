/**
 * The dependency-cruiser configuration, built from the package roles: role boundaries, Node builtins in universal
 * roles, cycles, core's layers, and test code never imported by shipped code. Disposable trees (`.tmp/`) are excluded.
 */
import type { IConfiguration, IForbiddenRuleType } from 'dependency-cruiser';

import { discoverPackages, forbiddenPackagesFor, UNIVERSAL_ROLES } from './roles.ts';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches a package either by its resolved directory or, when unresolvable, by its module name. */
function packagePathPattern(dir: string, name: string): string {
  return `^(${escapeRegExp(dir)}/|${escapeRegExp(name)}(/|$))`;
}

/** Per-package boundary rules, derived from each package's declared role. */
function boundaryRules(root: string): IForbiddenRuleType[] {
  return discoverPackages(root).flatMap((pkg, _, all) => {
    const rules: IForbiddenRuleType[] = [];
    // Package boundaries protect shipped code; tests may wire several adapters together (integration tests).
    const from = { path: `^${escapeRegExp(pkg.dir)}/`, pathNot: '(^|/)__tests__/' };
    const forbidden = forbiddenPackagesFor(pkg, all);

    if (forbidden.length > 0) {
      rules.push({
        name: 'role-boundary',
        comment: `A "${pkg.role}" package must not import ${forbidden.map((p) => `"${p.name}"`).join(', ')}.`,
        severity: 'error',
        from,
        to: { path: forbidden.map((p) => packagePathPattern(p.dir, p.name)) },
      });
    }

    if (UNIVERSAL_ROLES.includes(pkg.role)) {
      rules.push({
        name: 'universal-no-node-builtins',
        comment: `A "${pkg.role}" package must run anywhere: no Node builtins.`,
        severity: 'error',
        from,
        to: { dependencyTypes: ['core'] },
      });
    }

    return rules;
  });
}

/**
 * Layers of the core package, lowest first (see `roles.ts`): a layer only imports the layers below it; `config.ts`
 * and `index.ts`, at the root, sit on top of all of them.
 */
const CORE_LAYERS: readonly string[] = ['shared', 'declarations', 'paths', 'messages', 'content'];

function coreLayerRules(root: string): IForbiddenRuleType[] {
  return discoverPackages(root)
    .filter((pkg) => pkg.role === 'core')
    .flatMap((pkg) => {
      const src = `^${escapeRegExp(pkg.dir)}/src/`;

      return CORE_LAYERS.map((layer, index) => {
        const above = [...CORE_LAYERS.slice(index + 1).map((name) => `${name}/`), 'config\\.ts$', 'index\\.ts$'];

        return {
          name: 'core-layers',
          comment: `core/${layer} must only import the layers below it (${CORE_LAYERS.slice(0, index).join(', ') || 'none'}).`,
          severity: 'error',
          from: { path: `${src}${layer}/`, pathNot: '(^|/)__tests__/' },
          to: { path: `${src}(${above.join('|')})` },
        } satisfies IForbiddenRuleType;
      });
    });
}

/**
 * The whole dependency-cruiser configuration of the workspace rooted at `root` (also used by the fixture tests).
 *
 * @param root - The workspace root.
 * @returns The cycle, role and core-layer rules.
 */
export function createDepcruiseConfig(root: string): IConfiguration {
  return {
    forbidden: [
      { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
      {
        name: 'no-tests-in-shipped-code',
        comment: 'Shipped code must not import tests, scenarios or fixtures (`__tests__` folders).',
        severity: 'error',
        from: { pathNot: '(^|/)__tests__/' },
        to: { path: '(^|/)__tests__/' },
      },
      ...boundaryRules(root),
      ...coreLayerRules(root),
    ],
    options: {
      doNotFollow: { path: 'node_modules' },
      // Disposable test and playground trees are not part of the workspace graph.
      exclude: { path: ['(^|/)dist/', '(^|/)node_modules/', '(^|/)\\.tmp/'] },
      tsPreCompilationDeps: true,
      combinedDependencies: true,
      tsConfig: { fileName: 'tsconfig.json' },
      enhancedResolveOptions: {
        conditionNames: ['@figatellu/source', 'import', 'types', 'default'],
      },
    },
  };
}
