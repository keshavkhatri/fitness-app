import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import { CLOCK } from '../../../core/time/clock';

export type RestTimerStatus = 'idle' | 'running' | 'paused' | 'done';

interface TimerState {
  readonly status: RestTimerStatus;
  readonly totalSeconds: number;
  /** While running: when the rest ends (ms since epoch). */
  readonly endsAt: number;
  /** While paused: what was left (ms). */
  readonly remainingMs: number;
}

const IDLE: TimerState = { status: 'idle', totalSeconds: 0, endsAt: 0, remainingMs: 0 };

/**
 * A simple countdown for programmed rest. Time comes from CLOCK and is
 * measured against an end instant, so a throttled background tab or a slow
 * tick never makes it drift. Never blocks: the user can continue at any time.
 * Provided per page.
 */
@Injectable()
export class RestTimer {
  private readonly clock = inject(CLOCK);
  private readonly state = signal<TimerState>(IDLE);
  private readonly now = signal(0);
  private interval: ReturnType<typeof setInterval> | null = null;

  readonly status = computed(() => this.state().status);
  readonly totalSeconds = computed(() => this.state().totalSeconds);
  /** Whole seconds left (rounded up so "0:00" only shows when done). */
  readonly remainingSeconds = computed(() => {
    const s = this.state();
    switch (s.status) {
      case 'running':
        return Math.max(0, Math.ceil((s.endsAt - this.now()) / 1000));
      case 'paused':
        return Math.ceil(s.remainingMs / 1000);
      default:
        return 0;
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopTicking());
  }

  start(seconds: number): void {
    if (seconds <= 0) {
      this.state.set(IDLE);
      this.stopTicking();
      return;
    }
    const now = this.clock().getTime();
    this.now.set(now);
    this.state.set({ status: 'running', totalSeconds: seconds, endsAt: now + seconds * 1000, remainingMs: 0 });
    this.startTicking();
  }

  pause(): void {
    const s = this.state();
    if (s.status === 'running') {
      this.state.set({ ...s, status: 'paused', remainingMs: Math.max(0, s.endsAt - this.clock().getTime()) });
      this.stopTicking();
    }
  }

  resume(): void {
    const s = this.state();
    if (s.status === 'paused') {
      const now = this.clock().getTime();
      this.now.set(now);
      this.state.set({ ...s, status: 'running', endsAt: now + s.remainingMs });
      this.startTicking();
    }
  }

  /** Starts the same rest again from the full duration. */
  restart(): void {
    const total = this.state().totalSeconds;
    if (total > 0) {
      this.start(total);
    }
  }

  /** Ends the rest now (the user continues early) or dismisses a finished timer. */
  skip(): void {
    this.state.set(IDLE);
    this.stopTicking();
  }

  /** Re-evaluates the countdown (called on every tick). */
  tick(): void {
    const s = this.state();
    if (s.status !== 'running') {
      return;
    }
    const now = this.clock().getTime();
    this.now.set(now);
    if (now >= s.endsAt) {
      this.state.set({ ...s, status: 'done' });
      this.stopTicking();
    }
  }

  private startTicking(): void {
    this.stopTicking();
    this.interval = setInterval(() => this.tick(), 250);
  }

  private stopTicking(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

/** "01:30", "00:05" */
export const formatClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
