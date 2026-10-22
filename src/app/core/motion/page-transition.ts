import { Animation, createAnimation } from '@ionic/angular';

interface TransitionOptions {
  readonly enteringEl: HTMLElement;
  readonly leavingEl?: HTMLElement;
  readonly direction?: string;
}

/**
 * The page transition on Android (iOS keeps its native slide and swipe-back): the new page slides in a little
 * from the right and fades in while the old one drifts left and dims; Back plays it in reverse. Short (300 ms)
 * and transform/opacity only. Ionic turns transitions off entirely under reduced motion (app.config.ts).
 */
export function pageTransition(_base: HTMLElement, opts: TransitionOptions): Animation {
  const back = opts.direction === 'back';
  const root = createAnimation().duration(300).easing('cubic-bezier(0.2, 0, 0, 1)');

  root.addAnimation(
    createAnimation()
      .addElement(opts.enteringEl)
      .beforeRemoveClass('ion-page-invisible')
      .fromTo('transform', back ? 'translateX(-12%)' : 'translateX(18%)', 'translateX(0)')
      .fromTo('opacity', back ? '0.6' : '0', '1'),
  );
  if (opts.leavingEl) {
    const leaving = createAnimation()
      .addElement(opts.leavingEl)
      .fromTo('transform', 'translateX(0)', back ? 'translateX(18%)' : 'translateX(-12%)')
      .fromTo('opacity', '1', back ? '0' : '0.6');
    // Going back, the leaving page is on top and is removed after the transition. When the animation's styles
    // are cleared it would show again at full opacity for a frame (a blink) before that, so it's hidden as soon
    // as the transition completes, as Ionic's own transitions do. (Going forward it stays in the stack, under
    // the new page, and must stay displayable for the way back.)
    if (back) {
      leaving.onFinish((step) => {
        if (step === 1) {
          opts.leavingEl?.style.setProperty('display', 'none');
        }
      });
    }
    root.addAnimation(leaving);
  }
  return root;
}
