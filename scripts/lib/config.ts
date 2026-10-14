import fs from "node:fs";
import path from "node:path";

/** Everything about one trip lives in a single folder (default: ./my-trip). */
export const ROOT = path.resolve(import.meta.dirname, "../..");

export function tripDir(): string {
  const i = process.argv.indexOf("--trip");
  const dir = i > 0 ? process.argv[i + 1] : process.env.TRIP_DIR || "my-trip";
  return path.resolve(ROOT, dir);
}

export const paths = (trip: string) => ({
  trip,
  config: path.join(trip, "trip.config.json"),
  story: path.join(trip, "story.json"),
  overrides: path.join(trip, "overrides.json"),
  photos: path.join(trip, "photos"),
  notes: path.join(trip, "notes"),
  music: path.join(trip, "music"),
  finish: path.join(trip, "finish"),
  cache: path.join(trip, ".cache"),
  // generated for the video app
  media: path.join(ROOT, "public", "media"),
  publicDir: path.join(ROOT, "public"),
  data: path.join(ROOT, "src", "data"),
});

export type Rider = {
  look: "male" | "female";
  jacket: string;
  pants: string;
  helmet: string;
  hair?: string;
};

export type TripConfig = {
  title: string;
  tagline: string;
  /** "{km} km around {region}" */
  region: string;
  completeTitle: string;
  closing: string;
  /** used for video timestamps, which are stored in UTC, e.g. "+08:00" */
  timezone: string;
  targetMinutes: number;
  vehicle: { type: "scooter" | "motorcycle"; color: string; accent: string };
  riders: Rider[];
  loops: { name: string; dates: string; color: string; music?: string }[];
  intro: { n: string; text: string; sub?: string }[];
  finish: { subtitle: string; title: string; items: { file: string; caption: string }[] };
  sample: { loop: string; day: string };
  services: { osrm: string; nominatim: string; contact: string };
};

export type Story = {
  days: Record<string, string>;
  moments: Record<string, string>;
  banners: Record<string, string>;
  emoji_legs: Record<string, string[]>;
  time_fixes: Record<string, string>;
};

export type Override = {
  title?: string;
  pos?: [number, number];
  pos_from_file?: string;
  leg?: "sea";
  skip?: boolean;
};

export const DEFAULT_CONFIG: TripConfig = {
  title: "PH LOOP",
  tagline: "TWO RIDERS · ONE MOTORCYCLE",
  region: "the Philippines",
  completeTitle: "LOOP COMPLETE",
  closing: "Until the next ride! 🏍️",
  timezone: "+08:00",
  targetMinutes: 10,
  vehicle: { type: "scooter", color: "#3d4650", accent: "#2f7dd1" },
  riders: [
    { look: "male", jacket: "#1f2a36", pants: "#25344f", helmet: "#111111" },
    { look: "female", jacket: "#b03a6b", pants: "#2f3e66", helmet: "#e9edf1", hair: "#4a2c1a" },
  ],
  loops: [{ name: "Loop", dates: "", color: "#ff7a1a" }],
  intro: [],
  finish: { subtitle: "PROOF OF COMPLETION", title: "", items: [] },
  sample: { loop: "", day: "" },
  services: {
    osrm: "https://router.project-osrm.org",
    nominatim: "https://nominatim.openstreetmap.org",
    contact: "",
  },
};

const readJson = <T>(file: string, fallback: T): T =>
  fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback;

export function loadConfig(trip: string): TripConfig {
  const p = paths(trip);
  if (!fs.existsSync(p.config)) {
    throw new Error(`No trip.config.json in ${trip}. Run "npm run setup" first.`);
  }
  const c = readJson<Partial<TripConfig>>(p.config, {});
  return {
    ...DEFAULT_CONFIG,
    ...c,
    vehicle: { ...DEFAULT_CONFIG.vehicle, ...c.vehicle },
    finish: { ...DEFAULT_CONFIG.finish, ...c.finish },
    sample: { ...DEFAULT_CONFIG.sample, ...c.sample },
    services: { ...DEFAULT_CONFIG.services, ...c.services },
  };
}

export function loadStory(trip: string): Story {
  const s = readJson<Partial<Story>>(paths(trip).story, {});
  return { days: {}, moments: {}, banners: {}, emoji_legs: {}, time_fixes: {}, ...s };
}

/** keys starting with "_" are comments */
export function loadOverrides(trip: string): Record<string, Override> {
  const o = readJson<Record<string, Override>>(paths(trip).overrides, {});
  return Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_")));
}

export function readCache<T>(trip: string, name: string): T {
  return readJson(path.join(paths(trip).cache, name), {} as T);
}

export function writeCache(trip: string, name: string, data: unknown) {
  const dir = paths(trip).cache;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 1));
}

/** "Day 10 - 11" -> [10, 11] */
export const dayNumbers = (name: string) => (name.match(/\d+/g) ?? []).map(Number);

export const dayKey = (loop: string, day: string) => `${loop} / ${day}`;
export const stopKey = (loop: string, day: string, stop: number) => `${loop} / ${day} / ${stop}`;
