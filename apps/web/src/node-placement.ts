/**
 * Positions new proposed nodes without covering neighboring connection handles.
 * Custom node cards are up to 224px wide; horizontal gap >= 76px.
 */
export function suggestedNodePosition(index: number, viewportWidth: number): { x: number; y: number } {
  const columns = viewportWidth >= 1200 ? 3 : 2;
  const safeIndex = Math.max(0, Math.trunc(index));
  return {
    x: 80 + (safeIndex % columns) * 300,
    y: 130 + Math.floor(safeIndex / columns) * 175,
  };
}
