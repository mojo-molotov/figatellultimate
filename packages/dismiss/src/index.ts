/**
 * `@figatellultimate/dismiss`: a popup closed by a tap on its own trigger stays closed. A select whose list opens
 * below its trigger closes, on a touch screen, at the tap's `pointerdown` (outside its list: the page under an open
 * list takes no pointer, so the press lands on the document), then opens again at its `click`, which reaches the
 * trigger once the list is gone: the tap closed nothing.
 *
 *     pointerdown outside the list ──> on the trigger (by position)? ──> remembered, with its time
 *     click on the trigger         ──> within a tap of it?            ──> cancelled (the closing tap's)
 *
 * Key design decisions:
 *     - Its own small runtime package: the page select (`@figatellultimate/facets-react`) and the search's sort
 *       (`@figatellultimate/search-react`) both need it, two adapters that may not import each other.
 *     - Pure, on plain values (a point, a box, a time): no DOM or framework type, as every runtime package; each
 *       adapter hands it what its events measure.
 *     - The press told to be on the trigger by its position: its target is the document, the page taking no pointer.
 *     - A click more than a tap after the press (`TAP`) is a new one: a finger lifted late or sliding away reopens.
 *
 * Invariants (`dismiss.test.ts`): a press on the trigger then its click, within a tap: cancelled, once; a press
 * elsewhere, or a click after a tap's time: never; a point within a box, its edges included.
 */

/** How long a tap's click may follow its press, in milliseconds. */
export const TAP = 800;

/** A point, e.g. a pointer event's `clientX` and `clientY`. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box, e.g. an element's `getBoundingClientRect()`. */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Whether a point lies within a box, its edges included; an empty box holds no point.
 *
 * @param point - The point.
 * @param box - The box.
 * @returns Whether the point is in the box.
 *
 * @example
 * within({ x: event.clientX, y: event.clientY }, trigger.getBoundingClientRect());
 */
export function within(point: Point, box: Box): boolean {
  return (
    box.right > box.left &&
    box.bottom > box.top &&
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

/** A popup's dismissal by a tap on its trigger: what a press outside it was, then whether the click is its. */
export interface TapToClose {
  /**
   * A press outside the popup, which closed it.
   *
   * @param onTrigger - Whether it fell on the popup's trigger (by its target or its position).
   * @param now - Its time, in milliseconds.
   */
  readonly pressedOutside: (onTrigger: boolean, now: number) => void;
  /**
   * The trigger's click.
   *
   * @param now - Its time, in milliseconds.
   * @returns Whether to cancel it: it is the closing tap's, which would open the popup again.
   */
  readonly click: (now: number) => boolean;
}

/**
 * A popup's dismissal by a tap on its trigger, which never opens it again at once.
 *
 * @param tap - How long a tap's click may follow its press; default `TAP`.
 * @returns `pressedOutside` for the popup's outside press, `click` for its trigger's click.
 *
 * @example
 * const dismissal = tapToClose();
 * // onPointerDownOutside: dismissal.pressedOutside(trigger.contains(target) || within(point, box), performance.now());
 * // trigger's onClick: if (dismissal.click(performance.now())) event.preventDefault();
 */
export function tapToClose(tap: number = TAP): TapToClose {
  let pressed: number | undefined;

  return {
    pressedOutside(onTrigger, now) {
      pressed = onTrigger ? now : undefined;
    },
    click(now) {
      const at = pressed;

      pressed = undefined;

      return at !== undefined && now - at < tap;
    },
  };
}
