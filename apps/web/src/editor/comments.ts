import type { DiagramComment } from "@linework/shared";
import { createId } from "../diagram/factory";
import { useEditor } from "./store";

/** Comment actions. Comments live in the document, so they travel with files and share links. */

export function addComment(
  text: string,
  author: string,
  target: { targetId: string | null; x: number; y: number },
): string | null {
  const body = text.trim();
  if (!body) return null;
  const comment: DiagramComment = {
    id: createId(),
    targetId: target.targetId,
    x: Math.round(target.x),
    y: Math.round(target.y),
    author: author.slice(0, 100),
    text: body.slice(0, 5_000),
    createdAt: new Date().toISOString(),
    resolved: false,
    replies: [],
  };
  useEditor.getState().commit((d) => ({ ...d, comments: [...d.comments, comment] }));
  return comment.id;
}

export function replyToComment(id: string, text: string, author: string): void {
  const body = text.trim();
  if (!body) return;
  const reply = {
    id: createId(),
    author: author.slice(0, 100),
    text: body.slice(0, 5_000),
    createdAt: new Date().toISOString(),
  };
  useEditor.getState().commit((d) => ({
    ...d,
    comments: d.comments.map((c) => (c.id === id ? { ...c, replies: [...c.replies, reply] } : c)),
  }));
}

export function setCommentResolved(id: string, resolved: boolean): void {
  useEditor
    .getState()
    .commit((d) => ({ ...d, comments: d.comments.map((c) => (c.id === id ? { ...c, resolved } : c)) }));
}

export function deleteComment(id: string): void {
  useEditor.getState().commit((d) => ({ ...d, comments: d.comments.filter((c) => c.id !== id) }));
}

/** Where a comment's pin sits: the top-right of its shape, or its own point. */
export function commentAnchor(
  comment: DiagramComment,
  nodes: readonly { id: string; x: number; y: number; width: number }[],
): { x: number; y: number } {
  const node = comment.targetId ? nodes.find((n) => n.id === comment.targetId) : undefined;
  return node ? { x: node.x + node.width, y: node.y } : { x: comment.x, y: comment.y };
}
