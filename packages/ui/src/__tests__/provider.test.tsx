// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EntryCard, UiProvider, type ImageProps, type LinkProps } from '../index.js';

afterEach(cleanup);

function CustomLink({ href, children, ...rest }: LinkProps) {
  return (
    <a data-custom-link="" href={href} {...rest}>
      {children}
    </a>
  );
}

function CustomImage({ src, alt, fill, ...rest }: ImageProps) {
  return <img data-custom-image="" data-fill={fill === true ? 'true' : undefined} src={src} alt={alt} {...rest} />;
}

describe('UiProvider', () => {
  it('wires both link and image components through a single provider', () => {
    const { container } = render(
      <UiProvider link={CustomLink} image={CustomImage}>
        <EntryCard
          href="/docs/cli"
          title="CLI"
          image="/covers/cli.jpg"
          locale="en"
          labels={{ tags: 'Tags', authors: 'Authors', more: 'More' }}
        />
      </UiProvider>,
    );

    expect(container.querySelector('a[data-custom-link][href="/docs/cli"]')).not.toBeNull();
    expect(container.querySelector('img[data-custom-image][src="/covers/cli.jpg"]')).not.toBeNull();
  });

  it('falls back to plain elements for omitted providers', () => {
    const { container } = render(
      <UiProvider link={CustomLink}>
        <EntryCard
          href="/docs/cli"
          title="CLI"
          image="/covers/cli.jpg"
          locale="en"
          labels={{ tags: 'Tags', authors: 'Authors', more: 'More' }}
        />
      </UiProvider>,
    );

    expect(container.querySelector('a[data-custom-link]')).not.toBeNull();
    expect(container.querySelector('img[data-custom-image]')).toBeNull();
    expect(container.querySelector('img[src="/covers/cli.jpg"]')).not.toBeNull();
  });
});
