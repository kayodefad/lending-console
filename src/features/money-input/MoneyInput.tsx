import { useId, useLayoutEffect, useRef, type ChangeEvent, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { parseAmountEntry, type NairaParseResult } from "../../domain/money";
import { deleteAcrossComma, formatWhileTyping } from "./formatWhileTyping";

export interface MoneyInputProps {
  readonly label: string;
  /** Exactly what the field shows. The parent owns it so quick-fill buttons can set it. */
  readonly value: string;
  readonly onChange: (value: string, parsed: NairaParseResult) => void;
  /** Extra help under the field, e.g. the amount in words. */
  readonly hint?: ReactNode;
  /** Error from outside (e.g. "Enter an amount greater than zero"). Parse errors come first. */
  readonly externalError?: string | undefined;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
}

/**
 * Naira amount field built on the design-system Input. It groups thousands as
 * you type without moving the caret, accepts a pasted "₦1,200.00", and shows
 * parse errors inline. The parsed value is always bigint kobo; no floats.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  hint,
  externalError,
  disabled = false,
  autoFocus = false,
}: MoneyInputProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const lastSelection = useRef({ start: 0, end: 0 });

  const parsed = parseAmountEntry(value);
  const error = parsed.kind === "error" ? parsed.message : externalError;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  // Put the caret back where the officer was typing after React re-renders the value.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && pendingCaret.current !== null && document.activeElement === input) {
      input.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  });

  const rememberSelection = () => {
    const input = inputRef.current;
    if (input) lastSelection.current = { start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 };
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const inputType = (event.nativeEvent as InputEvent).inputType;
    let edit = { text: input.value, caret: input.selectionStart ?? input.value.length };

    const { start, end } = lastSelection.current;
    if (start === end && (inputType === "deleteContentBackward" || inputType === "deleteContentForward")) {
      const across = deleteAcrossComma(
        { text: value, caret: start },
        inputType === "deleteContentBackward" ? "backward" : "forward",
      );
      if (across) edit = across;
    }

    const next = formatWhileTyping(edit);
    pendingCaret.current = next.caret;
    lastSelection.current = { start: next.caret, end: next.caret };
    onChange(next.text, parseAmountEntry(next.text));
  };

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      <div className="relative">
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center border-r text-lg font-medium text-muted-foreground",
            error ? "border-danger/40" : "border-input",
            disabled && "opacity-50",
          )}
        >
          ₦
        </span>
        <Input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.00"
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={handleChange}
          onKeyDown={rememberSelection}
          onSelect={rememberSelection}
          onMouseUp={rememberSelection}
          className="tabular h-14 rounded-lg bg-card pl-16 text-2xl font-semibold tracking-tight shadow-none md:text-2xl"
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <div id={hintId} className="text-[0.8125rem] text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
