/** The MDX `img`: the design system's image zoom (client), its labels translated here, on the server. */
import { getTranslations } from 'next-intl/server';
import type { ComponentProps, ReactNode } from 'react';

import { ZoomImage } from './zoom-image';

/** MDX's `img`: enlarged in a modal on desktops, its labels from the messages. */
export async function Zoom(props: ComponentProps<'img'>): Promise<ReactNode> {
  const t = await getTranslations('ui.image');

  return <ZoomImage {...props} open={t('open', { alt: props.alt ?? '' })} close={t('close')} />;
}
