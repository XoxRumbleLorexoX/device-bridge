import { LeverageStore, defaultLeverageStorePath } from './storage.mjs';
import { LeverageService } from './service.mjs';

export { LeverageService } from './service.mjs';
export { LeverageStore, defaultLeverageStorePath } from './storage.mjs';
export { EventSchema, GoalSchema, FeedbackSchema, PrivacyPolicySchema, PRIVACY_CLASSES } from './model.mjs';
export { StaticEventProvider, collectProvider, assertEventProvider } from './providers.mjs';
export { estimateCapacityShift, syntheticLeverageFixture } from './pipeline.mjs';

export async function findLeverage(options = {}, { storePath = defaultLeverageStorePath(), clock } = {}) {
  const service = new LeverageService(new LeverageStore(storePath), clock ? { clock } : undefined);
  return service.analyse(options);
}
