import { useEffect, useRef, useState } from "react";
import type { Session } from "../types/domain";
import { getMockPersona, setMockPersona, type PersonaKey } from "../services/session";

/**
 * Shows which customer's data is on screen.
 *
 * For a single-customer user this is a label, not a control — there is
 * nothing to choose, so offering a choice would be noise. Users with
 * more than one engagement get a selector. Same component, driven by
 * the session's entitlement list rather than a prop someone sets.
 */
export function CustomerScope({
  session,
  onSwitch,
}: {
  session: Session;
  onSwitch: (customerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = session.customers.find((c) => c.id === session.activeCustomerId);
  const multi = session.customers.length > 1;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!active) return null;

  if (!multi) {
    return (
      <div className="cscope">
        <span className="cscope-label">Customer</span>
        <span className="cscope-name">{active.name}</span>
      </div>
    );
  }

  return (
    <div className="cscope" ref={ref}>
      <span className="cscope-label">Customer</span>
      <button
        className="cscope-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {active.name}
        <span aria-hidden="true" style={{ marginLeft: 8 }}>▾</span>
      </button>
      {open && (
        <ul className="cscope-menu" role="listbox" aria-label="Switch customer">
          {session.customers.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === active.id}>
              <button
                className={c.id === active.id ? "on" : ""}
                onClick={() => {
                  setOpen(false);
                  if (c.id !== active.id) onSwitch(c.id);
                }}
              >
                <span className="nm">{c.name}</span>
                <span className="meta">Tools Release {c.toolsRelease} · {c.environment}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Prototype-only control.
 *
 * Real sign-in decides who you are and what you can reach. This exists
 * purely so both behaviours can be demonstrated without a login screen,
 * and is labelled so nobody mistakes it for a product feature.
 */
export function PersonaSwitch({ onChange }: { onChange: () => void }) {
  const [persona, setPersona] = useState<PersonaKey>(getMockPersona());
  return (
    <label className="persona">
      <span>Prototype: view as</span>
      <select
        value={persona}
        onChange={(e) => {
          const next = e.target.value as PersonaKey;
          setMockPersona(next);
          setPersona(next);
          onChange();
        }}
      >
        <option value="consultant">Consultant, 3 customers</option>
        <option value="customer-user">Customer user, 1 customer</option>
      </select>
    </label>
  );
}
