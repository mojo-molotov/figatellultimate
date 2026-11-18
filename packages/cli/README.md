# @figatellu/cli

The `figatellu` command line: build, check and watch the content, index the built site for search, and migrate the content's locales.

```sh
pnpm add -D @figatellu/cli
```

```sh
figatellu build                       # write .figatellu/, exit 1 on content errors
figatellu watch                       # build, then again on every change
figatellu search --site .next/server/app --out public/pagefind --locale-folders
figatellu migrate default-locale en   # the plan; add --write to apply it
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)
