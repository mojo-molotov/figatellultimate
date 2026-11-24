/**
 * A select whose list opens below its trigger, closed by a tap on that trigger and kept closed: React's side of
 * `tapToClose` of `@figatellultimate/dismiss`, which says why and how.
 *
 * Invariant (`components.test.tsx`): a tap on the trigger of an open list closes it, and it stays closed.
 */
import { tapToClose, within } from '@figatellultimate/dismiss';
import { useMemo, useRef, type MouseEvent, type RefObject } from 'react';

/** The pointer event Radix hands an outside `pointerdown`, the part read here. */
interface OutsideEvent {
  readonly detail: { readonly originalEvent: PointerEvent };
}

/**
 * Closing a select by a tap on its trigger, without its click opening it again.
 *
 * @returns The trigger's ref, the list's `onPointerDownOutside`, and the trigger's `onClick`.
 *
 * @example
 * const { trigger, closesOnTrigger, swallowsReopen } = useTapToClose();
 * <Select.Trigger ref={trigger} onClick={swallowsReopen} />
 * <Select.Content position="popper" onPointerDownOutside={closesOnTrigger} />
 */
export function useTapToClose(): {
  readonly trigger: RefObject<HTMLButtonElement | null>;
  readonly closesOnTrigger: (event: OutsideEvent) => void;
  readonly swallowsReopen: (event: MouseEvent<HTMLButtonElement>) => void;
} {
  const trigger = useRef<HTMLButtonElement>(null);

  return useMemo(() => {
    const dismissal = tapToClose();

    return {
      trigger,
      closesOnTrigger: (event: OutsideEvent) => {
        const button = trigger.current;
        const { target, clientX, clientY } = event.detail.originalEvent;

        if (button === null) return;

        // Its target is the document (the page under an open list takes no pointer): its position tells.
        const onTrigger =
          (target instanceof Node && button.contains(target)) ||
          within({ x: clientX, y: clientY }, button.getBoundingClientRect());

        dismissal.pressedOutside(onTrigger, performance.now());
      },
      swallowsReopen: (event: MouseEvent<HTMLButtonElement>) => {
        if (dismissal.click(performance.now())) event.preventDefault();
      },
    };
  }, []);
}
