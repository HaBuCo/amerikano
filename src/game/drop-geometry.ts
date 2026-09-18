export type DropRect = { x: number; y: number; width: number; height: number };
export type DropPoint = { x: number; y: number; dx: number; dy: number };

const TAP_DISTANCE = 7;

export function isTapDrop(point: DropPoint) {
  return Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Math.abs(point.dx) + Math.abs(point.dy) < TAP_DISTANCE;
}

export function containsDropPoint(rect: DropRect | undefined, point: DropPoint, padding = 0) {
  return Boolean(rect
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= rect.x - padding
    && point.x <= rect.x + rect.width + padding
    && point.y >= rect.y - padding
    && point.y <= rect.y + rect.height + padding);
}

export type DropTarget<T> = { value: T; rect: DropRect; preferred?: boolean };

/** Pick the most useful nearby target, then the exact/closest one. */
export function closestDropTarget<T>(targets: DropTarget<T>[], point: DropPoint, padding = 0) {
  return targets
    .filter(target => containsDropPoint(target.rect, point, padding))
    .map(target => ({
      ...target,
      exact: containsDropPoint(target.rect, point),
      distance: (point.x - (target.rect.x + target.rect.width / 2)) ** 2
        + (point.y - (target.rect.y + target.rect.height / 2)) ** 2,
    }))
    .sort((a, b) => Number(Boolean(b.preferred)) - Number(Boolean(a.preferred))
      || Number(b.exact) - Number(a.exact)
      || a.distance - b.distance)[0]?.value;
}
