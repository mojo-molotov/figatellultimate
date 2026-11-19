/**
 * The ESLint configuration, built from the package roles: typescript-eslint `strictTypeChecked`, the role boundaries,
 * no cycles, no extraneous dependencies, no type assertions (`as const` aside), no DOM queries in React code (refs
 * instead), no whole-range coverage ignore. Run with `--max-warnings 0`.
 */
import { join } from 'node:path';

import js from '@eslint/js';
import type { Linter } from 'eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import { configs as tsConfigs } from 'typescript-eslint';

import { airy } from './airy.ts';
import { discoverPackages, forbiddenPackagesFor, NODE_BUILTINS, UNIVERSAL_ROLES } from './roles.ts';

/**
 * Comments that exclude a whole range or file from coverage. `v8 ignore next` stays allowed.
 * Matched by `no-warning-comments`, which only looks at the start of a comment.
 */
const COVERAGE_RANGE_IGNORES: string[] = [
  'v8 ignore start',
  'v8 ignore file',
  'c8 ignore start',
  'c8 ignore file',
  'istanbul ignore file',
];

/** Files of a package that are not shipped (tests and their scenarios, config files): they may use root devDependencies. */
const NON_SHIPPED_FILES: string[] = ['**/__tests__/**/*.{ts,tsx}', '*.config.ts'];

/**
 * Dependency declaration rules: shipped package code may only import its own package's dependencies;
 * tests and config files may also use the root devDependencies.
 */
function dependencyConfigs(root: string): Linter.Config[] {
  return discoverPackages(root).flatMap((pkg) => [
    {
      name: `figatellultimate/dependencies/${pkg.name}`,
      files: [`${pkg.dir}/**/*.{ts,tsx}`],
      rules: {
        'import-x/no-extraneous-dependencies': [
          'error',
          { devDependencies: false, optionalDependencies: false, packageDir: [join(root, pkg.dir)] },
        ],
      },
    },
    {
      name: `figatellultimate/dependencies/${pkg.name}/non-shipped`,
      files: NON_SHIPPED_FILES.map((glob) => `${pkg.dir}/${glob}`),
      rules: {
        'import-x/no-extraneous-dependencies': [
          'error',
          { devDependencies: true, packageDir: [join(root, pkg.dir), root] },
        ],
      },
    },
  ]);
}

/** Per-package boundary rules, derived from each package's declared role. */
function boundaryConfigs(root: string): Linter.Config[] {
  const packages = discoverPackages(root);

  return packages.map((pkg) => {
    const forbidden = forbiddenPackagesFor(pkg, packages);
    const universal = UNIVERSAL_ROLES.includes(pkg.role);
    const patterns = forbidden.map((other) => ({
      group: [other.name, `${other.name}/*`],
      message: `A "${pkg.role}" package must not import "${other.name}" (role "${other.role}"). See tooling/boundaries/roles.ts.`,
    }));
    const paths = universal
      ? NODE_BUILTINS.map((name) => ({
          name,
          message: `A "${pkg.role}" package must run anywhere: no Node builtins (use a port).`,
        }))
      : [];
    const config: Linter.Config = {
      name: `figatellultimate/boundaries/${pkg.name}`,
      files: [`${pkg.dir}/**/*.{ts,tsx}`],
      // Package boundaries protect shipped code; tests may wire several adapters together (integration tests).
      ignores: [`${pkg.dir}/**/__tests__/**`],
      rules: {
        'no-restricted-imports': ['error', { paths, patterns }],
      },
    };

    if (universal) {
      config.rules = {
        ...config.rules,
        'no-restricted-globals': [
          'error',
          { name: 'process', message: 'Universal packages must not read `process`: inject the environment.' },
        ],
      };
    }

    return config;
  });
}

/**
 * The whole ESLint configuration of the workspace rooted at `root` (also used by the boundary fixture tests).
 *
 * @param root - The workspace root.
 * @param ignores - Extra ignored globs.
 * @returns The flat config: recommended, typed and boundary rules.
 */
export function createEslintConfig(root: string, ignores: readonly string[] = []): Linter.Config[] {
  return defineConfig(
    globalIgnores(['**/dist/**', '**/coverage/**', ...ignores]),
    js.configs.recommended,
    tsConfigs.strictTypeChecked,
    {
      languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: root } },
    },
    importX.flatConfigs.recommended,
    importX.flatConfigs.typescript,
    {
      name: 'figatellultimate/base',
      settings: {
        'import-x/resolver-next': [
          // Workspace packages resolve each other through their sources (`@figatellultimate/source` export condition).
          createTypeScriptImportResolver({
            conditionNames: ['@figatellultimate/source', 'types', 'import', 'node', 'require', 'default'],
          }),
        ],
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        // No type assertions: narrow with guards, never tell the checker what it cannot prove. `as const` stays.
        '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
        'import-x/no-cycle': 'error',
        'import-x/no-extraneous-dependencies': ['error', { packageDir: [root] }],
        'no-warning-comments': ['error', { terms: COVERAGE_RANGE_IGNORES, location: 'start' }],
      },
    },
    // Airy code: blank lines before a return, after declarations, around control flow.
    airy(['**/*.{ts,tsx}']),
    {
      // React's rules of hooks and compiler-backed checks, wherever React code lives.
      name: 'figatellultimate/react-hooks',
      files: ['**/*.tsx', 'packages/*-react/**/*.ts', 'packages/next16/**/*.ts', 'packages/use-intl/**/*.ts'],
      extends: [reactHooks.configs.flat['recommended-latest']],
    },
    {
      // React code reaches its own elements through refs, never by querying the DOM; tests may query what they render.
      name: 'figatellultimate/react-no-dom-queries',
      files: [
        'packages/ui/src/**/*.{ts,tsx}',
        'packages/*-react/src/**/*.{ts,tsx}',
        'packages/next16/src/**/*.{ts,tsx}',
      ],
      ignores: ['**/__tests__/**'],
      rules: {
        'no-restricted-properties': [
          'error',
          ...['querySelector', 'querySelectorAll', 'closest'].map((property) => ({
            property,
            message: 'Use a ref to the element instead of querying the DOM.',
          })),
        ],
      },
    },
    dependencyConfigs(root),
    boundaryConfigs(root),
    {
      name: 'figatellultimate/plain-js',
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      extends: [tsConfigs.disableTypeChecked],
    },
  );
}
