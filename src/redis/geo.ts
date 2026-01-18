import { redis } from "./index";
const GEO_KEY = "orbit:drivers:geo";
export async function updateDriverLocation(
  driverId: string,
  latitude: number,
  longitude: number
) {
  await redis.geoAdd(GEO_KEY, {
    member: driverId,
    latitude,
    longitude,
  });
  
  await redis.set(
    `driver:alive:${driverId}`,
    "1",
    { EX: 30 }
  );
}
export async function findNearbyDrivers(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  limit = 5
) {
  const results = await redis.sendCommand([
    "GEORADIUS",
    GEO_KEY,
    longitude.toString(),
    latitude.toString(),
    radiusMeters.toString(),
    "m",
    "WITHDIST",
    "COUNT",
    limit.toString(),
    "ASC"
  ]) as unknown as Array<[string, string]>;
  return results.map(([driverId, distance]) => ({
    driverId,
    distanceMeters: Number(distance),
  }));
}