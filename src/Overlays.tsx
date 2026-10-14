import React from "react";
import { Img, interpolate, spring, staticFile } from "remotion";
import { Ctx, roadFraction } from "./geo";
import { FPS, Seg } from "./timing";
import { RECAP } from "./Recap";
import { FINISH, INTRO_WORDS, lastDayNumber, legKm, LOOP_META, META, Stop } from "./trip";

const fade = (local: number, dur: number, inF = 12, outF = 12) => {
  const a = Math.min(inF, dur * 0.4);
  const b = Math.max(a + 1, dur - Math.min(outF, dur * 0.4));
  return interpolate(local, [0, a, b, Math.max(b + 1, dur)], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

const shadow = "0 2px 12px rgba(0,0,0,0.45)";
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function loopKm(trip: Stop[], loop: string) {
  return trip.filter((s) => s.loop === loop).reduce((a, s, i) => a + (i ? legKm(s) : 0), 0);
}
function ferryRides(trip: Stop[]) {
  // a crossing = a sea leg that doesn't just continue from an "on the ferry" stop
  return trip.filter((s, i) => s.leg?.some((g) => g.mode === "sea") && !trip[i - 1]?.on_ferry).length;
}
function loopDays(trip: Stop[], loop: string) {
  return Math.max(...trip.filter((s) => s.loop === loop).map((s) => lastDayNumber(s.day)));
}

export const StopCaption: React.FC<{ stop: Stop; local: number; dur: number }> = ({ stop, local, dur }) => {
  const s = spring({ frame: local - 4, fps: FPS, config: { damping: 16 } });
  const o = fade(local, dur, 8, 10);
  const meta = LOOP_META[stop.loop];
  const sub = stop.custom_title ? stop.place : null;
  const facts = [stop.km ? `${stop.km} km from last stop` : null, stop.time ? `Arrived ${stop.time}` : null]
    .filter(Boolean).join("  ·  ");
  return (
    <div style={{
      position: "absolute", left: 50, top: 44, maxWidth: 860, opacity: o, padding: "20px 28px 22px",
      background: "rgba(8,30,48,0.78)", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
      transform: `translateX(${(1 - s) * -60}px)`, color: "white",
    }}>
      <div style={{ fontSize: 26, letterSpacing: 4, fontWeight: 700, color: meta?.color }}>
        {stop.loop.toUpperCase()} · {stop.day.toUpperCase()}
      </div>
      <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, marginTop: 6 }}>{stop.title}</div>
      {sub && <div style={{ fontSize: 30, marginTop: 8, opacity: 0.9 }}>{sub}</div>}
      {facts && <div style={{ fontSize: 24, marginTop: 10, opacity: 0.85 }}>{facts}</div>}
      {stop.moment && (
        <div style={{
          display: "inline-block", marginTop: 16, padding: "10px 18px", maxWidth: 640, borderRadius: 10,
          background: "rgba(255,250,235,0.94)", color: "#3a2f22", textShadow: "none", transform: "rotate(-1.5deg)",
          fontFamily: "'Bradley Hand', 'Marker Felt', cursive", fontSize: 30, lineHeight: 1.2,
          boxShadow: "0 6px 18px rgba(0,0,0,0.3)",
        }}>{stop.moment}</div>
      )}
    </div>
  );
};

const fmtClock = (m: number) => {
  const h = Math.floor((m % 1440) / 60);
  const mm = Math.floor(m % 60);
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** clock ticks from leaving the last stop to arriving at this one */
function hudClock(trip: Stop[], i: number, progress: number): string | null {
  const s = trip[i];
  if (s.clock == null) return null;
  const prev = trip[i - 1];
  const start = prev && prev.loop === s.loop ? (prev.departed_clock ?? prev.clock) : null;
  if (progress >= 1 || start == null) return fmtClock(s.clock);
  let end = s.clock;
  if (end < start) end += 1440;
  if (end - start > 12 * 60) return progress < 0.5 ? fmtClock(start) : fmtClock(s.clock);
  return fmtClock(start + (end - start) * progress);
}

export const Hud: React.FC<{ ctx: Ctx; seg: Seg; progress: number }> = ({ ctx, seg, progress }) => {
  if (seg.kind !== "travel" && seg.kind !== "stop") return null;
  const { trip } = ctx;
  const s = trip[seg.stopIdx];
  const start = trip.findIndex((t) => t.loop === s.loop);
  let km = trip[start] === trip[0] ? ctx.kmOffset : 0;
  let today = 0;
  const leg = ctx.legs[seg.stopIdx];
  const roadDone = seg.kind === "travel" && leg ? roadFraction(leg, progress * leg.length) : 1;
  for (let i = start + 1; i <= seg.stopIdx; i++) {
    const add = legKm(trip[i]) * (i === seg.stopIdx ? roadDone : 1);
    km += add;
    if (trip[i].day === s.day) today += add;
  }
  const color = LOOP_META[s.loop]?.color;
  const clock = hudClock(trip, seg.stopIdx, seg.kind === "travel" ? progress : 1);
  return (
    <div style={{
      position: "absolute", left: 70, bottom: 56, display: "flex", gap: 28, alignItems: "baseline",
      color: "white", textShadow: shadow, background: "rgba(8,30,48,0.55)", padding: "14px 26px", borderRadius: 14,
    }}>
      <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 3, color }}>{s.day.toUpperCase()}</span>
      {clock && <span style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{clock}</span>}
      <Counter label="TODAY" km={today} />
      <Counter label="LOOP" km={km} />
    </div>
  );
};

const Counter: React.FC<{ label: string; km: number }> = ({ label, km }) => (
  <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
    <span style={{ fontSize: 18, letterSpacing: 2, opacity: 0.75, fontWeight: 700 }}>{label}</span>
    <span style={{ fontSize: 40, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(km)}</span>
    <span style={{ fontSize: 20, opacity: 0.85 }}>km</span>
  </span>
);

const Title: React.FC<{ o: number; children: React.ReactNode }> = ({ o, children }) => (
  <div style={{
    position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", color: "white", textShadow: shadow, opacity: o, textAlign: "center",
    background: `rgba(6,26,42,${0.45 * o})`,
  }}>{children}</div>
);

/** stacked "1 motorcycle / 2 people / ..." lines that drop in, fall away, then the title */
export const Intro: React.FC<{ local: number; dur: number; trip: Stop[] }> = ({ local, dur, trip }) => {
  const total = META.loops.reduce((a, l) => a + loopKm(trip, l.name), 0);
  const step = Math.round(1.1 * FPS);
  const dropAll = 8 * FPS + 10; // after the last word lands
  const titleAt = dropAll + 18;
  const rowH = 112;
  const top = (1080 - INTRO_WORDS.length * rowH) / 2;
  const t = spring({ frame: local - titleAt, fps: FPS, config: { damping: 11, mass: 0.9 } });
  return (
    <div style={{
      position: "absolute", inset: 0, color: "white", textShadow: shadow, overflow: "hidden",
      background: `rgba(6,26,42,${0.55 * fade(local, dur, 1, 30)})`,
    }}>
      {INTRO_WORDS.map((w, i) => {
        const land = spring({ frame: local - 8 - i * step, fps: FPS, config: { damping: 9, mass: 0.8 } });
        const fall = Math.max(0, local - dropAll - i * 2);
        const y = top + i * rowH + (1 - land) * -700 + 0.9 * fall * fall;
        if (local < 8 + i * step) return null;
        return (
          <div key={i} style={{
            position: "absolute", left: 0, right: 0, top: y, height: rowH, display: "flex",
            alignItems: "baseline", justifyContent: "center", gap: 26,
            transform: `rotate(${(1 - land) * (i % 2 ? 8 : -8) + fall * (i % 2 ? 0.6 : -0.6)}deg)`,
          }}>
            <span style={{ fontSize: 96, fontWeight: 900, color: "#ff7a1a", minWidth: 280, textAlign: "right" }}>{w.n}</span>
            <span style={{ fontSize: 64, fontWeight: 800, minWidth: 600 }}>
              {w.text}
              {w.sub && <span style={{ fontSize: 28, fontWeight: 600, opacity: 0.85, marginLeft: 18 }}>{w.sub}</span>}
            </span>
          </div>
        );
      })}
      {local >= titleAt && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", textAlign: "center", opacity: fade(local - titleAt, dur - titleAt, 4, 24),
        }}>
          <div style={{ fontSize: 30, letterSpacing: 12, fontWeight: 600, opacity: 0.9 }}>{META.tagline}</div>
          <div style={{ fontSize: 200, fontWeight: 900, letterSpacing: 6, transform: `scale(${2.2 - 1.2 * t})` }}>{META.title}</div>
          <div style={{ fontSize: 36, fontWeight: 500 }}>{fmt(total)} km around {META.region}</div>
        </div>
      )}
    </div>
  );
};

export const LoopCard: React.FC<{ loop: string; local: number; dur: number; trip: Stop[] }> = ({ loop, local, dur, trip }) => {
  const meta = LOOP_META[loop];
  const s = spring({ frame: local - 4, fps: FPS, config: { damping: 14 } });
  return (
    <Title o={fade(local, dur, 10, 16)}>
      <div style={{ fontSize: 34, letterSpacing: 10, fontWeight: 700, color: meta?.color }}>PART {meta?.part}</div>
      <div style={{ fontSize: 150, fontWeight: 900, transform: `translateY(${(1 - s) * 40}px)` }}>{loop.toUpperCase()}</div>
      <div style={{ fontSize: 36, fontWeight: 500 }}>
        {meta?.dates} · {loopDays(trip, loop)} days · {fmt(loopKm(trip, loop))} km
      </div>
    </Title>
  );
};

export const Finale: React.FC<{ local: number; dur: number; trip: Stop[] }> = ({ local, dur, trip }) => {
  const loops = [...new Set(trip.map((s) => s.loop))];
  const o = interpolate(local, [RECAP.totalsAt, RECAP.totalsAt + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const s = spring({ frame: local - RECAP.totalsAt, fps: FPS, config: { damping: 14 } });
  const total = loops.reduce((a, l) => a + loopKm(trip, l), 0);
  const days = loops.reduce((a, l) => a + loopDays(trip, l), 0);
  if (local < RECAP.totalsAt) return null;
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", color: "white", textShadow: shadow, opacity: o * interpolate(local, [RECAP.giveawaysAt - 15, RECAP.giveawaysAt], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      textAlign: "center",
      transform: `scale(${0.9 + 0.1 * s})`,
    }}>
      <div style={{ background: "rgba(8,30,48,0.82)", borderRadius: 24, padding: "44px 70px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
      <div style={{ fontSize: 30, letterSpacing: 8, fontWeight: 700 }}>{META.completeTitle}</div>
      <div style={{ fontSize: 130, fontWeight: 900, lineHeight: 1 }}>{fmt(total)} km</div>
      <div style={{ fontSize: 36, marginTop: 10 }}>
        {days} riding days · {ferryRides(trip)} ferry rides · {trip.length} stops
      </div>
      {loops.map((l) => (
        <div key={l} style={{ fontSize: 30, marginTop: 14, color: LOOP_META[l]?.color, fontWeight: 700 }}>
          {l}: {fmt(loopKm(trip, l))} km · {loopDays(trip, l)} days · {LOOP_META[l]?.dates}
        </div>
      ))}
      <div style={{ fontSize: 40, marginTop: 34, fontFamily: "'Bradley Hand', 'Marker Felt', cursive" }}>
        {META.closing}
      </div>
      <div style={{ fontSize: 16, marginTop: 22, opacity: 0.6, textShadow: "none" }}>
        Map data © OpenStreetMap contributors · Natural Earth
      </div>
      </div>
    </div>
  );
};

/** big pop-up text when arriving somewhere special ("Touchdown MINDANAO!!!!") */
export const Banner: React.FC<{ text: string; local: number }> = ({ text, local }) => {
  const s = spring({ frame: local - 6, fps: FPS, config: { damping: 8, mass: 0.6 } });
  const o = interpolate(local, [6, 10, 70, 82], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, top: 380, textAlign: "center", opacity: o, zIndex: 100,
      transform: `scale(${0.3 + 0.7 * s}) rotate(-4deg)`, fontSize: 120, fontWeight: 900, color: "#ffd23d",
      textShadow: "0 6px 0 #b8501a, 0 12px 30px rgba(0,0,0,0.5)", letterSpacing: 2,
    }}>{text}</div>
  );
};

const READ_FONT = "'Avenir Next', 'Helvetica Neue', sans-serif";

/** end of a riding day: every photo from that day + the day's story, beside the zoomed-out route */
export const DayEnd: React.FC<{ stop: Stop; trip: Stop[]; local: number; dur: number }> = ({ stop, trip, local, dur }) => {
  const o = fade(local, dur, 14, 26);
  const photos = stop.day_photos;
  const today = trip
    .filter((t, i) => t.loop === stop.loop && t.day === stop.day && i <= trip.indexOf(stop))
    .reduce((a, t) => a + legKm(t), 0);
  const color = LOOP_META[stop.loop]?.color;

  // mosaic: as big as possible in the top-right box
  const box = { x: 0.44 * 1920, y: 40, w: 1920 - 0.44 * 1920 - 40, h: stop.story ? 470 : 1000 };
  let best = { cols: 1, cell: 0 };
  for (let cols = 1; cols <= 10; cols++) {
    const rows = Math.ceil(photos.length / cols);
    const cell = Math.min(box.w / cols, box.h / rows);
    if (cell > best.cell) best = { cols, cell };
  }
  const rows = Math.ceil(photos.length / best.cols);
  const gridX = box.x + (box.w - best.cols * best.cell) / 2;
  const gridY = box.y + (box.h - rows * best.cell) / 2;
  const card = spring({ frame: local - 20, fps: FPS, config: { damping: 16 } });
  const fontSize = (stop.story?.length ?? 0) > 260 ? 31 : 34;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      {photos.map((src, n) => {
        const at = 30 + n * Math.round(0.12 * FPS);
        if (local < at) return null;
        const pop = spring({ frame: local - at, fps: FPS, config: { damping: 12, mass: 0.6 } });
        const c = n % best.cols;
        const r = Math.floor(n / best.cols);
        const size = best.cell * 0.92;
        return (
          <div key={n} style={{
            position: "absolute", left: gridX + c * best.cell, top: gridY + r * best.cell, width: size, height: size,
            padding: size * 0.04, boxSizing: "border-box", background: "#fbfaf7", borderRadius: 4,
            boxShadow: "0 6px 16px rgba(0,0,0,0.35)", transform: `scale(${pop}) rotate(${((n * 47) % 7) - 3}deg)`,
          }}>
            <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        );
      })}
      {stop.story && (
        <div style={{
          position: "absolute", left: box.x, top: 540, width: box.w, boxSizing: "border-box", padding: "30px 40px 34px",
          background: "#fffaf0", borderRadius: 14, boxShadow: "0 18px 44px rgba(0,0,0,0.4)", color: "#2b2622",
          borderLeft: `10px solid ${color}`, transform: `translateY(${(1 - card) * 300}px)`, opacity: card,
        }}>
          <div style={{ fontFamily: READ_FONT, fontSize: 24, fontWeight: 800, letterSpacing: 3, color }}>
            {stop.loop.toUpperCase()} · {stop.day.toUpperCase()} · {fmt(today)} KM
          </div>
          <div style={{ fontFamily: READ_FONT, fontSize, fontWeight: 500, lineHeight: 1.45, marginTop: 12 }}>
            {stop.story}
          </div>
        </div>
      )}
    </div>
  );
};

/** after the totals: plaque, shirt, jacket */
export const Giveaways: React.FC<{ local: number; dur: number }> = ({ local, dur }) => {
  if (local < 0 || !FINISH.items.length) return null;
  const o = fade(local, dur, 15, 30);
  const n = FINISH.items.length;
  const w = Math.min(340, (1920 - 160) / n - 24);
  const h = w * 1.3;
  const title = spring({ frame: local, fps: FPS, config: { damping: 14 } });
  return (
    <div style={{ position: "absolute", inset: 0, background: `rgba(6,26,42,${0.75 * o})`, opacity: o }}>
      <div style={{
        position: "absolute", top: 90, left: 0, right: 0, textAlign: "center", color: "white", textShadow: shadow,
        transform: `translateY(${(1 - title) * -40}px)`,
      }}>
        <div style={{ fontSize: 28, letterSpacing: 10, fontWeight: 700, color: "#ffd23d" }}>{FINISH.subtitle}</div>
        <div style={{ fontSize: 88, fontWeight: 900 }}>{FINISH.title}</div>
      </div>
      <div style={{ position: "absolute", top: 330, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 28 }}>
        {FINISH.items.map((g, i) => {
          const pop = spring({ frame: local - 15 - i * 12, fps: FPS, config: { damping: 12, mass: 0.7 } });
          const kb = interpolate(local, [0, dur], [1, 1.08]);
          return (
            <div key={i} style={{
              width: w, height: h + 96, background: "#fbfaf7", padding: 12, paddingBottom: 0, boxSizing: "border-box",
              borderRadius: 6, boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
              transform: `translateY(${(1 - pop) * 500}px) rotate(${[-4, 3, -2, 4, -3][i % 5]}deg)`,
            }}>
              <div style={{ width: "100%", height: h - 12, overflow: "hidden" }}>
                <Img src={staticFile(g.src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${kb})` }} />
              </div>
              <div style={{ fontFamily: READ_FONT, fontSize: 24, fontWeight: 700, color: "#333", textAlign: "center", marginTop: 14, lineHeight: 1.2, padding: "0 6px" }}>
                {g.caption}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
