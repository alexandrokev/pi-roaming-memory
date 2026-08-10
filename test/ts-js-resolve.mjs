/**
 * Resolve ./x.js → ./x.ts when the .js file is absent.
 * Return format module-typescript so --experimental-strip-types applies.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  // Windows: raw drive-letter or UNC paths (e.g. import(path.join(root, ...)))
  // are not valid ESM specifiers. Normalize to file:// URLs first or the
  // default loader throws ERR_UNSUPPORTED_ESM_URL_SCHEME ("Received protocol 'c:'").
  if (/^[A-Za-z]:[\\/]/.test(specifier) || specifier.startsWith("\\\\")) {
    specifier = pathToFileURL(path.resolve(specifier)).href;
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.endsWith(".js")) throw err;
    const parent = context.parentURL
      ? fileURLToPath(context.parentURL)
      : process.cwd();
    const baseDir =
      fs.existsSync(parent) && fs.statSync(parent).isDirectory()
        ? parent
        : path.dirname(parent);
    let candidate;
    if (specifier.startsWith("file:")) {
      candidate = fileURLToPath(specifier).replace(/\.js$/, ".ts");
    } else if (specifier.startsWith(".")) {
      candidate = path.resolve(baseDir, specifier.replace(/\.js$/, ".ts"));
    } else {
      throw err;
    }
    if (fs.existsSync(candidate)) {
      return {
        shortCircuit: true,
        url: pathToFileURL(candidate).href,
        format: "module-typescript",
      };
    }
    throw err;
  }
}
