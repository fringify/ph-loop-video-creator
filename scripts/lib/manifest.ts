/**
 * Step 1: scan photos + day notes and group everything into stops.
 *
 * File naming (the first number is the stop within that day):
 *   dotted:     2.0.jpg, 2.1.jpg, 2.10.jpg   -> stop 2
 *   two-digit:  10.jpg, 11.jpg, 100.jpg       -> stop 1, stop 1, stop 10
 *   anything after the number is a caption:   "38 S - vessel down.mov"
 */
import fs from "node:fs";
import path from "node:path";
import { dayNumbers, paths, TripConfig } from "./config";
import { median } from "./geo";
import { isMedia, readMeta } from "./media";

export type NoteStop = {
  name: string;
  desc: string | null;
  km: number | null;
  arrived: string | null;
  link: string | null;
  pin: [number, number] | null;
};

export type ManifestMedia = {
  file: string; // relative to the trip folder
  index: number;
  label: string | null;
  video: boolean;
  lat: number | null;
  lon: number | null;
  clock: number | null;
  date: string | null;
};

export type ManifestStop = NoteStop & { stop: number; lat: number | null; lon: number | null; media: ManifestMedia[] };
export type ManifestDay = { day: string; stops: ManifestStop[]; story: string | null };
export type Manifest = { loop: string; days: ManifestDay[] }[];

/** "Motorshop. Natuyuan kami ng langis." -> ["Motorshop", "Natuyuan kami ng langis."] */
export function cleanTitle(raw: string): [string, string | null] {
  let t = raw.replace(/\bno picture\b/gi, "");
  t = t.replace(/\(?\s*hotel for day \d+\s*\)?\s*-?/gi, "");
  t = t.replace(/-\s*sleep for day \d+/gi, "");
  t = t.replace(/\(\s*(.*?)\s*\)/g, "($1)").replace(/\(\s*\)/g, "");
  t = t.replace(/\s+/g, " ").replace(/^[\s.-]+|[\s.-]+$/g, "");
  const i = t.indexOf(". ");
  return i < 0 ? [t, null] : [t.slice(0, i).trim(), t.slice(i + 2).trim() || null];
}

export function parseNotes(file: string | null): { stops: Map<number, NoteStop>; story: string | null } {
  const stops = new Map<number, NoteStop>();
  if (!file) return { stops, story: null };
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let cur: NoteStop | null = null;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (line.trim().toLowerCase() === "notes:") {
      return { stops, story: lines.slice(n + 1).join("\n").trim() || null };
    }
    const head = line.trim().match(/^(\d+)\.\s*(.+)$/);
    if (head) {
      const [name, desc] = cleanTitle(head[2]);
      cur = { name, desc, km: null, arrived: null, link: null, pin: null };
      stops.set(+head[1], cur);
      continue;
    }
    // details are indented "  - ..." lines under a numbered stop
    if (!cur || !/^\s/.test(line) || !line.trim().startsWith("-")) continue;
    const item = line.trim().slice(1).trim();
    const link = item.match(/https?:\/\/\S+/);
    const pin = item.match(/^pin\s*:?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
    if (pin) cur.pin = [+pin[1], +pin[2]];
    else if (link) cur.link = link[0];
    else if (/^(\d+)\s*(kms?\b|$)/i.test(item)) cur.km = +item.match(/^\d+/)![0];
    else if (/^zero\b/i.test(item)) cur.km = 0;
    else {
      const arr = item.match(/^(?:Arrived|Start(?: ride)?)\s*(?:at)?\s*:?\s*(.+)$/i);
      if (arr) cur.arrived = arr[1].trim();
    }
  }
  return { stops, story: null };
}

/** notes/<Loop>/<Day N>.txt (matched by the day numbers), else a Day*.txt inside the photo folder */
function notesFile(trip: string, loop: string, dayDir: string): string | null {
  const nums = dayNumbers(path.basename(dayDir)).join(",");
  const dir = path.join(paths(trip).notes, loop);
  if (fs.existsSync(dir)) {
    const hit = fs.readdirSync(dir).find((f) => f.endsWith(".txt") && dayNumbers(f).join(",") === nums);
    if (hit) return path.join(dir, hit);
  }
  const local = fs.readdirSync(dayDir).find((f) => /^day.*\.txt$/i.test(f));
  return local ? path.join(dayDir, local) : null;
}

function parseName(stem: string, dotted: boolean): [number, number, string | null] | null {
  const m = stem.match(/^(\d+)(?:\.(\d+))?\s*(.*)$/);
  if (!m) return null;
  const label = m[3].replace(/^[\s-]+|[\s-]+$/g, "") || null;
  if (dotted) return [+m[1], +(m[2] ?? 0), label];
  return [Math.floor(+m[1] / 10), +m[1] % 10, label];
}

export async function buildManifest(trip: string, config: TripConfig): Promise<Manifest> {
  const p = paths(trip);
  const manifest: Manifest = [];
  for (const loop of config.loops) {
    const loopDir = path.join(p.photos, loop.name);
    if (!fs.existsSync(loopDir)) {
      console.warn(`  ! no photos folder for "${loop.name}" (expected ${path.relative(process.cwd(), loopDir)})`);
      continue;
    }
    const dayDirs = fs.readdirSync(loopDir)
      .map((d) => path.join(loopDir, d))
      .filter((d) => fs.statSync(d).isDirectory() && dayNumbers(path.basename(d)).length)
      .sort((a, b) => dayNumbers(path.basename(a))[0] - dayNumbers(path.basename(b))[0]);
    const days: ManifestDay[] = [];
    for (const dayDir of dayDirs) {
      const notes = parseNotes(notesFile(trip, loop.name, dayDir));
      const files = fs.readdirSync(dayDir).filter(isMedia);
      const dotted = files.some((f) => /^\d+\.\d+/.test(path.parse(f).name));
      const byStop = new Map<number, ManifestMedia[]>();
      for (const f of files) {
        const parsed = parseName(path.parse(f).name, dotted);
        if (!parsed) {
          console.warn(`  ! skipped (name doesn't start with a stop number): ${f}`);
          continue;
        }
        const [stop, index, label] = parsed;
        const abs = path.join(dayDir, f);
        const meta = await readMeta(abs, config.timezone);
        const list = byStop.get(stop) ?? [];
        list.push({ file: path.relative(trip, abs), index, label, video: /\.(mov|mp4|m4v)$/i.test(f), ...meta });
        byStop.set(stop, list);
      }
      const stopNums = [...new Set([...byStop.keys(), ...notes.stops.keys()])].sort((a, b) => a - b);
      days.push({
        day: path.basename(dayDir),
        story: notes.story,
        stops: stopNums.map((n) => {
          const media = (byStop.get(n) ?? []).sort((a, b) => a.index - b.index);
          const gps = media.filter((m) => m.lat != null);
          const note = notes.stops.get(n);
          return {
            stop: n,
            name: note?.name ?? "",
            desc: note?.desc ?? null,
            km: note?.km ?? null,
            arrived: note?.arrived ?? null,
            link: note?.link ?? null,
            pin: note?.pin ?? null,
            lat: gps.length ? median(gps.map((m) => m.lat!)) : null,
            lon: gps.length ? median(gps.map((m) => m.lon!)) : null,
            media,
          };
        }),
      });
      process.stdout.write(`  ${loop.name} / ${path.basename(dayDir)}: ${files.length} files\n`);
    }
    manifest.push({ loop: loop.name, days });
  }
  return manifest;
}
