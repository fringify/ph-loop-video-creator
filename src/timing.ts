import { Stop } from "./trip";

export const FPS = 30;
export const W = 1920;
export const H = 1080;

// seconds — keep in sync with tools/prepare_media.py
export const STAGGER_S = 0.35; // next photo pops in
export const HOLD_S = 1.5; // whole collage stays up after the last photo lands
export const CLIP_S = 3.5;
export const STOP_LEAD_S = 0.5; // pin pops + caption before first photo
export const STOP_TAIL_S = 0.4;
export const EMPTY_STOP_S = 1.0;
export const INTRO_S = 14;
export const LOOP_CARD_S = 4;
export const FINALE_S = 38;

// end-of-day recap — keep in sync with tools/prepare_media.py
export const DAYEND_LEAD_S = 1.2;
export const DAYEND_TAIL_S = 1.0;
export const PHOTO_POP_S = 0.12;
/** reading time for the day's story (~18 characters a second) */
export const storySeconds = (text: string | null) => (!text ? 0 : Math.min(20, Math.max(8, 4 + text.length / 18)));
const dayEndSeconds = (s: Stop) => {
  const photos = s.day_photos.length ? 0.6 + s.day_photos.length * PHOTO_POP_S + 3 : 0;
  return DAYEND_LEAD_S + Math.max(storySeconds(s.story), photos) + DAYEND_TAIL_S;
};

export const travelSeconds = (legKm: number | null) =>
  !legKm ? 0 : Math.min(3, 0.6 + 0.15 * Math.sqrt(legKm));

const f = (s: number) => Math.round(s * FPS);

export type Seg =
  | { kind: "intro"; from: number; dur: number }
  | { kind: "loopcard"; from: number; dur: number; loop: string; stopIdx: number }
  | { kind: "travel"; from: number; dur: number; stopIdx: number }
  | { kind: "stop"; from: number; dur: number; stopIdx: number; mediaAt: number[] }
  | { kind: "dayend"; from: number; dur: number; stopIdx: number }
  | { kind: "finale"; from: number; dur: number };

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type Schedule = { segs: Seg[]; total: number };

export function buildSchedule(trip: Stop[], opts: { finale: boolean }): Schedule {
  const segs: Seg[] = [];
  let t = 0;
  const push = (s: DistributiveOmit<Seg, "from">) => {
    segs.push({ ...s, from: t } as Seg);
    t += s.dur;
  };
  push({ kind: "intro", dur: f(INTRO_S) });
  trip.forEach((s, i) => {
    const prev = trip[i - 1];
    if (!prev || prev.loop !== s.loop) {
      push({ kind: "loopcard", dur: f(LOOP_CARD_S), loop: s.loop, stopIdx: i });
    } else {
      push({ kind: "travel", dur: Math.max(f(0.6), f(travelSeconds(s.leg_km))), stopIdx: i });
    }
    const mediaAt = s.media.map((_, j) => f(STOP_LEAD_S + j * STAGGER_S));
    let dur = f(EMPTY_STOP_S);
    if (s.media.length) {
      dur = mediaAt[mediaAt.length - 1] + f(HOLD_S);
      s.media.forEach((m, j) => {
        if (m.video) dur = Math.max(dur, mediaAt[j] + f(CLIP_S + 0.3));
      });
      dur += f(STOP_TAIL_S);
    }
    push({ kind: "stop", dur, stopIdx: i, mediaAt });
    if (s.day_end && (s.story || s.day_photos.length)) push({ kind: "dayend", dur: f(dayEndSeconds(s)), stopIdx: i });
  });
  if (opts.finale) push({ kind: "finale", dur: f(FINALE_S) });
  return { segs, total: t };
}

export function segmentAt(schedule: Schedule, frame: number): { seg: Seg; index: number } {
  const { segs } = schedule;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].from <= frame) lo = mid;
    else hi = mid - 1;
  }
  return { seg: segs[lo], index: lo };
}
