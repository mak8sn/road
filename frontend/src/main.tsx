import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { expandedCardShift } from './cardPlacement';
import { layoutGraph } from './layout';
import type { Graph, Node, Section, Status } from './types';
import './style.css';

const statusMeta: Record<Status, { icon: string; label: string }> = {
  waiting: { icon: '◷', label: 'Ждёт других' },
  todo: { icon: '🎰', label: 'TODO' },
  done: { icon: '✓', label: 'Выполнено' },
  cancelled: { icon: '×', label: 'Отменено' }
};
const dateLabel = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
type LinkMode = { sourceId: string; direction: 'before' | 'after' } | null;

function App() {
  const [graph, setGraph] = useState<Graph>({ nodes: [], links: [], sections: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [titleConfirmation, setTitleConfirmation] = useState<{ id: string; oldTitle: string; newTitle: string } | null>(null);
  const [savingTitle, setSavingTitle] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkMode>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('road-theme') as 'light' | 'dark') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const canvasRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('road-theme', theme); }, [theme]);
  useEffect(() => { const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const reload = async () => { const data = await api.graph(); setGraph(data); return data; };
  useEffect(() => { reload().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const layout = useMemo(() => layoutGraph(graph, size.width, size.height), [graph, size]);
  useLayoutEffect(() => {
    if (loading || initialized.current || !canvasRef.current || !layout.positions.size) return;
    initialized.current = true;
    const first = [...layout.positions.values()][0];
    canvasRef.current.scrollLeft = Math.max(0, first.x - canvasRef.current.clientWidth / 2);
    canvasRef.current.scrollTop = Math.max(0, first.y - canvasRef.current.clientHeight / 2);
  }, [loading, layout]);
  const run = async (job: () => Promise<unknown>) => {
    try { setError(''); await job(); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить изменения'); }
  };
  const saveTitle = async (id: string, title: string) => {
    setSavingTitle(id);
    try {
      setError('');
      const updated = await api.updateNode(id, { title });
      setGraph(current => ({ ...current, nodes: current.nodes.map(node => node.id === id ? updated : node) }));
      setTitleDrafts(current => { const next = { ...current }; delete next[id]; return next; });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить название');
      return false;
    } finally { setSavingTitle(null); }
  };
  const closeCard = (node: Node) => {
    if (active !== node.id) return;
    setActive(null);
    const draft = titleDrafts[node.id] ?? node.title;
    if (draft !== node.title && savingTitle !== node.id) setTitleConfirmation({ id: node.id, oldTitle: node.title, newTitle: draft });
  };
  const create = async (near?: { id: string; direction: 'before' | 'after' }) => {
    let created: Node | undefined;
    await run(async () => {
      created = await api.createNode();
      if (near) await api.createLink(near.direction === 'before' ? created.id : near.id, near.direction === 'before' ? near.id : created.id);
    });
    if (created) setActive(created.id);
  };
  const connect = (targetId: string) => {
    if (!linkMode) return;
    if (targetId === linkMode.sourceId) { setLinkMode(null); return; }
    const sourceId = linkMode.direction === 'after' ? linkMode.sourceId : targetId;
    const destinationId = linkMode.direction === 'after' ? targetId : linkMode.sourceId;
    setLinkMode(null);
    run(() => api.createLink(sourceId, destinationId));
  };
  const remove = (id: string) => {
    if (!window.confirm('Удалить квадрат и все его связи?')) return;
    setActive(null);
    run(() => api.deleteNode(id));
  };

  return <div className="app-shell">
    <button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'} title="Сменить тему">{theme === 'light' ? '☾' : '☀'}</button>
    {linkMode && <div className="link-hint">Выберите квадрат для связи <button onClick={() => setLinkMode(null)} aria-label="Отменить связь">×</button></div>}
    {error && <div className="error-toast" role="alert">{error}<button onClick={() => setError('')} aria-label="Закрыть">×</button></div>}
    {titleConfirmation && <div className="confirmation-backdrop" role="presentation">
      <div className="confirmation-dialog" role="dialog" aria-modal="true" aria-label="Подтверждение названия">
        <p>Применить изменения названия с <strong>«{titleConfirmation.oldTitle || 'без названия'}»</strong> на <strong>«{titleConfirmation.newTitle || 'без названия'}»</strong>?</p>
        <div className="confirmation-actions"><button onClick={() => setTitleConfirmation(null)}>Позже</button><button className="primary" disabled={savingTitle === titleConfirmation.id} onClick={async () => { if (await saveTitle(titleConfirmation.id, titleConfirmation.newTitle)) setTitleConfirmation(null); }}>✓ Применить</button></div>
      </div>
    </div>}
    <div className={'canvas-scroll' + (linkMode ? ' linking' : '')} ref={canvasRef}>
      <div className="canvas-space" style={{ width: layout.width, height: layout.height }}>
        {(graph.sections || []).map(section => {
          const points = graph.nodes.filter(node => node.sectionId === section.id)
            .map(node => layout.positions.get(node.id)).filter((point): point is NonNullable<typeof point> => !!point);
          if (points.length < 2) return null;
          const xs = points.map(point => point.x);
          const ys = points.map(point => point.y);
          return <SectionFrame key={section.id} section={section} style={{ left: Math.min(...xs) - 107, top: Math.min(...ys) - 99, width: Math.max(...xs) - Math.min(...xs) + 214, height: Math.max(...ys) - Math.min(...ys) + 192 }} onSave={name => run(() => api.updateSection(section.id, name))} />;
        })}
        <svg className="connections" width={layout.width} height={layout.height} aria-hidden="true">
          <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L8 5 L1 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></marker></defs>
          {graph.links.map(link => {
            const a = layout.positions.get(link.sourceId); const b = layout.positions.get(link.targetId);
            if (!a || !b) return null;
            const x1 = a.x + 78, y1 = a.y, x2 = b.x - 91, y2 = b.y;
            const bend = Math.max(42, (x2 - x1) * 0.42);
            return <path key={link.id} d={`M ${x1} ${y1} C ${x1 + bend} ${y1 - 3}, ${x2 - bend} ${y2 + 3}, ${x2} ${y2}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" markerEnd="url(#arrow)" />;
          })}
        </svg>
        {[...layout.positions.entries()].map(([id, pos]) => {
          const node = graph.nodes.find(item => item.id === id)!;
          return <PlanCard key={id} node={node} links={graph.links} nodes={graph.nodes} x={pos.x} y={pos.y} active={active === id} linking={!!linkMode} draftTitle={titleDrafts[id] ?? node.title} savingTitle={savingTitle === id} onDraftTitle={title => setTitleDrafts(current => ({ ...current, [id]: title }))} onConfirmTitle={() => { void saveTitle(id, titleDrafts[id] ?? node.title); }} onOpen={() => linkMode ? connect(id) : setActive(id)} onClose={() => closeCard(node)} onPatch={patch => run(() => api.updateNode(id, patch))} onCreate={direction => create({ id, direction })} onLink={direction => { setLinkMode({ sourceId: id, direction }); setActive(null); }} onUnlink={linkId => run(() => api.deleteLink(linkId))} onDelete={() => remove(id)} />;
        })}
        {!loading && layout.positions.size === 0 && <div className="empty-note">{layout.tray.length ? 'Задайте дату или свяжите квадраты' : 'Добавьте квадрат внизу, чтобы начать план'}</div>}
      </div>
    </div>
    <div className="tray" aria-label="Задачи без даты">
      <button className="add-square" onClick={() => create()} aria-label="Создать задачу" title="Новая задача">+</button>
      <div className="tray-items">
        {layout.tray.map(node => <PlanCard key={node.id} node={node} links={graph.links} nodes={graph.nodes} active={active === node.id} linking={!!linkMode} draftTitle={titleDrafts[node.id] ?? node.title} savingTitle={savingTitle === node.id} onDraftTitle={title => setTitleDrafts(current => ({ ...current, [node.id]: title }))} onConfirmTitle={() => { void saveTitle(node.id, titleDrafts[node.id] ?? node.title); }} onOpen={() => linkMode ? connect(node.id) : setActive(node.id)} onClose={() => closeCard(node)} onPatch={patch => run(() => api.updateNode(node.id, patch))} onCreate={direction => create({ id: node.id, direction })} onLink={direction => { setLinkMode({ sourceId: node.id, direction }); setActive(null); }} onUnlink={linkId => run(() => api.deleteLink(linkId))} onDelete={() => remove(node.id)} />)}
      </div>
    </div>
  </div>;
}

function SectionFrame({ section, style, onSave }: { section: Section; style: React.CSSProperties; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const closed = useRef(false);
  const begin = () => { closed.current = false; setDraft(section.name || ''); setEditing(true); };
  const commit = () => {
    if (closed.current) return;
    closed.current = true;
    setEditing(false);
    if (draft.trim() !== (section.name || '')) onSave(draft.trim());
  };
  const cancel = () => { closed.current = true; setEditing(false); };
  return <div className="chain-section" style={style} aria-label={`Секция ${section.name || section.number}`}>
    {editing ? <input className="section-name-input" autoFocus value={draft} maxLength={120} placeholder="Название секции" onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } else if (event.key === 'Escape') { event.preventDefault(); cancel(); } }} />
      : <button className="section-name" onDoubleClick={begin} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); begin(); } }} title="Дважды нажмите, чтобы назвать секцию">Секция {section.name || section.number}</button>}
  </div>;
}

type CardProps = {
  node: Node; links: Graph['links']; nodes: Node[]; x?: number; y?: number; active: boolean; linking: boolean;
  draftTitle: string; savingTitle: boolean; onDraftTitle: (title: string) => void; onConfirmTitle: () => void;
  onOpen: () => void; onClose: () => void; onPatch: (patch: Partial<Node>) => void;
  onCreate: (direction: 'before' | 'after') => void; onLink: (direction: 'before' | 'after') => void;
  onUnlink: (id: string) => void; onDelete: () => void;
};
function PlanCard({ node, links, nodes, x, y, active, linking, draftTitle, savingTitle, onDraftTitle, onConfirmTitle, onOpen, onClose, onPatch, onCreate, onLink, onUnlink, onDelete }: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const date = node.eventDate ? new Date(`${node.eventDate.slice(0, 10)}T12:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const enter = () => { if (!linking) onOpen(); };
  const leave = () => { setCalendarOpen(false); onClose(); };
  const showCalendar = () => {
    const date = node.eventDate ? new Date(`${node.eventDate.slice(0, 10)}T12:00:00`) : new Date();
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setCalendarOpen(true);
  };
  useLayoutEffect(() => {
    if (!active || x === undefined || !cardRef.current) return;
    const card = cardRef.current;
    const anchor = card.parentElement!;
    const viewport = card.closest<HTMLElement>('.canvas-scroll');
    if (!viewport) return;
    const updateShift = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const trayRect = document.querySelector('.tray')?.getBoundingClientRect();
      const cardHeight = window.innerWidth <= 640 ? 320 : 300;
      const shift = expandedCardShift(
        { x: anchorRect.left + anchorRect.width / 2, y: anchorRect.top + anchorRect.height / 2 },
        { width: Math.min(600, window.innerWidth - 28), height: cardHeight },
        {
          left: viewportRect.left,
          top: viewportRect.top,
          right: viewportRect.left + viewport.clientWidth,
          bottom: viewportRect.top + viewport.clientHeight,
        },
        trayRect,
        pointerRef.current ?? undefined,
      );
      card.style.setProperty('--card-shift-x', `${shift.x}px`);
      card.style.setProperty('--card-shift-y', `${shift.y}px`);
    };
    updateShift();
    window.addEventListener('resize', updateShift);
    return () => {
      window.removeEventListener('resize', updateShift);
      card.style.removeProperty('--card-shift-x');
      card.style.removeProperty('--card-shift-y');
    };
  }, [active, x, y]);
  const relationships = links.filter(link => link.sourceId === node.id || link.targetId === node.id);
  const rememberPointer = (event: React.MouseEvent) => { pointerRef.current = { x: event.clientX, y: event.clientY }; };
  return <div className={'card-anchor' + (active ? ' active' : '') + (linking ? ' link-target' : '')} style={x === undefined ? undefined : { left: x, top: y }}>
    <div className="plan-card" ref={cardRef} onMouseEnter={event => { rememberPointer(event); enter(); }} onMouseMove={rememberPointer} onMouseLeave={leave} onClick={linking ? onOpen : undefined} onFocus={enter}>
      {!active ? <div className="card-front" onClick={linking ? undefined : onOpen} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }} role="button" aria-label={node.title || 'Новая задача'}>
        <span className={'status-icon ' + node.status}>{statusMeta[node.status].icon}</span>
        <span className="card-title">{node.title || 'Новая задача'}</span>
        {node.eventDate && <span className="card-date">{dateLabel(node.eventDate)}</span>}
      </div> : <div className="card-detail" onClick={event => event.stopPropagation()}>
        <div className="detail-top"><span className="detail-caption">ЗАДАЧА</span><div className="detail-top-actions">{draftTitle !== node.title && <button className="confirm-title" disabled={savingTitle} onClick={onConfirmTitle} aria-label="Подтвердить название" title="Подтвердить название">✓ <span>Подтвердить</span></button>}<button className="icon-button delete-button" onClick={onDelete} aria-label="Удалить квадрат" title="Удалить">×</button></div></div>
        <textarea className="title-input" value={draftTitle} onChange={event => onDraftTitle(event.target.value)} placeholder="Что за задача?" maxLength={500} rows={2} />
        <div className="detail-fields">
          <div className="date-field"><span>ДАТА СОБЫТИЯ</span><button className="date-trigger" onClick={() => calendarOpen ? setCalendarOpen(false) : showCalendar()} aria-haspopup="dialog" aria-expanded={calendarOpen}>{node.eventDate ? dateLabel(node.eventDate) : 'Выбрать дату'} <span aria-hidden="true">▦</span></button></div>
          <div className="created-field"><span>ДАТА СОЗДАНИЯ</span><strong>{dateLabel(node.createdAt)}</strong></div>
        </div>
        <div className="status-picker" aria-label="Статус задачи">{(Object.keys(statusMeta) as Status[]).map(status => <button key={status} className={node.status === status ? 'selected' : ''} onClick={() => onPatch({ status })} title={statusMeta[status].label} aria-label={statusMeta[status].label}>{statusMeta[status].icon}</button>)}</div>
        <div className="detail-bottom">
          <div className="link-actions"><button onClick={() => onCreate('before')} title="Создать предыдущую задачу">+ ←</button><button onClick={() => onCreate('after')} title="Создать следующую задачу">+ →</button><button onClick={() => onLink('before')} title="Связать с существующей предыдущей задачей">← связь</button><button onClick={() => onLink('after')} title="Связать с существующей следующей задачей">связь →</button></div>
          {relationships.length > 0 && <div className="relationships">{relationships.map(link => { const other = nodes.find(item => item.id === (link.sourceId === node.id ? link.targetId : link.sourceId)); return <button key={link.id} onClick={() => onUnlink(link.id)} title="Удалить связь">{link.targetId === node.id ? '←' : '→'} {other?.title || 'Новая задача'} ×</button>; })}</div>}
        </div>
        {calendarOpen && <Calendar value={node.eventDate?.slice(0, 10) || null} month={viewMonth} onMonth={setViewMonth} onSelect={value => { setCalendarOpen(false); onPatch({ eventDate: value }); }} onClose={() => setCalendarOpen(false)} />}
      </div>}
    </div>
  </div>;
}

function Calendar({ value, month, onMonth, onSelect, onClose }: { value: string | null; month: Date; onMonth: (date: Date) => void; onSelect: (value: string | null) => void; onClose: () => void }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday + days }, (_, index) => index - firstWeekday + 1);
  const format = (day: number) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return <div className="calendar-panel" role="dialog" aria-label="Выбор даты события">
    <div className="calendar-heading"><button onClick={() => onMonth(new Date(year, monthIndex - 1, 1))} aria-label="Предыдущий месяц">‹</button><strong>{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</strong><button onClick={() => onMonth(new Date(year, monthIndex + 1, 1))} aria-label="Следующий месяц">›</button></div>
    <div className="calendar-grid">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <span className="weekday" key={day}>{day}</span>)}{cells.map((day, index) => day > 0 ? <button key={index} className={value === format(day) ? 'chosen' : ''} onClick={() => onSelect(format(day))} aria-label={new Date(year, monthIndex, day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}>{day}</button> : <span key={index} />)}</div>
    <div className="calendar-footer"><button onClick={() => onSelect(null)}>Без даты</button><button onClick={onClose}>Закрыть</button></div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
