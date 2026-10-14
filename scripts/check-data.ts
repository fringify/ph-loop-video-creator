/** Runs before studio/sample/render: the video needs "npm run build" (or "npm run demo") first. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/config";

for (const f of ["trip.json", "meta.json"]) {
  if (!fs.existsSync(path.join(ROOT, "src", "data", f))) {
    console.error('\nNo trip data yet. Run "npm run build" for your trip (or "npm run demo" for the sample) first.\n');
    process.exit(1);
  }
}
