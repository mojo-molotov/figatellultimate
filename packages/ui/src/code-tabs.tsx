'use client';

/**
 * Code tabs: variants of one code block (the same command for npm, pnpm, Yarn and Bun), one tab each.
 *
 *     <CodeTabs labels>                         Radix Tabs: role tablist, arrows, Home/End
 *       <div data-label="npm"><pre/></div>   ──> [ npm ] [ pnpm ] [ Yarn ] [ Bun ]
 *       <div data-label="pnpm"><pre/></div>       the chosen variant, the others prerendered and hidden
 *
 * Key design decisions:
 *     - The app groups its blocks (e.g. consecutive code blocks marked `npm`, `pnpm`…): this component only shows
 *       labelled panels as tabs, whatever they hold; no text of its own (the tab names are the panels' labels).
 *     - One choice for the whole site: picking "pnpm" in one block picks it in every block holding a "pnpm" tab, on
 *       this page and the next ones (remembered in `localStorage`, where it is allowed). Before hydration, and for a
 *       label a block does not have, its first tab.
 *     - Every panel prerendered: the code is in the HTML without JavaScript; the hidden ones stay out of print.
 *
 * Invariants (`code-tabs.test.tsx`): the panels' labels as tabs; the choice synchronized between blocks and
 * remembered; the first tab without one; the keyboard and axe.
 */
import { Tabs } from 'radix-ui';
import { Children, isValidElement, useSyncExternalStore, type ReactNode } from 'react';

/** Where the chosen label is remembered. */
const STORAGE_KEY = 'figatellultimate-code-tab';

const listeners = new Set<() => void>();
/** The choice when `localStorage` is not allowed (private browsing, blocked storage): this page only. */
let remembered: string | undefined;

function read(): string | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return remembered;
  }
}

function choose(label: string): void {
  remembered = label;

  try {
    window.localStorage.setItem(STORAGE_KEY, label);
  } catch {
    // Not allowed: this page only.
  }

  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab or window chose: follow it.
  window.addEventListener('storage', onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Every text of the code tabs of their own. */
export interface CodeTabsLabels {
  /** The tab list's accessible name, e.g. "Package manager". */
  readonly list: string;
}

/** A panel: its label (the tab's name) and what it shows. */
interface Panel {
  readonly label: string;
  readonly content: ReactNode;
}

/** The labelled children, in order: each one's `data-label`, and the child itself. */
function panelsOf(children: ReactNode): Panel[] {
  return Children.toArray(children).flatMap((child): Panel[] => {
    if (!isValidElement<{ readonly 'data-label'?: unknown }>(child)) return [];

    const label = child.props['data-label'];

    return typeof label === 'string' && label !== '' ? [{ label, content: child }] : [];
  });
}

/**
 * Variants of a code block, one tab each, the choice shared by every block of the site.
 *
 * @param props - The tab list's label, the reading direction (the arrows move the reading way: `→` to the next tab
 *   left to right, `←` right to left; Radix reads no page direction), and the variants: children carrying
 *   `data-label` (the tab's name), e.g. a `<div data-label="pnpm">` around a code block.
 * @returns The tabs, every panel prerendered; children without a label are left out.
 *
 * @example
 * <CodeTabs labels={{ list: 'Package manager' }}>
 *   <div data-label="npm"><CodeBlock …>npm install</CodeBlock></div>
 *   <div data-label="pnpm"><CodeBlock …>pnpm install</CodeBlock></div>
 * </CodeTabs>
 */
export function CodeTabs({
  labels,
  dir,
  children,
}: {
  readonly labels: CodeTabsLabels;
  readonly dir?: 'ltr' | 'rtl' | undefined;
  readonly children: ReactNode;
}): ReactNode {
  const panels = panelsOf(children);
  const chosen = useSyncExternalStore(subscribe, read, () => undefined);
  const first = panels[0]?.label ?? '';
  const value = panels.some((panel) => panel.label === chosen) ? (chosen ?? first) : first;

  return (
    <Tabs.Root data-slot="code-tabs" value={value} onValueChange={choose} {...(dir === undefined ? {} : { dir })}>
      <Tabs.List data-slot="code-tabs-list" aria-label={labels.list}>
        {panels.map((panel) => (
          <Tabs.Trigger key={panel.label} data-slot="code-tabs-trigger" value={panel.label}>
            {panel.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {panels.map((panel) => (
        <Tabs.Content
          key={panel.label}
          data-slot="code-tabs-content"
          value={panel.label}
          forceMount
          // No Tab stop of its own: from the tabs, Tab goes to its code's copy button (its code, when it overflows).
          tabIndex={-1}
        >
          {panel.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
