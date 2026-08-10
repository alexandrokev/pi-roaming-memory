import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(dir, "ts-js-resolve.mjs")).href);
