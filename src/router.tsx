/**
 * Jade's routing: every meaningful page has a real URL, so the browser's
 * Back, Forward, Refresh, bookmarks, copied links and "open in a new tab"
 * all work. Deliberately tiny (History API + one hook) rather than a
 * routing library: the app has a handful of route shapes and no nested
 * data loading, and this keeps the local preview free of new installs.
 *
 * Navigation state is derived from the URL alone -- nothing else decides
 * which page or nav item is active.
 */
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

const listeners = new Set<() => void>();

/**
 * Where the app is served from ("/" at jade.consultiq.nl and in the local
 * preview). A file:// copy (the single-file build) cannot use real paths,
 * so it falls back to "#/path" URLs -- same pages, same behaviour.
 */
const HASH_MODE = typeof window !== "undefined" && window.location.protocol === "file:";
const BASE = (import.meta.env.BASE_URL || "/").startsWith("/") ? (import.meta.env.BASE_URL || "/").replace(/\/$/, "") : "";

/** The href for an app path (what a link points to). */
export function href(to: string): string {
  return HASH_MODE ? `#${to}` : `${BASE}${to}`;
}

function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", notify);
}

export interface Location {
  path: string;
  query: URLSearchParams;
  hash: string;
}

function read(): Location {
  if (HASH_MODE) {
    const url = new URL(window.location.hash.replace(/^#/, "") || "/", "http://x");
    return { path: url.pathname.replace(/\/+$/, "") || "/", query: url.searchParams, hash: url.hash.replace(/^#/, "") };
  }
  const raw = window.location.pathname;
  const path = BASE && raw.startsWith(BASE) ? raw.slice(BASE.length) : raw;
  return {
    path: path.replace(/\/+$/, "") || "/",
    query: new URLSearchParams(window.location.search),
    hash: window.location.hash.replace(/^#/, ""),
  };
}

/** Go somewhere. `replace` swaps the current history entry (e.g. filters). */
export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = new URL(to, "http://x");
  const next = href(url.pathname + url.search + url.hash);
  const current = HASH_MODE ? window.location.hash : window.location.pathname + window.location.search + window.location.hash;
  if (next === current) return;
  if (opts.replace) window.history.replaceState({}, "", next);
  else window.history.pushState({}, "", next);
  notify();
  if (!opts.replace && !url.hash) window.scrollTo({ top: 0 });
}

/** The current location; re-renders on every navigation. */
export function useLocation(): Location {
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const update = () => setLoc(read());
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  return loc;
}

/**
 * Match a pattern like "/stories/:id/:tab?" against a path. Returns the
 * named parameters, or null when it does not match.
 */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    const optional = seg.endsWith("?");
    const name = seg.replace(/^:/, "").replace(/\?$/, "");
    if (i >= s.length) {
      if (optional) continue;
      return null;
    }
    if (seg.startsWith(":")) out[name] = decodeURIComponent(s[i]);
    else if (seg !== s[i]) return null;
  }
  return s.length <= p.length ? out : null;
}

/** Update one query parameter in place (e.g. a list filter), keeping history clean. */
export function setQueryParam(key: string, value: string | null) {
  const loc = read();
  const q = new URLSearchParams(loc.query);
  if (value === null || value === "") q.delete(key);
  else q.set(key, value);
  const qs = q.toString();
  navigate(`${loc.path}${qs ? `?${qs}` : ""}`, { replace: true });
}

/**
 * A real link: right-click / cmd-click / middle-click open a new tab as
 * normal; a plain click navigates in place without a page reload.
 */
export function Link({ to, children, onClick, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== "_self") return;
    e.preventDefault();
    navigate(to);
  }
  return <a href={href(to)} onClick={handle} {...rest}>{children}</a>;
}

/** Links to a story's workspace, optionally a tab and an anchor. */
export function storyPath(id: string, tab?: string, anchor?: string): string {
  return `/stories/${encodeURIComponent(id)}${tab && tab !== "overview" ? `/${tab}` : ""}${anchor ? `#${anchor}` : ""}`;
}
