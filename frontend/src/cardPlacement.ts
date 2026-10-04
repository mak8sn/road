type Bounds = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number };
type Size = { width: number; height: number };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);
const intersects = (left: number, top: number, size: Size, bounds: Bounds) =>
  left < bounds.right && left + size.width > bounds.left && top < bounds.bottom && top + size.height > bounds.top;
const contains = (left: number, top: number, size: Size, point?: Point) =>
  !point || (point.x >= left && point.x <= left + size.width && point.y >= top && point.y <= top + size.height);

// Move only the expanded card. The canvas and the square's grid position stay put.
export function expandedCardShift(center: Point, size: Size, visible: Bounds, obstacle?: Bounds, pointer?: Point) {
  const centeredLeft = center.x - size.width / 2;
  const centeredTop = center.y - size.height / 2;
  const baseLeft = clamp(centeredLeft, visible.left, Math.max(visible.left, visible.right - size.width));
  const baseTop = clamp(centeredTop, visible.top, Math.max(visible.top, visible.bottom - size.height));
  let left = baseLeft;
  let top = baseTop;

  if (obstacle && intersects(left, top, size, obstacle)) {
    const candidates = [
      { left: baseLeft, top: obstacle.top - size.height },
      { left: obstacle.left - size.width, top: baseTop },
      { left: obstacle.right, top: baseTop },
      { left: baseLeft, top: obstacle.bottom },
    ].filter(candidate =>
      candidate.left >= visible.left && candidate.left + size.width <= visible.right &&
      candidate.top >= visible.top && candidate.top + size.height <= visible.bottom &&
      contains(candidate.left, candidate.top, size, pointer) &&
      !intersects(candidate.left, candidate.top, size, obstacle)
    ).sort((a, b) =>
      (a.left - centeredLeft) ** 2 + (a.top - centeredTop) ** 2 -
      ((b.left - centeredLeft) ** 2 + (b.top - centeredTop) ** 2)
    );
    // If avoiding the panel would move the card away from the pointer, keep
    // the viewport-clamped position and let the active card cover the panel.
    if (candidates[0]) ({ left, top } = candidates[0]);
  }

  return { x: left - centeredLeft, y: top - centeredTop };
}
