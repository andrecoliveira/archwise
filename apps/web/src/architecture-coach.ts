import type { Graph } from './graph-types.js';

export interface CoachQuestion {
  readonly id: string;
  readonly topic: 'requirements' | 'evidence' | 'dependencies' | 'trade-offs';
  readonly question: string;
  readonly explanation: string;
  readonly nodeId: string | null;
}

/**
 * An offline, deterministic architecture interviewer.
 * These prompts do not assert runtime topology, performance, or service health
 * based solely on package manifests.
 */
export function getCoachQuestions(graph: Graph, selectedId: string | null): readonly CoachQuestion[] {
  const selected = graph.nodes.find((node) => node.id === selectedId);
  const questions: CoachQuestion[] = [
    {
      id: 'requirements',
      topic: 'requirements',
      question: 'What is the most critical business flow in this project, and what failure would users notice first?',
      explanation: 'Package manifests cannot identify business criticality. Start by clarifying requirements.',
      nodeId: null,
    },
  ];

  if (graph.nodes.length === 0) {
    return questions;
  }

  if (graph.diagnostics.length > 0) {
    questions.push({
      id: 'coverage',
      topic: 'evidence',
      question: 'Some files could not be analyzed or resolved. Which missing evidence would you investigate first?',
      explanation: 'Discovery gaps should be resolved before making architectural recommendations.',
      nodeId: null,
    });
  }

  if (selected) {
    questions.push({
      id: 'selected-responsibility',
      topic: 'dependencies',
      question: `What responsibility does ${selected.label} have in the real system, and which services call it at runtime?`,
      explanation: `The manifest at ${selected.evidence[0]?.path ?? 'an unknown path'} identifies a package, not its deployed role.`,
      nodeId: selected.id,
    });
  }

  if (graph.edges.length > 0) {
    questions.push({
      id: 'declared-vs-runtime',
      topic: 'dependencies',
      question: 'Which declared package dependencies represent real network calls, and which are build-time or in-process imports?',
      explanation: 'Dependency declarations alone do not establish network traffic or availability boundaries.',
      nodeId: null,
    });
  }

  questions.push({
    id: 'design-tradeoff',
    topic: 'trade-offs',
    question: 'Before adding a cache, queue, or load balancer, which measurable requirement would justify it?',
    explanation: 'Start with latency, throughput, reliability or operational constraints rather than assumed components.',
    nodeId: null,
  });
  return questions;
}
