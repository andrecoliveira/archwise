import { expect, test } from 'vitest';
import { canScaleComponent, MAX_REPLICAS, modeledCapacityRps, replicaCount } from './replica-model.js';

test('services can model replicas but client, load balancer and data kinds stay at one', () => {
  expect(canScaleComponent('service', 'app-server')).toBe(true);
  expect(canScaleComponent('service', 'worker')).toBe(true);
  expect(canScaleComponent('service', '')).toBe(true);
  expect(canScaleComponent('service', 'client')).toBe(false);
  expect(canScaleComponent('service', 'load-balancer')).toBe(false);
  expect(canScaleComponent('queue', 'queue')).toBe(false);
});

test('modeled per-replica capacity scales linearly under the explicit model ceiling', () => {
  expect(modeledCapacityRps('service', 'app-server', 80, 1)).toBe(80);
  expect(modeledCapacityRps('service', 'app-server', 80, 3)).toBe(240);
  expect(modeledCapacityRps('service', 'worker', 125, 2)).toBe(250);
  expect(modeledCapacityRps('cache', 'cache', 80, 3)).toBe(80);
  expect(modeledCapacityRps('service', 'client', 80, 3)).toBe(80);
  expect(modeledCapacityRps('service', 'app-server', 1_000_000, 16)).toBe(1_000_000);
});

test('invalid or missing replica counts fall back to one in the view model', () => {
  for (const value of [undefined, 0, -1, 1.5, MAX_REPLICAS + 1, Number.NaN]) {
    expect(replicaCount('service', 'app-server', value)).toBe(1);
  }
  expect(replicaCount('service', 'app-server', MAX_REPLICAS)).toBe(MAX_REPLICAS);
});
