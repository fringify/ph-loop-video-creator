import tripJson from "./data/trip.json";
import metaJson from "./data/meta.json";

export type Media = { src: string; video: boolean; from: string };
export type LegSegment = { mode: "road" | "sea"; points: [number, number][] };
export type Stop = {
  id: number;
  loop: string;
  day: string;
  stop: number;
  title: string | null;
  place: string | null;
  custom_title: boolean;
  label: string | null;
  arrived: string | null;
  time: string | null;
  clock: number | null;
  departed_clock: number | null;
  time_from_notes: boolean;
  overnight: boolean;
  major: boolean;
  km: number | null;
  leg_km: number | null;
  pos: [number, number];
  leg: LegSegment[] | null;
  media: Media[];
  count_km: number;
  on_ferry: boolean;
  day_end: boolean;
  moment: string | null;
  banner: string | null;
  emoji: string[] | null;
  story: string | null;
  day_photos: string[];
};

export const TRIP = tripJson as unknown as Stop[];

export type Rider = { look: "male" | "female"; jacket: string; pants: string; helmet: string; hair?: string };
export type Meta = {
  title: string;
  tagline: string;
  region: string;
  completeTitle: string;
  closing: string;
  vehicle: { type: "scooter" | "motorcycle"; color: string; accent: string };
  riders: Rider[];
  loops: { name: string; dates: string; color: string; music: string | null }[];
  intro: { n: string; text: string; sub?: string }[];
  finish: { subtitle: string; title: string; items: { src: string; caption: string }[] };
  sample: { loop: string; day: string };
};
export const META = metaJson as unknown as Meta;

/** per-loop colour, dates and part number ("Part 1") */
export const LOOP_META: Record<string, { part: number; dates: string; color: string; music: string | null }> =
  Object.fromEntries(META.loops.map((l, i) => [l.name, { part: i + 1, dates: l.dates, color: l.color, music: l.music }]));

/** "Day 10 - 11" -> 11 */
export const lastDayNumber = (day: string) => Math.max(...(day.match(/\d+/g) ?? ["0"]).map(Number));

/** km ridden into this stop for the odometer (notes figure, else routed; ferries count 0) */
export const legKm = (s: Stop) => s.count_km;

export const INTRO_WORDS = META.intro;
export const FINISH = META.finish;
