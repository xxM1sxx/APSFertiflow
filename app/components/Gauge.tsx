import React, { useEffect, useMemo, useRef, useState } from 'react';
/**
 * Reusable radial gauge component for real-time metrics.
 * - Pure SVG, Tailwind-themed, and fully responsive.
 * - Smoothly animates value changes using requestAnimationFrame.
 * - Displays status badge based on thresholds (normal/warning/danger).
 */

type Thresholds = {
  warning: number;
  danger: number;
};

type GaugeProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  color?: 'blue' | 'green' | 'purple' | 'yellow';
  className?: string;
  thresholds: Thresholds;
  majorTicks?: number;
  minorTicks?: number;
  labelDecimals?: number;
  valueDecimals?: number;
  labelFontPx?: number;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function getStatus(value: number, thresholds: Thresholds) {
  if (value >= thresholds.danger) return 'danger';
  if (value >= thresholds.warning) return 'warning';
  return 'normal';
}

const statusStyles: Record<'normal' | 'warning' | 'danger', { text: string; badge: string }> = {
  normal: { text: 'text-gray-600', badge: 'bg-green-100 text-green-800' },
  warning: { text: 'text-gray-600', badge: 'bg-yellow-100 text-yellow-800' },
  danger: { text: 'text-gray-600', badge: 'bg-red-100 text-red-800' },
};

const accentText: Record<NonNullable<GaugeProps['color']>, string> = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  purple: 'text-purple-600',
  yellow: 'text-yellow-600',
};

const accentBg: Record<NonNullable<GaugeProps['color']>, string> = {
  blue: 'bg-blue-50',
  green: 'bg-green-50',
  purple: 'bg-purple-50',
  yellow: 'bg-yellow-50',
};

const Gauge = React.memo(function Gauge({
  label,
  value,
  min,
  max,
  unit,
  color = 'blue',
  className,
  thresholds,
  majorTicks = 6,
  minorTicks = 3,
  labelDecimals = 0,
  valueDecimals = 1,
  labelFontPx = 10,
}: GaugeProps) {
  const clamped = clamp(value, min, max);
  const percent = (clamped - min) / (max - min);

  const [animatedPercent, setAnimatedPercent] = useState(percent);
  const rafRef = useRef<number | null>(null);
  const prevRef = useRef(percent);

  useEffect(() => {
    const start = performance.now();
    const duration = 400; // ms
    const from = prevRef.current;
    const to = percent;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    function step(now: number) {
      const t = clamp((now - start) / duration, 0, 1);
      setAnimatedPercent(from + (to - from) * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    prevRef.current = to;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [percent]);

  const radius = 70;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const halfCirc = circumference / 2;
  const startOffset = -halfCirc / 2;

  const status = getStatus(clamped, thresholds) as 'normal' | 'warning' | 'danger';
  const accent = accentText[color];

  const tickAngles = useMemo(() => {
    return Array.from({ length: majorTicks }, (_, i) => -Math.PI + (i / (majorTicks - 1)) * Math.PI);
  }, [majorTicks]);
  const tickValues = useMemo(() => {
    return Array.from({ length: majorTicks }, (_, i) => min + (i / (majorTicks - 1)) * (max - min));
  }, [min, max, majorTicks]);
  const minorAngles = useMemo(() => {
    const angles: number[] = [];
    for (let i = 0; i < majorTicks - 1; i++) {
      const a0 = tickAngles[i];
      const a1 = tickAngles[i + 1];
      for (let j = 1; j <= minorTicks; j++) {
        const f = j / (minorTicks + 1);
        angles.push(a0 + (a1 - a0) * f);
      }
    }
    return angles;
  }, [tickAngles, majorTicks, minorTicks]);
  const warnFrac = clamp((thresholds.warning - min) / (max - min), 0, 1);
  const dangerFrac = clamp((thresholds.danger - min) / (max - min), 0, 1);
  const seg1 = halfCirc * warnFrac;
  const seg2 = halfCirc * (dangerFrac - warnFrac);
  const seg3 = halfCirc * (1 - dangerFrac);
  const deg = -180 + animatedPercent * 180;

  return (
    <div className={`w-full ${className || ''}`} aria-label={`${label} gauge`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className={`p-2 ${accentBg[color]} rounded-full`}>
            <svg className={`w-4 h-4 ${accent}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 12l6-3" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${statusStyles[status].badge}`}>{status.toUpperCase()}</span>
      </div>

      <div className="relative w-full" style={{ paddingBottom: '50%' }}>
        <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full">
          <g transform="translate(60,100)">
            <circle cx="0" cy="0" r={radius} strokeWidth={stroke} fill="none" stroke="currentColor" className="text-red-400" style={{ strokeDasharray: `${seg1} ${circumference}`, strokeDashoffset: `${startOffset}`, transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
            <circle cx="0" cy="0" r={radius} strokeWidth={stroke} fill="none" stroke="currentColor" className="text-yellow-400" style={{ strokeDasharray: `${seg2} ${circumference}`, strokeDashoffset: `${startOffset + seg1}`, transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
            <circle cx="0" cy="0" r={radius} strokeWidth={stroke} fill="none" stroke="currentColor" className="text-green-500" style={{ strokeDasharray: `${seg3} ${circumference}`, strokeDashoffset: `${startOffset + seg1 + seg2}`, transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
            <circle
              cx="0"
              cy="0"
              r={radius}
              className={`${status === 'danger' ? 'text-red-500' : status === 'warning' ? 'text-yellow-500' : accent}`}
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              style={{
                strokeDasharray: `${animatedPercent * halfCirc} ${circumference}`,
                strokeDashoffset: `${-halfCirc / 2}`,
                transform: 'rotate(-90deg)',
                transformOrigin: 'center',
              }}
            />
            {tickAngles.map((a, idx) => (
              <g key={`major-${idx}`}>
                <line x1={Math.cos(a) * (radius + 1)} y1={Math.sin(a) * (radius + 1)} x2={Math.cos(a) * (radius - 6)} y2={Math.sin(a) * (radius - 6)} stroke="currentColor" className="text-gray-400" strokeWidth={1.5} />
                <text x={Math.cos(a) * (radius + 10)} y={Math.sin(a) * (radius + 10)} textAnchor="middle" dominantBaseline="middle" className="fill-gray-500" style={{ fontSize: labelFontPx }}>
                  {tickValues[idx].toFixed(labelDecimals)}
                </text>
              </g>
            ))}
            {minorAngles.map((a, idx) => (
              <line key={`minor-${idx}`} x1={Math.cos(a) * (radius + 1)} y1={Math.sin(a) * (radius + 1)} x2={Math.cos(a) * (radius - 3)} y2={Math.sin(a) * (radius - 3)} stroke="currentColor" className="text-gray-300" strokeWidth={1} />
            ))}
            <g transform={`rotate(${deg})`}>
              <line x1={0} y1={0} x2={radius - 8} y2={0} stroke="currentColor" className="text-gray-800" strokeWidth={2} strokeLinecap="round" />
            </g>
            <circle cx={0} cy={0} r={3} className="text-gray-600" fill="currentColor" />
          </g>
        </svg>
      </div>
      <div className="mt-0 text-center">
        <div className={`text-2xl font-bold text-gray-900`}>{clamped.toFixed(valueDecimals)}</div>
        <div className={`text-sm ${accent}`}>{unit}</div>
      </div>
    </div>
  );
});

export default Gauge;

