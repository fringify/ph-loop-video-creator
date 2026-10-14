import { geoArea, geoBounds, geoMercator, geoPath, GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/countries-10m.json";
import { Easing, interpolate } from "remotion";
import { H, W, Schedule, Seg } from "./timing";
import { Stop, TRIP } from "./trip";

type XY = [number, number];

const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
const countries = feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection;

// ---------- map fitted to wherever the trip goes ----------

const allPoints = TRIP.flatMap((s) => [s.pos, ...(s.leg ?? []).flatMap((g) => g.points)]);
const lats = allPoints.map((p) => p[0]);
const lons = allPoints.map((p) => p[1]);
const bounds = { s: Math.min(...lats), n: Math.max(...lats), w: Math.min(...lons), e: Math.max(...lons) };
const pad = Math.max(0.1, Math.max(bounds.n - bounds.s, bounds.e - bounds.w) * 0.06);
const tripArea: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: { type: "MultiPoint", coordinates: [[bounds.w - pad, bounds.s - pad], [bounds.e + pad, bounds.n + pad]] },
};

/** Mercator fitted so the whole trip fills the frame at zoom k = 1 */
export const projection = geoMercator()
  .fitExtent([[80, 50], [W - 80, H - 50]], tripArea as GeoPermissibleObjects)
  .clipExtent([[-W, -H], [2 * W, 2 * H]]);

const path = geoPath(projection).digits(3);
// only land near the trip (keeps every frame fast)
const margin = Math.max(bounds.n - bounds.s, bounds.e - bounds.w) * 0.8 + 3;
const nearby = countries.features.filter((c) => {
  // Antarctica wraps the pole; a few shapes in the data are stored inside-out (they "cover"
  // more than half the globe) — either would flood the whole frame with land
  if (String(c.id) === "010" || geoArea(c as GeoPermissibleObjects) > 2 * Math.PI) return false;
  const [[x0, y0], [x1, y1]] = geoBounds(c as GeoPermissibleObjects);
  const latOk = y0 < bounds.n + margin && y1 > bounds.s - margin;
  const overlaps = (a: number, b: number) => a < bounds.e + margin && b > bounds.w - margin;
  // features crossing the antimeridian report x0 > x1
  return latOk && (x0 <= x1 ? overlaps(x0, x1) : overlaps(x0, 180) || overlaps(-180, x1));
});
export const LAND_PATH = nearby
  .map((c) => path(c as GeoPermissibleObjects))
  .filter(Boolean)
  .join("");
/** centre of the whole-trip view */
export const OVERVIEW_CENTER: XY = [W / 2, H / 2];

export const project = ([lat, lon]: [number, number]): XY => projection([lon, lat]) as XY;

// ---------- legs as projected polylines with cumulative length ----------

export type Poly = { mode: "road" | "sea"; pts: XY[]; cum: number[] };
export type Leg = { polys: Poly[]; length: number };

export function buildLegs(trip: Stop[]): (Leg | null)[] {
  return trip.map((s) => {
    if (!s.leg) return null;
    let length = 0;
    const polys = s.leg.map((seg) => {
      const pts = seg.points.map(project);
      const cum = [length];
      for (let i = 1; i < pts.length; i++) {
        length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        cum.push(length);
      }
      return { mode: seg.mode, pts, cum };
    });
    return { polys, length };
  });
}

/** point + travel mode at distance d along a leg */
export function pointAt(leg: Leg, d: number): { p: XY; mode: "road" | "sea" } {
  d = Math.max(0, Math.min(leg.length, d));
  for (const poly of leg.polys) {
    const last = poly.cum[poly.cum.length - 1];
    if (d > last && poly !== leg.polys[leg.polys.length - 1]) continue;
    for (let i = 1; i < poly.pts.length; i++) {
      if (poly.cum[i] >= d) {
        const t = (d - poly.cum[i - 1]) / Math.max(1e-9, poly.cum[i] - poly.cum[i - 1]);
        const a = poly.pts[i - 1];
        const b = poly.pts[i];
        return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], mode: poly.mode };
      }
    }
    return { p: poly.pts[poly.pts.length - 1], mode: poly.mode };
  }
  return { p: leg.polys[0].pts[0], mode: leg.polys[0].mode };
}

/** share of this leg's road distance covered at distance d (ferry stretches don't add km) */
export function roadFraction(leg: Leg, d: number): number {
  let done = 0;
  let total = 0;
  for (const poly of leg.polys) {
    if (poly.mode !== "road") continue;
    const a = poly.cum[0];
    const b = poly.cum[poly.cum.length - 1];
    total += b - a;
    done += Math.max(0, Math.min(d, b) - a);
  }
  return total > 0 ? done / total : 1;
}

/** SVG path for the first d units of a leg, split by mode */
export function partialPaths(leg: Leg, d: number): { mode: "road" | "sea"; d: string }[] {
  const out: { mode: "road" | "sea"; d: string }[] = [];
  for (const poly of leg.polys) {
    if (poly.cum[0] >= d) break;
    const pts: XY[] = [];
    for (let i = 0; i < poly.pts.length; i++) {
      if (poly.cum[i] <= d) pts.push(poly.pts[i]);
      else {
        const t = (d - poly.cum[i - 1]) / Math.max(1e-9, poly.cum[i] - poly.cum[i - 1]);
        const a = poly.pts[i - 1];
        const b = poly.pts[i];
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        break;
      }
    }
    if (pts.length > 1) out.push({ mode: poly.mode, d: "M" + pts.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join("L") });
  }
  return out;
}

// ---------- camera ----------

/** zoom at a stop: about 185 km of map top-to-bottom (less zoom for small trips) */
const tripKm = (bounds.n - bounds.s + 2 * pad) * 111;
export const K_STOP = Math.max(1.6, Math.min(9, tripKm / 185));
const K_LOOPCARD = Math.min(2.6, Math.max(1, K_STOP / 3.5));

export type Cam = { c: XY; k: number; ox: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpCam = (a: Cam, b: Cam, t: number): Cam => ({
  c: [lerp(a.c[0], b.c[0], t), lerp(a.c[1], b.c[1], t)],
  // zoom interpolates geometrically so it feels even
  k: a.k * Math.pow(b.k / a.k, t),
  ox: lerp(a.ox, b.ox, t),
});
const ease = Easing.inOut(Easing.cubic);

export function legFitK(leg: Leg): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of leg.polys)
    for (const [x, y] of poly.pts) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  return Math.min(K_STOP, (0.55 * W) / Math.max(1, x1 - x0), (0.55 * H) / Math.max(1, y1 - y0));
}

export type Ctx = {
  trip: Stop[];
  legs: (Leg | null)[];
  schedule: Schedule;
  stopPts: XY[];
  /** when starting mid-trip (samples): km already ridden in this loop, and the routes ridden before */
  kmOffset: number;
  before: { loop: string; leg: Leg }[];
};

/** where the riders are + how far along the current leg (0..1) */
export function riderAt(ctx: Ctx, seg: Seg, frame: number): { p: XY; mode: "road" | "sea"; progress: number; moving: boolean } {
  const { trip, legs, stopPts } = ctx;
  if (seg.kind === "travel") {
    const leg = legs[seg.stopIdx];
    const t = ease(Math.min(1, (frame - seg.from) / seg.dur));
    if (!leg) return { p: stopPts[seg.stopIdx], mode: "road", progress: 1, moving: false };
    const { p, mode } = pointAt(leg, t * leg.length);
    return { p, mode, progress: t, moving: t > 0 && t < 1 };
  }
  if (seg.kind === "intro") return { p: stopPts[0], mode: "road", progress: 1, moving: false };
  if (seg.kind === "finale") return { p: stopPts[trip.length - 1], mode: "road", progress: 1, moving: false };
  return { p: stopPts[seg.stopIdx], mode: "road", progress: 1, moving: false };
}

/** stop indexes ridden on the same day as stop i, plus where that day started */
export function dayStops(trip: Stop[], i: number): number[] {
  const s = trip[i];
  const ids = trip.flatMap((t, j) => (t.loop === s.loop && t.day === s.day ? [j] : []));
  return ids[0] > 0 && trip[ids[0] - 1].loop === s.loop ? [ids[0] - 1, ...ids] : ids;
}

/** camera that fits the whole day's route into the left part of the screen */
export const DAY_MAP_W = 0.4 * W;
function dayCam(ctx: Ctx, i: number): Cam {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = ([x, y]: XY) => {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  };
  for (const j of dayStops(ctx.trip, i)) {
    add(ctx.stopPts[j]);
    ctx.legs[j]?.polys.forEach((p) => p.pts.forEach(add));
  }
  const k = Math.min(K_STOP, (0.85 * DAY_MAP_W) / Math.max(1, x1 - x0), (0.78 * H) / Math.max(1, y1 - y0));
  return { c: [(x0 + x1) / 2, (y0 + y1) / 2], k, ox: W / 2 - (24 + DAY_MAP_W / 2) };
}

function endCam(ctx: Ctx, seg: Seg): Cam {
  switch (seg.kind) {
    case "dayend":
      return { c: ctx.stopPts[seg.stopIdx], k: K_STOP, ox: 0 };
    case "intro":
      return { c: ctx.stopPts[0], k: K_LOOPCARD, ox: 0 };
    case "loopcard":
      return { c: ctx.stopPts[seg.stopIdx], k: K_LOOPCARD, ox: 0 };
    case "travel":
      return { c: ctx.stopPts[seg.stopIdx], k: K_STOP, ox: 0 };
    case "stop":
      return { c: ctx.stopPts[seg.stopIdx], k: K_STOP, ox: 0 };
    case "finale":
      return { c: OVERVIEW_CENTER, k: 1, ox: 0 };
  }
}

export function cameraAt(ctx: Ctx, frame: number, segIndex: number): Cam {
  const seg = ctx.schedule.segs[segIndex];
  const prev = segIndex > 0 ? endCam(ctx, ctx.schedule.segs[segIndex - 1]) : { c: OVERVIEW_CENTER, k: 1, ox: 0 };
  const local = frame - seg.from;
  const target = endCam(ctx, seg);

  if (seg.kind === "intro") {
    const t = ease(interpolate(local, [seg.dur * 0.7, seg.dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    return lerpCam({ c: OVERVIEW_CENTER, k: 1, ox: 0 }, target, t);
  }
  if (seg.kind === "travel") {
    const leg = ctx.legs[seg.stopIdx];
    const { p } = riderAt(ctx, seg, frame);
    const t = Math.min(1, local / seg.dur);
    const kLeg = leg ? legFitK(leg) : K_STOP;
    // zoom out mid-leg for long rides, back in on arrival
    const k = K_STOP * Math.pow(kLeg / K_STOP, Math.sin(Math.PI * t));
    return { c: p, k, ox: 0 };
  }
  if (seg.kind === "dayend") {
    // zoom out to the day's route, hold, then back to the hotel for the next ride
    const day = dayCam(ctx, seg.stopIdx);
    const tIn = ease(interpolate(local, [0, 36], [0, 1], { extrapolateRight: "clamp" }));
    const tOut = ease(interpolate(local, [seg.dur - 30, seg.dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    return lerpCam(lerpCam(prev, day, tIn), target, tOut);
  }
  if (seg.kind === "stop") {
    // slide the map left so photos fit on the right, then back before leaving
    // short stops (no photos) get a proportionally shorter slide
    const slideIn = Math.min(18, seg.dur * 0.4);
    const slideOut = Math.max(slideIn + 1, seg.dur - Math.min(14, seg.dur * 0.4));
    const ox = interpolate(local, [0, slideIn, slideOut, seg.dur], [0, W * 0.2, W * 0.2, 0], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease,
    });
    const t = ease(interpolate(local, [0, 24], [0, 1], { extrapolateRight: "clamp" }));
    const base = lerpCam(prev, target, t);
    return { ...base, ox };
  }
  const span = seg.kind === "finale" ? 3 * 30 : seg.dur * 0.6;
  const t = ease(interpolate(local, [0, span], [0, 1], { extrapolateRight: "clamp" }));
  return lerpCam(prev, target, t);
}

/** map point -> screen point for a camera */
export const toScreen = (cam: Cam, p: XY): XY => [
  (p[0] - cam.c[0]) * cam.k + W / 2 - cam.ox,
  (p[1] - cam.c[1]) * cam.k + H / 2,
];

/** direction of travel in screen space, smoothed with a look-ahead */
export function heading(ctx: Ctx, seg: Seg, frame: number): number {
  if (seg.kind !== "travel") return 0;
  const leg = ctx.legs[seg.stopIdx];
  if (!leg) return 0;
  const t = ease(Math.min(1, (frame - seg.from) / seg.dur));
  const look = Math.max(leg.length * 0.04, 0.8);
  const a = pointAt(leg, t * leg.length - look).p;
  const b = pointAt(leg, t * leg.length + look).p;
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
