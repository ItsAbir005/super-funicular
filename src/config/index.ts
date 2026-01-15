import { z } from "zod";
import { config as dotenvConfig } from "dotenv";
dotenvConfig();
const configSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.string().transform(Number),
});
type Config = z.infer<typeof configSchema>;
export function loadConfig(): Config {
  const parsed = configSchema.safeParse(process.env);
  
  if (!parsed.success) {
    console.error("[orbit] invalid configuration");
    console.error(parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
}