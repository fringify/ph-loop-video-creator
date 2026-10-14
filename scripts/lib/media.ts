import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";
// @ts-expect-error no types published
import heicConvert from "heic-convert";
import { ROOT } from "./config";

export const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"]);
export const VIDEO_EXT = new Set([".mov", ".mp4", ".m4v"]);
export const isVideo = (f: string) => VIDEO_EXT.has(path.extname(f).toLowerCase());
export const isMedia = (f: string) => isVideo(f) || PHOTO_EXT.has(path.extname(f).toLowerCase());

export type MediaMeta = {
  lat: number | null;
  lon: number | null;
  /** minutes after local midnight when it was taken, plus the local date "YYYY-MM-DD" */
  clock: number | null;
  date: string | null;
};

/** ffmpeg/ffprobe: the system ones if installed, else the copies that ship with Remotion */
function tool(name: "ffmpeg" | "ffprobe"): [string, string[]] {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", [name]);
  if (which.status === 0) return [name, []];
  return [process.platform === "win32" ? "npx.cmd" : "npx", ["remotion", name]];
}

export function run(name: "ffmpeg" | "ffprobe", args: string[]) {
  const [cmd, pre] = tool(name);
  const r = spawnSync(cmd, [...pre, ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${name} failed: ${r.stderr?.slice(-500)}`);
  return r.stdout;
}

const parseExifDate = (s: string | undefined) => {
  // "2025:11:30 23:13:37" is the camera's local time, which is what the video shows
  const m = s?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, clock: +m[4] * 60 + +m[5] } : null;
};

export async function readMeta(file: string, timezone: string): Promise<MediaMeta> {
  if (isVideo(file)) {
    const out = run("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "json", file]);
    const tags: Record<string, string> = JSON.parse(out).format?.tags ?? {};
    const iso = tags["com.apple.quicktime.location.ISO6709"] ?? tags["location"] ?? "";
    const g = iso.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
    let clock = null;
    let date = null;
    const created = tags["com.apple.quicktime.creationdate"] ?? tags["creation_time"];
    if (created) {
      const t = new Date(created);
      const [, sign, hh, mm] = timezone.match(/([+-])(\d{2}):?(\d{2})/) ?? ["", "+", "00", "00"];
      const local = new Date(t.getTime() + (sign === "-" ? -1 : 1) * (+hh * 60 + +mm) * 60000);
      date = local.toISOString().slice(0, 10);
      clock = local.getUTCHours() * 60 + local.getUTCMinutes();
    }
    return { lat: g ? +g[1] : null, lon: g ? +g[2] : null, clock, date };
  }
  try {
    const x = await exifr.parse(file, { gps: true, reviveValues: false, pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude", "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef"] });
    const gps = await exifr.gps(file).catch(() => null);
    const d = parseExifDate(x?.DateTimeOriginal ?? x?.CreateDate);
    return { lat: gps?.latitude ?? null, lon: gps?.longitude ?? null, clock: d?.clock ?? null, date: d?.date ?? null };
  } catch {
    return { lat: null, lon: null, clock: null, date: null };
  }
}

/** photo -> upright JPEG no bigger than `size` px */
export async function convertPhoto(src: string, dst: string, size: number) {
  if (fs.existsSync(dst)) return;
  let input: Buffer = fs.readFileSync(src);
  if ([".heic", ".heif"].includes(path.extname(src).toLowerCase())) {
    input = Buffer.from(await heicConvert({ buffer: input, format: "JPEG", quality: 0.92 }));
  }
  await sharp(input).rotate().resize(size, size, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(dst);
}

/** video -> short muted H.264 clip */
export function convertClip(src: string, dst: string, seconds: number) {
  if (fs.existsSync(dst)) return;
  const dur = parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src])) || 0;
  const start = Math.max(0, Math.min(1, dur - seconds));
  run("ffmpeg", [
    "-v", "error", "-y", "-ss", start.toFixed(2), "-i", src, "-t", String(seconds), "-an",
    "-vf", "scale='if(gt(iw,ih),1280,-2)':'if(gt(iw,ih),-2,1280)',fps=30",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-movflags", "+faststart", dst,
  ]);
}
