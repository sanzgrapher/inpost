import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "right" | "left";

type TipState = {
  text: string;
  left: number;
  top: number;
  side: Side;
};

const DELAY_MS = 350;
const GAP = 6;
const PAD = 6;
const PENDING = -9999;

function place(
  side: Side,
  anchor: DOMRect,
  tipW: number,
  tipH: number,
): { left: number; top: number; side: Side } {
  let s = side;
  let left: number;
  let top: number;

  if (s === "right") {
    left = anchor.right + GAP;
    top = anchor.top + anchor.height / 2 - tipH / 2;
  } else if (s === "left") {
    left = anchor.left - tipW - GAP;
    top = anchor.top + anchor.height / 2 - tipH / 2;
  } else if (s === "bottom") {
    left = anchor.left + anchor.width / 2 - tipW / 2;
    top = anchor.bottom + GAP;
  } else {
    left = anchor.left + anchor.width / 2 - tipW / 2;
    top = anchor.top - tipH - GAP;
    if (top < PAD) {
      s = "bottom";
      top = anchor.bottom + GAP;
    }
  }

  left = Math.max(PAD, Math.min(left, window.innerWidth - tipW - PAD));
  top = Math.max(PAD, Math.min(top, window.innerHeight - tipH - PAD));
  return { left, top, side: s };
}

/** Compact in-app tooltips for `[data-tip]` (optional `data-tip-side`). */
export function TipHost() {
  const [tip, setTip] = useState<TipState | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const pendingSide = useRef<Side>("top");

  useEffect(() => {
    function clearTimer() {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function hide() {
      clearTimer();
      elRef.current = null;
      setTip(null);
    }

    function schedule(el: HTMLElement) {
      const text = el.getAttribute("data-tip")?.trim();
      if (!text) {
        hide();
        return;
      }
      if (elRef.current === el) return;
      clearTimer();
      elRef.current = el;
      pendingSide.current =
        (el.getAttribute("data-tip-side") as Side) || "top";
      setTip(null);
      timerRef.current = window.setTimeout(() => {
        if (elRef.current !== el) return;
        setTip({
          text,
          left: PENDING,
          top: PENDING,
          side: pendingSide.current,
        });
      }, DELAY_MS);
    }

    function onOver(e: PointerEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const el = t.closest("[data-tip]") as HTMLElement | null;
      if (!el?.getAttribute("data-tip")?.trim()) return;
      schedule(el);
    }

    function onOut(e: PointerEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const el = t.closest("[data-tip]") as HTMLElement | null;
      if (!el || el !== elRef.current) return;
      const rel = e.relatedTarget as Node | null;
      if (rel && el.contains(rel)) return;
      hide();
    }

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
      hide();
    };
  }, []);

  useEffect(() => {
    if (!tip || tip.left !== PENDING || !boxRef.current || !elRef.current)
      return;
    const anchor = elRef.current.getBoundingClientRect();
    const box = boxRef.current.getBoundingClientRect();
    const next = place(tip.side, anchor, box.width, box.height);
    setTip({ text: tip.text, ...next });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={boxRef}
      className={`app-tip app-tip-${tip.side}`}
      style={{ left: tip.left, top: tip.top }}
      role="tooltip"
    >
      {tip.text}
    </div>,
    document.body,
  );
}
