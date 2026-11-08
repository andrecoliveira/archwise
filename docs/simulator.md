# Simulator

## Purpose

The simulator helps users reason consistently about trade-offs. It is not a production capacity planner and must not present estimates as measured facts.

## Deterministic core

The open-source simulator consumes a graph revision plus a scenario. Inputs include request rate, read/write mix, payload size, service-time distributions, concurrency limits, replica counts, cache hit rate, queue capacity, retry policy, failure probabilities, recovery time, regional topology, and optional unit-cost tables.

Initial models use transparent approximations:

- critical-path latency and percentile ranges;
- utilization and saturation warnings using queueing approximations;
- throughput constrained by the tightest modeled resource;
- availability from dependency topology and redundancy assumptions;
- retry amplification, queue backlog, and recovery estimates;
- relative infrastructure cost from user-supplied unit prices.

Every result includes the formula/model version, input assumptions, uncertainty notes, and sensitivity drivers. The same version and seed produce the same result.

## Scenario library

MVP scenarios:

- baseline traffic;
- 10× traffic growth;
- dependency latency increase;
- service or instance failure;
- datastore degradation;
- regional outage represented by explicit topology;
- retry storm and queue backlog.

## Validation

The engine rejects impossible values, reports missing inputs, and distinguishes `unknown` from zero. It warns when a graph lacks the detail required for a model. Property tests cover monotonic expectations (for example, increasing service time cannot improve latency with all else equal), while golden fixtures stabilize known scenarios.

## AI boundary

AI may explain results, ask for missing assumptions, or suggest scenarios. It does not calculate canonical metrics. Explanations cite the deterministic result and scenario inputs; model output is labeled interpretation.
