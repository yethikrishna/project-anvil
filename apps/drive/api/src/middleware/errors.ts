/**
 * Drive API — Error handling utilities
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  error: Error,
  _request: FastifyRequest,
  reply: FastifyReply
): void {
  if (error instanceof AppError) {
    reply.code(error.statusCode).send({
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  // Fastify validation errors
  if ('validation' in error) {
    reply.code(400).send({
      code: 'VALIDATION_ERROR',
      message: error.message,
      details: { validation: (error as any).validation },
    });
    return;
  }

  // Unexpected errors
  console.error('Unhandled error:', error);
  reply.code(500).send({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}
