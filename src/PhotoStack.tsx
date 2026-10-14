import React from "react";
import { Img, interpolate, OffthreadVideo, Sequence, spring, staticFile } from "remotion";
import { CLIP_S, FPS, H, W } from "./timing";
import { Stop } from "./trip";

const AREA = { x: W * 0.46, y: 150, w: W * 0.52, h: H - 230 };
const TILTS = [-4, 3, -2, 5, -5, 2, -3, 4];
const JITTER = [[-14, 8], [12, -10], [-8, -6], [10, 12], [-12, 10], [6, -12]];

type Slot = { x: number; y: number; w: number; h: number; rot: number };

/** scattered-grid collage: 1 big card, or 2 / 2x2 / 3x2 overlapping polaroids */
function layout(n: number, seed: number): Slot[] {
  const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cellW = AREA.w / cols;
  const cellH = AREA.h / rows;
  // portrait-ish polaroid, slightly bigger than its cell so cards overlap
  let w = Math.min(cellW * 1.05, 600);
  let h = w * 1.18;
  if (h > cellH * 1.08) {
    h = cellH * 1.08;
    w = h / 1.18;
  }
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const c = i % cols;
    const rowOffset = ((cols - inRow) * cellW) / 2;
    const [jx, jy] = JITTER[(i + seed) % JITTER.length];
    return {
      x: AREA.x + rowOffset + c * cellW + (cellW - w) / 2 + jx,
      y: AREA.y + r * cellH + (cellH - h) / 2 + jy,
      w, h,
      rot: TILTS[(i + seed) % TILTS.length],
    };
  });
}

/** Polaroids that pop in one after another and stay together as a collage. */
export const PhotoStack: React.FC<{ stop: Stop; local: number; dur: number; mediaAt: number[]; from: number }> = ({
  stop, local, dur, mediaAt, from,
}) => {
  const slots = layout(stop.media.length, stop.id);
  const leave = interpolate(local, [dur - 12, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <>
      {stop.media.map((m, i) => {
        const at = mediaAt[i];
        if (local < at) return null;
        const s = slots[i];
        const enter = spring({ frame: local - at, fps: FPS, config: { damping: 13, mass: 0.7 } });
        const kb = interpolate(local - at, [0, 150], [1.0, 1.08], { extrapolateRight: "clamp" });
        const pad = s.w * 0.035;
        const caption = i === 0 ? stop.title : m.video && stop.label ? stop.label : "";
        return (
          <div key={i} style={{
            position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h,
            background: "#fbfaf7", borderRadius: 5, padding: pad, paddingBottom: s.w * 0.13,
            boxSizing: "border-box", boxShadow: "0 14px 34px rgba(0,0,0,0.38)",
            transform: `translateY(${(1 - enter) * -90 + leave * H}px) rotate(${s.rot * (2 - enter)}deg) scale(${0.6 + 0.4 * enter})`,
            opacity: Math.min(1, enter * 2),
            zIndex: i,
          }}>
            <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "#222" }}>
              {m.video ? (
                <Sequence from={from + at} durationInFrames={Math.round(CLIP_S * FPS)} layout="none">
                  <OffthreadVideo src={staticFile(m.src)} muted
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </Sequence>
              ) : (
                <Img src={staticFile(m.src)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${kb})` }} />
              )}
            </div>
            {caption && (
              <div style={{
                position: "absolute", bottom: s.w * 0.025, left: 8, right: 8, textAlign: "center", color: "#333",
                fontFamily: "'Marker Felt', 'Bradley Hand', cursive", fontSize: Math.max(18, s.w * 0.055),
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {caption}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
