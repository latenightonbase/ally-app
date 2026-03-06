import { resolve } from "path";

const envPath = resolve(import.meta.dir, "../../.env.test.live");
const envFile = Bun.file(envPath);
if (await envFile.exists()) {
  const text = await envFile.text();
  console.log(text)
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} else {
  console.error(
    "E2E tests require apps/api/.env.test.live with real API keys.\n" +
    "Copy .env.test.live.example and fill in your keys.",
  );
  process.exit(1);
}

process.env.NODE_ENV = "test";
