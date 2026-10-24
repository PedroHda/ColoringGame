export type Vector = { x: number; y: number };
export function clampPan(
  offset: Vector,
  zoom: number,
  width: number,
  height: number,
): Vector {
  const x = Math.max(0, ((zoom - 1) * width) / 2),
    y = Math.max(0, ((zoom - 1) * height) / 2);
  return {
    x: Math.max(-x, Math.min(x, offset.x)) || 0,
    y: Math.max(-y, Math.min(y, offset.y)) || 0,
  };
}
/** Keep the artwork point below an arbitrary screen focal point fixed as scale changes. */
export function zoomAt(
  focal: Vector,
  center: Vector,
  pan: Vector,
  oldZoom: number,
  newZoom: number,
): Vector {
  const ratio = newZoom / Math.max(0.01, oldZoom);
  return {
    x: focal.x - center.x - (focal.x - center.x - pan.x) * ratio,
    y: focal.y - center.y - (focal.y - center.y - pan.y) * ratio,
  };
}
