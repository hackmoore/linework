import { useRef, useState, type ReactElement } from "react";
import { isValidIsoDate, MAX_YEAR, MIN_YEAR } from "@linework/shared";

interface CommitInputProps {
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly className?: string;
  readonly label: string;
  readonly maxLength?: number;
  readonly placeholder?: string;
  /** Id of a <datalist> of suggestions. */
  readonly list?: string;
}

/**
 * Text input that commits on blur or Enter (one undo step per edit, not per keystroke)
 * and reverts on Escape. Give it `key={value}` so outside changes (undo) reset the draft.
 */
export function CommitInput({
  value,
  onCommit,
  className = "",
  label,
  maxLength = 200,
  placeholder,
  list,
}: CommitInputProps): ReactElement {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  return (
    <input
      className={className}
      aria-label={label}
      list={list}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        if (cancelled.current) cancelled.current = false;
        else if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        else if (event.key === "Escape") {
          cancelled.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface NumberCommitInputProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onCommit: (value: number) => void;
  readonly className?: string;
  readonly label: string;
}

export function NumberCommitInput({
  value,
  min,
  max,
  onCommit,
  className = "",
  label,
}: NumberCommitInputProps): ReactElement {
  const [draft, setDraft] = useState(String(value));
  const commit = (): void => {
    const n = Math.round(Number(draft));
    if (draft.trim() === "" || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <input
      className={className}
      aria-label={label}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

interface DateInputProps {
  readonly value: string;
  readonly min?: string;
  readonly onCommit: (value: string) => void;
  readonly className?: string;
  readonly label: string;
}

/** Native date picker; commits only complete, valid dates. */
export function DateInput({ value, min, onCommit, className = "", label }: DateInputProps): ReactElement {
  return (
    <input
      className={className}
      aria-label={label}
      type="date"
      value={value}
      min={min ?? `${String(MIN_YEAR)}-01-01`}
      max={`${String(MAX_YEAR)}-12-31`}
      onChange={(event) => {
        const next = event.target.value;
        if (isValidIsoDate(next) && next !== value) onCommit(next);
      }}
    />
  );
}

interface CommitTextareaProps {
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly className?: string;
  readonly label: string;
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly rows?: number;
}

/**
 * Multi-line version of CommitInput: commits on blur or Ctrl/Cmd+Enter, reverts on Escape.
 * Give it `key={value}` so outside changes reset the draft.
 */
export function CommitTextarea({
  value,
  onCommit,
  className = "",
  label,
  maxLength = 5_000,
  placeholder,
  rows = 3,
}: CommitTextareaProps): ReactElement {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  return (
    <textarea
      className={className}
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      rows={rows}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        if (cancelled.current) cancelled.current = false;
        else if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.blur();
        else if (event.key === "Escape") {
          cancelled.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
