/**
 * Step 3: choose which photos/clips each stop shows so the video fits the target length,
 * convert them, and write the data files the video reads (src/data/*.json).
 * Timings mirror src/timing.ts — change both together.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dayKey, loadStory, paths, stopKey, TripConfig } from "./config";
import { clockMinutes } from "./geo";
import { convertClip, convertPhoto } from "./media";
import { TimelineStop } from "./timeline";

const STAGGER_S = 0.35;
const HOLD_S = 1.5;
const CLIP_S = 3.5;
const STOP_LEAD_S = 0.5;
const STOP_TAIL_S = 0.4;
const EMPTY_STOP_S = 1.0;
const DAYEND_LEAD_S = 1.2;
const DAYEND_TAIL_S = 1.0;
const PHOTO_POP_S = 0.12;
const MAX_PER_STOP = 6; // collage layout fits up to 6
const MAX_DAY_PHOTOS = 24;
const MAX_CLIPS = 12;
const INTRO_S = 14;
const LOOP_CARD_S = 4;
const FINALE_S = 38;

const travelSeconds = (legKm: number | null) => (!legKm ? 0 : Math.min(3, 0.6 + 0.15 * Math.sqrt(legKm)));
const storySeconds = (t: string | null) => (!t ? 0 : Math.min(20, Math.max(8, 4 + t.length / 18)));
const dayEndSeconds = (story: string | null, photos: number) =>
  DAYEND_LEAD_S + Math.max(storySeconds(story), photos ? 0.6 + photos * PHOTO_POP_S + 3 : 0) + DAYEND_TAIL_S;

function stopSeconds(media: boolean[]) {
  if (!media.length) return EMPTY_STOP_S;
  let dur = STOP_LEAD_S + (media.length - 1) * STAGGER_S + HOLD_S;
  media.forEach((video, j) => {
    if (video) dur = Math.max(dur, STOP_LEAD_S + j * STAGGER_S + CLIP_S + 0.3);
  });
  return dur + STOP_TAIL_S;
}

/** n items evenly spread over the list */
const spread = <T>(items: T[], n: number) =>
  n >= items.length ? [...items] : Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);

const isMajor = (s: TimelineStop) =>
  s.overnight || s.media.length >= 5 || s.labels.length > 0 || /checkpoint/i.test(s.title);

/** converted copies are named after the source file so reruns never mix up stops */
const mediaName = (rel: string, suffix: string) => crypto.createHash("sha1").update(rel).digest("hex").slice(0, 12) + suffix;

export async function prepare(trip: string, timeline: TimelineStop[], config: TripConfig) {
  const p = paths(trip);
  const story = loadStory(trip);
  fs.mkdirSync(p.media, { recursive: true });
  fs.mkdirSync(p.data, { recursive: true });

  const dayStory = (s: TimelineStop) => (s.day_end ? story.days[dayKey(s.loop, s.day)] ?? null : null);

  // every photo taken that day (by folder), shown together at the end of the day
  const dayPhotos = new Map<number, string[]>();
  for (const s of timeline.filter((t) => t.day_end)) {
    const prefix = path.join("photos", s.loop, s.day) + path.sep;
    const files = [...new Set(timeline.flatMap((t) => t.media).filter((m) => !m.video && m.file.startsWith(prefix)).map((m) => m.file))];
    files.sort((a, b) => parseFloat(path.basename(a)) - parseFloat(path.basename(b)));
    dayPhotos.set(s.id, spread(files, MAX_DAY_PHOTOS));
  }

  const fixed = INTRO_S + config.loops.length * LOOP_CARD_S + FINALE_S;
  const travel = timeline.reduce((a, s) => a + travelSeconds(s.leg_km), 0);
  const dayEnds = timeline.reduce((a, s) => a + (s.day_end ? dayEndSeconds(dayStory(s), dayPhotos.get(s.id)?.length ?? 0) : 0), 0);
  const budget = config.targetMinutes * 60 - fixed - travel - dayEnds;

  // clips: one per big stop (captioned ones first), capped overall
  const clipFor = new Map<number, string>();
  timeline
    .filter(isMajor)
    .flatMap((s) => {
      const vids = s.media.filter((m) => m.video);
      const labelled = vids.filter((v) => v.label);
      return vids.length ? [{ score: s.media.length + (labelled.length ? 100 : 0), id: s.id, file: (labelled[0] ?? vids[0]).file }] : [];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CLIPS)
    .forEach((c) => clipFor.set(c.id, c.file));

  // photos: 2 for small stops, more for big ones; trimmed evenly until the video fits
  const photos = new Map(timeline.map((s) => [s.id, s.media.filter((m) => !m.video).map((m) => m.file)]));
  const want = new Map(timeline.map((s) => {
    const n = photos.get(s.id)!.length;
    const room = MAX_PER_STOP - (clipFor.has(s.id) ? 1 : 0);
    return [s.id, Math.min(n, room, isMajor(s) ? 2 + Math.round(Math.sqrt(n)) : 2)];
  }));
  const total = () => timeline.reduce((a, s) => a + stopSeconds([...Array(want.get(s.id)!).fill(false), ...(clipFor.has(s.id) ? [true] : [])]), 0);
  while (total() > budget && Math.max(...want.values()) > 1) {
    const [id] = [...want.entries()].sort((a, b) => b[1] - a[1])[0];
    want.set(id, want.get(id)! - 1);
  }

  const used = new Set<string>();
  const out: object[] = [];
  let prev: { day: string; clock: number | null } | null = null;
  for (const [n, s] of timeline.entries()) {
    const key = stopKey(s.loop, s.day, s.stop);
    let { clock, time } = s;
    if (story.time_fixes[key]) {
      time = story.time_fixes[key];
      clock = clockMinutes(time);
    } else if (!s.clock_from_notes && clock != null && prev?.day === s.day && prev.clock != null && clock < prev.clock) {
      clock = time = null; // photo taken later (e.g. next morning), not an arrival time
    }

    const chosen: [string, boolean][] = spread(photos.get(s.id)!, want.get(s.id)!).map((f) => [f, false]);
    if (clipFor.has(s.id)) chosen.splice(Math.min(1, chosen.length), 0, [clipFor.get(s.id)!, true]);
    const media = [];
    for (const [rel, video] of chosen) {
      const name = mediaName(rel, video ? ".mp4" : ".jpg");
      if (video) convertClip(path.join(trip, rel), path.join(p.media, name), CLIP_S);
      else await convertPhoto(path.join(trip, rel), path.join(p.media, name), 1600);
      used.add(name);
      media.push({ src: `media/${name}`, video });
    }
    const thumbs = [];
    for (const rel of dayPhotos.get(s.id) ?? []) {
      const name = mediaName(rel, "-t.jpg");
      await convertPhoto(path.join(trip, rel), path.join(p.media, name), 700);
      used.add(name);
      thumbs.push(`media/${name}`);
    }
    const label = s.labels[0] ?? null;
    out.push({
      id: s.id, loop: s.loop, day: s.day, stop: s.stop,
      title: s.title, place: s.place, custom_title: s.custom_title,
      label: label ? label.replace(/^S\b\s*-?\s*/, "") : null,
      time, clock, departed_clock: s.departed_clock, overnight: s.overnight, major: isMajor(s),
      km: s.km, leg_km: s.leg_km, count_km: s.count_km, pos: s.pos, leg: s.leg,
      on_ferry: s.on_ferry, day_end: s.day_end, media,
      moment: story.moments[key] ?? s.desc ?? null,
      banner: story.banners[key] || null,
      emoji: story.emoji_legs[key] ?? null,
      story: dayStory(s),
      day_photos: thumbs,
    });
    prev = { day: s.day, clock };
    process.stdout.write(`\r  converting media: stop ${n + 1}/${timeline.length}   `);
  }
  process.stdout.write("\n");

  const finish = [];
  for (const item of config.finish.items) {
    const rel = path.join("finish", item.file);
    if (!fs.existsSync(path.join(trip, rel))) {
      console.warn(`  ! finish photo not found: ${rel}`);
      continue;
    }
    const name = mediaName(rel, ".jpg");
    await convertPhoto(path.join(trip, rel), path.join(p.media, name), 1400);
    used.add(name);
    finish.push({ src: `media/${name}`, caption: item.caption });
  }

  for (const f of fs.readdirSync(p.media)) if (!used.has(f)) fs.unlinkSync(path.join(p.media, f));

  // one song per loop: first file in music/ whose name contains loops[].music
  const songs = fs.existsSync(p.music) ? fs.readdirSync(p.music).filter((f) => /\.(mp3|m4a|wav|aac)$/i.test(f)) : [];
  const loops = config.loops.map((l, i) => {
    const song = l.music ? songs.find((f) => f.toLowerCase().includes(l.music!.toLowerCase())) : undefined;
    let music: string | null = null;
    if (song) {
      music = `music-${i + 1}${path.extname(song)}`;
      fs.copyFileSync(path.join(p.music, song), path.join(p.publicDir, music));
    } else if (l.music) console.warn(`  ! no file in music/ matching "${l.music}" for ${l.name}`);
    return { name: l.name, dates: l.dates, color: l.color, music };
  });

  // intro facts: yours from the config, or counted from the trip
  const ferries = timeline.filter((s, i) => s.leg?.some((g) => g.mode === "sea") && !timeline[i - 1]?.on_ferry).length;
  const days = config.loops.reduce((a, l) => {
    const nums = timeline.filter((s) => s.loop === l.name).flatMap((s) => (s.day.match(/\d+/g) ?? []).map(Number));
    return a + (nums.length ? Math.max(...nums) : 0);
  }, 0);
  const totalKm = timeline.reduce((a, s) => a + s.count_km, 0);
  const intro = config.intro.length ? config.intro : [
    { n: "1", text: config.vehicle.type },
    { n: String(config.riders.length), text: config.riders.length === 1 ? "rider" : "people" },
    { n: String(days), text: days === 1 ? "riding day" : "riding days" },
    ...(ferries ? [{ n: String(ferries), text: ferries === 1 ? "ferry ride" : "ferry rides" }] : []),
    { n: String(timeline.length), text: "stops" },
    { n: Math.round(totalKm).toLocaleString("en-US"), text: "kilometers" },
  ];

  fs.writeFileSync(path.join(p.data, "trip.json"), JSON.stringify(out));
  fs.writeFileSync(path.join(p.data, "meta.json"), JSON.stringify({
    title: config.title, tagline: config.tagline, region: config.region,
    completeTitle: config.completeTitle, closing: config.closing,
    vehicle: config.vehicle, riders: config.riders, loops, intro,
    finish: { subtitle: config.finish.subtitle, title: config.finish.title, items: finish },
    sample: config.sample,
  }, null, 1));

  const secs = fixed + travel + dayEnds + (out as { media: { video: boolean }[] }[]).reduce((a, t) => a + stopSeconds(t.media.map((m) => m.video)), 0);
  console.log(`  ${out.length} stops, ${used.size} media files, about ${(secs / 60).toFixed(1)} minutes`);
}
