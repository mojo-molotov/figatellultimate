'use client';

/**
 * The search dialog: the search box in a modal, opened from the navbar's search button.
 *
 * Key design decision: the box (cmdk, the sort select, the engine) is a chunk of its own, loaded when the dialog
 * opens and fetched ahead as soon as the pointer or the focus reaches the button (a dynamic `import()`, no framework):
 * a page ships only the button and the dialog until the reader searches. The loaded module is kept in state rather
 * than behind `React.lazy`, which would erase the box's collection type.
 *
 * Key design decisions:
 *     - The shortcut shown after the trigger's label (`labels.shortcut`): the reader's keys, ⌘ K
 *       on an Apple device, Ctrl K elsewhere, both rendered and one shown by the stylesheet from the shortcut's
 *       `data-platform`. Marked before the first paint by the page's `searchShortcutScript`, and by a layout effect
 *       once hydrated: never a switch, and never a mismatch to correct. Seen, not heard: the button keeps its label
 *       as its name, its shortcut told by `aria-keyshortcuts`. Never shown on a touch screen (the stylesheet's).
 *
 * Invariants (`search-dialog.test.tsx`): axe on the dialog; Enter opens it with focus in the field; Escape back to
 * the trigger; ⌘K or Ctrl+K; opening a result closes it; the shortcut after the label, the reader's keys from the
 * first paint, out of the name, none with the hotkey off.
 */
import { Dialog, VisuallyHidden } from 'radix-ui';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { APPLE_PLATFORM } from './scripts.js';

import type * as Box from './search-box.js';
import type { SearchBoxProps } from './search-box.js';

type BoxModule = typeof Box;

/** The box's module once loaded, shared by every dialog of the page. */
let loaded: BoxModule | undefined;

async function loadBox(): Promise<BoxModule> {
  loaded ??= await import('./search-box.js');

  return loaded;
}

const preload = (): void => {
  void loadBox();
};

/** The dialog's own texts; the box inside keeps its `boxLabels`. */
export interface SearchDialogLabels {
  /** The navbar button's text and accessible name. */
  readonly trigger: string;
  /** The dialog's accessible name. */
  readonly title: string;
  /** The close button's accessible name. */
  readonly close: string;
  /**
   * The shortcut shown after the trigger's label while the hotkey is on: its keys on an Apple device (e.g. `'⌘ K'`)
   * and elsewhere (e.g. `'Ctrl K'`); none when absent.
   */
  readonly shortcut?: { readonly mac: string; readonly other: string } | undefined;
}

/** The dialog's props: the search box's, its labels as `boxLabels`, the dialog's own labels, and the hotkey. */
export interface SearchDialogProps<C extends string> extends Omit<SearchBoxProps<C>, 'labels'> {
  readonly labels: SearchDialogLabels;
  readonly boxLabels: SearchBoxProps<C>['labels'];
  /** ⌘K or Ctrl+K opens the dialog from anywhere in the page; default `true`. */
  readonly hotkey?: boolean | undefined;
}

/**
 * The search in a modal, opened from the navbar.
 *
 * @param props - The dialog's labels (trigger, title, close), the box's labels and props, and whether ⌘K or Ctrl+K
 *   opens it from anywhere (default `true`).
 * @returns A trigger and a Radix Dialog (focus trapped, Escape back to the trigger) holding the `SearchBox`, its field
 *   focused on opening; opening a result closes it. With the hotkey on, the trigger tells it (`aria-keyshortcuts`),
 *   and shows `labels.shortcut` after its label, the reader's keys, when given.
 *
 * @example
 * <SearchDialog search={search} labels={dialogLabels} boxLabels={boxLabels} locale="fr" onNavigate={router.push} />
 */
export function SearchDialog<C extends string>({
  labels,
  boxLabels,
  hotkey = true,
  onNavigate,
  ...props
}: SearchDialogProps<C>): ReactNode {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<BoxModule | undefined>(loaded);
  const shortcut = useRef<HTMLElement>(null);
  const shows = hotkey && labels.shortcut !== undefined;

  // The reader's keys, as `searchShortcutScript` marks them before the first paint: the same, whatever ran first.
  useLayoutEffect(() => {
    shortcut.current?.setAttribute(
      'data-platform',
      new RegExp(APPLE_PLATFORM).test(navigator.userAgent) ? 'mac' : 'other',
    );
  }, [shows]);

  // Opened: the box's module, fetched now unless the button's hover or focus already did.
  useEffect(() => {
    if (!open || box !== undefined) return;

    let live = true;

    void loadBox().then((module) => {
      if (live) setBox(module);
    });

    return () => {
      live = false;
    };
  }, [open, box]);

  useEffect(() => {
    if (!hotkey) return;

    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.defaultPrevented) {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [hotkey]);
  const navigate =
    onNavigate ??
    ((url: string) => {
      globalThis.location.assign(url);
    });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        data-slot="search-dialog-trigger"
        onPointerEnter={preload}
        onFocus={preload}
        {...(hotkey ? { 'aria-keyshortcuts': 'Meta+K Control+K' } : {})}
      >
        <span data-slot="search-dialog-icon" aria-hidden />
        <span data-slot="search-dialog-label">{labels.trigger}</span>
        {!shows ? null : (
          // Marked by the page's script before hydration: its `data-platform` is expected.
          <kbd ref={shortcut} data-slot="search-dialog-shortcut" aria-hidden suppressHydrationWarning>
            <span data-slot="search-dialog-shortcut-keys" data-platform="mac">
              {labels.shortcut.mac}
            </span>
            <span data-slot="search-dialog-shortcut-keys" data-platform="other">
              {labels.shortcut.other}
            </span>
          </kbd>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay data-slot="search-dialog-overlay" />
        <Dialog.Content data-slot="search-dialog-content" aria-describedby={undefined}>
          <VisuallyHidden.Root asChild>
            <Dialog.Title>{labels.title}</Dialog.Title>
          </VisuallyHidden.Root>
          {box === undefined ? null : (
            <box.SearchBox
              {...props}
              // The field first (Radix keeps a focus already inside), not the first focusable element.
              autoFocus
              labels={boxLabels}
              onNavigate={(url) => {
                setOpen(false);
                navigate(url);
              }}
            />
          )}
          <Dialog.Close data-slot="search-dialog-close" aria-label={labels.close}>
            <span data-slot="search-dialog-close-icon" aria-hidden />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
