/**
 * npm run setup
 * Asks a few questions, writes trip.config.json and creates the trip folder layout.
 * Safe to run again: your answers become the defaults and nothing you added is deleted.
 */
import fs from "node:fs";
import path from "node:path";
import { input, number, select } from "@inquirer/prompts";
import { DEFAULT_CONFIG, paths, ROOT, Rider, TripConfig } from "./lib/config";

const COLORS: Record<string, string> = {
  black: "#1f2a36", navy: "#25344f", grey: "#3d4650", white: "#e9edf1", red: "#c62f2f",
  pink: "#b03a6b", orange: "#e0701c", yellow: "#e8b923", green: "#2f7d4f", blue: "#2f6fd1", purple: "#6b3fa0",
};
const LOOP_COLORS = ["#ff7a1a", "#ffd23d", "#4dd0e1", "#ff5c8a", "#9be15d", "#b388ff"];
const colorChoices = Object.keys(COLORS).map((c) => ({ name: c, value: COLORS[c] }));
const nameOf = (hex: string) => Object.keys(COLORS).find((c) => COLORS[c] === hex);

console.log("\nPH Loop video creator — trip setup\nPress Enter to keep the value in brackets.\n");

const dir = await input({ message: "Trip folder", default: "my-trip" });
const trip = path.resolve(ROOT, dir);
const p = paths(trip);
const old: TripConfig = fs.existsSync(p.config)
  ? { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(p.config, "utf8")) }
  : DEFAULT_CONFIG;

const title = await input({ message: "Video title (big text in the intro)", default: old.title });

const vehicleType = await select({
  message: "What did you ride?",
  default: old.vehicle.type,
  choices: [
    { name: "Scooter (NMAX, ADV, PCX, Aerox, Click…)", value: "scooter" as const },
    { name: "Motorcycle (sport, naked, underbone, adventure…)", value: "motorcycle" as const },
  ],
});
const vehicleColor = await select({ message: "Vehicle colour", choices: colorChoices, default: old.vehicle.color });

const riderCount = await select({
  message: "How many people on the bike?",
  default: (old.riders.length === 1 ? 1 : 2) as 1 | 2,
  choices: [{ name: "1 — solo", value: 1 }, { name: "2 — rider + passenger", value: 2 }],
});

async function askRider(label: string, prev: Rider | undefined, fallback: Rider): Promise<Rider> {
  const base = prev ?? fallback;
  const look = await select({
    message: `${label}: look`,
    default: base.look,
    choices: [{ name: "Male", value: "male" as const }, { name: "Female (ponytail)", value: "female" as const }],
  });
  const jacket = await select({ message: `${label}: jacket colour`, choices: colorChoices, default: nameOf(base.jacket) ? base.jacket : undefined });
  const helmet = await select({ message: `${label}: helmet colour`, choices: colorChoices, default: nameOf(base.helmet) ? base.helmet : undefined });
  return { look, jacket, helmet, pants: base.pants, ...(look === "female" ? { hair: base.hair ?? "#4a2c1a" } : {}) };
}
const riders = [await askRider("Rider (driver)", old.riders[0], DEFAULT_CONFIG.riders[0])];
if (riderCount === 2) riders.push(await askRider("Passenger", old.riders[1], DEFAULT_CONFIG.riders[1]));

const vehicleWord = vehicleType === "scooter" ? "SCOOTER" : "MOTORCYCLE";
const tagline = await input({
  message: "Line above the title",
  default: old.tagline !== DEFAULT_CONFIG.tagline ? old.tagline : `${riderCount === 2 ? "TWO RIDERS" : "ONE RIDER"} · ONE ${vehicleWord}`,
});
const region = await input({ message: 'Where? (shown as "1,234 km around …")', default: old.region });

const loopCount = (await number({
  message: "How many parts was the trip split into? (e.g. South Loop + North Loop = 2)",
  default: old.loops.length || 1, min: 1, max: 6,
})) ?? 1;
const loops: TripConfig["loops"] = [];
for (let i = 0; i < loopCount; i++) {
  const prev = old.loops[i];
  console.log(`\nPart ${i + 1}`);
  const name = await input({ message: "  Name (also the photos folder name)", default: prev?.name ?? (loopCount === 1 ? "Loop" : `Part ${i + 1}`) });
  const dates = await input({ message: "  Dates (free text, e.g. Dec 1 – 11, 2025)", default: prev?.dates ?? "" });
  const music = await input({ message: "  Song for this part: a word from the file name in music/ (blank = none)", default: prev?.music ?? "" });
  loops.push({ name, dates, color: prev?.color ?? LOOP_COLORS[i % LOOP_COLORS.length], ...(music ? { music } : {}) });
}

console.log("");
const targetMinutes = (await number({ message: "Target video length in minutes", default: old.targetMinutes, min: 2, max: 30 })) ?? 10;
const closing = await input({ message: "Closing message at the very end", default: old.closing });
const timezone = await input({ message: "Time zone of the trip (for video timestamps)", default: old.timezone });
const contact = await input({
  message: "Your email (optional; sent to the free map services so they can contact you about heavy use)",
  default: old.services.contact,
});

const config: TripConfig = {
  ...old, title, tagline, region, closing, timezone, targetMinutes,
  vehicle: { ...old.vehicle, type: vehicleType, color: vehicleColor },
  riders, loops,
  sample: old.sample.loop ? old.sample : { loop: loops[0].name, day: "Day 1" },
  services: { ...old.services, contact },
};

// ---------- folders and templates (never overwrites your files) ----------
const write = (file: string, text: string) => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, text);
};
for (const d of [p.trip, p.music, p.finish]) fs.mkdirSync(d, { recursive: true });
for (const l of loops) {
  fs.mkdirSync(path.join(p.photos, l.name, "Day 1"), { recursive: true });
  fs.mkdirSync(path.join(p.notes, l.name), { recursive: true });
  write(path.join(p.notes, l.name, "Day 1.txt"), fs.readFileSync(path.join(ROOT, "templates", "Day 1.txt"), "utf8"));
}
write(p.story, fs.readFileSync(path.join(ROOT, "templates", "story.json"), "utf8"));
write(p.overrides, fs.readFileSync(path.join(ROOT, "templates", "overrides.json"), "utf8"));
fs.writeFileSync(p.config, JSON.stringify(config, null, 2) + "\n");

const rel = path.relative(process.cwd(), trip) || ".";
console.log(`\nSaved ${path.join(rel, "trip.config.json")}\n`);
console.log(`Next:
  1. Put photos in ${path.join(rel, "photos", "<part name>", "Day N")}/  (name them 1.0.jpg, 1.1.jpg, 2.0.jpg …)
  2. Write notes in ${path.join(rel, "notes", "<part name>", "Day N.txt")}  (see the example there)
  3. Songs in ${path.join(rel, "music")}/, finisher photos in ${path.join(rel, "finish")}/ (optional)
  4. npm run build${dir === "my-trip" ? "" : ` -- --trip ${dir}`}

Format guide: docs/FORMAT.md
`);
