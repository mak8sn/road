import type { Graph, Node } from './types';

export type Position = { x: number; y: number; row: number; col: number };
export type Layout = { positions: Map<string, Position>; tray: Node[]; width: number; height: number };

const cellX = 246;
const cellY = 200;

export function layoutGraph(graph: Graph, viewportWidth: number, viewportHeight: number): Layout {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const neighbors = new Map<string, string[]>();
  graph.nodes.forEach(node => { outgoing.set(node.id, []); incoming.set(node.id, []); neighbors.set(node.id, []); });
  [...graph.links].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).forEach(link => {
    if (!byId.has(link.sourceId) || !byId.has(link.targetId)) return;
    outgoing.get(link.sourceId)!.push(link.targetId);
    incoming.get(link.targetId)!.push(link.sourceId);
    neighbors.get(link.sourceId)!.push(link.targetId);
    neighbors.get(link.targetId)!.push(link.sourceId);
  });

  // The fixed tray holds independent undated squares. A linked square joins the canvas
  // so arrows and the order of its chain remain visible.
  const tray = graph.nodes.filter(node => !node.eventDate && neighbors.get(node.id)!.length === 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const onCanvas = graph.nodes.filter(node => !tray.includes(node));
  const visited = new Set<string>();
  const components: Node[][] = [];
  for (const node of onCanvas) {
    if (visited.has(node.id)) continue;
    const ids: string[] = [];
    const stack = [node.id];
    visited.add(node.id);
    while (stack.length) {
      const id = stack.pop()!;
      ids.push(id);
      for (const next of neighbors.get(id)!) if (!visited.has(next)) { visited.add(next); stack.push(next); }
    }
    components.push(ids.map(id => byId.get(id)!));
  }
  const dateKey = (nodes: Node[]) => nodes.map(node => node.eventDate).filter((date): date is string => !!date).sort()[0] || '9999-99-99';
  const createdKey = (nodes: Node[]) => nodes.map(node => node.createdAt).sort()[0];
  const dates = [...new Set(onCanvas.map(node => node.eventDate).filter((date): date is string => !!date))].sort();
  const columnForDate = new Map(dates.map((date, index) => [date, index]));
  components.sort((a, b) => createdKey(a).localeCompare(createdKey(b)) || dateKey(a).localeCompare(dateKey(b)));

  const raw = new Map<string, { row: number; col: number }>();
  let nextRow = 0;
  for (const component of components) {
    // Creation time chooses the row; event date independently chooses the column.
    const startCol = columnForDate.get(dateKey(component)) ?? dates.length;
    const componentIds = new Set(component.map(node => node.id));
    const roots = component.filter(node => incoming.get(node.id)!.filter(id => componentIds.has(id)).length === 0)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const placed = new Set<string>();
    const reservedRows = new Map<string, number>();
    const place = (id: string, row: number, col: number) => {
      if (placed.has(id)) return;
      placed.add(id);
      const ownRow = reservedRows.get(id) ?? row;
      raw.set(id, { row: ownRow, col });
      const children = outgoing.get(id)!.filter(child => componentIds.has(child));
      // Reserve secondary rows first, then follow the main chain. This keeps
      // a merge on the first branch while distinct secondary children retain
      // their own rows even if the main branch reaches them later.
      for (const child of children.slice(1)) if (!placed.has(child) && !reservedRows.has(child)) reservedRows.set(child, nextRow++);
      if (children[0]) place(children[0], ownRow, col + 1);
      for (const child of children.slice(1)) place(child, reservedRows.get(child) ?? ownRow, col + 1);
    };
    for (const root of roots) place(root.id, nextRow++, startCol);
    // Corrupt legacy cycles cannot trap layout; place any remaining nodes independently.
    for (const node of component) if (!placed.has(node.id)) place(node.id, nextRow++, startCol);

  }

  // Dates are shared column anchors across every chain. Reserve extra columns
  // between two dates only when a linked path actually needs that much room.
  const indegree = new Map(onCanvas.map(node => [node.id, incoming.get(node.id)!.length]));
  const queue = onCanvas.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  const ordered: string[] = [];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    ordered.push(id);
    for (const child of outgoing.get(id)!) {
      const remaining = indegree.get(child)! - 1;
      indegree.set(child, remaining);
      if (remaining === 0) queue.push(child);
    }
  }
  // Keep malformed legacy cycles visible; the API does not allow creating them.
  for (const node of onCanvas) if (!ordered.includes(node.id)) ordered.push(node.id);

  const requiredGaps = dates.map(() => dates.map(() => 0));
  for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
    const distance = new Map<string, number>();
    for (const node of onCanvas) if (node.eventDate === dates[dateIndex]) distance.set(node.id, 0);
    for (const id of ordered) {
      const steps = distance.get(id);
      if (steps === undefined) continue;
      const nodeDate = byId.get(id)!.eventDate;
      if (nodeDate) {
        const targetIndex = columnForDate.get(nodeDate)!;
        if (targetIndex > dateIndex) requiredGaps[dateIndex][targetIndex] = Math.max(requiredGaps[dateIndex][targetIndex], steps);
      }
      for (const child of outgoing.get(id)!) distance.set(child, Math.max(distance.get(child) ?? -Infinity, steps + 1));
    }
  }
  const dateColumns: number[] = [];
  for (let index = 0; index < dates.length; index++) {
    let column = index === 0 ? 0 : dateColumns[index - 1] + 1;
    for (let earlier = 0; earlier < index; earlier++) column = Math.max(column, dateColumns[earlier] + requiredGaps[earlier][index]);
    dateColumns.push(column);
  }

  const anchoredColumn = (id: string) => {
    const date = byId.get(id)!.eventDate;
    return date ? dateColumns[columnForDate.get(date)!] : undefined;
  };
  const latestBeforeDate = new Map<string, number>();
  for (const id of [...ordered].reverse()) {
    const anchor = anchoredColumn(id);
    if (anchor !== undefined) { latestBeforeDate.set(id, anchor); continue; }
    const childLimits = outgoing.get(id)!.map(child => latestBeforeDate.get(child)).filter((value): value is number => value !== undefined);
    if (childLimits.length) latestBeforeDate.set(id, Math.min(...childLimits) - 1);
  }
  const earliestAfterDate = new Map<string, number>();
  for (const id of ordered) {
    const anchor = anchoredColumn(id);
    if (anchor !== undefined) { earliestAfterDate.set(id, anchor); continue; }
    const parentLimits = incoming.get(id)!.map(parent => earliestAfterDate.get(parent)).filter((value): value is number => value !== undefined);
    if (parentLimits.length) earliestAfterDate.set(id, Math.max(...parentLimits) + 1);
  }
  for (const id of ordered) {
    const pos = raw.get(id)!;
    pos.col = anchoredColumn(id) ?? latestBeforeDate.get(id) ?? earliestAfterDate.get(id) ?? pos.col;
    // An undated suffix follows its predecessor; this also keeps inconsistent
    // same-date links pointing forward when their date anchors cannot coincide.
    for (const parent of incoming.get(id)!) pos.col = Math.max(pos.col, raw.get(parent)!.col + 1);
  }

  const minCol = Math.min(0, ...[...raw.values()].map(pos => pos.col));
  const maxCol = Math.max(0, ...[...raw.values()].map(pos => pos.col));
  const graphWidth = (maxCol - minCol + 1) * cellX;
  const graphHeight = Math.max(1, nextRow) * cellY;
  const startX = Math.max(360, (viewportWidth - graphWidth) / 2 + cellX / 2);
  // Center the visible rows above the fixed bottom tray.
  const usableHeight = viewportHeight - (viewportWidth <= 640 ? 160 : 230);
  const startY = Math.max(160, (usableHeight - graphHeight) / 2 + cellY / 2);
  const positions = new Map<string, Position>();
  raw.forEach((pos, id) => positions.set(id, { ...pos, col: pos.col - minCol, x: startX + (pos.col - minCol) * cellX, y: startY + pos.row * cellY }));
  return { positions, tray, width: Math.max(viewportWidth, startX + graphWidth + 300), height: Math.max(viewportHeight - 120, startY + graphHeight + 190) };
}
