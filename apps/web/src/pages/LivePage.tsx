import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { checkRelay } from "../collab/availability";
import { parseRoomSecret } from "../collab/crypto";
import { ensureDisplayName } from "../collab/identity";
import { startSession, stopSession } from "../collab/session";
import { saveDiagram } from "../storage/localStore";

const JOIN_TIMEOUT_MS = 15_000;

/**
 * /live#room=...&key=... joins someone's live session: it waits for a copy of the chart
 * from a person already in the room, saves it locally, and opens the editor connected.
 */
export function LivePage(): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const secret = useMemo(() => parseRoomSecret(location.hash), [location.hash]);
  const [failure, setError] = useState<string | null>(null);
  const error = secret ? failure : "This live link is incomplete. Ask for the link again and copy all of it.";
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !secret) return;
    started.current = true;
    ensureDisplayName();
    void (async () => {
      try {
        if (!(await checkRelay())) {
          setError(
            "Live sessions aren't set up on this server, or it can't be reached right now. Ask the person who shared the link to send the chart another way, such as a share link.",
          );
          return;
        }
        const session = await startSession(secret, true);
        const diagram = await session.waitForSnapshot(JOIN_TIMEOUT_MS);
        if (!diagram) {
          stopSession();
          setError(
            "Nobody else is in this live session right now, so there's no chart to load. Ask the person who shared it to open it.",
          );
          return;
        }
        // Same id as the sharer's copy, so rejoining later updates the same local chart.
        await saveDiagram(diagram);
        void navigate(`/d/${diagram.id}#room=${secret.roomId}&key=${secret.key}`, { replace: true });
      } catch (cause) {
        stopSession();
        setError(cause instanceof Error ? cause.message : "Couldn't join the live session");
      }
    })();
  }, [secret, navigate]);

  return (
    <div className="editor-message">
      {error ? (
        <>
          <h1>Couldn&apos;t join</h1>
          <p className="error-text">{error}</p>
          <Link to="/" className="btn">
            Home
          </Link>
        </>
      ) : (
        <p>Joining live session...</p>
      )}
    </div>
  );
}
