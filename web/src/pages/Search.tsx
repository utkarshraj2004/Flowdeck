import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../api';
import { DUE_TEXT, dueState, formatDate, Spinner } from '../components/ui';

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [res, setRes] = useState<any>(null);
  useEffect(() => {
    setRes(null);
    document.title = `Search: ${q} · Flowdeck`;
    get(`/search?q=${encodeURIComponent(q)}`).then(setRes);
  }, [q]);
  if (!res) return <Spinner />;
  const byBoard = new Map<string, { board: any; cards: any[] }>();
  for (const c of res.cards) {
    if (!byBoard.has(c.board.id)) byBoard.set(c.board.id, { board: c.board, cards: [] });
    byBoard.get(c.board.id)!.cards.push(c);
  }
  return (
    <div className="page stack">
      <h1>
        Search results for “{q}” <span className="muted">({res.cards.length} cards)</span>
      </h1>
      {res.boards.length > 0 && (
        <section>
          <h2>Boards</h2>
          <ul className="rows">
            {res.boards.map((b: any) => (
              <li key={b.id}>
                <Link to={`/b/${b.shortId}`}>{b.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {[...byBoard.values()].map(({ board, cards }) => (
        <section key={board.id}>
          <h2>{board.name}</h2>
          <ul className="rows panel">
            {cards.map((c) => {
              const ds = dueState(c.dueAt, c.dueComplete);
              return (
                <li key={c.id}>
                  <Link to={`/b/${board.shortId}/c/${c.number}`}>{c.name}</Link>
                  <span className="muted small">
                    {' '}
                    in {c.listName}
                    {c.archivedAt ? ' · archived' : ''}
                    {c.dueAt ? ` · ${DUE_TEXT[ds]} ${formatDate(c.dueAt)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {res.cards.length === 0 && <p>No cards match.</p>}
      <details className="panel" open={res.cards.length === 0}>
        <summary>Search operators</summary>
        <ul className="small">
          <li>
            <code>@username</code> or <code>@me</code> — cards assigned to someone
          </li>
          <li>
            <code>#label</code> or <code>label:name</code> — cards with a label (name or colour)
          </li>
          <li>
            <code>board:name</code>, <code>list:name</code> — limit to a board or list
          </li>
          <li>
            <code>due:overdue</code>, <code>due:day</code>, <code>due:week</code>, <code>due:month</code>, <code>due:7</code>, <code>due:none</code>
          </li>
          <li>
            <code>has:attachments</code>, <code>has:description</code>, <code>has:checklists</code>, <code>has:members</code>, <code>has:comments</code>
          </li>
          <li>
            <code>is:archived</code>, <code>is:complete</code>, <code>is:incomplete</code>, <code>is:starred</code>
          </li>
          <li>
            <code>-term</code> excludes; <code>"exact phrase"</code> matches a phrase
          </li>
        </ul>
      </details>
    </div>
  );
}
