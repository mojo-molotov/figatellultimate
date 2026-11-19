'use client';

/**
 * The image zoom: a content image enlarged in a modal, desktops only.
 *
 * Key design decisions:
 *     - Desktop only (`(hover: hover) and (pointer: fine) and (min-width: 64rem)`): on a phone the image already fills
 *       the width and pinch-zoom is the native gesture. The prerendered HTML is always the plain image.
 *     - An image without alternative text is decorative: nothing would name its button, so it is never zoomable.
 *     - Radix Dialog gives the role, the name, the focus trap and return, Escape and the scroll lock; the entrance is
 *       CSS (a 3D spring as `linear()`), a fade with reduced motion; no animation library.
 *     - The lens never stays zoomed once the button is up, even when the release is lost (a move without the button,
 *       the context menu, the window losing focus); Ctrl + click (the Mac's context menu) never starts it.
 *     - The pointer capture is a comfort, never a condition: a browser refuses a pointer it no longer counts as active
 *       (Firefox throws), and the zoom starts before it is attempted.
 *     - Closing gives the focus back to the image without scrolling (`preventScroll`): the keyboard finds its place,
 *       and the page stays where the reader left it, never jumping to the image.
 *     - The zoom out keeps the last zoomed point until the image is whole again: it shrinks back where the reader
 *       looked, never jumping to the center.
 *     - Both images through the app's image component (`ImageProvider`), at the size the content gives (an MDX image
 *       measured at build); the enlarged one at its own size, the screen at most, set from that size: the variant
 *       an image component serves (`next/image`: wider than the file) would otherwise shrink it. An image without its width and
 *       height in pixels (remote, unmeasured) stays a plain `<img>`: an image component such as `next/image` fails
 *       without them.
 *
 * Invariants (`image-zoom.test.tsx` and `image-zoom-layout.test.tsx` in real browsers).
 */
import { Dialog, VisuallyHidden } from 'radix-ui';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type PointerEvent,
  type ReactNode,
} from 'react';

import { Image, pixelsOf } from './image.js';

/** A desktop: a mouse or a trackpad, and a wide screen. */
const DESKTOP = '(hover: hover) and (pointer: fine) and (min-width: 64rem)';

const subscribe = (onChange: () => void): (() => void) => {
  const media = window.matchMedia(DESKTOP);

  media.addEventListener('change', onChange);

  return () => {
    media.removeEventListener('change', onChange);
  };
};
const onDesktop = (): boolean => window.matchMedia(DESKTOP).matches;

/** Every text of the zoom of its own. */
export interface ImageZoomLabels {
  /** The image button's accessible name, from the image's alternative text, e.g. (alt) => `Enlarge: ${alt}`. */
  readonly open: (alt: string) => string;
  /** The close button's accessible name. */
  readonly close: string;
}

/** The zoom's props: an `<img>`'s, plus the labels. */
export type ImageZoomProps = ComponentProps<'img'> & { readonly labels: ImageZoomLabels };

/**
 * A content image that opens enlarged in a modal on desktops: the app's MDX `img`.
 *
 * @param props - The labels, and the `<img>`'s props.
 * @returns Prerendered, off a desktop or without alternative text, the plain image; on a desktop, once hydrated, a
 *   button (named from the alternative text) opening a Radix Dialog with the enlarged image and a close button.
 *   Holding the left mouse button zooms ×2.5 around the pressed point and follows the mouse; releasing returns it
 *   smoothly, from the same point.
 *
 * @example
 * const components = { img: (props) => <ImageZoom {...props} labels={{ open: (alt) => `Agrandir : ${alt}`, close: 'Fermer' }} /> };
 */
export function ImageZoom({ labels, ...props }: ImageZoomProps): ReactNode {
  // The server cannot know the device: the plain image first, the button once hydrated where the query holds.
  const desktop = useSyncExternalStore(subscribe, onDesktop, () => false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { src, width: givenWidth, height: givenHeight, ...rest } = props;
  // Pixels only: an image component reads no `50%`.
  const width = pixelsOf(givenWidth);
  const height = pixelsOf(givenHeight);
  // Through the app's image component with its size only: `next/image` fails without one.
  const measured = typeof src === 'string' && width !== undefined && height !== undefined ? src : undefined;
  const image =
    measured !== undefined ? (
      <Image
        {...rest}
        width={width}
        height={height}
        src={measured}
        alt={props.alt ?? ''}
        data-slot="image-zoom-image"
      />
    ) : (
      <img {...props} data-slot="image-zoom-image" />
    );
  const alt = props.alt?.trim() ?? '';

  if (!desktop || alt === '') return image;

  return (
    <Dialog.Root>
      <Dialog.Trigger ref={trigger} data-slot="image-zoom-trigger" aria-label={labels.open(alt)}>
        {image}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay data-slot="image-zoom-overlay" />
        <Dialog.Content
          data-slot="image-zoom-content"
          aria-describedby={undefined}
          // Radix would focus the image back with a scroll into view: the focus returns, the page stays put.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Title>{alt}</Dialog.Title>
          </VisuallyHidden.Root>
          <ImageZoomLens
            src={src}
            measured={measured !== undefined}
            srcSet={props.srcSet}
            width={width}
            height={height}
          />
          <Dialog.Close data-slot="image-zoom-close" aria-label={labels.close} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Where the pressed point is in the frame, as a share of its size, kept inside it. */
function originOf(event: PointerEvent<HTMLElement>): { readonly x: number; readonly y: number } {
  const box = event.currentTarget.getBoundingClientRect();
  const share = (offset: number, size: number): number =>
    size <= 0 ? 50 : Math.min(100, Math.max(0, (offset / size) * 100));

  return { x: share(event.clientX - box.left, box.width), y: share(event.clientY - box.top, box.height) };
}

/**
 * The enlarged image in its frame: holding the left mouse button zooms it around the pressed point, moving
 * the mouse explores it, releasing returns it from where it was, the last point kept until it is whole again;
 * the stylesheet scales and animates. Mouse only: the image is whole without it, so the keyboard loses nothing.
 */
function ImageZoomLens({
  src,
  measured,
  srcSet,
  width,
  height,
}: {
  readonly src: ComponentProps<'img'>['src'];
  /** Its width and height are known: through the app's image component. */
  readonly measured: boolean;
  readonly srcSet: string | undefined;
  readonly width: number | undefined;
  readonly height: number | undefined;
}): ReactNode {
  // The point the zoom is around: kept after the release, so that the zoom out shrinks the image around it.
  const [origin, setOrigin] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const release = (): void => {
    setZoomed(false);
  };

  // Released wherever the button goes up, even out of the page: switching apps while holding never leaves it zoomed.
  useEffect(() => {
    if (!zoomed) return undefined;

    window.addEventListener('blur', release);

    return () => {
      window.removeEventListener('blur', release);
    };
  }, [zoomed]);

  return (
    // Measured on the frame (the event's target), never on the scaled image: its box would include the zoom.
    <div
      data-slot="image-zoom-frame"
      onPointerDown={(event) => {
        // The left button alone: Ctrl + click is the Mac's context menu, whose menu would swallow the release.
        if (event.pointerType !== 'mouse' || event.button !== 0 || event.ctrlKey) return;

        // No native image drag while zooming.
        event.preventDefault();
        setOrigin(originOf(event));
        setZoomed(true);

        // The pointer stays ours until released, even outside the frame. A comfort, never a condition: a browser
        // refuses to capture a pointer it no longer counts as active (Firefox throws), and the zoom does not need it.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Not active: nothing to capture; the release is still caught on the frame, or by the move without button.
        }
      }}
      onPointerMove={(event) => {
        // The release may have been lost (a menu, another window): no left button pressed, no zoom.
        if ((event.buttons & 1) === 0) {
          release();

          return;
        }

        // Only while zoomed: a move after the release leaves the zoom out's point where it was.
        if (zoomed) setOrigin(originOf(event));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={release}
    >
      {/* Named by the dialog's title: its alternative text would say it twice. */}
      {measured && typeof src === 'string' ? (
        <Image
          src={src}
          {...(width === undefined ? {} : { width })}
          {...(height === undefined ? {} : { height })}
          {...(srcSet === undefined ? {} : { srcSet })}
          sizes="90vw"
          alt=""
          draggable={false}
          data-slot="image-zoom-full"
          data-zoomed={zoomed ? '' : undefined}
          style={{
            // Its own size, the screen at most: never the size the served variant's density implies (`next/image`
            // serves a wider file than the image, which the browser would shrink by as much).
            ...(width === undefined || height === undefined
              ? {}
              : { width: `min(90vw, ${String(width)}px, calc(90vh * ${String(width)} / ${String(height)}))` }),
            ...(origin === null ? {} : { transformOrigin: `${String(origin.x)}% ${String(origin.y)}%` }),
          }}
        />
      ) : (
        <img
          src={src}
          {...(srcSet === undefined ? {} : { srcSet, sizes: '90vw' })}
          alt=""
          draggable={false}
          data-slot="image-zoom-full"
          data-zoomed={zoomed ? '' : undefined}
          style={origin === null ? undefined : { transformOrigin: `${String(origin.x)}% ${String(origin.y)}%` }}
        />
      )}
    </div>
  );
}
