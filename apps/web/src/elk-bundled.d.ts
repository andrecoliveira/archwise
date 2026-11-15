/** Minimal ELK bundled constructor contract used for deterministic graph layout. */
declare module 'elkjs/lib/elk.bundled.js' {
  interface ElkLayoutNode {
    id: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
  }
  interface ElkLayoutEdge {
    id: string;
    sources: string[];
    targets: string[];
  }
  interface ElkGraph extends ElkLayoutNode {
    layoutOptions?: Record<string, string>;
    children?: ElkLayoutNode[];
    edges?: ElkLayoutEdge[];
  }
  const ELK: new () => {
    layout(graph: ElkGraph): Promise<ElkGraph>;
  };
  export default ELK;
}
