import React from "react";
import { Composition } from "remotion";
import { Main, MainProps } from "./Main";
import { buildSchedule, FPS, H, W } from "./timing";
import { META, TRIP } from "./trip";

const hasMusic = META.loops.some((l) => l.music);

/** the sample day from trip.config.json, else the first day */
const sampleRange = () => {
  const { loop, day } = META.sample;
  let ids = TRIP.flatMap((s, i) => (s.loop === loop && s.day === day ? [i] : []));
  if (!ids.length) ids = TRIP.flatMap((s, i) => (s.loop === TRIP[0].loop && s.day === TRIP[0].day ? [i] : []));
  return { fromStop: ids[0], toStop: ids[ids.length - 1] + 1 };
};
const SAMPLE = sampleRange();

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Trip" component={Main} width={W} height={H} fps={FPS}
      durationInFrames={buildSchedule(TRIP, { finale: true }).total}
      defaultProps={{ finale: true, music: hasMusic } satisfies MainProps} />
    {/* about a minute: intro + one day */}
    <Composition id="Sample" component={Main} width={W} height={H} fps={FPS}
      durationInFrames={buildSchedule(TRIP.slice(SAMPLE.fromStop, SAMPLE.toStop), { finale: false }).total}
      defaultProps={{ ...SAMPLE, finale: false, music: hasMusic } satisfies MainProps} />
  </>
);
