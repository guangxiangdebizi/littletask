interface WindowEntry {
  count: number;
  resetAt: number;
}

export class RateLimitError extends Error {
  readonly code = 'RATE_LIMITED';
  readonly statusCode = 429;

  constructor(readonly retryAfterSeconds: number) {
    super('Too many requests; retry after the current rate-limit window');
    this.name = 'RateLimitError';
  }
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, WindowEntry>();
  private operations = 0;

  consume(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + windowMs });
      this.prune(now);
      return;
    }
    if (entry.count >= limit) {
      throw new RateLimitError(Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)));
    }
    entry.count += 1;
    this.prune(now);
  }

  private prune(now: number): void {
    this.operations += 1;
    if (this.operations % 1_000 !== 0) return;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}
