# Trip folder format

Everything about one trip lives in one folder (default `my-trip/`). `npm run setup` creates it; this page explains every file.

```
my-trip/
├── trip.config.json
├── photos/<Part>/<Day folder>/<stop>.<n>.<ext>
├── notes/<Part>/<Day N>.txt
├── story.json        (optional)
├── overrides.json    (optional)
├── music/            (optional)
├── finish/           (optional)
└── .cache/           (made by npm run build: lookups and intermediate files)
```

## Keys

Several files refer to a day or a stop by name:

- **Day key**: `"<Part> / <Day folder>"`, for example `"South Loop / Day 3"` or `"South Loop / Day 10 - 11"`.
- **Stop key**: `"<Part> / <Day folder> / <stop number>"`, for example `"South Loop / Day 3 / 5"`.

The part name is a `loops[].name` from the config. The day folder name is exactly as it appears under `photos/`.

## Photos: `photos/<Part>/<Day folder>/`

- Day folders need a number in their name: `Day 1`, `Day 2`, `Day 10 - 11`. They are sorted by their first number.
- **The first number of a file name is the stop.** Each day folder uses one of two styles:
  - **Dotted**: `<stop>.<n>`, e.g. `3.0.jpg`, `3.1.HEIC`, `3.12.mov` → stop 3. Order within a stop follows `n`.
  - **Two-digit**: the number ÷ 10, e.g. `30.jpg`, `31.jpg` → stop 3; `100.jpg` → stop 10.
- Text after the number becomes the clip or photo caption: `75 S - onboarding to Caticlan.mov`. A leading `S -` (for "sea") is removed from the caption.
- Formats: `.jpg .jpeg .png .heic .heif .webp .mov .mp4 .m4v`. Other files are ignored.
- GPS and capture time are read from the files when present.

## Notes: `notes/<Part>/<Day N>.txt`

The notes file is matched to the day folder by its numbers (`Day 10-11.txt` ↔ `Day 10 - 11`). A `Day*.txt` placed inside the photo folder also works.

```text
<stop>. <Name>[. <short note>]
  - <detail>
  - <detail>

Notes:
<free text: the full story of the day>
```

Details are indented lines starting with `-`:

| Detail | Meaning |
|---|---|
| `pin: 14.5995, 120.9842` | Exact location (latitude, longitude) |
| `https://maps.app.goo.gl/…` | Google Maps share link (short or full); the location is read from it |
| `135km from previous` / `135 km` / `0` / `Zero land travel` | Distance shown and added to the odometers |
| `Arrived at 3:48 AM` / `Arrived: 3:48 AM` | Arrival time (drives the clock) |
| `Start ride: 7:23 AM` / `Start: 7:23 AM` | Departure time on a day's first stop |
| `Arrived: 01:00 AM (Next Day)` | After midnight |

Rules applied during the build:

- **Location** comes from the pin or link, else from the photos' GPS (the middle value of all of them), else halfway between the neighbouring stops. A pin more than 20 km from the photos is treated as a mistake, and the photo GPS is used instead.
- **Name**: a missing name becomes the town name ("Calapan, Oriental Mindoro"). Text after the first `. ` becomes a small note under the name. `(No picture)` and `Hotel for Day N` are removed.
- **Overnight**: if a day's first stop is at the same place as the previous day's last stop, they become one stop.
- **Ferries**: a stop named with *ferry*, *roro*, *onboard* or *boat* that has no pin of its own is "on the boat". The legs into and out of it are drawn as a straight sea crossing and count 0 km. Ferry routes the router knows about are also detected on their own.
- **Distance**: a sea crossing counts 0 km. Otherwise the notes' km is used if given, else the routed road distance.
- Lines that are not indented under a stop, and everything after `Notes:`, are not shown in the video. Put the short version in `story.json`.

## `trip.config.json`

| Field | Example | Meaning |
|---|---|---|
| `title` | `"PH LOOP"` | Big intro title |
| `tagline` | `"TWO RIDERS · ONE SCOOTER"` | Line above the title |
| `region` | `"the Philippines"` | "N km around …" under the title |
| `completeTitle` | `"LOOP COMPLETE"` | Heading of the totals card |
| `closing` | `"Until the next ride! 🏍️"` | Last line of the totals card |
| `timezone` | `"+08:00"` | Used for video timestamps, which phones save in UTC |
| `targetMinutes` | `10` | Photos per stop are reduced until the video fits |
| `vehicle.type` | `"scooter"` or `"motorcycle"` | Which drawing to use |
| `vehicle.color`, `vehicle.accent` | `"#3d4650"`, `"#2f7dd1"` | Body and stripe colours |
| `riders` | 1 or 2 objects | `look` (`male`/`female`), `jacket`, `pants`, `helmet`, `hair` colours. The first is the driver. |
| `loops` | `[{ "name", "dates", "color", "music" }]` | Parts of the trip in order. `name` = photos/notes folder; `music` = a word from a file name in `music/` |
| `intro` | `[{ "n": "6", "text": "ferry rides" }]` | Intro facts. Leave empty `[]` to count them from the trip. `sub` adds small text. |
| `finish` | `{ "subtitle", "title", "items": [{ "file", "caption" }] }` | Closing photos from `finish/` |
| `sample` | `{ "loop": "South Loop", "day": "Day 3" }` | Which day `npm run sample` renders |
| `services` | `osrm`, `nominatim`, `contact` | Routing and town-name servers; `contact` is added to the User-Agent |

## `story.json` (optional)

```json
{
  "days":       { "<day key>": "Shown at the end of the day next to all of the day's photos." },
  "moments":    { "<stop key>": "Small note under the stop name (replaces the note from the name)" },
  "banners":    { "<stop key>": "Big pop-up text on arrival" },
  "emoji_legs": { "<stop key>": ["🏍️", "💨"] },
  "time_fixes": { "<stop key>": "6:30 PM" }
}
```

- Day stories stay on screen for about 18 characters per second (8–20 s), so they can be a few sentences long.
- `emoji_legs` floats emojis up from the riders on the ride **into** that stop. It's good for long stretches with no photos.
- An empty string hides an entry.

## `overrides.json` (optional)

```json
{
  "South Loop / Day 1 / 3": { "title": "Calapan Port", "pos": [13.4234, 121.193], "leg": "sea" },
  "North Loop / Day 3 / 7": { "pos_from_file": "70.jpg" },
  "South Loop / Day 4 / 2": { "skip": true }
}
```

| Field | Meaning |
|---|---|
| `title` | Replace the stop name |
| `pos` | Exact `[lat, lon]` |
| `pos_from_file` | Use the GPS of one photo in that stop (when photos from elsewhere are mixed in) |
| `leg: "sea"` | Draw the way **into** this stop as a straight ferry crossing |
| `skip` | Leave the stop out |

Keys starting with `_` are comments.

## Music: `music/`

`.mp3`, `.m4a`, `.wav` or `.aac`. Each part plays the first file whose name contains its `loops[].music` word, on repeat, and crossfades into the next part's song at that part's title card. A part without a song is silent.

## Finish photos: `finish/`

Any photo format. They're listed in `trip.config.json` → `finish.items` and appear after the totals.
