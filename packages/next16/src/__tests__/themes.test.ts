import { describe, expect, it, vi } from 'vitest';

import { themeStylesheetRoute } from '../themes.js';

describe('themeStylesheetRoute', () => {
  const read = vi.fn((theme: 'calanque' | 'granite') => Promise.resolve(`/* ${theme} */`));
  const route = themeStylesheetRoute({ themes: ['calanque', 'granite'] as const, read });
  const get = (name: string) =>
    route.GET(new Request(`https://example.org/themes/${name}`), { params: Promise.resolve({ name }) });

  it('prerenders one `<theme>.css` param per lazy theme', () => {
    expect(route.generateStaticParams()).toEqual([{ name: 'calanque.css' }, { name: 'granite.css' }]);
  });

  it('serves a known theme as edge-cached, browser-revalidated CSS', async () => {
    const response = await get('calanque.css');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=31536000, must-revalidate');
    expect(await response.text()).toBe('/* calanque */');
    expect(read).toHaveBeenLastCalledWith('calanque');
  });

  it.each(['maquis.css', 'calanque', '../secret.css', ''])('answers 404 for %j without reading', async (name) => {
    read.mockClear();
    const response = await get(name);

    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
});
