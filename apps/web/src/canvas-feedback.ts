import { simulateSandbox, type ProposedComponent, type ProposedConnection } from './simulation.js';

/** These labels describe a hypothetical model, never production telemetry. */
export interface CanvasNodeFeedback {
  readonly id: string;
  readonly label: string;
  readonly status: 'normal' | 'near-capacity' | 'bottleneck' | 'failed';
  readonly detail: string;
}

export function getCanvasFeedback(
  components: readonly ProposedComponent[],
  connections: readonly ProposedConnection[],
  entryNodeId: string,
  inputRps: number,
): readonly CanvasNodeFeedback[] {
  if (!components.length) return [];
  const report = simulateSandbox({ components, connections, entryNodeId, incomingRps: inputRps });
  return report.nodes.map((item) => {
    const status = item.failed
      ? 'failed'
      : item.droppedRps > 0
        ? 'bottleneck'
        : item.incomingRps > 0 && item.utilization >= 0.9
          ? 'near-capacity'
          : 'normal';
    const value = item.droppedRps.toFixed(1);
    const label =
      item.incomingRps === 0
        ? `${item.label} · idle (modeled)`
        : status === 'failed'
          ? `${item.label} · FAILED (modeled)`
          : status === 'bottleneck'
            ? `${item.label} · BOTTLENECK · ${value} dropped RPS`
            : `${item.label} · ${(item.utilization * 100).toFixed(0)}% modeled use`;
    const detail =
      status === 'failed'
        ? `${item.label}: hypothetical failure, zero configured serving capacity.`
        : status === 'bottleneck'
          ? `${item.label}: modeled incoming ${item.incomingRps} RPS exceeds served ${item.servedRps} RPS. ${item.droppedRps} RPS are dropped. Review configured capacity or routing.`
          : `${item.label}: modeled incoming ${item.incomingRps} RPS, served ${item.servedRps} RPS; utilization ${(item.utilization * 100).toFixed(0)}%.`;
    return { id: item.id, label, status, detail };
  });
}
