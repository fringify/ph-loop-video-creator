/**
 * Step 2: pins, place names, merged stops, road/ferry routes and odometer distances.
 * Network lookups are cached in <trip>/.cache so reruns are instant.
 */
import { loadOverrides, readCache, stopKey, TripConfig, writeCache } from "./config";
import { clockMinutes, fmtClock, km, LatLon, pathKm, simplify, sleep } from "./geo";
import { Manifest, ManifestMedia } from "./manifest";

export type Leg = { mode: "road" | "sea"; points: LatLon[] }[];

export type TimelineStop = {
  id: number;
  loop: string;
  day: string;
  stop: number;
  title: string;
  custom_title: boolean;
  desc: string | null;
  place: string | null;
  on_ferry: boolean;
  force_sea: boolean;
  km: number | null;
  arrived: string | null;
  clock: number | null;
  clock_from_notes: boolean;
  time: string | null;
  departed_clock: number | null;
  pos: LatLon;
  labels: string[];
  media: ManifestMedia[];
  overnight: boolean;
  leg: Leg | null;
  leg_km: number | null;
  count_km: number;
  day_end: boolean;
};

const UA = (c: TripConfig) => `ph-loop-video-creator/1.0${c.services.contact ? ` (${c.services.contact})` : ""}`;

async function get(url: string, config: TripConfig, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { "User-Agent": UA(config), ...(init.headers ?? {}) } });
}

/** Google Maps link (short or full) -> [lat, lon] */
async function resolveLink(url: string, cache: Record<string, LatLon | null>, config: TripConfig) {
  const parse = (u: string): LatLon | null => {
    const m = u.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/) ?? u.match(/@(-?[\d.]+),(-?[\d.]+)/) ?? u.match(/[?&]q=(-?[\d.]+),(-?[\d.]+)/);
    return m ? [+m[1], +m[2]] : null;
  };
  if (parse(url)) return parse(url);
  if (!(url in cache)) {
    try {
      const res = await get(url, config, { method: "HEAD", redirect: "follow" });
      cache[url] = parse(res.url);
    } catch {
      cache[url] = null;
    }
    await sleep(300);
  }
  return cache[url];
}

/** "Town, Province" via OpenStreetMap Nominatim (max 1 request a second, per their policy) */
async function placeName(pos: LatLon, cache: Record<string, string | null>, config: TripConfig) {
  const key = `${pos[0].toFixed(3)},${pos[1].toFixed(3)}`;
  if (!(key in cache)) {
    const q = new URLSearchParams({ lat: String(pos[0]), lon: String(pos[1]), format: "jsonv2", zoom: "12", "accept-language": "en" });
    try {
      const a = (await (await get(`${config.services.nominatim}/reverse?${q}`, config)).json()).address ?? {};
      const town = a.city ?? a.town ?? a.municipality ?? a.village ?? a.county;
      const prov = a.province ?? a.state;
      cache[key] = [town, prov].filter(Boolean).join(", ") || null;
    } catch {
      return null; // offline: not cached, retried next run
    }
    await sleep(1100);
  }
  return cache[key];
}

/** driving route; OSRM marks ferry steps, which become sea legs */
async function route(a: LatLon, b: LatLon, cache: Record<string, Leg>, config: TripConfig): Promise<Leg> {
  const key = `${a[0].toFixed(5)},${a[1].toFixed(5)}>${b[0].toFixed(5)},${b[1].toFixed(5)}`;
  if (!(key in cache)) {
    const url = `${config.services.osrm}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=false&steps=true&geometries=geojson`;
    let data: any;
    try {
      data = await (await get(url, config)).json();
    } catch {
      data = { code: "Error" };
    }
    if (data.code !== "Ok" && data.code !== "NoRoute") {
      console.warn(`  ! route lookup failed (${data.code}), drawing a straight line`);
      return [{ mode: "road", points: [a, b] }]; // not cached, retried next run
    }
    const segs: Leg = [];
    if (data.code === "Ok") {
      for (const step of data.routes[0].legs[0].steps) {
        const mode = step.mode === "ferry" ? "sea" : "road";
        const pts = step.geometry.coordinates.map(([lon, lat]: number[]) => [+lat.toFixed(5), +lon.toFixed(5)] as LatLon);
        const last = segs[segs.length - 1];
        if (last?.mode === mode) last.points.push(...pts.slice(1));
        else segs.push({ mode, points: pts });
      }
    } else {
      segs.push({ mode: "sea", points: [a, b] });
    }
    cache[key] = segs;
    await sleep(1000);
  }
  const segs: Leg = cache[key].map((g) => ({ ...g, points: [...g.points] }));
  // connect the pins to where OSRM snapped; a long gap is water it couldn't route
  const gapA = km(a, segs[0].points[0]);
  const gapB = km(b, segs[segs.length - 1].points.at(-1)!);
  if (gapA > 0.05) segs.unshift({ mode: gapA > 10 ? "sea" : "road", points: [a, segs[0].points[0]] });
  if (gapB > 0.05) segs.push({ mode: gapB > 10 ? "sea" : "road", points: [segs[segs.length - 1].points.at(-1)!, b] });
  return segs;
}

/** earliest photo time at a stop, ignoring stragglers with odd dates (re-exports, edits) */
function photoArrival(media: ManifestMedia[]): number | null {
  const t = media.filter((m) => !m.video && m.clock != null && m.date)
    .map((m) => Date.parse(`${m.date}T00:00:00Z`) / 60000 + m.clock!)
    .sort((x, y) => x - y);
  if (!t.length) return null;
  const mid = t[t.length >> 1];
  const first = t.find((x) => Math.abs(mid - x) < 360)!;
  return ((first % 1440) + 1440) % 1440;
}

export async function buildTimeline(trip: string, manifest: Manifest, config: TripConfig): Promise<TimelineStop[]> {
  const overrides = loadOverrides(trip);
  const links = readCache<Record<string, LatLon | null>>(trip, "links.json");
  const places = readCache<Record<string, string | null>>(trip, "places.json");
  const routes = readCache<Record<string, Leg>>(trip, "routes.json");
  let timeline: (Omit<TimelineStop, "pos"> & { pos: LatLon | null })[] = [];

  try {
    for (const loop of manifest) {
      for (const day of loop.days) {
        for (const [i, s] of day.stops.entries()) {
          const key = stopKey(loop.loop, day.day, s.stop);
          const ov = overrides[key] ?? {};
          if (ov.skip) continue;
          let pos: LatLon | null = s.pin ?? (s.link ? await resolveLink(s.link, links, config) : null);
          const photoPos: LatLon | null = s.lat != null ? [s.lat, s.lon!] : null;
          // a pin far from where the photos were taken is usually a copy-pasted link
          if (pos && photoPos && km(pos, photoPos) > 20) {
            console.warn(`  ! ${key}: pin is ${km(pos, photoPos).toFixed(0)} km from the photos, using photo GPS`);
            pos = photoPos;
          }
          pos = pos ?? photoPos;
          if (ov.pos_from_file) {
            const m = s.media.find((x) => x.file.endsWith(`/${ov.pos_from_file}`));
            if (m?.lat != null) pos = [m.lat, m.lon!];
          }
          if (ov.pos) pos = ov.pos;
          const title = ov.title ?? s.name;
          const noteClock = clockMinutes(s.arrived);
          const clock = noteClock ?? photoArrival(s.media);
          const stop = {
            id: 0, loop: loop.loop, day: day.day, stop: s.stop,
            title, custom_title: !!title, desc: s.desc, place: null,
            // "In the ferry going to ..." / "Ferry onboard": no pin of their own
            on_ferry: !!title && !s.link && !s.pin && /ferry|roro|onboard|boat/i.test(title),
            force_sea: ov.leg === "sea",
            km: s.km, arrived: s.arrived, clock, clock_from_notes: noteClock != null,
            time: clock != null ? fmtClock(clock) : null, departed_clock: null,
            pos, labels: s.media.map((m) => m.label).filter((l): l is string => !!l),
            media: s.media, overnight: false, leg: null, leg_km: null, count_km: 0, day_end: false,
          };
          const prev = timeline.at(-1);
          // first stop of a day at the same place as last night's stop -> one overnight stop
          if (i === 0 && prev && prev.loop === stop.loop && pos && prev.pos && km(prev.pos, pos) < 2) {
            prev.overnight = true;
            prev.media.push(...stop.media);
            prev.title ||= stop.title;
            prev.departed_clock = stop.clock;
            continue;
          }
          timeline.push(stop);
        }
      }
    }

    // stops with no pin and no GPS photos: halfway between neighbours
    timeline.forEach((s, i) => {
      if (s.pos) return;
      const a = timeline[i - 1]?.pos ?? timeline[i + 1]?.pos;
      const b = timeline[i + 1]?.pos ?? a;
      if (!a || !b) throw new Error(`Can't place ${stopKey(s.loop, s.day, s.stop)}: add "- pin: lat, lon" to its notes`);
      s.pos = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    });

    for (const s of timeline) {
      s.place = await placeName(s.pos!, places, config);
      s.title ||= s.place ?? `Stop ${s.stop}`;
    }

    // unnamed stops next to each other in the same town become one stop
    const merged: typeof timeline = [];
    for (const s of timeline) {
      const p = merged.at(-1);
      if (p && !s.custom_title && p.loop === s.loop &&
          (km(p.pos!, s.pos!) < 0.5 || (!p.custom_title && p.place && p.place === s.place && km(p.pos!, s.pos!) < 15))) {
        p.media.push(...s.media);
        p.labels.push(...s.labels);
        p.overnight ||= s.overnight;
        continue;
      }
      merged.push(s);
    }
    timeline = merged;

    for (let i = 1; i < timeline.length; i++) {
      const a = timeline[i - 1];
      const b = timeline[i];
      if (a.loop !== b.loop) continue;
      const sea = b.force_sea || a.on_ferry || b.on_ferry;
      const segs = sea ? [{ mode: "sea" as const, points: [a.pos!, b.pos!] }] : await route(a.pos!, b.pos!, routes, config);
      b.leg = segs.map((g) => ({ mode: g.mode, points: simplify(g.points) }));
      const road = segs.filter((g) => g.mode === "road").reduce((t, g) => t + pathKm(g.points), 0);
      const water = segs.filter((g) => g.mode === "sea").reduce((t, g) => t + pathKm(g.points), 0);
      b.leg_km = +(road + water).toFixed(1);
      // odometer: ferry crossings don't count; else the notes' km, else the routed km
      b.count_km = water > road ? 0 : b.km ?? +road.toFixed(1);
    }
    timeline.forEach((s, i) => {
      const n = timeline[i + 1];
      s.day_end = !n || n.loop !== s.loop || n.day !== s.day;
      s.id = i;
    });
  } finally {
    writeCache(trip, "links.json", links);
    writeCache(trip, "places.json", places);
    writeCache(trip, "routes.json", routes);
  }
  return timeline as TimelineStop[];
}
