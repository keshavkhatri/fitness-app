import { playEntrancesOnce } from './play-once';

describe('playEntrancesOnce', () => {
  const end = (el: HTMLElement, animationName: string) => {
    const event = new Event('animationend', { bubbles: true }) as Event & { animationName: string };
    event.animationName = animationName;
    el.dispatchEvent(event);
  };

  it('stops an entrance animation from replaying once it has ended, and leaves other animations alone', () => {
    playEntrancesOnce();
    const card = document.createElement('div');
    const flame = document.createElement('div');
    flame.style.animation = 'fit-flicker 1s infinite';
    document.body.append(card, flame);

    end(card, 'fit-rise');
    end(flame, 'fit-flicker');

    expect(card.style.animation).toBe('none');
    expect(flame.style.animation).toContain('fit-flicker');
    card.remove();
    flame.remove();
  });
});
