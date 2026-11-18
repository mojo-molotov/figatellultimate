import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { IntlProvider } from 'use-intl/react';
import { describe, expect, it } from 'vitest';

import { useTranslations } from '../react.js';
import { FR } from './register.js';

function Posts(): string {
  const t = useTranslations('home');

  return `${t('title')}: ${t('posts', { count: 2 })}`;
}

describe('useTranslations (React)', () => {
  it('translates inside use-intl’s provider, typed and scoped', () => {
    const html = renderToString(
      createElement(IntlProvider, {
        locale: 'fr',
        messages: FR,
        timeZone: 'UTC',
        children: createElement(Posts),
      }),
    );

    expect(html).toBe('Accueil: 2 billets');
  });
});
