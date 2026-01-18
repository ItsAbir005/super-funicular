import { redis } from "./index";
const GEO_KEY = "orbit:drivers:geo";
export async function cleanupDeadDrivers() {
  const drivers = await redis.zRange(GEO_KEY, 0, -1);
  for (const driverId of drivers) {
    const alive = await redis.exists(`driver:alive:${driverId}`);

    if (!alive) {
      await redis.zRem(GEO_KEY, driverId);
    }
  }
}
