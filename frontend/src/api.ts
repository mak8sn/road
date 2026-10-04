import type { Graph, Link, Node, Section } from './types';

async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, headers: data ? { 'Content-Type': 'application/json' } : undefined, body: data ? JSON.stringify(data) : undefined });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Не удалось сохранить изменения');
  return json as T;
}

export const api = {
  graph: () => request<Graph>('/graph'),
  createNode: (data: Partial<Node> = {}) => request<Node>('/nodes', 'POST', data),
  updateNode: (id: string, data: Partial<Node>) => request<Node>(`/nodes/${id}`, 'PATCH', data),
  deleteNode: (id: string) => request<{ deleted: boolean }>(`/nodes/${id}`, 'DELETE'),
  createLink: (sourceId: string, targetId: string) => request<Link>('/links', 'POST', { sourceId, targetId }),
  deleteLink: (id: string) => request<{ deleted: boolean }>(`/links/${id}`, 'DELETE'),
  updateSection: (id: string, name: string) => request<Section>(`/sections/${id}`, 'PATCH', { name })
};
