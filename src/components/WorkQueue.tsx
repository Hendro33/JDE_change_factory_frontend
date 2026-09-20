import { useMemo, useState, type ReactNode } from "react";
import type { Change } from "../types/domain";

/**
 * Shared building blocks for every work queue in Jade (Requests, User
 * Stories, User Story Review, Approval & Backlog, Active Changes,
 * Validation, Ready for Release) — one grid/filter implementation
 * reused with different columns and filters, rather than a bespoke
 * table per page.
 */

export interface GridColumn {
  key: string;
  header: string;
  render: (c: Change) => ReactNode;
  /** Present only on sortable columns. */
  sortValue?: (c: Change) => string | number;
}

export interface SelectFilterConfig {
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  selects,
  onClear,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  selects: SelectFilterConfig[];
  onClear?: () => void;
}) {
  const hasActive = selects.some((s) => s.value) || !!search?.trim();
  return (
    <div className="panel filterbar">
      {onSearchChange && (
        <div className="field">
          <label htmlFor="wq-search">Search</label>
          <input
            id="wq-search"
            type="text"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder ?? "Search by ID or title"}
          />
        </div>
      )}
      {selects.map((s) => (
        <div className="field" key={s.key}>
          <label htmlFor={`wq-${s.key}`}>{s.label}</label>
          <select id={`wq-${s.key}`} value={s.value} onChange={(e) => s.onChange(e.target.value)}>
            {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      ))}
      {onClear && hasActive && (
        <button className="linkish" onClick={onClear}>Clear filters</button>
      )}
    </div>
  );
}

export function ChangeGrid({
  changes,
  columns,
  onRowClick,
  selectedId,
  emptyMessage,
  sortKey,
  sortDir,
  onSortChange,
}: {
  changes: Change[];
  columns: GridColumn[];
  onRowClick: (id: string) => void;
  selectedId?: string | null;
  emptyMessage: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string) => void;
}) {
  if (changes.length === 0) {
    return <div className="empty" style={{ padding: 20 }}>{emptyMessage}</div>;
  }
  return (
    <div className="gridwrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((col) => {
              const sortable = !!(col.sortValue && onSortChange);
              return (
                <th
                  key={col.key}
                  className={sortable ? "sortable" : undefined}
                  onClick={sortable ? () => onSortChange!(col.key) : undefined}
                >
                  {col.header}
                  {sortKey === col.key && <span className="arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr
              key={c.id}
              className="clickable"
              style={c.id === selectedId ? { background: "var(--wash)" } : undefined}
              onClick={() => onRowClick(c.id)}
            >
              {columns.map((col) => <td key={col.key}>{col.render(c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Text search + column sort over a Change[] list. Filtering by domain/
 * status/etc. stays page-specific (each page knows what its own select
 * filters mean) — this hook only owns the two behaviours every grid
 * needs identically.
 */
export function useChangeListControls(
  changes: Change[],
  columns: GridColumn[],
  searchText: (c: Change) => string
) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? changes.filter((c) => searchText(c).toLowerCase().includes(q)) : changes;
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        const sv = col.sortValue;
        list = [...list].sort((a, b) => {
          const av = sv(a);
          const bv = sv(b);
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, search, sortKey, sortDir]);

  function onSortChange(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return { search, setSearch, sortKey, sortDir, onSortChange, filtered };
}
