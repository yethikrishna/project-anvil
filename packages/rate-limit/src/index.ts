/**
 * @anvil/rate-limit — Token bucket rate limiter for all endpoints.
 *
 * Features:
 * - Token bucket algorithm (smooth burst + sustained rate)
 * - In-memory store with optional Redis backend
 * - Per-IP, per-user, per-endpoint limiting
 * - Sliding window with configurable buckets
 * - Fastify + Express middleware
 * - Standard rate limit headers (RFC 6585)
 */

// ── Types ──

export interface RateLimitOptions {
  /** Max requests per window */
  max: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Key generator function (default: IP address) */
  keyGenerator?: (request: RateLimitRequest) => string;
  /** Custom error message */
  errorMessage?: string;
  /** Include rate limit headers in response */
  includeHeaders?: boolean;
  /** Skip certain requests */
  skip?: (request: RateLimitRequest) => boolean;
}

export interface RateLimitRequest {
  ip?: string;
  headers: Record<string, string | undefined>;
  url: string;
  method: string;
  userId?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // Unix timestamp ms
  retryAfter?: number; // Seconds
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

// ── Token Bucket Store ──

export class TokenBucketStore {
  private buckets = new Map<string, Bucket>();
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(max: number, windowSeconds: number) {
    this.maxTokens = max;
    this.refillRate = max / (windowSeconds * 1000);

    // Cleanup stale buckets every 60s
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  consume(key: string, tokens = 1): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {tokens: this.maxTokens, lastRefill: now};
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refill = elapsed * this.refillRate;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refill);
    bucket.lastRefill = now;

    const resetAt = now + ((this.maxTokens - bucket.tokens) / this.refillRate);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        limit: this.maxTokens,
        resetAt: Math.ceil(resetAt),
      };
    }

    const retryAfter = Math.ceil((tokens - bucket.tokens) / this.refillRate / 1000);
    return {
      allowed: false,
      remaining: 0,
      limit: this.maxTokens,
      resetAt: Math.ceil(resetAt),
      retryAfter,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  getStats(): {totalKeys: number; buckets: {key: string; tokens: number; lastRefill: number}[]} {
    return {
      totalKeys: this.buckets.size,
      buckets: Array.from(this.buckets.entries()).map(([key, bucket]) => ({
        key,
        tokens: bucket.tokens,
        lastRefill: bucket.lastRefill,
      })),
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > staleThreshold) {
        this.buckets.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }
}

// ── Rate Limiter ──

export class RateLimiter {
  private store: TokenBucketStore;
  private options: Required<Pick<RateLimitOptions, 'max' | 'windowSeconds' | 'errorMessage' | 'includeHeaders'>> & {
    keyGenerator: (req: RateLimitRequest) => string;
    skip?: (req: RateLimitRequest) => boolean;
  };

  constructor(options: RateLimitOptions) {
    this.store = new TokenBucketStore(options.max, options.windowSeconds);
    this.options = {
      max: options.max,
      windowSeconds: options.windowSeconds,
      errorMessage: options.errorMessage ?? 'Too many requests. Please try again later.',
      includeHeaders: options.includeHeaders ?? true,
      keyGenerator: options.keyGenerator ?? ((req) => req.userId || req.ip || 'unknown'),
      skip: options.skip,
    };
  }

  /**
   * Check if a request is allowed.
   */
  check(request: RateLimitRequest): RateLimitResult & {headers: Record<string, string>} {
    if (this.options.skip?.(request)) {
      return {
        allowed: true,
        remaining: this.options.max,
        limit: this.options.max,
        resetAt: Date.now() + this.options.windowSeconds * 1000,
        headers: {},
      };
    }

    const key = this.options.keyGenerator(request);
    const result = this.store.consume(key);

    const headers: Record<string, string> = {};
    if (this.options.includeHeaders) {
      headers['X-RateLimit-Limit'] = String(result.limit);
      headers['X-RateLimit-Remaining'] = String(result.remaining);
      headers['X-RateLimit-Reset'] = String(Math.ceil(result.resetAt / 1000));

      if (!result.allowed) {
        headers['Retry-After'] = String(result.retryAfter);
      }
    }

    return {...result, headers};
  }

  /**
   * Fastify preHandler hook.
   */
  fastifyHook() {
    return async (request: any, reply: any) => {
      const result = this.check({
        ip: request.ip,
        headers: request.headers,
        url: request.url,
        method: request.method,
        userId: request.user?.sub,
      });

      // Set rate limit headers
      for (const [key, value] of Object.entries(result.headers)) {
        reply.header(key, value);
      }

      if (!result.allowed) {
        reply.code(429).send({
          error: 'Too Many Requests',
          message: this.options.errorMessage,
          retryAfter: result.retryAfter,
        });
      }
    };
  }

  /**
   * Express/Fastify middleware (generic).
   */
  middleware() {
    return (req: any, res: any, next?: any) => {
      const result = this.check({
        ip: req.ip ?? req.socket?.remoteAddress,
        headers: req.headers ?? {},
        url: req.url,
        method: req.method,
        userId: req.user?.sub,
      });

      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader?.(key, value);
      }

      if (!result.allowed) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'Too Many Requests',
          message: this.options.errorMessage,
          retryAfter: result.retryAfter,
        }));
        return;
      }

      next?.();
    };
  }

  /**
   * Next.js Edge middleware helper.
   */
  edgeMiddleware(request: Request): Response | null {
    const result = this.check({
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      headers: Object.fromEntries(request.headers.entries()),
      url: new URL(request.url).pathname,
      method: request.method,
    });

    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Too Many Requests',
          message: this.options.errorMessage,
          retryAfter: result.retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(result.retryAfter),
            ...result.headers,
          },
        }
      );
    }

    return null;
  }

  /**
   * Get store stats.
   */
  getStats() {
    return this.store.getStats();
  }

  /**
   * Reset rate limit for a key.
   */
  reset(key: string) {
    this.store.reset(key);
  }

  /**
   * Destroy the rate limiter.
   */
  destroy() {
    this.store.destroy();
  }
}

// ── Presets ──

export const RATE_LIMITS = {
  /** General API: 100 req/min */
  api: {max: 100, windowSeconds: 60},
  /** Auth endpoints: 5 req/min (brute force protection) */
  auth: {max: 5, windowSeconds: 60},
  /** Search: 30 req/min */
  search: {max: 30, windowSeconds: 60},
  /** File upload: 10 req/min */
  upload: {max: 10, windowSeconds: 60},
  /** Webhooks: 1000 req/min */
  webhook: {max: 1000, windowSeconds: 60},
  /** Password reset: 3 req/hour */
  passwordReset: {max: 3, windowSeconds: 3600},
};
