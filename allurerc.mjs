// Allure Report 3 configuration, read by `allure generate` (`pnpm allure`, and CI's allure-history action).
// A plain object, not `defineConfig` from "allure": the CLI loads this file, which then needs no import.
//
// - `historyPath`: one JSONL file appended on every generation; CI keeps one per test family on the
//   `allure-reports` branch (`.github/actions/allure-publish`), so trends span builds without mixing families.
// - `categories`: failures sorted by kind, the way they are read.
export default {
  name: 'figatellultimate',
  output: 'allure-report',
  historyPath: './history.jsonl',
  plugins: {
    awesome: {
      options: { reportName: 'figatellultimate' },
    },
  },
  categories: {
    rules: [
      { name: 'Test defects', matchers: { statuses: ['broken'] } },
      { name: 'Type errors', matchers: { statuses: ['failed'], message: /TypeCheckError|Type '/ } },
      { name: 'Assertion errors', matchers: { statuses: ['failed'], message: /AssertionError|expected/ } },
      { name: 'Skipped', matchers: { statuses: ['skipped'] } },
    ],
  },
};
