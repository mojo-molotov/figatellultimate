# @figatellultimate/dismiss

A popup closed by a tap on its own trigger stays closed: on a touch screen, a select closes at the tap's press and
would open again at its click. Pure and DOM-free.

```sh
pnpm add @figatellultimate/dismiss
```

```ts
import { tapToClose, within } from '@figatellultimate/dismiss';

const dismissal = tapToClose();
// The popup's outside press: on the trigger?
dismissal.pressedOutside(within({ x: event.clientX, y: event.clientY }, trigger.getBoundingClientRect()), performance.now());
// The trigger's click: the closing tap's?
if (dismissal.click(performance.now())) event.preventDefault();
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)
