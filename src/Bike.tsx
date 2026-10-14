import React from "react";
import { META, Rider } from "./trip";

type Pt = [number, number];
/** where a rider's body sits on a vehicle (side view, facing right) */
type Pose = { hip: Pt; knee: Pt; foot: Pt; shoulder: Pt; hand: Pt; head: Pt; headR: number; torsoW: number };

const POSES: Record<"scooter" | "motorcycle", { driver: Pose; passenger: Pose; wheels: [number, number]; wheelY: number; wheelR: number }> = {
  scooter: {
    wheels: [62, 174], wheelY: 138, wheelR: 22,
    driver: { hip: [109, 94], knee: [136, 98], foot: [134, 122], shoulder: [118, 50], hand: [146, 61], head: [120, 35], headR: 15, torsoW: 20 },
    passenger: { hip: [81, 88], knee: [104, 96], foot: [100, 118], shoulder: [90, 50], hand: [112, 76], head: [93, 36], headR: 13, torsoW: 17 },
  },
  motorcycle: {
    wheels: [55, 170], wheelY: 132, wheelR: 27,
    driver: { hip: [103, 92], knee: [132, 102], foot: [124, 128], shoulder: [120, 52], hand: [142, 74], head: [123, 37], headR: 15, torsoW: 20 },
    passenger: { hip: [79, 93], knee: [98, 104], foot: [92, 128], shoulder: [90, 54], hand: [112, 78], head: [92, 40], headR: 13, torsoW: 17 },
  },
};

const limb = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

const RiderFigure: React.FC<{ pose: Pose; rider: Rider; sway: number; feetOnBoard: boolean }> = ({ pose: p, rider, sway, feetOnBoard }) => {
  const [hx, hy] = p.head;
  const r = p.headR;
  return (
    <g>
      {rider.look === "female" && (
        <path d={`M${hx - r + 1} ${hy} Q${hx - r - 14} ${hy + 8 + sway * 0.3} ${hx - r - 22 + sway * 0.4} ${hy + 24 + sway}`}
          stroke={rider.hair ?? "#4a2c1a"} strokeWidth={8} {...limb} />
      )}
      <path d={`M${p.hip[0]} ${p.hip[1]} L${p.knee[0]} ${p.knee[1]} L${p.foot[0]} ${p.foot[1]}`} stroke={rider.pants} strokeWidth={13} {...limb} />
      {feetOnBoard && <path d={`M${p.foot[0]} ${p.foot[1]} L${p.foot[0] + 8} ${p.foot[1]}`} stroke="#111" strokeWidth={8} strokeLinecap="round" />}
      <path d={`M${p.hip[0] - 1} ${p.hip[1]} Q${p.hip[0] + 3} ${(p.hip[1] + p.shoulder[1]) / 2 + 4} ${p.shoulder[0]} ${p.shoulder[1]}`}
        stroke={rider.jacket} strokeWidth={p.torsoW} {...limb} />
      <path d={`M${p.shoulder[0]} ${p.shoulder[1] + 6} Q${(p.shoulder[0] + p.hand[0]) / 2 + 2} ${(p.shoulder[1] + p.hand[1]) / 2 + 6} ${p.hand[0]} ${p.hand[1]}`}
        stroke={rider.jacket} strokeWidth={8.5} {...limb} />
      <circle cx={p.hand[0]} cy={p.hand[1]} r={4} fill="#1d1d1d" />
      <circle cx={hx} cy={hy} r={r} fill={rider.helmet} stroke="rgba(0,0,0,0.25)" strokeWidth={1.5} />
      <path d={`M${hx + 4} ${hy - r * 0.45} Q${hx + r + 3} ${hy - r * 0.2} ${hx + r - 2} ${hy + r * 0.55} L${hx + 3} ${hy + r * 0.55} Z`} fill="#33414e" />
    </g>
  );
};

const ScooterBody: React.FC<{ color: string; accent: string }> = ({ color, accent }) => (
  <>
    <path d="M62 138 L112 128 L114 136 L64 142 Z" fill="#1d2126" />
    <rect x={36} y={124} width={46} height={8} rx={4} fill="#1d2126" />
    <rect x={40} y={125} width={24} height={4} rx={2} fill="#8a949e" />
    <path d="M70 134 L84 112" stroke="#c43c3c" strokeWidth={5} strokeLinecap="round" />
    <path d="M174 138 L166 104" stroke="#aeb7c0" strokeWidth={6} strokeLinecap="round" />
    <path d="M156 118 Q174 106 192 120" stroke="#262c33" strokeWidth={6} fill="none" strokeLinecap="round" />
    <path d="M110 122 H152 L150 132 H112 Z" fill="#262c33" />
    <path d="M36 112 Q40 96 58 90 L112 94 Q120 104 118 122 L108 126 Q84 124 70 128 L42 124 Q34 120 36 112 Z" fill={color} />
    <path d="M44 106 Q70 100 104 104" stroke={accent} strokeWidth={3} fill="none" />
    <path d="M35 108 l8 -6 l2 8 z" fill="#ff3b3b" />
    <path d="M148 124 Q150 96 156 70 L166 62 Q182 76 182 96 Q180 112 168 122 Z" fill={color} />
    <path d="M168 78 L180 90 L176 94 L164 84 Z" fill="#e9f4ff" />
    <path d="M160 68 Q172 74 178 88" stroke={accent} strokeWidth={2.5} fill="none" />
    <path d="M156 64 L162 44 L170 48 L166 64 Z" fill="#5d6b78" opacity={0.85} />
    <path d="M144 60 L160 62" stroke="#1d1d1d" strokeWidth={5} strokeLinecap="round" />
    <path d="M94 92 Q108 90 122 94 L120 99 L94 98 Z" fill="#151515" />
    <path d="M56 88 Q74 82 96 88 L94 97 L58 96 Z" fill="#151515" />
  </>
);

const MotorcycleBody: React.FC<{ color: string; accent: string }> = ({ color, accent }) => (
  <>
    <path d="M55 132 L100 118" stroke="#2b2f33" strokeWidth={7} strokeLinecap="round" />
    <path d="M170 132 L150 80" stroke="#b8c2cc" strokeWidth={7} strokeLinecap="round" />
    <rect x={42} y={116} width={52} height={9} rx={4.5} fill="#b8c2cc" />
    <path d="M88 104 h40 l8 26 h-48 z" fill="#2b2f33" />
    <path d="M36 101 Q48 92 72 95 L74 104 L40 106 Z" fill={color} />
    <path d="M92 94 Q112 78 140 84 L146 98 Q120 104 96 104 Z" fill={color} />
    <path d="M100 92 Q116 84 134 88" stroke={accent} strokeWidth={3} fill="none" />
    <path d="M140 84 Q156 80 162 92 L150 100 Z" fill={color} opacity={0.8} />
    <circle cx={161} cy={92} r={6} fill="#ffe58a" stroke="#333" strokeWidth={2} />
    <path d="M150 133 Q168 108 192 128" stroke={color} strokeWidth={5} fill="none" />
    <path d="M58 94 Q80 88 106 92 L104 99 L60 101 Z" fill="#1d1d1d" />
    <path d="M140 74 L150 78" stroke="#1d1d1d" strokeWidth={4} strokeLinecap="round" />
  </>
);

/**
 * The trip vehicle with its riders (from trip.config.json), facing right.
 * Origin: bottom-centre (where the wheels touch the ground) is at (110, 160).
 */
export const Bike: React.FC<{ frame: number; moving: boolean }> = ({ frame, moving }) => {
  const { type, color, accent } = META.vehicle;
  const v = POSES[type] ?? POSES.scooter;
  const spin = moving ? frame * (type === "scooter" ? 30 : 24) : 0;
  const bob = moving ? Math.sin(frame * 0.9) * 1.1 : 0;
  const sway = Math.sin(frame * (moving ? 0.5 : 0.12)) * (moving ? 7 : 2);
  const [driver, passenger] = META.riders;

  const wheel = (cx: number) => (
    <g transform={`translate(${cx} ${v.wheelY})`}>
      <circle r={v.wheelR} fill="#141414" />
      <circle r={v.wheelR * 0.7} fill="#2b3036" />
      <g transform={`rotate(${spin})`} stroke="#aeb7c0" strokeWidth={2.5} strokeLinecap="round">
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <line key={a} x1={0} y1={-v.wheelR * 0.2} x2={0} y2={-v.wheelR * 0.65} transform={`rotate(${a})`} />
        ))}
      </g>
      <circle r={4} fill="#aeb7c0" />
    </g>
  );

  return (
    <svg width={220} height={170} viewBox="0 0 220 170" style={{ overflow: "visible" }}>
      {moving &&
        [0, 1, 2].map((i) => {
          const off = ((frame * 9 + i * 23) % 60) - 10;
          return (
            <line key={i} x1={20 - off} y1={70 + i * 22} x2={-10 - off} y2={70 + i * 22}
              stroke="white" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" />
          );
        })}
      <ellipse cx={114} cy={161} rx={86} ry={7} fill="black" opacity={0.25} />
      {wheel(v.wheels[0])}
      {wheel(v.wheels[1])}
      <g transform={`translate(0 ${bob})`}>
        {type === "motorcycle" ? <MotorcycleBody color={color} accent={accent} /> : <ScooterBody color={color} accent={accent} />}
        {passenger && <RiderFigure pose={v.passenger} rider={passenger} sway={sway} feetOnBoard={false} />}
        {driver && <RiderFigure pose={v.driver} rider={driver} sway={sway} feetOnBoard={type === "scooter"} />}
      </g>
    </svg>
  );
};

/** Small RoRo ferry carrying the bike, facing right. Origin bottom-centre at (130, 120). */
export const Ferry: React.FC<{ frame: number }> = ({ frame }) => {
  const rock = Math.sin(frame * 0.18) * 2;
  const wave = (frame * 3) % 40;
  return (
    <svg width={260} height={150} viewBox="0 0 260 150" style={{ overflow: "visible" }}>
      <g transform={`rotate(${rock} 130 110)`}>
        <rect x={60} y={36} width={90} height={34} rx={5} fill="#f4f6f8" stroke="#1d3557" strokeWidth={3} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={70 + i * 20} y={44} width={12} height={10} rx={2} fill="#7fb3d5" />
        ))}
        <rect x={130} y={18} width={10} height={20} fill="#d62f2f" />
        <path d="M20 70 H240 L218 112 H40 Z" fill="#f4f6f8" stroke="#1d3557" strokeWidth={3} />
        <path d="M30 88 H232" stroke="#1d3557" strokeWidth={8} />
        <path d="M34 98 H228" stroke="#d62f2f" strokeWidth={4} />
        <g transform="translate(160 30) scale(0.32)">
          <Bike frame={frame} moving={false} />
        </g>
      </g>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M${i * 40 - wave} 118 q10 -8 20 0 t20 0`} stroke="white" strokeWidth={3} fill="none" opacity={0.8} />
      ))}
    </svg>
  );
};
