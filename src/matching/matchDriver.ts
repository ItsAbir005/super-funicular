import { redis } from "../redis";
import { findNearbyDrivers } from "../redis/geo";
const DRIVER_LOCK_TTL = 5000;
export async function matchDriver(
  riderLat: number,
  riderLng: number
) {
  const candidates = await findNearbyDrivers(
    riderLat,
    riderLng,
    3000,
    10
  );
  for (const candidate of candidates) {
    const driverId = candidate.driverId;
    const state = await redis.hGetAll(`driver:state:${driverId}`);
    if (state.status !== "AVAILABLE") continue;
    const lockKey = `lock:driver:${driverId}`;
    const lock = await redis.set(
      lockKey,
      "1",
      { NX: true, PX: DRIVER_LOCK_TTL }
    );

    if (!lock) continue;
    await redis.hSet(`driver:state:${driverId}`, {
      status: "BUSY",
      lastAssignedAt: Date.now(),
    });

    return {
      driverId,
      distance: candidate.distanceMeters,
    };
  }
  throw new Error("NO_DRIVER_AVAILABLE");
}
