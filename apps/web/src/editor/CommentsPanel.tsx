import { useEffect, useRef, useState, type ReactElement } from "react";
import type { Diagram, DiagramComment } from "@linework/shared";
import { colorFor, ensureDisplayName, useDisplayName } from "../collab/identity";
import { addComment, deleteComment, replyToComment, setCommentResolved } from "./comments";
import { useEditor } from "./store";
import { useUi } from "./ui";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function targetName(diagram: Diagram, comment: DiagramComment): string {
  if (!comment.targetId)
    return diagram.chartType === "freeform" || diagram.chartType === "flowchart" ? "Canvas" : "Whole chart";
  const node = diagram.nodes.find((n) => n.id === comment.targetId);
  if (node) return (node.label.split("\n")[0] ?? "") || "Shape";
  const task = diagram.gantt?.tasks.find((t) => t.id === comment.targetId);
  if (task) return task.name;
  return diagram.kanban?.cards.find((c) => c.id === comment.targetId)?.title ?? "Deleted item";
}

function Author({ name }: { name: string }): ReactElement {
  return (
    <span className="comment__author">
      <span className="comment__avatar" style={{ background: colorFor(name) }} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
      {name}
    </span>
  );
}

function ReplyBox({ commentId }: { commentId: string }): ReactElement {
  const [text, setText] = useState("");
  return (
    <form
      className="comment__reply-form"
      onSubmit={(event) => {
        event.preventDefault();
        const name = ensureDisplayName();
        if (name === null) return;
        replyToComment(commentId, text, name);
        setText("");
      }}
    >
      <input
        className="input"
        placeholder="Reply"
        aria-label="Reply"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
    </form>
  );
}

function CommentCard({
  diagram,
  comment,
  focused,
}: {
  diagram: Diagram;
  comment: DiagramComment;
  focused: boolean;
}): ReactElement {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  const selectTarget = (): void => {
    const state = useEditor.getState();
    const id = comment.targetId;
    if (!id) return;
    if (diagram.nodes.some((n) => n.id === id)) state.select({ nodeIds: [id] });
    else if (diagram.gantt?.tasks.some((t) => t.id === id)) state.select({ taskIds: [id] });
    else if (diagram.kanban?.cards.some((c) => c.id === id)) state.select({ cardIds: [id] });
  };
  return (
    <li
      ref={ref}
      className={`comment${comment.resolved ? " comment--resolved" : ""}${focused ? " comment--focused" : ""}`}
    >
      <button type="button" className="comment__target" onClick={selectTarget} disabled={!comment.targetId}>
        On: {targetName(diagram, comment)}
      </button>
      <div className="comment__head">
        <Author name={comment.author} />
        <time dateTime={comment.createdAt}>{timeFormat.format(new Date(comment.createdAt))}</time>
      </div>
      <p className="comment__text">{comment.text}</p>
      {comment.replies.map((reply) => (
        <div key={reply.id} className="comment__reply">
          <div className="comment__head">
            <Author name={reply.author} />
            <time dateTime={reply.createdAt}>{timeFormat.format(new Date(reply.createdAt))}</time>
          </div>
          <p className="comment__text">{reply.text}</p>
        </div>
      ))}
      {!comment.resolved && <ReplyBox commentId={comment.id} />}
      <div className="comment__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setCommentResolved(comment.id, !comment.resolved);
          }}
        >
          {comment.resolved ? "Reopen" : "Resolve"}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--danger"
          onClick={() => {
            if (window.confirm("Delete this comment and its replies?")) deleteComment(comment.id);
          }}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

/** Lists comments and adds new ones, attached to the selected shape or task when there is one. */
export function CommentsPanel({
  newCommentPoint,
}: {
  newCommentPoint: () => { x: number; y: number };
}): ReactElement | null {
  const diagram = useEditor((s) => s.diagram);
  const selection = useEditor((s) => s.selection);
  const focusedId = useUi((s) => s.focusedCommentId);
  const name = useDisplayName();
  const [text, setText] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  if (!diagram) return null;

  const targetId = selection.nodeIds[0] ?? selection.taskIds[0] ?? selection.cardIds[0] ?? null;
  const open = diagram.comments.filter((c) => !c.resolved);
  const resolved = diagram.comments.filter((c) => c.resolved);
  const shown = [...open, ...(showResolved ? resolved : [])];
  const selectedLabel = targetId ? targetName(diagram, { targetId } as DiagramComment) : null;

  return (
    <div className="comments">
      <form
        className="comments__new"
        onSubmit={(event) => {
          event.preventDefault();
          const author = ensureDisplayName();
          if (author === null) return;
          const point = newCommentPoint();
          const id = addComment(text, author, { targetId, ...point });
          if (id) {
            setText("");
            useUi.getState().focusComment(id);
          }
        }}
      >
        <label className="inspector__field">
          <span className="inspector__label">
            {selectedLabel ? `Comment on "${selectedLabel}"` : "New comment"}
          </span>
          <textarea
            className="input"
            rows={3}
            placeholder={
              selectedLabel
                ? "What should change?"
                : "Select a shape or task to comment on it, or comment on the whole chart"
            }
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                event.currentTarget.form?.requestSubmit();
            }}
          />
        </label>
        <div className="comments__new-actions">
          <span className="comments__as">as {name}</span>
          <button type="submit" className="btn btn--primary btn--sm" disabled={!text.trim()}>
            Comment
          </button>
        </div>
      </form>
      {shown.length === 0 ? (
        <p className="inspector__hint comments__empty">No open comments.</p>
      ) : (
        <ul className="comments__list">
          {shown.map((c) => (
            <CommentCard key={c.id} diagram={diagram} comment={c} focused={c.id === focusedId} />
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <button
          type="button"
          className="btn btn--ghost btn--sm comments__toggle"
          onClick={() => {
            setShowResolved((v) => !v);
          }}
        >
          {showResolved ? "Hide" : "Show"} {resolved.length} resolved
        </button>
      )}
    </div>
  );
}
