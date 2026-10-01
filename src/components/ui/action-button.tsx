"use client"

import * as React from "react"
import { AlertCircle, Check, Loader2 } from "lucide-react"
import type { AsyncAction } from "@/hooks/use-async-action"

/**
 * The one button for anything that sends a request or runs a long action
 * (Part A). Pair it with `useAsyncAction`:
 *
 *   const save = useAsyncAction((ctx) => saveThing(data, ctx))
 *   <ActionButton action={save} onClick={() => save.run()} loadingLabel="Saving…" successLabel="Saved">
 *     Save
 *   </ActionButton>
 *
 * - idle → loading (spinner + label, can't be clicked again) → retrying
 *   (button: "Retrying…"; under it: "Connection problem, retrying in 3 s…")
 *   → success (brief) → idle; on failure: the error message + the button
 *   becomes "Try again".
 * - Width never jumps: every label variant is laid out in the same grid
 *   cell and only the current one is visible.
 * - Accessible: aria-busy while working; `aria-disabled` (not `disabled`)
 *   while busy so keyboard focus stays on the button; errors are announced
 *   (role="alert"), progress politely (role="status").
 * - Keeps the caller's look: pass `className`, or `as` to render another
 *   button component (e.g. the editor's `Button`).
 * - `compact`: icon-only buttons; the icon is swapped for a spinner/check/
 *   alert, labels go to screen readers only.
 */

type Labels = {
  loadingLabel?: React.ReactNode
  successLabel?: React.ReactNode
  /** Label of the button after a failure. Default "Try again". */
  errorLabel?: React.ReactNode
}

export type ActionButtonProps = Labels &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action: Pick<AsyncAction<any[], unknown>, "state" | "busy" | "errorText" | "retry">
    /** Omit for type="submit": the form's onSubmit runs the action. */
    onClick?: () => void
    /** Where the error message goes: right after the button (default);
     * "sr-only": announced to screen readers only (the caller shows it
     * visually, e.g. a toast); "none": the caller renders it itself with
     * role="alert" (e.g. <ActionError> or an existing error line). */
    errorPlacement?: "after" | "sr-only" | "none"
    errorClassName?: string
    /** Where the "Connection problem, retrying in N s…" line goes while
     * retrying: right after the button (default); "sr-only" (default for
     * compact): announced only; "none": the caller renders it (e.g.
     * <ActionStatus>) — then nothing is rendered here. */
    retryPlacement?: "after" | "sr-only" | "none"
    retryClassName?: string
    compact?: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    as?: React.ElementType<any>
    [key: `data-${string}`]: unknown
    // Pass-through props for a custom `as` component (variant, size, ...).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }

export function retryLabel(retry: AsyncAction<unknown[], unknown>["retry"]): string {
  if (!retry) return "Retrying…"
  return retry.secondsLeft >= 1 ? `Connection problem, retrying in ${retry.secondsLeft} s…` : "Retrying…"
}

const cell: React.CSSProperties = { gridArea: "1 / 1" }

function Variant({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <span
      style={cell}
      aria-hidden={!show}
      className={`inline-flex items-center justify-center gap-1.5 ${show ? "" : "invisible"}`}
    >
      {children}
    </span>
  )
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  {
    action,
    onClick,
    children,
    loadingLabel = "Working…",
    successLabel,
    errorLabel = "Try again",
    errorPlacement = "after",
    errorClassName = "mt-2 text-sm text-red-500",
    retryPlacement,
    retryClassName = "mt-2 text-sm text-foreground/60",
    compact = false,
    as: Comp = "button",
    disabled,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  const { state, busy, errorText, retry } = action
  const retrying = state === "retrying"
  const statusText =
    state === "loading" ? String(typeof loadingLabel === "string" ? loadingLabel : "Working…")
    : retrying ? retryLabel(retry)
    : state === "success" && typeof successLabel === "string" ? successLabel
    : ""

  const handleClick = (e: React.MouseEvent) => {
    if (busy || disabled) {
      e.preventDefault()
      return
    }
    onClick?.()
  }

  const spinner = <Loader2 className="size-4 animate-spin" aria-hidden />

  const content = compact ? (
    <span className="inline-grid place-items-center">
      <Variant show={state === "idle"}>{children}</Variant>
      <Variant show={busy}>{spinner}</Variant>
      <Variant show={state === "success"}>
        <Check className="size-4" aria-hidden />
      </Variant>
      <Variant show={state === "error"}>
        <AlertCircle className="size-4 text-red-500" aria-hidden />
      </Variant>
    </span>
  ) : (
    <span className="inline-grid place-items-center">
      <Variant show={state === "idle" || (state === "success" && !successLabel)}>{children}</Variant>
      <Variant show={state === "loading"}>
        {spinner}
        {loadingLabel}
      </Variant>
      {/* Short and fixed, so the width never jumps; the countdown is shown
          under the button (retryPlacement) and announced via role=status. */}
      <Variant show={retrying}>
        {spinner}
        Retrying…
      </Variant>
      {successLabel ? (
        <Variant show={state === "success"}>
          <Check className="size-4" aria-hidden />
          {successLabel}
        </Variant>
      ) : null}
      <Variant show={state === "error"}>{errorLabel}</Variant>
    </span>
  )

  return (
    <>
      <Comp
        ref={ref}
        type={type}
        className={className}
        disabled={disabled}
        aria-busy={busy || undefined}
        aria-disabled={busy || disabled || undefined}
        data-state={state}
        onClick={handleClick}
        {...rest}
      >
        {content}
      </Comp>
      {retrying && (retryPlacement ?? (compact ? "sr-only" : "after")) === "after" ? (
        <p role="status" aria-live="polite" className={retryClassName}>
          {statusText}
        </p>
      ) : retrying && retryPlacement === "none" ? null : (
        <span role="status" aria-live="polite" className="sr-only">
          {statusText}
        </span>
      )}
      {state === "error" && errorText && errorPlacement !== "none" ? (
        errorPlacement === "after" ? (
          <p role="alert" className={errorClassName}>
            {errorText}
          </p>
        ) : (
          <span role="alert" className="sr-only">
            {errorText}
          </span>
        )
      ) : null}
    </>
  )
})

/** Shows an action's error somewhere other than right after its button. */
export function ActionError({
  action,
  className = "text-sm text-red-500",
}: {
  action: Pick<AsyncAction<unknown[], unknown>, "state" | "errorText">
  className?: string
}) {
  if (action.state !== "error" || !action.errorText) return null
  return (
    <p role="alert" className={className}>
      {action.errorText}
    </p>
  )
}

/** The retry countdown somewhere other than right after its button
 * (pair with retryPlacement="none"). */
export function ActionStatus({
  action,
  className = "text-sm text-foreground/60",
}: {
  action: Pick<AsyncAction<unknown[], unknown>, "state" | "retry">
  className?: string
}) {
  if (action.state !== "retrying") return null
  return (
    <p role="status" aria-live="polite" className={className}>
      {retryLabel(action.retry)}
    </p>
  )
}
