// The types of `allurerc.mjs`, for the test that checks it against the repository (`tooling/__tests__/allure.test.ts`):
// only the parts that test reads.

/** The testing pyramid's layers, base first. */
export declare const LAYERS: readonly string[];

interface ReportLabel {
  readonly name: string;
  readonly value: string;
}

interface AllureConfig {
  readonly environments: Readonly<
    Record<string, { readonly name: string; matcher(payload: { readonly labels: readonly ReportLabel[] }): boolean }>
  >;
  readonly plugins: {
    readonly awesome: {
      readonly options: { readonly charts: readonly { readonly type: string; readonly layers?: readonly string[] }[] };
    };
  };
}

declare const config: AllureConfig;

export default config;
