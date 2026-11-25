// Portable wrapper for every backend:* npm script.
// Prefers the project virtual environment, then falls back to python on PATH.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  resolve(root, ".venv", "Scripts", "python.exe"), // Windows
  resolve(root, ".venv", "bin", "python") // macOS / Linux
];
const python = candidates.find((candidate) => existsSync(candidate)) ?? "python";

const result = spawnSync(python, process.argv.slice(2), {
  cwd: root,
  stdio: "inherit"
});

if (result.error) {
  console.error(`Could not start Python (${python}): ${result.error.message}`);
  console.error("Create .venv and run: npm run backend:setup");
  process.exit(1);
}

process.exit(result.status ?? 1);
