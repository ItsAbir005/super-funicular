import { createClient } from "redis";
import { logger } from "../logger";
import { loadConfig } from "../config";
const { REDIS_URL } = loadConfig();
export const redis = createClient({
  url: REDIS_URL,
});
redis.on("connect", () => {
  logger.info("[redis] connecting");
});
redis.on("ready", () => {
  logger.info("[redis] ready");
});
redis.on("error", (err) => {
  logger.error({ err }, "[redis] error");
});
redis.on("reconnecting", () => {
  logger.warn("[redis] reconnecting");
});
