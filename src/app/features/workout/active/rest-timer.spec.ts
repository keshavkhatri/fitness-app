import { TestBed } from '@angular/core/testing';

import { CLOCK } from '../../../core/time/clock';
import { RestTimer, formatClock } from './rest-timer';

describe('RestTimer', () => {
  let now: number;

  function setup() {
    now = Date.parse('2026-10-08T09:00:00.000Z');
    TestBed.configureTestingModule({ providers: [RestTimer, { provide: CLOCK, useValue: () => new Date(now) }] });
    return TestBed.inject(RestTimer);
  }
  const advance = (timer: RestTimer, ms: number) => {
    now += ms;
    timer.tick();
  };

  it('counts down from the programmed rest and finishes', () => {
    const timer = setup();
    timer.start(90);
    expect(timer.status()).toBe('running');
    expect(timer.remainingSeconds()).toBe(90);
    advance(timer, 30_400);
    expect(timer.remainingSeconds()).toBe(60); // rounded up
    advance(timer, 60_000);
    expect(timer.status()).toBe('done');
    expect(timer.remainingSeconds()).toBe(0);
  });

  it('pauses and resumes without losing or gaining time', () => {
    const timer = setup();
    timer.start(60);
    advance(timer, 20_000);
    timer.pause();
    advance(timer, 120_000);
    expect(timer.status()).toBe('paused');
    expect(timer.remainingSeconds()).toBe(40);
    timer.resume();
    advance(timer, 10_000);
    expect(timer.remainingSeconds()).toBe(30);
  });

  it('restarts from the full duration and can be skipped at any time', () => {
    const timer = setup();
    timer.start(60);
    advance(timer, 45_000);
    timer.restart();
    expect(timer.remainingSeconds()).toBe(60);
    timer.skip();
    expect(timer.status()).toBe('idle');
  });

  it('no rest means no timer', () => {
    const timer = setup();
    timer.start(0);
    expect(timer.status()).toBe('idle');
  });

  it('measures against an end time, so missed ticks never make it drift', () => {
    const timer = setup();
    timer.start(120);
    now += 100_000; // no ticks for 100 s (e.g. a throttled background tab)
    timer.tick();
    expect(timer.remainingSeconds()).toBe(20);
  });

  it('ticks on its own while running', () => {
    vi.useFakeTimers();
    try {
      const timer = setup();
      timer.start(1);
      now += 1_000;
      vi.advanceTimersByTime(300);
      expect(timer.status()).toBe('done');
    } finally {
      vi.useRealTimers();
    }
  });

  it('formats a clock', () => {
    expect([0, 5, 60, 90, 125].map(formatClock)).toEqual(['0:00', '0:05', '1:00', '1:30', '2:05']);
  });
});
