import { redis } from "../redis";
import { findNearbyDrivers } from "../redis/geo";
import { logger } from "../logger";
import { matchingCircuitBreaker, CircuitOpenError } from "../resilience/circuitBreaker";
import { withTimeout, TimeoutError } from "../redis/safeRedis";
import { ensureIdempotent } from "../resilience/idempotency";

const DRIVER_LOCK_TTL = 5000;
const MAX_SEARCH_RADIUS = 10000;
const RADIUS_INCREMENT = 2000;
export class NoDriverAvailableError extends Error {
  constructor(radius: number) {
    super(`No drivers available within ${radius}m`);
    this.name = "NoDriverAvailableError";
  }
}

export class MatchingTemporarilyUnavailableError extends Error {
  constructor() {
    super("Matching service temporarily unavailable");
    this.name = "MatchingTemporarilyUnavailableError";
  }
}

interface MatchResult {
  driverId: string;
  distance: number;
  searchRadius: number;
  attemptCount: number;
}

export async function matchDriver(
  riderLat: number,
  riderLng: number,
  requestId?: string
): Promise<MatchResult> {
  if (!matchingCircuitBreaker.canProceed()) {
    logger.warn("Matching circuit breaker open");
    throw new MatchingTemporarilyUnavailableError();
  }

  if (requestId) {
    try {
      await ensureIdempotent(requestId, 60);
    } catch (err) {
      matchingCircuitBreaker.recordFailure();
      throw err;
    }
  }

  let currentRadius = 3000;
  let attemptCount = 0;

  while (currentRadius <= MAX_SEARCH_RADIUS) {
    attemptCount++;

    try {
      const result = await attemptMatch(riderLat, riderLng, currentRadius, attemptCount);
      
      matchingCircuitBreaker.recordSuccess();
      
      return result;
    } catch (err) {
      if (err instanceof NoDriverAvailableError) {
        logger.info(
          { radius: currentRadius, attempt: attemptCount },
          "No drivers in radius, expanding search"
        );
        currentRadius += RADIUS_INCREMENT;
        continue;
      }

      if (err instanceof TimeoutError || err instanceof CircuitOpenError) {
        matchingCircuitBreaker.recordFailure();
        throw new MatchingTemporarilyUnavailableError();
      }

      matchingCircuitBreaker.recordFailure();
      throw err;
    }
  }

  matchingCircuitBreaker.recordFailure();
  throw new NoDriverAvailableError(MAX_SEARCH_RADIUS);
}

async function attemptMatch(
  riderLat: number,
  riderLng: number,
  radius: number,
  attemptCount: number
): Promise<MatchResult> {
  const candidates = await withTimeout(
    findNearbyDrivers(riderLat, riderLng, radius, 10),
    300,
    "find-nearby-drivers"
  );

  if (!candidates || candidates.length === 0) {
    throw new NoDriverAvailableError(radius);
  }

  for (const candidate of candidates) {
    const driverId = candidate.driverId;

    try {
      const state = await withTimeout(
        redis.hGetAll(`driver:state:${driverId}`),
        200,
        "get-driver-state"
      );

      if (state.status !== "AVAILABLE") {
        logger.debug({ driverId, status: state.status }, "Driver not available");
        continue;
      }

      const lockKey = `lock:driver:${driverId}`;
      const lock = await withTimeout(
        redis.set(lockKey, "1", { NX: true, PX: DRIVER_LOCK_TTL }),
        200,
        "acquire-driver-lock"
      );

      if (!lock) {
        logger.debug({ driverId }, "Failed to acquire lock");
        continue;
      }

      await withTimeout(
        redis.hSet(`driver:state:${driverId}`, {
          status: "BUSY",
          lastAssignedAt: Date.now().toString(),
        }),
        200,
        "update-driver-state"
      );

      logger.info(
        { driverId, distance: candidate.distanceMeters, radius, attemptCount },
        "Driver matched successfully"
      );

      return {
        driverId,
        distance: candidate.distanceMeters,
        searchRadius: radius,
        attemptCount,
      };
    } catch (err) {
      logger.warn({ err, driverId }, "Error processing candidate driver");
      continue;
    }
  }

  throw new NoDriverAvailableError(radius);
}

export async function releaseDriver(driverId: string): Promise<void> {
  try {
    const lockKey = `lock:driver:${driverId}`;
    
    await Promise.all([
      withTimeout(redis.del(lockKey), 200, "release-lock"),
      withTimeout(
        redis.hSet(`driver:state:${driverId}`, { status: "AVAILABLE" }),
        200,
        "release-driver-state"
      ),
    ]);

    logger.info({ driverId }, "Driver released successfully");
  } catch (err) {
    logger.error({ err, driverId }, "Failed to release driver");
  }
}