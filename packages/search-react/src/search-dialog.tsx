'use client';

/**
 * The search dialog: the search box in a modal, opened from the navbar's search button.
 *
 * Key design decision: the box (cmdk, the sort select, the engine) is a chunk of its own, loaded when the dialog
 * opens and fetched ahead as soon as the pointer or the focus reaches the button (a dynamic `import()`, no framework):
 * a page ships only the button and the dialog until the reader searches. The loaded module is kept in state rather
 * than behind `React.lazy`, which would erase the box's collection type.
 *
 * Invariants (`search-dialog.test.tsx`): axe on the dialog; Enter opens it with focus in the field; Escape back to
 * the trigger; ⌘K or Ctrl+K; opening a result closes it.
 */
import { Dialog, VisuallyHidden } from 'radix-ui';
import { useEffect, useState, type ReactNode } from 'react';

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
 *   focused on opening; opening a result closes it.
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
      <Dialog.Trigger data-slot="search-dialog-trigger" onPointerEnter={preload} onFocus={preload}>
        <span data-slot="search-dialog-icon" aria-hidden />
        <span data-slot="search-dialog-label">{labels.trigger}</span>
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
