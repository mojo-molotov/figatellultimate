import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import allurerc, { LAYERS as REPORT_LAYERS } from '../../allurerc.mjs';
import { labelRun, OS_NAMES, type ModuleShape, type TestShape } from '../allure.ts';
import { BEHAVIORS, LAYERS, labelsOf, type TestPlace } from '../allure-behaviors.ts';
import { discoverPackages } from '../boundaries/roles.ts';

const ROOT = join(import.meta.dirname, '..', '..');

/** A field of a value the reporter wrote, whatever its shape. */
const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

/** A label's values, by name. */
const valuesOf = (labels: readonly { name: string; value: string }[], name: string): string[] =>
  labels.filter((label) => label.name === name).map((label) => label.value);

describe('the behaviors table', () => {
  it('gives every workspace package its place, and names no other folder', () => {
    const folders = discoverPackages(ROOT).map((pkg) => pkg.dir.replace(/^packages\//, ''));

    expect(Object.keys(BEHAVIORS).sort()).toEqual([...folders, 'tooling'].sort());
  });

  it("puts every package in a layer of the pyramid, and only the repository's own checks outside it", () => {
    const outside = Object.entries(BEHAVIORS)
      .filter(([, behavior]) => !LAYERS.some((layer) => layer === behavior.layer))
      .map(([folder]) => folder);

    expect(outside).toEqual(['tooling']);
  });

  it('names each feature after its package: every npm name is the scope and the folder', () => {
    for (const pkg of discoverPackages(ROOT)) expect(pkg.name).toBe(`@figatellultimate/${pkg.dir.split('/')[1] ?? ''}`);
  });
});

describe('labelsOf', () => {
  it.each<[string, TestPlace, { epic: string; layer: string; severity: string; story: string; tags: string[] }]>([
    [
      'a pure package test',
      {
        family: 'scenarios',
        file: 'packages/core/src/paths/__tests__/parse.test.ts',
        describe: 'parseEntryPath',
        role: 'core',
      },
      {
        epic: 'Content model',
        layer: 'unit',
        severity: 'critical',
        story: 'parseEntryPath',
        tags: ['scenarios', 'core'],
      },
    ],
    [
      'a component test in happy-dom',
      { family: 'scenarios', file: 'packages/ui/src/__tests__/navbar.test.tsx', describe: 'Navbar', role: 'adapter' },
      {
        epic: 'Design system',
        layer: 'component',
        severity: 'normal',
        story: 'Navbar',
        tags: ['scenarios', 'adapter'],
      },
    ],
    [
      'a React binding test without JSX',
      { family: 'scenarios', file: 'packages/facets-react/src/__tests__/hook.test.ts', role: 'adapter' },
      {
        epic: 'Faceted collections',
        layer: 'component',
        severity: 'normal',
        story: 'hook',
        tags: ['scenarios', 'adapter'],
      },
    ],
    [
      'an adapter driving its real tool',
      {
        family: 'scenarios',
        file: 'packages/pagefind/src/__tests__/index-site.test.ts',
        describe: 'indexSite',
        role: 'adapter',
      },
      { epic: 'Search', layer: 'integration', severity: 'normal', story: 'indexSite', tags: ['scenarios', 'adapter'] },
    ],
    [
      'a type test, whatever its package',
      { family: 'scenarios', file: 'packages/codegen/src/__tests__/getters.test-d.ts', role: 'tooling' },
      {
        epic: 'Code generation',
        layer: 'unit',
        severity: 'critical',
        story: 'getters',
        tags: ['scenarios', 'tooling', 'types'],
      },
    ],
    [
      'the built command line in real processes',
      {
        family: 'cli',
        file: 'packages/cli/src/__tests__/surface.cli.test.ts',
        describe: 'figatellultimate --help',
        role: 'tooling',
      },
      {
        epic: 'Command line',
        layer: 'e2e',
        severity: 'critical',
        story: 'figatellultimate --help',
        tags: ['cli', 'tooling'],
      },
    ],
    [
      'the watch lab',
      { family: 'lab', file: 'packages/cli/src/__tests__/watch.lab.test.ts', role: 'tooling' },
      { epic: 'Command line', layer: 'e2e', severity: 'critical', story: 'watch', tags: ['lab', 'tooling'] },
    ],
    [
      'a component test in a real browser',
      { family: 'browsers', file: 'packages/search-react/src/__tests__/search-box.test.tsx', role: 'adapter' },
      { epic: 'Search', layer: 'component', severity: 'normal', story: 'search-box', tags: ['browsers', 'adapter'] },
    ],
    [
      "the repository's own checks",
      { family: 'scenarios', file: 'tooling/__tests__/docs.test.ts', describe: 'module headers' },
      {
        epic: 'Repository checks',
        layer: 'checks',
        severity: 'normal',
        story: 'module headers',
        tags: ['scenarios'],
      },
    ],
  ])('%s', (_, place, expected) => {
    const labels = labelsOf(place);

    expect({
      epic: valuesOf(labels, 'epic')[0],
      layer: valuesOf(labels, 'layer')[0],
      severity: valuesOf(labels, 'severity')[0],
      story: valuesOf(labels, 'story')[0],
      tags: valuesOf(labels, 'tag'),
    }).toEqual(expected);
    expect(valuesOf(labels, 'feature')).toEqual([
      place.file.startsWith('tooling/') ? 'tooling' : `@figatellultimate/${place.file.split('/')[1] ?? ''}`,
    ]);
  });

  it('refuses a package without a behavior, so that a new one is given its place', () => {
    expect(() => labelsOf({ family: 'scenarios', file: 'packages/newcomer/src/__tests__/a.test.ts' })).toThrow(
      'packages/newcomer has no behavior',
    );
  });
});

describe('labelRun', () => {
  it("adds each test's labels after what it reported, from its outermost describe", () => {
    const reported = { type: 'metadata', data: { labels: [{ name: 'owner', value: 'napoleon' }] } };
    const nested: TestShape = {
      module: { moduleId: join(ROOT, 'packages', 'facets', 'src', '__tests__', 'engine.test.ts') },
      parent: { type: 'suite', name: 'read', parent: { type: 'suite', name: 'Engine', parent: { type: 'module' } } },
      meta: () => nestedMeta,
    };
    const loose: TestShape = {
      module: { moduleId: join(ROOT, 'packages', 'toc', 'src', '__tests__', 'toc.test.ts') },
      parent: { type: 'module' },
      meta: () => looseMeta,
    };
    const nestedMeta = { allureRuntimeMessages: [reported] };
    const looseMeta = {};
    const modules: ModuleShape[] = [{ children: { allTests: () => [nested, loose] } }];

    labelRun(modules, 'scenarios', { facets: 'runtime', toc: 'runtime' }, ROOT);

    expect(nestedMeta.allureRuntimeMessages).toHaveLength(2);
    expect(nestedMeta.allureRuntimeMessages[0]).toBe(reported);
    const added = nestedMeta.allureRuntimeMessages[1];

    expect(field(added, 'type')).toBe('metadata');
    expect(field(field(added, 'data'), 'labels')).toContainEqual({ name: 'story', value: 'Engine' });
    expect(field(field(added, 'data'), 'labels')).toContainEqual({ name: 'tag', value: 'runtime' });

    const looseMessages = field(looseMeta, 'allureRuntimeMessages');

    expect(looseMessages).toHaveLength(1);
    expect(field(field(field(looseMessages, '0'), 'data'), 'labels')).toContainEqual({ name: 'story', value: 'toc' });
  });
});

describe('allurerc.mjs', () => {
  it('draws the testing pyramid with the layers of the labels, base first', () => {
    const pyramid = allurerc.plugins.awesome.options.charts.find((chart) => chart.type === 'testingPyramid');

    expect(REPORT_LAYERS).toEqual([...LAYERS]);
    expect(pyramid).toMatchObject({ layers: [...LAYERS] });
  });

  it("has one environment per OS and Node version of the CI's test matrix, matched by the reporter's labels", () => {
    const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const list = (key: string): string[] =>
      (new RegExp(`^\\s+${key}: \\[([^\\]]+)\\]`, 'm').exec(ci)?.[1] ?? '').split(',').map((item) => item.trim());
    const runner: Readonly<Record<string, string>> = { ubuntu: 'linux', macos: 'darwin', windows: 'win32' };
    const expected = list('os').flatMap((os) => {
      const platform = runner[os.replace(/-latest$/, '')] ?? os;

      return list('node').map((node) => ({ os: OS_NAMES[platform] ?? platform, node }));
    });

    // Precondition: the matrix was read.
    expect(expected.length).toBeGreaterThan(1);

    const environments = Object.values(allurerc.environments);

    for (const { os, node } of expected) {
      const labels = [
        { name: 'os', value: os },
        { name: 'node', value: node },
      ];

      expect(environments.filter((environment) => environment.matcher({ labels })).map((e) => e.name)).toEqual([
        `${os} · Node ${node}`,
      ]);
    }

    expect(environments).toHaveLength(expected.length);
  });
});
