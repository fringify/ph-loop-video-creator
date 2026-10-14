export type LatLon = [number, number];

/** great-circle distance in km */
export function km(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * r) / 2) ** 2 +
    Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export const pathKm = (pts: LatLon[]) => pts.slice(1).reduce((a, p, i) => a + km(pts[i], p), 0);

/** drop points closer than tol km to the last kept one */
export function simplify(points: LatLon[], tol = 0.15): LatLon[] {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (const p of points.slice(1, -1)) if (km(out[out.length - 1], p) >= tol) out.push(p);
  out.push(points[points.length - 1]);
  return out;
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** "5:05 AM" -> 305, "01:00 AM (Next Day)" -> 1500 */
export function clockMinutes(text: string | null | undefined): number | null {
  const m = text?.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  const h = (+m[1] % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + +m[2] + (/next day/i.test(text!) ? 1440 : 0);
}

export function fmtClock(minutes: number): string {
  const h = Math.floor((minutes % 1440) / 60);
  const mm = minutes % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
