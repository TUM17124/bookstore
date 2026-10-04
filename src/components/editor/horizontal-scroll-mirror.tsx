"use client";

/**
 * horizontal-scroll-mirror.tsx
 *
 * A horizontal scrollbar for a tall element whose own bar would sit far below
 * the fold. The continuous page view is as tall as the whole document (the
 * window scrolls it vertically), so its native horizontal scrollbar would only
 * appear at the very end of the last page. This renders a thin bar pinned to the
 * bottom of the screen that scrolls the target in both directions, and only
 * exists while the target actually overflows horizontally.
 */

import React, { useEffect, useRef, useState } from "react";

export function HorizontalScrollMirror({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLElement | null>;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState({ scroll: 0, client: 0 });
  // Guards the two-way sync against echoing each other's scroll events.
  const syncing = useRef(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) {
      return;
    }
    const measure = () =>
      setSizes((prev) =>
        prev.scroll === target.scrollWidth && prev.client === target.clientWidth
          ? prev
          : { scroll: target.scrollWidth, client: target.clientWidth },
      );
    measure();
    const onTargetScroll = () => {
      const bar = barRef.current;
      if (!bar || syncing.current) {
        syncing.current = false;
        return;
      }
      if (bar.scrollLeft !== target.scrollLeft) {
        syncing.current = true;
        bar.scrollLeft = target.scrollLeft;
      }
    };
    target.addEventListener("scroll", onTargetScroll, { passive: true });
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(target);
      // The content box changes size with zoom while the target itself does not.
      for (const child of Array.from(target.children)) {
        ro.observe(child);
      }
    }
    return () => {
      target.removeEventListener("scroll", onTargetScroll);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [targetRef]);

  const overflowing = sizes.scroll - sizes.client > 1;

  // Keep the bar in step with the target when it first appears.
  useEffect(() => {
    const target = targetRef.current;
    const bar = barRef.current;
    if (overflowing && target && bar) {
      bar.scrollLeft = target.scrollLeft;
    }
  }, [overflowing, targetRef]);

  if (!overflowing) {
    return null;
  }
  return (
    <div
      ref={barRef}
      data-testid="horizontal-scroll-mirror"
      className="sticky bottom-0 z-30 overflow-x-auto overflow-y-hidden border-t bg-background/90"
      style={{ height: 16 }}
      onScroll={(e) => {
        const target = targetRef.current;
        if (!target) {
          return;
        }
        if (syncing.current) {
          syncing.current = false;
          return;
        }
        if (target.scrollLeft !== e.currentTarget.scrollLeft) {
          syncing.current = true;
          target.scrollLeft = e.currentTarget.scrollLeft;
        }
      }}
      aria-hidden="true"
    >
      <div style={{ width: sizes.scroll, height: 1 }} />
    </div>
  );
}
