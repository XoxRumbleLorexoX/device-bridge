import { canonicalEvent } from './model.mjs';

export function assertEventProvider(provider) {
  if (!provider || typeof provider.collect !== 'function') throw new TypeError('Event provider must expose async collect().');
  if (!provider.id || typeof provider.id !== 'string') throw new TypeError('Event provider must expose a stable string id.');
  return provider;
}

export async function collectProvider(provider, context = {}) {
  assertEventProvider(provider);
  const collected = await provider.collect(context);
  if (!Array.isArray(collected)) throw new TypeError(`Provider ${provider.id} must return an array of events.`);
  return collected.map(event => canonicalEvent({ ...event, source: event.source ?? provider.id }));
}

export class StaticEventProvider {
  constructor(id, events = []) {
    this.id = id;
    this.events = events;
  }

  async collect() {
    return this.events.map(event => structuredClone(event));
  }
}
