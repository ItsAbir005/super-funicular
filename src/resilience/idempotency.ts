import { redis } from "../redis";
import { logger } from "../logger";
import { withTimeout } from "../redis/safeRedis";

export class DuplicateRequestError extends Error {
  constructor(key: string) {
    super(`Duplicate request detected: ${key}`);
    this.name = "DuplicateRequestError";
  }
}
const IDEMPOTENCY_TTL = 60;
export async function ensureIdempotent(
  key: string,
  ttl: number = IDEMPOTENCY_TTL
): Promise<void> {
  try {
    const result = await withTimeout(
      redis.set(`idempotency:${key}`, "1", { NX: true, EX: ttl }),
      200,
      "idempotency-check"
    );

    if (!result) {
      throw new DuplicateRequestError(key);
    }
  } catch (err) {
    if (err instanceof DuplicateRequestError) {
      throw err;
    }
    logger.warn({ err, key }, "Idempotency check failed, allowing request");
  }
}

export async function markRequestComplete(key: string): Promise<void> {
  try {
    await withTimeout(
      redis.del(`idempotency:${key}`),
      200,
      "idempotency-cleanup"
    );
  } catch (err) {
    logger.warn({ err, key }, "Failed to cleanup idempotency key");
  }
}

export async function checkIdempotency(key: string): Promise<boolean> {
  try {
    const exists = await withTimeout(
      redis.exists(`idempotency:${key}`),
      200,
      "idempotency-exists"
    );
    return exists === 1;
  } catch (err) {
    logger.warn({ err, key }, "Failed to check idempotency, assuming unique");
    return false;
  }
}