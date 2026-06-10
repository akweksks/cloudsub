import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "jsonc-parser";

const databaseName = "cloudsub";
const bucketName = "cloudsub-cache";
const generatedConfig = resolve("wrangler.deploy.json");
const wranglerCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function runWrangler(args, { capture = false } = {}) {
  const result = spawnSync(wranglerCommand, ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || `wrangler ${args.join(" ")} failed`);
  }

  return result;
}

function parseJsonOutput(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) {
    throw new Error("Unable to parse Wrangler JSON output.");
  }
  return JSON.parse(output.slice(start, end + 1));
}

function findDatabase() {
  const result = runWrangler(["d1", "list", "--json"], { capture: true });
  return parseJsonOutput(result.stdout).find((database) => database.name === databaseName) || null;
}

function ensureDatabase() {
  const existing = findDatabase();
  if (existing) {
    return { database: existing, created: false };
  }

  console.log(`Creating D1 database "${databaseName}"...`);
  runWrangler(["d1", "create", databaseName]);
  const created = findDatabase();
  if (!created) {
    throw new Error(`D1 database "${databaseName}" was created but could not be resolved.`);
  }
  return { database: created, created: true };
}

function ensureBucket() {
  const list = runWrangler(["r2", "bucket", "list"], { capture: true });
  if (!list.stdout.includes(bucketName)) {
    console.log(`Creating R2 bucket "${bucketName}"...`);
    runWrangler(["r2", "bucket", "create", bucketName]);
  }
}

function databaseHasSchema() {
  try {
    const result = runWrangler([
      "d1",
      "execute",
      databaseName,
      "--remote",
      "--json",
      "--command=SELECT name FROM sqlite_master WHERE type='table' AND name='common';",
    ], { capture: true });
    return result.stdout.includes('"common"');
  } catch {
    return false;
  }
}

function initializeDatabase() {
  const dbDir = resolve("workers/poly-workers/db");
  const files = readdirSync(dbDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => {
      if (left === "base.sql") return -1;
      if (right === "base.sql") return 1;
      return left.localeCompare(right, undefined, { numeric: true });
    });

  console.log(`Initializing D1 database with ${files.length} SQL files...`);
  for (const file of files) {
    runWrangler(["d1", "execute", databaseName, "--remote", `--file=${resolve(dbDir, file)}`]);
  }
}

function writeDeployConfig(database) {
  const errors = [];
  const config = parse(readFileSync(resolve("wrangler.jsonc"), "utf8"), errors, {
    allowTrailingComma: true,
  });
  if (errors.length > 0 || !config) {
    throw new Error("Unable to parse wrangler.jsonc.");
  }

  config.d1_databases = [
    {
      binding: "DB",
      database_name: databaseName,
      database_id: database.uuid || database.id,
    },
  ];
  writeFileSync(generatedConfig, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

try {
  const { database, created } = ensureDatabase();
  ensureBucket();
  if (created || !databaseHasSchema()) {
    initializeDatabase();
  }
  writeDeployConfig(database);
  runWrangler(["deploy", "--config", generatedConfig]);
} finally {
  try {
    unlinkSync(generatedConfig);
  } catch {
    // Provisioning may fail before a generated config exists.
  }
}
