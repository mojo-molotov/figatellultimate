# @figatellultimate/cli

The `figatellultimate` command line: build, check and watch the content, index the built site for search, and migrate the content's locales.

```sh
pnpm add -D @figatellultimate/cli
```

```sh
figatellultimate build                       # write .figatellultimate/, exit 1 on content errors
figatellultimate watch                       # build, then again on every change
figatellultimate search --site .next/server/app --out public/pagefind --locale-folders
figatellultimate migrate default-locale en   # the plan; add --write to apply it
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)
