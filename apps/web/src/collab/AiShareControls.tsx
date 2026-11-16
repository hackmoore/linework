import { useEffect, useRef, useState, type ReactElement } from "react";
import { useRelayAvailability } from "./availability";
import { ensureDisplayName } from "./identity";
import { agentLink, setAgentHost, startNewSession, useLive } from "./session";

/** The message a person pastes into their AI agent to let it edit this chart. */
export function agentPrompt(origin: string, link: string): string {
  return `Let's edit a Linework chart together, live. I'll see your changes as you make them.
You need Node.js 22 or newer. Download the Linework agent client and read its help:

  curl -fsSL ${origin}/linework-agent.mjs -o linework-agent.mjs
  node linework-agent.mjs '${link}' help

Then run "get" to read the chart and "edit" to change it.`;
}

/**
 * Header control: let an AI agent edit this chart through commands. It joins the live
 * session with a small command-line client, and this tab runs its commands (see agent.ts).
 */
export function AiShareControls(): ReactElement {
  const status = useLive((s) => s.status);
  const secret = useLive((s) => s.secret);
  const agentHost = useLive((s) => s.agentHost);
  const agentPeer = useLive((s) => [...s.peers.values()].find((p) => p.client === "ai-agent"));
  const relay = useRelayAvailability();
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

  const origin = window.location.origin;
  const prompt = secret ? agentPrompt(origin, agentLink(origin, secret)) : "";

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  const start = async (): Promise<void> => {
    let room = useLive.getState().secret;
    if (status === "idle" || !room) {
      if (ensureDisplayName() === null) return;
      room = await startNewSession();
    }
    setAgentHost(true);
    setOpen(true);
    await copy(agentPrompt(origin, agentLink(origin, room)));
  };

  if (!agentHost) {
    return (
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        title={
          relay === "unavailable"
            ? "Sharing with AI needs live sessions, which aren't set up on this server"
            : relay === "checking"
              ? "Checking for the live server..."
              : "Let an AI agent edit this chart with you, live"
        }
        disabled={relay !== "available"}
        onClick={() => void start()}
      >
        Share with AI
      </button>
    );
  }

  return (
    <div className="menu live" ref={ref}>
      <button
        type="button"
        className={`live__button live__button--${agentPeer ? "connected" : "connecting"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Sharing with AI"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <span className="live__dot" aria-hidden="true" />
        {agentPeer ? "AI editing" : "AI invited"}
      </button>
      {open && (
        <div className="live__panel live__panel--wide" role="dialog" aria-label="Share with AI">
          <p className="live__lead">
            Paste this into an AI agent that can run commands, such as Claude Code. It edits{" "}
            <strong>this chart</strong> through your browser, so you see each change and can undo it.
          </p>
          <textarea
            className="input live__prompt"
            readOnly
            rows={8}
            value={prompt}
            aria-label="Message for the AI agent"
            onFocus={(e) => {
              e.currentTarget.select();
            }}
          />
          <button type="button" className="btn btn--primary btn--sm" onClick={() => void copy(prompt)}>
            {copied ? "Copied" : "Copy message"}
          </button>
          <p className="inspector__hint">
            {agentPeer
              ? `${agentPeer.name} is connected.`
              : "Waiting for the AI to connect. Keep this tab open while it works."}{" "}
            The link gives edit access, like a live link: share it only with an agent you trust. Edits stay
            end-to-end encrypted. Stopping turns off the AI&apos;s commands; leave the live session to shut
            the link off completely.
          </p>
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => {
              setAgentHost(false);
              setOpen(false);
            }}
          >
            Stop sharing with AI
          </button>
        </div>
      )}
    </div>
  );
}
