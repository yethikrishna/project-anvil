/**
 * OpenTelemetry distributed tracing setup for Project Anvil.
 *
 * Traces flow: Frontend → API → Database → S3
 *
 * Usage:
 *   import {initTracing, traceMiddleware} from './telemetry';
 *   initTracing({serviceName: 'drive-api'});
 *
 * Environment:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  (Jaeger/collector)
 *   OTEL_SERVICE_NAME=drive-api
 */

import {trace, context, SpanStatusCode, SpanKind} from '@opentelemetry/api';
import {NodeTracerProvider} from '@opentelemetry/sdk-trace-node';
import {Resource} from '@opentelemetry/resources';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {SimpleSpanProcessor, BatchSpanProcessor} from '@opentelemetry/sdk-trace-base';
import {ATTR_SERVICE_NAME} from '@opentelemetry/semantic-conventions';

export interface TracingConfig {
  serviceName: string;
  endpoint?: string;
  /** Use batch processing (better for production) */
  batch?: boolean;
}

let initialized = false;

/**
 * Initialize OpenTelemetry tracing.
 */
export function initTracing(config: TracingConfig) {
  if (initialized) return;

  const endpoint = config.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces';

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
    }),
  });

  const exporter = new OTLPTraceExporter({url: endpoint});

  if (config.batch ?? process.env.NODE_ENV === 'production') {
    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  } else {
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  }

  provider.register();
  initialized = true;
  console.log(`🔍 Tracing initialized for ${config.serviceName} → ${endpoint}`);
}

/**
 * Create a traced span around an async operation.
 */
export async function traced<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number>;
  }
): Promise<T> {
  const tracer = trace.getTracer('anvil');
  return tracer.startActiveSpan(name, {kind: options?.kind}, async (span) => {
    try {
      if (options?.attributes) {
        for (const [key, value] of Object.entries(options.attributes)) {
          span.setAttribute(key, value);
        }
      }
      const result = await fn();
      span.setStatus({code: SpanStatusCode.OK});
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Fastify middleware for automatic request tracing.
 */
export function traceMiddleware() {
  return async (request: any, reply: any) => {
    const tracer = trace.getTracer('anvil');
    const span = tracer.startSpan(`HTTP ${request.method} ${request.url}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': request.method,
        'http.url': request.url,
        'http.user_agent': request.headers['user-agent'] ?? '',
      },
    });

    // Store span for later access
    request.span = span;

    reply.addHook('onSend', async () => {
      span.setAttribute('http.status_code', reply.statusCode);
      if (reply.statusCode >= 400) {
        span.setStatus({code: SpanStatusCode.ERROR, message: `HTTP ${reply.statusCode}`});
      }
      span.end();
    });
  };
}
