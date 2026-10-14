/**
 * npm run build [-- --trip path/to/trip]
 * Reads your trip folder and prepares everything the video needs.
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig, paths, tripDir } from "./lib/config";
import { buildManifest } from "./lib/manifest";
import { prepare } from "./lib/prepare";
import { buildTimeline } from "./lib/timeline";

const trip = tripDir();
const config = loadConfig(trip);
const cache = paths(trip).cache;
fs.mkdirSync(cache, { recursive: true });

console.log(`\n1/3 Reading photos and notes in ${path.relative(process.cwd(), trip) || "."}`);
const manifest = await buildManifest(trip, config);
fs.writeFileSync(path.join(cache, "manifest.json"), JSON.stringify(manifest, null, 1));

console.log("2/3 Placing pins and routing (first run looks things up online, ~1 s per stop)");
const timeline = await buildTimeline(trip, manifest, config);
fs.writeFileSync(path.join(cache, "timeline.json"), JSON.stringify(timeline, null, 1));
console.log(`  ${timeline.length} stops`);

console.log("3/3 Choosing and converting photos");
await prepare(trip, timeline, config);

console.log("\nDone. Next:\n  npm run studio   preview in the browser\n  npm run sample   render a ~1 minute sample\n  npm run render   render the full video\n");
