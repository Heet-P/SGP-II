"use client";

import { useEffect, useRef, useState } from "react";

/** Tweens from the previously shown value to `value`, so numbers count up instead of jumping. */
export default function AnimatedNumber({
  value,
  format,
  duration = 700,
}: {
  value: number;
  format: (v: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const v = from + (value - from) * (1 - Math.pow(1 - p, 3));
      current.current = v;
      setShown(v);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className="tabular-nums">{format(shown)}</span>;
}
