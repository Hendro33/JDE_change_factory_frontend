/**
 * Line icons for the yellow icon tiles, as on consultiq.nl: one per kind of
 * work, so a queue can be scanned by kind (decision, question, setup,
 * delivery …). Always paired with words; never the only cue.
 */
const PATHS: Record<string, JSX.Element> = {
  decision: <><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" /><path d="M12 17.5h.01" /></>,
  run: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5z" /></>,
  setup: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  delivery: <><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>,
  test: <><path d="M9 3h6" /><path d="M10 3v6L4.5 18.5A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.5-2.5L14 9V3" /><path d="M7.5 15h9" /></>,
  release: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  requests: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></>,
  blocked: <><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  domain: <><path d="M12 2l10 5-10 5L2 7z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
  story: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" /></>,
  done: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name] ?? PATHS.story}
    </svg>
  );
}

/** A yellow rounded-square tile with a line icon (the consultiq.nl service tiles). */
export function IconTile({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return <span className={`icontile ${size}`} aria-hidden="true"><Icon name={name} size={size === "lg" ? 26 : size === "sm" ? 16 : 20} /></span>;
}

/** Which icon a next action shows: what the person will do. */
export function iconFor(action?: string | null, kind?: string): string {
  const a = action ?? "";
  if (/setup/.test(a)) return "setup";
  if (/test|evidence/.test(a)) return "test";
  if (/release|asbuilt|cnc/.test(a)) return "release";
  if (/apply|deliver|technical|package/.test(a)) return "delivery";
  if (/rerun|start|run/.test(a)) return "run";
  if (/answer|clarify|question/.test(a)) return "question";
  if (/domain/.test(a)) return "domain";
  if (kind === "decision" || /approve|authorise|review|accept|confirm|decide/.test(a)) return "decision";
  return "story";
}
