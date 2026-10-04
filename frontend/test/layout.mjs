import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/layout.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { layoutGraph } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const placementSource = await readFile(new URL('../src/cardPlacement.ts', import.meta.url), 'utf8');
const placementCompiled = ts.transpileModule(placementSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { expandedCardShift } = await import(`data:text/javascript;base64,${Buffer.from(placementCompiled).toString('base64')}`);

const node = (id, eventDate, createdAt) => ({ id, title: id, status: 'todo', eventDate, createdAt, updatedAt: createdAt, sectionId: null });
const link = (sourceId, targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, order: 0 });
const position = (graph, id) => layoutGraph(graph, 1200, 800).positions.get(id);

test('equal dates align across chains even with an undated predecessor', () => {
  const graph = {
    nodes: [
      node('old', '2026-10-07', '2026-10-01T00:00:00Z'),
      node('first-oct-8', '2026-10-08', '2026-10-02T00:00:00Z'),
      node('undated', null, '2026-10-03T00:00:00Z'),
      node('second-oct-8', '2026-10-08', '2026-10-04T00:00:00Z'),
    ],
    links: [link('old', 'first-oct-8'), link('undated', 'second-oct-8')],
    sections: [],
  };
  assert.equal(position(graph, 'first-oct-8').x, position(graph, 'second-oct-8').x);
  assert.ok(position(graph, 'undated').x < position(graph, 'second-oct-8').x);
  assert.ok(position(graph, 'first-oct-8').y < position(graph, 'second-oct-8').y);
});

test('an undated step between two dates adds room for all chains', () => {
  const graph = {
    nodes: [
      node('oct-7', '2026-10-07', '2026-10-01T00:00:00Z'),
      node('middle', null, '2026-10-02T00:00:00Z'),
      node('oct-8-a', '2026-10-08', '2026-10-03T00:00:00Z'),
      node('oct-8-b', '2026-10-08', '2026-10-04T00:00:00Z'),
    ],
    links: [link('oct-7', 'middle'), link('middle', 'oct-8-a')],
    sections: [],
  };
  const positions = layoutGraph(graph, 1200, 800).positions;
  assert.equal(positions.get('oct-8-a').x, positions.get('oct-8-b').x);
  assert.ok(positions.get('oct-7').x < positions.get('middle').x);
  assert.ok(positions.get('middle').x < positions.get('oct-8-a').x);
});

test('sections precede loose squares, which stack by creation time within each date', () => {
  const inSection = (id, date, createdAt, sectionId) => ({ ...node(id, date, createdAt), sectionId });
  const graph = {
    nodes: [
      node('oct-5-late', '2026-10-05', '2026-10-05T00:00:00Z'),
      inSection('section-2-start', '2026-10-07', '2026-10-03T00:00:00Z', 'section-2'),
      node('oct-8', '2026-10-08', '2026-10-01T00:00:00Z'),
      inSection('section-1-start', '2026-10-05', '2026-10-02T00:00:00Z', 'section-1'),
      node('oct-5-early', '2026-10-05', '2026-10-01T00:00:00Z'),
      inSection('section-2-end', '2026-10-08', '2026-10-04T00:00:00Z', 'section-2'),
      inSection('section-1-end', '2026-10-06', '2026-10-03T00:00:00Z', 'section-1'),
      inSection('section-1-branch', '2026-10-06', '2026-10-04T00:00:00Z', 'section-1'),
    ],
    links: [link('section-1-start', 'section-1-end'), { ...link('section-1-start', 'section-1-branch'), order: 1 }, link('section-2-start', 'section-2-end')],
    sections: [{ id: 'section-1', number: 1, name: null }, { id: 'section-2', number: 2, name: null }],
  };
  const positions = layoutGraph(graph, 1200, 800).positions;
  assert.ok(positions.get('section-1-start').y < positions.get('section-2-start').y);
  assert.ok(positions.get('section-1-branch').y < positions.get('section-2-start').y);
  assert.ok(positions.get('section-2-start').y < positions.get('oct-5-early').y);
  assert.equal(positions.get('oct-5-early').y, positions.get('oct-8').y);
  assert.ok(positions.get('oct-5-early').y < positions.get('oct-5-late').y);
  assert.equal(positions.get('section-1-start').x, positions.get('oct-5-early').x);
  assert.equal(positions.get('section-2-end').x, positions.get('oct-8').x);
});

test('expanded card opens inward at viewport edges', () => {
  const visible = { left: 0, top: 0, right: 900, bottom: 600 };
  assert.deepEqual(expandedCardShift({ x: 15, y: 20 }, { width: 600, height: 300 }, visible), { x: 285, y: 130 });
  assert.deepEqual(expandedCardShift({ x: 885, y: 580 }, { width: 600, height: 300 }, visible), { x: -285, y: -130 });
  assert.deepEqual(expandedCardShift({ x: 450, y: 300 }, { width: 600, height: 300 }, visible), { x: 0, y: 0 });
});

test('bottom panel only affects cards that overlap its actual rectangle', () => {
  const visible = { left: 0, top: 0, right: 1200, bottom: 800 };
  const size = { width: 600, height: 300 };
  const center = { x: 100, y: 700 };
  const awayFromCard = { left: 800, top: 625, right: 1100, bottom: 780 };
  assert.deepEqual(expandedCardShift(center, size, visible, awayFromCard, { x: 100, y: 700 }), { x: 200, y: -50 });

  const overlappingPanel = { left: 400, top: 625, right: 800, bottom: 780 };
  // Moving above the panel would leave the pointer outside the expanded card.
  assert.deepEqual(expandedCardShift(center, size, visible, overlappingPanel, { x: 100, y: 700 }), { x: 200, y: -50 });
  assert.deepEqual(expandedCardShift(center, size, visible, overlappingPanel, { x: 100, y: 600 }), { x: 200, y: -225 });
});
