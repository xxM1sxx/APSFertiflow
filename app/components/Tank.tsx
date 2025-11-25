import React, { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';

type TankProps = {
  label: string;
  value: number;
  capacity: number;
  unit: string;
  color?: 'blue' | 'green' | 'purple' | 'yellow';
  className?: string;
  thresholds?: { lowPercent: number };
  sizeRatio?: number;
  showRawValue?: boolean;
  ryRatio?: number;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

const accentText: Record<NonNullable<TankProps['color']>, string> = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  purple: 'text-purple-600',
  yellow: 'text-yellow-600',
};

const accentHex: Record<NonNullable<TankProps['color']>, string> = {
  blue: '#3B82F6',
  green: '#10B981',
  purple: '#8B5CF6',
  yellow: '#F59E0B',
};

const statusBadge: Record<'normal' | 'low', string> = {
  normal: 'bg-green-100 text-green-800',
  low: 'bg-yellow-100 text-yellow-800',
};

const Tank = React.memo(function Tank({
  label,
  value,
  capacity,
  unit,
  color = 'blue',
  className,
  thresholds = { lowPercent: 20 },
  sizeRatio = 60,
  showRawValue = false,
  ryRatio = 0.28,
}: TankProps) {
  const percent = clamp(value / capacity, 0, 1);
  const percentText = Math.round(percent * 100);
  const status: 'normal' | 'low' = percentText <= thresholds.lowPercent ? 'low' : 'normal';

  const svgRef = useRef<SVGSVGElement | null>(null);
  const meniscusRef = useRef<SVGEllipseElement | null>(null);
  const levelRef = useRef<SVGRectElement | null>(null);

  const vbW = 180;
  const vbH = 180;
  const pad = 16;
  const axisRight = 36;
  const tankX = pad;
  const tankY = pad;
  const tankW = vbW - pad - axisRight - pad;
  const tankH = vbH - pad * 2;
  const cx = tankX + tankW / 2;
  const rx = tankW / 2;
  const ry = Math.max(6, rx * ryRatio);
  const topY = tankY + ry;
  const bottomY = tankY + tankH - ry;
  const ch = bottomY - topY;
  const leftX = cx - rx;
  const rightX = cx + rx;
  const clipId = useMemo(() => 'clip-' + Math.random().toString(36).slice(2), []);

  const scale = useMemo(() => d3.scaleLinear().domain([0, capacity]).range([ch, 0]), [capacity, ch]);

  useEffect(() => {
    if (!levelRef.current) return;
    const h = percent * ch;
    const y = bottomY - h;
    d3.select(levelRef.current).transition().duration(400).ease(d3.easeCubic).attr('y', y).attr('height', h);
    if (meniscusRef.current) {
      d3.select(meniscusRef.current).transition().duration(400).ease(d3.easeCubic).attr('cy', y);
    }
  }, [percent, tankH, tankY]);

  const accent = accentText[color];

  return (
    <div className={`w-full ${className || ''}`} aria-label={`${label} tank`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className={`p-2 rounded-full ${color === 'blue' ? 'bg-blue-50' : color === 'green' ? 'bg-green-50' : color === 'purple' ? 'bg-purple-50' : 'bg-yellow-50'}`}>
            <svg className={`w-4 h-4 ${accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="12" height="16" rx="2" />
              <path d="M6 14h12" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${statusBadge[status]}`}>{status.toUpperCase()}</span>
      </div>
      <div className="relative w-full" style={{ paddingBottom: `${sizeRatio}%` }}>
        <svg ref={svgRef} viewBox={`0 0 ${vbW} ${vbH}`} className="absolute inset-0 w-full h-full">
          <defs>
            <clipPath id={clipId}>
              <path d={`M ${leftX} ${topY} A ${rx} ${ry} 0 0 1 ${rightX} ${topY} L ${rightX} ${bottomY} A ${rx} ${ry} 0 0 1 ${leftX} ${bottomY} Z`} />
            </clipPath>
          </defs>
          <rect ref={levelRef} x={leftX} y={bottomY} width={tankW} height={0} fill={accentHex[color]} clipPath={`url(#${clipId})`} opacity={0.45} />
          <ellipse ref={meniscusRef} cx={cx} cy={bottomY} rx={rx} ry={ry} fill={accentHex[color]} opacity={0.55} clipPath={`url(#${clipId})`} />
          <ellipse cx={cx} cy={bottomY} rx={rx} ry={ry} fill={accentHex[color]} opacity={0.55} clipPath={`url(#${clipId})`} />
          <ellipse cx={cx} cy={topY} rx={rx} ry={ry} stroke="currentColor" className="text-gray-300" fill="none" strokeWidth={2} />
          <path d={`M ${leftX} ${topY} L ${leftX} ${bottomY} A ${rx} ${ry} 0 0 0 ${rightX} ${bottomY} L ${rightX} ${topY}`} stroke="currentColor" className="text-gray-300" fill="none" strokeWidth={2} />
          <ellipse cx={cx} cy={bottomY} rx={rx} ry={ry} stroke="currentColor" className="text-gray-300" fill="none" strokeWidth={2} />
          <g>
            {[{p:100,label:'Full'},{p:75,label:'75%'},{p:50,label:'50%'},{p:25,label:'25%'},{p:0,label:'Empty'}].map(({p,label}) => (
              <text key={p} x={rightX + 12} y={topY + (1 - p/100) * ch} className="text-[10px] fill-gray-500">{label}</text>
            ))}
          </g>
        </svg>
      </div>
      <div className="mt-1 text-center">
        <div className="text-2xl font-bold text-gray-900">{percentText}%</div>
        {showRawValue && <div className={`text-sm ${accent}`}>{value.toFixed(0)} {unit}</div>}
      </div>
    </div>
  );
});

export default Tank;
