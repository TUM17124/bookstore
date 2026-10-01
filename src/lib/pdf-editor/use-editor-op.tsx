"use client";

import * as React from "react";
import { useCallback, useEffect, useRef } from "react";
import { ToastAction, useToast } from "@giga-pdf/ui";
import { errorMessage, isAbortError, type CallOptions, type RetryInfo } from "@/lib/auth-fetch";

/**
 * Part A: the editor's button-state equivalent for actions whose button
 * goes away when they start (a dialog's Apply, a menu item): ONE toast walks
 * the same states as ActionButton —
 *
 *   "Inserting SVG…" → "Connection problem, retrying in 3 s…" → "SVG inserted"
 *                                                             ↘ "Couldn't insert the SVG" + reason + [Try again]
 *
 * Requests made with the `call` options are retried by authFetch on
 * transient failures (the PDF service is stateless, so its calls are `pure`).
 * Unmounting the editor (leaving the page) cancels pending retries.
 */

export type EditorOpLabels = {
  working: string;
  done?: string;
  doneDescription?: string;
  failed: string;
  /** Shown when the error carries no user-facing message. */
  failedFallback?: string;
};

export type EditorOpCall = CallOptions & { signal: AbortSignal; onRetry: (info: RetryInfo) => void };

const DONE_MS = 4000;

export function useEditorOp() {
  const { toast } = useToast();
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const live = controllers.current;
    return () => {
      live.forEach((c) => c.abort());
      live.clear();
    };
  }, []);

  return useCallback(
    async <T,>(
      labels: EditorOpLabels,
      op: (call: EditorOpCall) => Promise<T>,
      tryAgain?: () => void,
    ): Promise<T | undefined> => {
      const ctrl = new AbortController();
      controllers.current.add(ctrl);
      const working = (description?: React.ReactNode) => ({
        title: labels.working,
        description,
        duration: Number.POSITIVE_INFINITY,
      });
      const handle = toast(working());
      let countdown: ReturnType<typeof setInterval> | null = null;
      const stopCountdown = () => {
        if (countdown) clearInterval(countdown);
        countdown = null;
      };

      const onRetry = (info: RetryInfo) => {
        if (ctrl.signal.aborted) return;
        stopCountdown();
        const until = Date.now() + info.delayMs;
        const show = () => {
          const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
          handle.update({
            id: handle.id,
            ...working(left >= 1 ? `Connection problem, retrying in ${left} s…` : "Retrying…"),
          });
          if (left < 1) stopCountdown();
        };
        show();
        countdown = setInterval(show, 250);
      };

      try {
        const result = await op({ signal: ctrl.signal, onRetry });
        stopCountdown();
        if (labels.done) {
          handle.update({ id: handle.id, title: labels.done, description: labels.doneDescription, duration: DONE_MS });
          setTimeout(() => handle.dismiss(), DONE_MS);
        } else {
          handle.dismiss();
        }
        return result;
      } catch (err) {
        stopCountdown();
        if (isAbortError(err) || ctrl.signal.aborted) {
          handle.dismiss();
          return undefined;
        }
        handle.update({
          id: handle.id,
          variant: "destructive",
          title: labels.failed,
          description: errorMessage(err, labels.failedFallback),
          duration: Number.POSITIVE_INFINITY,
          action: tryAgain ? (
            <ToastAction
              altText="Try again"
              onClick={() => {
                handle.dismiss();
                tryAgain();
              }}
            >
              Try again
            </ToastAction>
          ) : undefined,
        });
        return undefined;
      } finally {
        controllers.current.delete(ctrl);
      }
    },
    [toast],
  );
}
