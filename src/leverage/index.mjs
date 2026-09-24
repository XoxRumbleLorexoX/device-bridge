import { LeverageStore, defaultLeverageStorePath } from './storage.mjs';
import { LeverageService } from './service.mjs';

export { LeverageService } from './service.mjs';
export { LeverageStore, defaultLeverageStorePath } from './storage.mjs';
export { EventSchema, GoalSchema, FeedbackSchema, OutcomeMetricSchema, OutcomeMeasurementSchema, PrivacyPolicySchema, PRIVACY_CLASSES } from './model.mjs';
export { StaticEventProvider, collectProvider, assertEventProvider } from './providers.mjs';
export { estimateCapacityShift, syntheticLeverageFixture } from './pipeline.mjs';
export { deriveOutcomeMetrics, detectBottlenecks, attachOpportunityCosts, enrichLeverageMap, toProactiveInsight } from './reasoning.mjs';
export { assertDomainModule, discoverDomainCandidates, makeDomainCandidate } from './domains.mjs';

export async function findLeverage(options = {}, { storePath = defaultLeverageStorePath(), clock, domainModules = [] } = {}) {
  const service = new LeverageService(new LeverageStore(storePath), { ...(clock ? { clock } : {}), domainModules });
  return service.analyse(options);
}
