import React from "react";
import { G } from "./theme";

/**
 * ASATEX 紅色海豚（依 ASAHI LTDA ZOFRI LOGO 重畫）：直立在尾鰭上、戴水手帽。
 * 原點在尾鰭著地點；靠尾鰭彈跳前進，所以壓扁／拉長都以腳底為支點。
 */
export const Dolphin: React.FC<{
  x: number;
  y: number;
  s?: number;
  hop?: number;
  squash?: number; // <1 壓扁、>1 拉長
  wave?: number; // 鰭肢舉起角度（度）
  opacity?: number;
}> = ({ x, y, s = 1, hop = 0, squash = 1, wave = 0, opacity = 1 }) => {
  const shadow = Math.max(0.35, 1 - hop / 140);
  const stroke = { stroke: G.ink, strokeWidth: 3.5, strokeLinejoin: "round" as const };
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
      <ellipse cx={0} cy={0} rx={34 * shadow} ry={9 * shadow} fill={G.ink} opacity={0.2} />
      <g transform={`translate(0 ${-hop}) scale(${1 / Math.sqrt(squash)} ${squash})`}>
        {/* 背鰭 */}
        <path d="M-24,-64 L-46,-58 L-22,-84 Z" fill={G.dolphin} {...stroke} />
        {/* 尾鰭（著地） */}
        <path d="M-6,-14 C-20,-6 -34,-2 -42,4 C-34,-10 -30,-14 -26,-16 C-34,-20 -40,-28 -40,-34 C-28,-30 -16,-26 -4,-24 Z" fill={G.dolphin} {...stroke} />
        {/* 身體＋吻部 */}
        <path
          d="M-8,-12 C-34,-40 -32,-96 2,-108 C26,-116 44,-100 46,-88 L68,-84 C74,-82 72,-74 64,-73 L44,-72 C40,-48 24,-20 -8,-12 Z"
          fill={G.dolphin}
          {...stroke}
        />
        {/* 白肚 */}
        <path d="M6,-22 C24,-34 36,-54 38,-70 L30,-70 C26,-52 14,-36 -2,-26 Z" fill="#fff" />
        {/* 嘴角 */}
        <path d="M46,-75 Q56,-72 64,-74" fill="none" stroke={G.ink} strokeWidth={2.5} strokeLinecap="round" />
        {/* 眼睛 */}
        <circle cx={24} cy={-88} r={8} fill="#fff" stroke={G.ink} strokeWidth={2} />
        <circle cx={26.5} cy={-88} r={4.2} fill={G.ink} />
        <circle cx={28} cy={-90} r={1.4} fill="#fff" />
        {/* 胸鰭：揮手時以肩膀為支點舉起 */}
        <g transform={`rotate(${-wave} 16 -54)`}>
          <ellipse cx={24} cy={-36} rx={7} ry={17} transform="rotate(-28 24 -36)" fill={G.dolphin} {...stroke} />
        </g>
        {/* 水手帽 */}
        <path d="M-14,-104 Q4,-134 30,-108 Z" fill="#fff" {...stroke} />
        <path d="M-13,-106 Q6,-118 29,-109" fill="none" stroke={G.navy} strokeWidth={8} strokeLinecap="round" />
        <circle cx={6} cy={-126} r={5} fill={G.pin} stroke={G.ink} strokeWidth={2} />
      </g>
    </g>
  );
};
