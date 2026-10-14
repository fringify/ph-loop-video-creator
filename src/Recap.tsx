import React, { useMemo } from "react";
import { Img, interpolate, spring, staticFile } from "remotion";
import { Cam, Ctx, OVERVIEW_CENTER, toScreen } from "./geo";
import { FPS, H, W } from "./timing";

/** finale timing (frames from the start of the finale) */
export const RECAP = {
  zoomEnd: 3 * FPS, // camera reaches the whole-trip view
  popStart: 3 * FPS,
  popEnd: 14 * FPS, // every stop's photo + arrow has appeared
  totalsAt: 17 * FPS, // totals card over the dimmed recap
  giveawaysAt: 26 * FPS, // plaque, shirt, jacket
};

const FINAL_CAM: Cam = { c: OVERVIEW_CENTER, k: 1, ox: 0 };
const SIDE_W = 620;
const MARGIN = 30;

type Thumb = { stopIdx: number; src: string; x: number; y: number; size: number; pin: [number, number] };

/** one photo per stop, in two grids beside the map, sorted so arrows cross as little as possible */
function layoutThumbs(ctx: Ctx): Thumb[] {
  const items = ctx.trip
    .map((s, i) => ({ i, src: s.media.find((m) => !m.video)?.src, pin: toScreen(FINAL_CAM, ctx.stopPts[i]) }))
    .filter((t): t is { i: number; src: string; pin: [number, number] } => !!t.src);
  const out: Thumb[] = [];
  for (const side of ["left", "right"] as const) {
    const group = items.filter((t) => (side === "left") === t.pin[0] < W / 2).sort((a, b) => a.pin[1] - b.pin[1]);
    if (!group.length) continue;
    let best = { cols: 1, rows: group.length, cell: 0 };
    for (let cols = 1; cols <= 10; cols++) {
      const rows = Math.ceil(group.length / cols);
      const cell = Math.min(SIDE_W / cols, (H - 2 * MARGIN) / rows);
      if (cell > best.cell) best = { cols, rows, cell };
    }
    const { cols, rows, cell } = best;
    const x0 = side === "left" ? MARGIN : W - MARGIN - cols * cell;
    const y0 = (H - rows * cell) / 2;
    for (let r = 0; r < rows; r++) {
      // within a row, the pin furthest from the map edge gets the cell furthest out
      const row = group.slice(r * cols, (r + 1) * cols).sort((a, b) => a.pin[0] - b.pin[0]);
      row.forEach((t, c) => {
        out.push({
          stopIdx: t.i, src: t.src, pin: t.pin, size: cell * 0.86,
          x: x0 + c * cell + cell * 0.07, y: y0 + r * cell + cell * 0.07,
        });
      });
    }
  }
  return out.sort((a, b) => a.stopIdx - b.stopIdx);
}

export const Recap: React.FC<{ ctx: Ctx; local: number }> = ({ ctx, local }) => {
  const thumbs = useMemo(() => layoutThumbs(ctx), [ctx]);
  const step = (RECAP.popEnd - RECAP.popStart) / Math.max(1, thumbs.length);
  const dim = interpolate(local, [RECAP.totalsAt - 15, RECAP.totalsAt + 10], [1, 0.3], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, opacity: dim }}>
      <svg width={W} height={H} style={{ position: "absolute" }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#ffd23d" />
          </marker>
        </defs>
        {thumbs.map((t, n) => {
          const at = RECAP.popStart + n * step;
          const grow = interpolate(local, [at, at + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (grow <= 0) return null;
          const fromX = t.pin[0] < W / 2 ? t.x + t.size : t.x;
          const fromY = t.y + t.size / 2;
          const toX = fromX + (t.pin[0] - fromX) * grow;
          const toY = fromY + (t.pin[1] - fromY) * grow;
          return (
            <g key={n}>
              <line x1={fromX} y1={fromY} x2={toX} y2={toY} stroke="#ffd23d" strokeOpacity={0.75} strokeWidth={1.6}
                markerEnd={grow > 0.95 ? "url(#arrow)" : undefined} />
              {grow > 0.95 && <circle cx={t.pin[0]} cy={t.pin[1]} r={3.5} fill="white" stroke="#1d3557" strokeWidth={1.5} />}
            </g>
          );
        })}
      </svg>
      {thumbs.map((t, n) => {
        const at = RECAP.popStart + n * step;
        if (local < at) return null;
        const pop = spring({ frame: local - at, fps: FPS, config: { damping: 12, mass: 0.6 } });
        return (
          <div key={n} style={{
            position: "absolute", left: t.x, top: t.y, width: t.size, height: t.size, padding: t.size * 0.05,
            boxSizing: "border-box", background: "#fbfaf7", borderRadius: 3, boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
            transform: `scale(${pop}) rotate(${((n * 37) % 9) - 4}deg)`,
          }}>
            <Img src={staticFile(t.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        );
      })}
    </div>
  );
};
