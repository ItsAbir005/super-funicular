import { createClient } from "redis";
const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

async function seedTestDrivers() {
  await redis.connect();

  const drivers = [
    { id: "driver-1", lat: 40.7128, lng: -74.0060, status: "AVAILABLE" },
    { id: "driver-2", lat: 40.7580, lng: -73.9855, status: "AVAILABLE" },
    { id: "driver-3", lat: 40.7489, lng: -73.9680, status: "AVAILABLE" },
    { id: "driver-4", lat: 40.7614, lng: -73.9776, status: "BUSY" },
    { id: "driver-5", lat: 40.7306, lng: -73.9352, status: "AVAILABLE" },
  ];

  for (const driver of drivers) {
    await redis.geoAdd("orbit:drivers:geo", {
      member: driver.id,
      latitude: driver.lat,
      longitude: driver.lng,
    });
    await redis.hSet(`driver:state:${driver.id}`, {
      status: driver.status,
      lastAssignedAt: Date.now().toString(),
    });
    await redis.set(`driver:alive:${driver.id}`, "1", { EX: 600 });

    console.log(`✅ Added driver: ${driver.id} at (${driver.lat}, ${driver.lng}) - ${driver.status}`);
  }

  console.log("\n🎉 Test data seeded successfully!");
  console.log("\nYou can now test /match with coordinates around NYC:");
  console.log("  lat: 40.7128, lng: -74.0060");

  await redis.quit();
}

seedTestDrivers().catch(console.error);