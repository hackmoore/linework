import { useEffect, useRef, useState, type ReactElement } from "react";
import { liveLink, newRoomSecret } from "./crypto";
import { ensureDisplayName, setDisplayName, useDisplayName } from "./identity";
import { startSession, stopSession, useLive } from "./session";

/** Header control: start a live session, see who's here, copy the link, or leave. */
export function LiveControls(): ReactElement {
  const status = useLive((s) => s.status);
  const secret = useLive((s) => s.secret);
  const peers = useLive((s) => s.peers);
  const error = useLive((s) => s.error);
  const name = useDisplayName();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("mousedown", close);
    };
  }, [open]);

  const link = secret ? liveLink(window.location.origin, secret) : "";

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  const start = async (): Promise<void> => {
    if (ensureDisplayName() === null) return;
    const room = newRoomSecret();
    // Keep the room in this tab's URL so a reload rejoins the same session.
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}#room=${room.roomId}&key=${room.key}`,
    );
    const session = await startSession(room, false);
    session.attach();
    setOpen(true);
    await navigator.clipboard.writeText(liveLink(window.location.origin, room)).then(
      () => {
        setCopied(true);
      },
      () => undefined,
    );
  };

  const leave = (): void => {
    stopSession();
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setOpen(false);
  };

  if (status === "idle") {
    return (
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        title="Edit together in real time"
        onClick={() => void start()}
      >
        Share live
      </button>
    );
  }

  const others = [...peers.values()];
  return (
    <div className="menu live" ref={ref}>
      <button
        type="button"
        className={`live__button live__button--${status}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Live session"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <span className="live__dot" aria-hidden="true" />
        <span className="live__avatars" aria-hidden="true">
          {others.slice(0, 4).map((p) => (
            <span key={p.client} className="live__avatar" style={{ background: p.color }} title={p.name}>
              {p.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </span>
        {status === "connected"
          ? `Live · ${String(others.length + 1)}`
          : status === "error"
            ? "Live error"
            : "Connecting..."}
      </button>
      {open && (
        <div className="live__panel" role="dialog" aria-label="Live session">
          <p className="live__lead">
            Anyone with this link can view and edit <strong>this chart</strong> with you. It&apos;s end-to-end
            encrypted: the server only relays scrambled data.
          </p>
          <div className="live__link">
            <input
              className="input"
              readOnly
              value={link}
              aria-label="Live link"
              onFocus={(e) => {
                e.currentTarget.select();
              }}
            />
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
          {status === "reconnecting" && <p className="inspector__hint">Connection lost. Reconnecting...</p>}
          <ul className="live__people">
            <li>
              <span className="live__avatar" style={{ background: "#4f46e5" }}>
                {name.charAt(0).toUpperCase()}
              </span>
              <button
                type="button"
                className="live__me"
                title="Change your name"
                onClick={() => {
                  const next = window.prompt("Your name", name);
                  if (next?.trim()) setDisplayName(next);
                }}
              >
                {name} (you)
              </button>
            </li>
            {others.map((p) => (
              <li key={p.client}>
                <span className="live__avatar" style={{ background: p.color }}>
                  {p.name.charAt(0).toUpperCase()}
                </span>
                {p.name}
              </li>
            ))}
          </ul>
          <p className="inspector__hint">
            Changes save in each person&apos;s browser. Leaving keeps your copy.
          </p>
          <button type="button" className="btn btn--sm btn--danger" onClick={leave}>
            Leave live session
          </button>
        </div>
      )}
    </div>
  );
}
