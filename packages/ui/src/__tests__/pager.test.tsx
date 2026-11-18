// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { Pager } from '../index.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const LABELS = { nav: '«pages»', previous: '«précédent»', next: '«suivant»' };
const INSTALLATION = { url: '/docs/installation', title: 'Installation' };
const CONFIGURATION = { url: '/docs/configuration', title: 'Configuration' };

afterEach(() => {
  cleanup();
});

describe('Pager', () => {
  it('links the previous then the next page, each named by its word and its title, and passes axe', async () => {
    render(<Pager previous={INSTALLATION} next={CONFIGURATION} labels={LABELS} />);
    const nav = screen.getByRole('navigation', { name: '«pages»' });
    const links = within(nav).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('rel')])).toEqual([
      ['«précédent»Installation', '/docs/installation', 'prev'],
      ['«suivant»Configuration', '/docs/configuration', 'next'],
    ]);

    const results = await axe.run(document.body, { rules: { region: { enabled: false } } });

    expect(results.violations).toEqual([]);
  });

  it('shows only the side that exists, and nothing without a page on either side', () => {
    const { rerender, container } = render(<Pager next={CONFIGURATION} labels={LABELS} />);

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/docs/configuration']);

    rerender(<Pager labels={LABELS} />);

    expect(container.innerHTML).toBe('');
  });
});
