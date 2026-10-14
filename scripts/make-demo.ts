/**
 * npm run demo
 * Draws placeholder "postcard" photos for the sample trip in examples/demo-trip,
 * so you can try the whole pipeline without your own pictures.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "./lib/config";
import { parseNotes } from "./lib/manifest";

const TRIP = path.join(ROOT, "examples", "demo-trip");
const LOOP = "Mini Loop";
/** photos per stop, per day */
const COUNTS: Record<string, number[]> = { "Day 1": [2, 4, 2, 3, 2, 3], "Day 2": [2, 1, 2, 1, 3, 2] };

const SKIES = [
  ["#ffb36b", "#ff6f61"], ["#7ec8f2", "#2f80c0"], ["#ffd38a", "#f08a5d"],
  ["#9be7c4", "#3aa17e"], ["#c3a6ff", "#6b5bd2"], ["#ffe29a", "#ffa99f"],
];

function postcard(title: string, sub: string, seed: number, portrait: boolean) {
  const [w, h] = portrait ? [900, 1200] : [1200, 900];
  const [top, bottom] = SKIES[seed % SKIES.length];
  const hill = (y: number, amp: number, color: string, phase: number) => {
    let d = `M0 ${h}`;
    for (let x = 0; x <= w; x += 40) d += ` L${x} ${y + Math.sin((x / w) * Math.PI * 2 + phase) * amp + Math.sin(x / 70 + phase) * amp * 0.25}`;
    return `<path d="${d} L${w} ${h} Z" fill="${color}"/>`;
  };
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * (0.2 + (seed % 5) * 0.15)}" cy="${h * 0.28}" r="${h * 0.09}" fill="#fff6d5" opacity="0.9"/>
    ${hill(h * 0.58, h * 0.06, "#2d5d4f", seed)}
    ${hill(h * 0.68, h * 0.05, "#1f4038", seed * 2.1)}
    ${hill(h * 0.8, h * 0.03, "#2a6f97", seed * 0.7)}
    <rect x="0" y="${h - 190}" width="${w}" height="190" fill="rgba(0,0,0,0.35)"/>
    <text x="${w / 2}" y="${h - 110}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="700" fill="#fff">${esc(title)}</text>
    <text x="${w / 2}" y="${h - 50}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="#fff" opacity="0.85">${esc(sub)}</text>
  </svg>`;
}

let made = 0;
for (const [day, counts] of Object.entries(COUNTS)) {
  const dir = path.join(TRIP, "photos", LOOP, day);
  fs.mkdirSync(dir, { recursive: true });
  const { stops } = parseNotes(path.join(TRIP, "notes", LOOP, `${day}.txt`));
  for (const [i, n] of counts.entries()) {
    const stop = i + 1;
    for (let k = 0; k < n; k++) {
      const file = path.join(dir, `${stop}.${k}.jpg`);
      if (fs.existsSync(file)) continue;
      const svg = postcard(stops.get(stop)?.name ?? `Stop ${stop}`, `${LOOP} · ${day} · sample photo ${k + 1}`, stop * 7 + k * 3 + day.length, k % 3 === 2);
      await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toFile(file);
      made++;
    }
  }
}

const finish = path.join(TRIP, "finish");
fs.mkdirSync(finish, { recursive: true });
for (const [name, title] of [["medal.jpg", "Finisher medal"], ["shirt.jpg", "Finisher shirt"]]) {
  const file = path.join(finish, name);
  if (!fs.existsSync(file)) {
    await sharp(Buffer.from(postcard(title, "sample photo", name.length, true))).jpeg({ quality: 80 }).toFile(file);
    made++;
  }
}
console.log(`Demo photos ready (${made} new) in examples/demo-trip`);
