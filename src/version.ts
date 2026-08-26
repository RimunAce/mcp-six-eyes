import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");

export const VERSION: string = (
  JSON.parse(readFileSync(packagePath, "utf8")) as { version: string }
).version;
