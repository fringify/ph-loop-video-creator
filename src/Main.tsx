import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Bike, Ferry } from "./Bike";
import {
  buildLegs, cameraAt, Ctx, dayStops, heading, K_STOP, LAND_PATH, partialPaths, project, riderAt, toScreen,
} from "./geo";
import { Banner, DayEnd, Finale, Giveaways, Hud, Intro, LoopCard, StopCaption } from "./Overlays";
import { PhotoStack } from "./PhotoStack";
import { RECAP, Recap } from "./Recap";
import { buildSchedule, H, segmentAt, W } from "./timing";
import { LOOP_META, Stop, TRIP } from "./trip";

/** fromStop/toStop render just part of the trip (samples) */
export type MainProps = { fromStop?: number; toStop?: number; finale: boolean; music: boolean };

export const useCtx = (fromStop = 0, toStop?: number, finale = true): Ctx =>
  useMemo(() => {
    const trip = TRIP.slice(fromStop, toStop);
    const earlier = TRIP.slice(0, fromStop).filter((s) => s.loop === trip[0].loop);
    const earlierLegs = buildLegs(earlier);
    return {
      trip,
      legs: buildLegs(trip),
      schedule: buildSchedule(trip, { finale }),
      stopPts: trip.map((s) => project(s.pos)),
      kmOffset: earlier.slice(1).reduce((a, s) => a + s.count_km, 0),
      before: earlier.flatMap((s, i) => (earlierLegs[i] ? [{ loop: s.loop, leg: earlierLegs[i]! }] : [])),
    };
  }, [fromStop, toStop, finale]);

/** one song per loop; the next loop's song fades in over the previous one at its title card */
const LoopMusic: React.FC<{ ctx: Ctx; total: number }> = ({ ctx, total }) => {
  const starts = ctx.schedule.segs.flatMap((sg) => (sg.kind === "loopcard" ? [{ loop: sg.loop, from: sg.from }] : []));
  const XFADE = 45;
  return (
    <>
      {starts.map(({ loop, from }, i) => {
        const song = LOOP_META[loop]?.music;
        if (!song) return null;
        const start = i === 0 ? 0 : from;
        const end = i + 1 < starts.length ? starts[i + 1].from + XFADE : total;
        const len = end - start;
        return (
          <Sequence key={loop} from={start} durationInFrames={len} layout="none">
            <Html5Audio src={staticFile(song)} loop
              volume={(f) => interpolate(f, [0, i === 0 ? 30 : XFADE, len - (i + 1 < starts.length ? XFADE : 90), len],
                [0, 0.85, 0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
          </Sequence>
        );
      })}
    </>
  );
};

export const Main: React.FC<MainProps> = ({ fromStop, toStop, finale, music }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ctx = useCtx(fromStop, toStop, finale);
  const { trip, legs, schedule } = ctx;
  const { seg, index } = segmentAt(schedule, frame);
  const cam = cameraAt(ctx, frame, index);
  const rider = riderAt(ctx, seg, frame);

  // which stop the story has reached (routes up to here are drawn)
  const reached = seg.kind === "intro" ? 0 : seg.kind === "finale" ? trip.length - 1 : seg.stopIdx;
  // end of a day: that day's legs glow, everything else steps back
  const today = seg.kind === "dayend" ? new Set(dayStops(trip, seg.stopIdx).slice(1)) : null;
  const currentLoop = trip[reached].loop;

  const routes: React.ReactNode[] = ctx.before.flatMap(({ loop, leg }, i) =>
    partialPaths(leg, leg.length).map((p, j) => (
      <path key={`b${i}-${j}`} d={p.d} fill="none" vectorEffect="non-scaling-stroke"
        stroke={p.mode === "sea" ? "#e8f6ff" : LOOP_META[loop]?.color} strokeWidth={p.mode === "sea" ? 4 : 6}
        strokeDasharray={p.mode === "sea" ? "2 10" : undefined} strokeLinecap="round" strokeLinejoin="round" />
    )));
  trip.forEach((s, i) => {
    const leg = legs[i];
    if (!leg || i > reached) return;
    const d = i === reached && seg.kind === "travel" ? rider.progress * leg.length : leg.length;
    const color = LOOP_META[s.loop]?.color ?? "#ff7a1a";
    const faded = seg.kind !== "finale" && s.loop !== currentLoop;
    partialPaths(leg, d).forEach((p, j) => {
      if (today?.has(i)) {
        routes.push(
          <path key={`g${i}-${j}`} d={p.d} fill="none" vectorEffect="non-scaling-stroke" stroke="#fff6c2"
            strokeWidth={18} strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round" />,
        );
      }
      routes.push(
        <path key={`${i}-${j}`} d={p.d} fill="none" vectorEffect="non-scaling-stroke"
          stroke={p.mode === "sea" ? "#e8f6ff" : color} strokeWidth={p.mode === "sea" ? 4 : 6}
          strokeDasharray={p.mode === "sea" ? "2 10" : undefined}
          strokeLinecap="round" strokeLinejoin="round" opacity={faded || (today && !today.has(i)) ? 0.35 : 1} />,
      );
    });
  });

  const pins = trip.map((s, i) => {
    if (i > reached || (i === reached && seg.kind === "travel")) return null;
    const [x, y] = ctx.stopPts[i];
    const isNow = seg.kind === "stop" && seg.stopIdx === i;
    const pop = isNow ? interpolate(frame - seg.from, [0, 8, 14], [0, 1.5, 1], { extrapolateRight: "clamp" }) : 1;
    const r = ((s.major ? 7 : 5) * pop) / cam.k;
    return (
      <circle key={i} cx={x} cy={y} r={r} fill={isNow ? "#fff" : LOOP_META[s.loop]?.color}
        stroke="#1d3557" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    );
  });

  const [rx, ry] = toScreen(cam, rider.p);
  const ang = heading(ctx, seg, frame);
  const facingLeft = Math.cos(ang) < -0.15;
  const onFerry = (rider.mode === "sea" && seg.kind === "travel") || (seg.kind === "stop" && trip[seg.stopIdx].on_ferry);
  const tilt = (onFerry ? 0.3 : 1) * (facingLeft ? -1 : 1) * Math.max(-10, Math.min(10, ((facingLeft ? Math.PI - ang : ang) * 180) / Math.PI));
  const riderScale = interpolate(cam.k / K_STOP, [0.11, 0.33, 1], [0.45, 0.7, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const showRider = seg.kind === "intro" ? frame - seg.from > seg.dur * 0.85 : seg.kind !== "finale" || frame - seg.from < 20;

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #2a7f9e 0%, #145a78 55%, #0b3954 100%)", fontFamily: "'Avenir Next', 'Helvetica Neue', sans-serif" }}>
      <svg width={W} height={H} style={{ position: "absolute" }}>
        <g transform={`translate(${W / 2 - cam.ox} ${H / 2}) scale(${cam.k}) translate(${-cam.c[0]} ${-cam.c[1]})`}>
          <path d={LAND_PATH} fill="#0a3049" opacity={0.35} transform={`translate(${3 / cam.k} ${4 / cam.k})`} />
          <path d={LAND_PATH} fill="#e9dcb9" stroke="#fff8e6" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          {routes}
          {pins}
        </g>
      </svg>

      {showRider && (
        <div style={{
          position: "absolute", left: rx, top: ry,
          transform: `translate(-50%, -94%) scale(${riderScale}) scaleX(${facingLeft ? -1 : 1}) rotate(${tilt}deg)`,
          transformOrigin: "50% 94%",
        }}>
          {onFerry ? <Ferry frame={frame} /> : <Bike frame={frame} moving={rider.moving} />}
        </div>
      )}

      {seg.kind === "travel" && trip[seg.stopIdx].emoji && (
        <EmojiTrail emoji={trip[seg.stopIdx].emoji!} x={rx} y={ry} local={frame - seg.from} />
      )}
      {seg.kind === "stop" && (
        <>
          <StopCaption stop={trip[seg.stopIdx]} local={frame - seg.from} dur={seg.dur} />
          <PhotoStack stop={trip[seg.stopIdx]} local={frame - seg.from} dur={seg.dur}
            mediaAt={seg.mediaAt} from={seg.from} />
          {trip[seg.stopIdx].banner && <Banner text={trip[seg.stopIdx].banner!} local={frame - seg.from} />}
        </>
      )}
      {seg.kind !== "intro" && seg.kind !== "finale" && seg.kind !== "loopcard" && (
        <Hud ctx={ctx} seg={seg} progress={rider.progress} />
      )}
      {seg.kind === "intro" && <Intro local={frame - seg.from} dur={seg.dur} trip={TRIP} />}
      {seg.kind === "loopcard" && <LoopCard loop={seg.loop} local={frame - seg.from} dur={seg.dur} trip={TRIP} />}
      {seg.kind === "dayend" && <DayEnd stop={trip[seg.stopIdx]} trip={trip} local={frame - seg.from} dur={seg.dur} />}
      {seg.kind === "finale" && <Recap ctx={ctx} local={frame - seg.from} />}
      {seg.kind === "finale" && <Finale local={frame - seg.from} dur={seg.dur} trip={trip} />}
      {seg.kind === "finale" && (
        <Giveaways local={frame - seg.from - RECAP.giveawaysAt} dur={seg.dur - RECAP.giveawaysAt} />
      )}

      {music && <LoopMusic ctx={ctx} total={durationInFrames} />}
    </AbsoluteFill>
  );
};

/** emojis floating up from the riders (legs with no photos) */
const EmojiTrail: React.FC<{ emoji: string[]; x: number; y: number; local: number }> = ({ emoji, x, y, local }) => (
  <>
    {Array.from({ length: 10 }, (_, i) => {
      const born = i * 9;
      const age = (local - born) % 90;
      if (local < born) return null;
      const e = emoji[(i + Math.floor((local - born) / 90) * 3) % emoji.length];
      const dx = Math.sin(i * 2.4) * 160 + Math.sin(age / 12 + i) * 18;
      return (
        <div key={i} style={{
          position: "absolute", left: x + dx, top: y - 120 - age * 2.6, fontSize: 64,
          opacity: interpolate(age, [0, 10, 70, 90], [0, 1, 1, 0]), transform: `scale(${0.7 + age / 150})`,
        }}>{e}</div>
      );
    })}
  </>
);

export type { Stop };
