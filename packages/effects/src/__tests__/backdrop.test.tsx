// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Backdrop, type BackdropImageProps } from '../index.js';

afterEach(cleanup);

describe('Backdrop', () => {
  it('shows its image behind the section, hidden from assistive technologies, without alternative text', () => {
    const { container } = render(
      <section>
        <h1>Lost</h1>
        <Backdrop src="/covers/maquis.jpeg" />
      </section>,
    );
    const slot = container.querySelector('[data-slot="backdrop"]');
    const image = slot?.querySelector('img[data-slot="backdrop-image"]');

    expect(slot?.getAttribute('aria-hidden')).toBe('true');
    expect(image?.getAttribute('src')).toBe('/covers/maquis.jpeg');
    expect(image?.getAttribute('alt')).toBe('');
    // Decorative: the section's own content is all a reader meets.
    expect(container.querySelector('section')?.textContent).toBe('Lost');
  });

  it("renders its image through the app's image component, filling the page's width", () => {
    const AppImage = ({ fill, ...props }: BackdropImageProps): ReactNode => (
      <img data-app="" {...(fill === true ? { 'data-fill': '' } : {})} {...props} />
    );
    const { container } = render(<Backdrop src="/covers/maquis.jpeg" image={AppImage} />);
    const image = container.querySelector('[data-slot="backdrop-image"]');

    expect(image?.hasAttribute('data-app')).toBe(true);
    expect(image?.hasAttribute('data-fill')).toBe(true);
    expect(image?.getAttribute('sizes')).toBe('100vw');
    expect(image?.getAttribute('alt')).toBe('');
  });
});
