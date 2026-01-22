import { logger } from "../logger";
export class TimeoutError extends Error {
  constructor(operation: string, ms: number) {
    super(`Operation '${operation}' timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}
export async function withTimeout<T>(
  promise: Promise<T>,
  ms = 200,
  operation = "redis-operation"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(operation, ms)), ms)
    ),
  ]);
}
export async function safeRedisOperation<T>(
  operation: () => Promise<T>,
  fallback: T | (() => T),
  operationName = "redis-op"
): Promise<T> {
  try {
    return await withTimeout(operation(), 200, operationName);
  } catch (err) {
    logger.warn({ err, operation: operationName }, "Redis operation failed, using fallback");
    return typeof fallback === "function" ? (fallback as () => T)() : fallback;
  }
}