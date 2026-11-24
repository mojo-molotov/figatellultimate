/**
 * The site theme's change as a blur: the page blurs, changes theme, then comes back sharp (a view transition,
 * `<html data-site-theme-switch>` while it plays; the motion is `@figatellultimate/themes/base.css`'s).
 *
 * Key design decisions:
 *     - On a desktop only (a mouse or a trackpad), motion allowed, where view transitions run: a touch screen changes
 *       the theme at once.
 *     - Only the latest blur clears the mark when it ends: a newer one, started meanwhile, keeps it.
 *
 * Invariants (`site-theme-transition.test.ts`): the page marked while it plays on a desktop and cleared once it ends;
 * at once on a touch screen, with reduced motion, or without view transitions, the page never marked.
 */

/** The page's latest blur: only it clears the mark it set on the root when it ends. */
let latest: ViewTransition | undefined;

/**
 * Applies a site theme's change, the page blurring from the old theme to the new one.
 *
 * @param apply - Changes the theme (sets `<html data-site-theme>`).
 * @returns Nothing: `apply` runs at once, or inside the view transition.
 *
 * @example
 * <SiteThemePicker themes={themes} names={names} label={label} transition={siteThemeTransition} />
 */
export function siteThemeTransition(apply: () => void): void {
  const desktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (
    !desktop ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !('startViewTransition' in document)
  ) {
    apply();

    return;
  }

  const root = document.documentElement;

  root.dataset['siteThemeSwitch'] = '';
  const transition = document.startViewTransition(apply);

  latest = transition;
  void transition.finished.finally(() => {
    if (latest !== transition) return;

    latest = undefined;
    delete root.dataset['siteThemeSwitch'];
  });
}
