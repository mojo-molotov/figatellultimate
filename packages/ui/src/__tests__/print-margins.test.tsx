// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PrintMargins } from '../index.js';

afterEach(cleanup);

describe('PrintMargins', () => {
  it('writes escaped CSS custom properties for print margin boxes', () => {
    const { container } = render(<PrintMargins title={'Guide "A"\n</style>'} url="https://example.dev/docs/guide" />);
    const style = container.querySelector('style');

    expect(style?.textContent).toBe(
      ':root{--fig-print-title:"Guide \\"A\\" \\3C /style>";--fig-print-url:"https://example.dev/docs/guide"}',
    );
  });
});
