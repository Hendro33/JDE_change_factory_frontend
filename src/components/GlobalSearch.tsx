import { useEffect, useRef, useState } from "react";
import { navigate, useLocation } from "../router";

/** Search across stories, business processes and knowledge; results show business context. */
export function GlobalSearch() {
  const { path, query } = useLocation();
  const [q, setQ] = useState(path === "/search" ? query.get("q") ?? "" : "");
  const input = useRef<HTMLInputElement>(null);
  // "/" jumps to search from anywhere, unless the person is already typing somewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form className="globalsearch" role="search" title="Search (press /)" onClick={() => input.current?.focus()} onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.41-5.4-5.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"/></svg>
      <input ref={input} type="search" aria-label="Search Jade" placeholder="Search stories, processes…" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}
