import commonService from "./commonService.js";
import { getOrigin, normalizeDistributionDomain } from "../utils/http.js";

export function selectDistributionOrigin(config, requestOrigin) {
  const currentOrigin = normalizeDistributionDomain(requestOrigin);
  const domains = Array.isArray(config?.cloudsub?.distributionDomains)
    ? config.cloudsub.distributionDomains
    : [];
  const defaultDomain = domains.find((item) => item?.isDefault) || domains[0];
  const configuredOrigin = normalizeDistributionDomain(defaultDomain?.domain || defaultDomain);

  return configuredOrigin || currentOrigin;
}

export async function getDistributionOrigin(env, request) {
  const config = await commonService.getConfig(env).catch(() => null);
  return selectDistributionOrigin(config, getOrigin(request)) || getOrigin(request);
}

export async function withSubscriptionUrl(env, request, payload) {
  const origin = await getDistributionOrigin(env, request);
  return {
    ...payload,
    subscriptionUrl: `${origin}/subscribe?token=${payload.token}`,
  };
}
