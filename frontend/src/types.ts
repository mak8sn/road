export type Status = 'waiting' | 'todo' | 'done' | 'cancelled';
export type Node = { id: string; title: string; status: Status; eventDate: string | null; createdAt: string; updatedAt: string; sectionId: string | null };
export type Link = { id: string; sourceId: string; targetId: string; order: number };
export type Section = { id: string; number: number; name: string | null };
export type Graph = { nodes: Node[]; links: Link[]; sections: Section[] };
