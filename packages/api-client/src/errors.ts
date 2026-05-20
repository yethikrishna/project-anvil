/**
 * @anvil/api-client — Error handling
 */

/** Base error for all API client errors */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** Thrown when the server returns 401 */
export class AuthenticationError extends ApiClientError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTH_REQUIRED');
    this.name = 'AuthenticationError';
  }
}

/** Thrown when the server returns 403 */
export class AuthorizationError extends ApiClientError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'AuthorizationError';
  }
}

/** Thrown when the server returns 404 */
export class NotFoundError extends ApiClientError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/** Thrown when the server returns 409 */
export class ConflictError extends ApiClientError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/** Thrown when the server returns 422 */
export class ValidationError extends ApiClientError {
  constructor(
    message: string,
    public readonly fields: Record<string, string[]>
  ) {
    super(message, 422, 'VALIDATION_ERROR', { fields });
    this.name = 'ValidationError';
  }
}

/** Thrown when the server returns 429 */
export class RateLimitError extends ApiClientError {
  constructor(
    message = 'Rate limit exceeded',
    public readonly retryAfter?: number
  ) {
    super(message, 429, 'RATE_LIMITED', { retryAfter });
    this.name = 'RateLimitError';
  }
}

/** Thrown on network failures or server errors (5xx) */
export class ServerError extends ApiClientError {
  constructor(message = 'Internal server error', statusCode = 500) {
    super(message, statusCode, 'SERVER_ERROR');
    this.name = 'ServerError';
  }
}

/** Thrown when the request times out */
export class TimeoutError extends ApiClientError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, 0, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

/**
 * Map HTTP status codes to typed errors
 */
export function createErrorFromResponse(
  status: number,
  body: Record<string, unknown>
): ApiClientError {
  const message = (body.message as string) || 'Unknown error';
  const code = (body.code as string) || 'UNKNOWN';

  switch (status) {
    case 401:
      return new AuthenticationError(message);
    case 403:
      return new AuthorizationError(message);
    case 404:
      return new NotFoundError(message);
    case 409:
      return new ConflictError(message);
    case 422:
      return new ValidationError(
        message,
        (body.details as Record<string, string[]>) ?? {}
      );
    case 429: {
      const retryAfter = body.retryAfter as number | undefined;
      return new RateLimitError(message, retryAfter);
    }
    default:
      if (status >= 500) return new ServerError(message, status);
      return new ApiClientError(message, status, code, body.details as Record<string, unknown>);
  }
}
