/**
 * Fixed-window counters held in this process's memory. Enough for one
 * instance; several instances (or a serverless platform) each count on their
 * own, so the effective limits multiply: use a shared store there.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number,
    /** Keys kept at most; the oldest windows are dropped first. */
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts one use of `key`; `retryAfterMs` when the window is already full. */
  take(key: string): { readonly allowed: true } | { readonly allowed: false; readonly retryAfterMs: number } {
    const now = this.now();
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.windowMs) {
      this.windows.delete(key);
      this.prune(now);
      this.windows.set(key, { start: now, count: 1 });
      return { allowed: true };
    }
    if (current.count >= this.limit) {
      return { allowed: false, retryAfterMs: current.start + this.windowMs - now };
    }
    current.count += 1;
    return { allowed: true };
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) {
      if (this.windows.size < this.maxKeys && now - window.start < this.windowMs) {
        break;
      }
      // Map order is insertion order: the first entries are the oldest windows.
      this.windows.delete(key);
    }
  }
}
