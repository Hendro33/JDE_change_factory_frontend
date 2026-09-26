/**
 * Recently viewed stories: a per-viewer convenience kept in this browser
 * only. It may be empty (private window, blocked storage) and nothing
 * depends on it; every read and write is guarded.
 */
const KEY = "jade_recent_stories";
const MAX = 6;

export interface RecentStory { id: string; title: string; customerId: string; at: string }

function readAll(): RecentStory[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberStory(customerId: string, id: string, title: string): void {
  try {
    const rest = readAll().filter((r) => !(r.id === id && r.customerId === customerId));
    const next = [{ id, title, customerId, at: new Date().toISOString() }, ...rest].slice(0, MAX * 4);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: recently viewed simply stays empty.
  }
}

export function recentStories(customerId: string, exclude?: string): RecentStory[] {
  return readAll().filter((r) => r.customerId === customerId && r.id !== exclude).slice(0, MAX);
}
