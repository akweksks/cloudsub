import airportRepository from "../db/airportRepository.js";
import commonRepository from "../db/commonRepository.js";
import airportHealthService from "./airportHealthService.js";
import nodePoolService from "./nodePoolService.js";
import { putSchedulerStatus, resolveConfigDocument } from "./r2CacheService.js";

const DEFAULT_REFRESH_INTERVAL_HOURS = 6;
const MIN_REFRESH_INTERVAL_HOURS = 1;
const MAX_REFRESH_INTERVAL_HOURS = 168;

function clampIntervalHours(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_REFRESH_INTERVAL_HOURS;
  return Math.min(Math.max(numericValue, MIN_REFRESH_INTERVAL_HOURS), MAX_REFRESH_INTERVAL_HOURS);
}

async function getRefreshIntervalHours(env) {
  const row = await commonRepository.getInfoByType(env, "config");
  const config = row ? await resolveConfigDocument(env, row.json) : null;
  return clampIntervalHours(config?.cloudsub?.upstreamRefreshIntervalHours);
}

function isDue(airport, intervalHours, now = new Date()) {
  if (!airport.last_checked_at) return true;
  const lastCheckedAt = new Date(airport.last_checked_at).getTime();
  if (!Number.isFinite(lastCheckedAt)) return true;
  return now.getTime() - lastCheckedAt >= intervalHours * 60 * 60 * 1000;
}

export default {
  async run(env, options = {}) {
    const now = new Date();
    const intervalHours = clampIntervalHours(options.intervalHours ?? await getRefreshIntervalHours(env));
    const airports = await airportRepository.getAllOpenAirports(env);
    const checked = [];
    const skipped = [];

    for (const airport of airports.results || []) {
      if (!options.force && !isDue(airport, intervalHours, now)) {
        skipped.push({
          id: airport.id,
          name: airport.name,
          lastCheckedAt: airport.last_checked_at,
        });
        continue;
      }

      const health = await airportHealthService.checkAndSave(env, airport, { skipNodePoolRebuild: true });
      checked.push({
        id: airport.id,
        name: airport.name,
        status: health.status,
        nodeCount: health.nodeCount,
        checkedAt: health.checkedAt,
      });
    }

    const nodePool = await nodePoolService.rebuild(env);
    const summary = {
      ranAt: now.toISOString(),
      intervalHours,
      force: Boolean(options.force),
      checked,
      skipped,
      nodePool: {
        validCount: nodePool.validCount,
        invalidCount: nodePool.invalidCount,
        duplicateCount: nodePool.duplicateCount,
      },
    };
    await putSchedulerStatus(env, summary);
    return summary;
  },

  isDue,
  clampIntervalHours,
};
