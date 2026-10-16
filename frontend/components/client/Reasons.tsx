import type { Reason } from "@/lib/types";

/** Plain-language drivers of a prediction: green arrow raises the chance, red lowers it. */
export default function Reasons({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="space-y-2.5">
      {reasons.map((r) => (
        <li key={r.feature} className="flex gap-2.5 text-[13px] leading-snug">
          <span className={`mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${
            r.effect === "up" ? "bg-good" : "bg-bad"}`} aria-label={r.effect === "up" ? "raises the chance" : "lowers the chance"}>
            {r.effect === "up" ? "↑" : "↓"}
          </span>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}
