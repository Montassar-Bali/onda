// Creates .env.test with fresh random keys for the local test database (never committed).
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const file = new URL("../.env.test", import.meta.url);
if (!existsSync(file)) {
  const k = () => randomBytes(32).toString("base64");
  writeFileSync(file, [
    `DATABASE_URL="${process.env.TEST_DATABASE_URL ?? "postgresql://tropical@localhost:5433/tropical_test"}"`,
    `DATABASE_URL_UNPOOLED="${process.env.TEST_DATABASE_URL ?? "postgresql://tropical@localhost:5433/tropical_test"}"`,
    `SESSION_SECRET="${k()}"`, `CIN_ENC_KEY="${k()}"`, `CIN_ENC_KEY_VERSION="1"`, `CIN_HMAC_KEY="${k()}"`,
    `CIN_RETENTION_DAYS="365"`, `APP_URL="http://localhost:3000"`, "",
  ].join("\n"));
  console.log("Created .env.test with random test keys");
}
