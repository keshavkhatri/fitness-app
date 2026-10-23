/**
 * Entrance animations (cards rising, bars and rings filling, the weight line drawing) play once per element.
 * A tab's page is hidden and shown again as the person switches tabs, and a hidden-then-shown element restarts its
 * CSS animation, so every card would rise in again on top of the tab change (the heaviest frames in the app).
 * Once an entrance ends, the element keeps its final state with no animation attached. Pops and bounces that
 * answer a tap are left alone: state re-triggers them. Elements created later (a new day's meals) still animate.
 */
const ENTRANCES: ReadonlySet<string> = new Set(['fit-rise', 'fit-fade', 'fit-grow-x', 'progress-ring-in', 'body-reveal']);

export function playEntrancesOnce(target: Document = document): void {
  target.addEventListener(
    'animationend',
    (event) => {
      if (ENTRANCES.has(event.animationName) && event.target instanceof HTMLElement) {
        event.target.style.animation = 'none';
      }
    },
    { capture: true },
  );
}
