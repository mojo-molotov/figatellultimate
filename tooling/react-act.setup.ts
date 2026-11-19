/**
 * React's `act` environment, set once for every test: on in happy-dom and Node, where the tests wrap their updates
 * in `act()` (Testing Library does), off in a real browser, where scrolling, transitions and images update the page
 * outside any `act()` and React would warn at each one (hundreds a run, burying the warnings that matter). Set in the
 * scenario and browser configurations, never by a test file.
 */
// Read through globalThis: the tooling is typed for Node, without the DOM's globals.
const navigator: unknown = Reflect.get(globalThis, 'navigator');
const userAgent: unknown =
  typeof navigator === 'object' && navigator !== null ? Reflect.get(navigator, 'userAgent') : undefined;
const inRealBrowser = 'window' in globalThis && typeof userAgent === 'string' && !userAgent.includes('HappyDOM');

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', !inRealBrowser);
