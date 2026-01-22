import { redis } from "./index";
import { logger } from "../logger";
import { withTimeout } from "./safeRedis";
import { redisCircuitBreaker } from "../resilience/circuitBreaker";

const GEO_KEY = "orbit:drivers:geo";
const ALIVE_TTL = 30;

export async function updateDriverLocation(
  driverId: string,
  latitude: number,
  longitude: number
): Promise<void> {
  if (!redisCircuitBreaker.canProceed()) {
    logger.warn("Redis circuit breaker open, skipping location update");
    throw new Error("REDIS_UNAVAILABLE");
  }

  try {
    await Promise.all([
      withTimeout(
        redis.geoAdd(GEO_KEY, {
          member: driverId,
          latitude,
          longitude,
        }),
        200,
        "geo-add"
      ),
      withTimeout(
        redis.set(`driver:alive:${driverId}`, "1", { EX: ALIVE_TTL }),
        200,
        "set-alive"
      ),
    ]);

    redisCircuitBreaker.recordSuccess();
  } catch (err) {
    logger.error({ err, driverId }, "Failed to update driver location");
    redisCircuitBreaker.recordFailure();
    throw err;
  }
}

interface NearbyDriver {
  driverId: string;
  distanceMeters: number;
}

export async function findNearbyDrivers(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  limit = 5
): Promise<NearbyDriver[]> {
  if (!redisCircuitBreaker.canProceed()) {
    logger.warn("Redis circuit breaker open, returning empty results");
    return [];
  }

  try {
    const results = (await withTimeout(
      redis.sendCommand([
        "GEORADIUS",
        GEO_KEY,
        longitude.toString(),
        latitude.toString(),
        radiusMeters.toString(),
        "m",
        "WITHDIST",
        "COUNT",
        limit.toString(),
        "ASC",
      ]),
      300,
      "georadius"
    )) as unknown as Array<[string, string]>;

    if (!results || results.length === 0) {
      return [];
    }

    redisCircuitBreaker.recordSuccess();

    return results.map(([driverId, distance]) => ({
      driverId,
      distanceMeters: Number(distance),
    }));
  } catch (err) {
    logger.error(
      { err, latitude, longitude, radiusMeters },
      "Failed to find nearby drivers"
    );
    redisCircuitBreaker.recordFailure();
    return [];
  }
}

export async function removeDriverLocation(driverId: string): Promise<void> {
  try {
    await Promise.all([
      withTimeout(redis.zRem(GEO_KEY, driverId), 200, "geo-remove"),
      withTimeout(redis.del(`driver:alive:${driverId}`), 200, "del-alive"),
    ]);

    logger.info({ driverId }, "Driver location removed");
  } catch (err) {
    logger.error({ err, driverId }, "Failed to remove driver location");
  }
}