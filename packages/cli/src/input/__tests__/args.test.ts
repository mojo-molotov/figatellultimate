import { describe, expect, it } from 'vitest';

import { parseCli } from '../args.js';

describe('parseCli', () => {
  it.each([
    [
      ['build'],
      { kind: 'command', command: { name: 'build', config: 'figatellultimate.config.ts', mode: 'production' } },
    ],
    [['check', '-c', 'x.ts'], { kind: 'command', command: { name: 'check', config: 'x.ts', mode: 'production' } }],
    [
      ['watch'],
      { kind: 'command', command: { name: 'watch', config: 'figatellultimate.config.ts', mode: 'development' } },
    ],
    [
      ['build', '--mode', 'development'],
      { kind: 'command', command: { name: 'build', config: 'figatellultimate.config.ts', mode: 'development' } },
    ],
    [
      ['search', '--site', '.next/server/app'],
      {
        kind: 'command',
        command: {
          name: 'search',
          config: 'figatellultimate.config.ts',
          mode: 'production',
          search: { sites: ['.next/server/app'], out: 'public/pagefind', localeFolders: false },
        },
      },
    ],
    [
      ['search', '--site', 'out', '--out', 'dist/pagefind', '--locale-folders'],
      {
        kind: 'command',
        command: {
          name: 'search',
          config: 'figatellultimate.config.ts',
          mode: 'production',
          search: { sites: ['out'], out: 'dist/pagefind', localeFolders: true },
        },
      },
    ],
    [
      ['search', '--site', 'pages', '--site', 'blog'],
      {
        kind: 'command',
        command: {
          name: 'search',
          config: 'figatellultimate.config.ts',
          mode: 'production',
          search: { sites: ['pages', 'blog'], out: 'public/pagefind', localeFolders: false },
        },
      },
    ],
    [
      ['migrate', 'default-locale', 'en'],
      {
        kind: 'command',
        command: {
          name: 'migrate',
          config: 'figatellultimate.config.ts',
          mode: 'production',
          migration: { target: { kind: 'default-locale', locale: 'en' }, write: false },
        },
      },
    ],
    [
      ['migrate', 'notation', 'explicit', '--write'],
      {
        kind: 'command',
        command: {
          name: 'migrate',
          config: 'figatellultimate.config.ts',
          mode: 'production',
          migration: { target: { kind: 'notation', notation: 'explicit' }, write: true },
        },
      },
    ],
    [
      ['build', '--no-unused'],
      {
        kind: 'command',
        command: { name: 'build', config: 'figatellultimate.config.ts', mode: 'production', unused: false },
      },
    ],
    [
      ['check', '--no-unused'],
      {
        kind: 'command',
        command: { name: 'check', config: 'figatellultimate.config.ts', mode: 'production', unused: false },
      },
    ],
    [['--help'], { kind: 'help' }],
    [['build', '-h'], { kind: 'help' }],
    [['--version'], { kind: 'version' }],
  ])('%j', (argv, expected) => {
    expect(parseCli(argv)).toEqual(expected);
  });

  it.each([
    [[], 'Missing command.', ['build', 'check', 'watch', 'search', 'migrate']],
    [
      ['migrate'],
      'Missing migration: default-locale <locale> or notation <implicit|explicit>.',
      ['default-locale', 'notation'],
    ],
    [['migrate', 'default-locle', 'en'], 'Unknown migration "default-locle".', ['default-locale']],
    [['migrate', 'default-locale'], 'The default-locale migration needs a locale, e.g. en.', []],
    [['migrate', 'notation', 'explict'], 'Unknown notation "explict".', ['explicit']],
    [['migrate', 'notation', 'explicit', 'more'], 'Unexpected argument "more".', []],
    [['build', '--write'], 'The --write option only applies to migrate.', []],
    [['watch', '--no-unused'], 'The --no-unused option only applies to build and check.', []],
    [['search', '--site', 'x', '--no-unused'], 'The --no-unused option only applies to build and check.', []],
    [['migrate', 'notation', 'explicit', '--no-unused'], 'The --no-unused option only applies to build and check.', []],
    [['search'], 'The search command needs --site <built HTML directory>, e.g. .next/server/app.', []],
    [['search', '--site', 'x', '--out', ''], 'The --out option needs a path.', []],
    [
      ['search', '--site', 'x', '--site', ' '],
      'The search command needs --site <built HTML directory>, e.g. .next/server/app.',
      [],
    ],
    [['build', '--site', 'x'], 'The --site option only applies to search.', []],
    [['check', '--out', 'x'], 'The --out option only applies to search.', []],
    [['build', '--locale-folders'], 'The --locale-folders option only applies to search.', []],
    [['biuld'], 'Unknown command "biuld".', ['build']],
    [['build', 'extra'], 'Unexpected argument "extra".', []],
    [['build', '--mode', 'prod'], 'Unknown mode "prod".', ['production']],
    [['build', '--confg', 'x.ts'], 'Unknown or malformed option --confg.', ['--config']],
    [['build', '--config', ' '], 'The --config option needs a path.', []],
  ])('%j is a usage error with suggestions, never a crash', (argv, message, suggestions) => {
    expect(parseCli(argv)).toEqual({ kind: 'usage-error', message, suggestions });
  });

  it('an option missing its value is a usage error too', () => {
    expect(parseCli(['build', '--config'])).toMatchObject({ kind: 'usage-error' });
  });
});
