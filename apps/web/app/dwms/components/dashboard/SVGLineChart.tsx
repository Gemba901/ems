import React, { useState } from 'react';
import type { DwmsDashboardTrendPoint } from '@/services/dwms.service';
import { formatOrganizationDateKey } from '../../utils/organizationDate';

type SVGLineChartProps = {
  trendData: DwmsDashboardTrendPoint[];
  valueKey?: keyof DwmsDashboardTrendPoint;
  ySuffix?: string;
  tooltipLabel?: string;
};

export default function SVGLineChart({
  trendData,
  valueKey = 'value',
  ySuffix = '',
  tooltipLabel = 'Value'
}: SVGLineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!trendData || trendData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border-app bg-bg-app/50 text-sm text-muted-app">
        No trend data available.
      </div>
    );
  }

  const width = 600;
  const height = 220;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const getValue = (d: DwmsDashboardTrendPoint) => {
    if (!d) return 0;
    const rawValue = d[valueKey] ?? d.value ?? d.completionRate ?? d.avgAcknowledgeTimeMin ?? 0;
    return typeof rawValue === 'number' ? rawValue : 0;
  };

  const maxValInData = trendData.reduce((max, d) => {
    const val = getValue(d);
    return val > max ? val : max;
  }, 0);

  const maxScale = ySuffix.trim() === '%' ? 100 : (maxValInData > 0 ? Math.ceil(maxValInData * 1.2) : 10);

  const pointsCount = trendData.length;
  const getX = (index: number) => paddingLeft + (index * (chartWidth / Math.max(1, pointsCount - 1)));
  const getY = (val: number) => {
    const v = Math.max(0, Math.min(maxScale, val));
    return paddingTop + chartHeight - (v / maxScale) * chartHeight;
  };

  let pathD = '';
  let areaD = '';

  trendData.forEach((d, i) => {
    const x = getX(i);
    const y = getY(getValue(d));
    if (i === 0) {
      pathD = `M ${x} ${y}`;
      areaD = `M ${x} ${paddingTop + chartHeight} L ${x} ${y}`;
    } else {
      pathD += ` L ${x} ${y}`;
      areaD += ` L ${x} ${y}`;
    }
    if (i === pointsCount - 1) {
      areaD += ` L ${x} ${paddingTop + chartHeight} Z`;
    }
  });

  return (
    <div className="relative w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 25, 50, 75, 100].map((percent) => {
          const val = (percent / 100) * maxScale;
          const y = getY(val);
          return (
            <g key={percent} className="opacity-15 dark:opacity-10">
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={paddingLeft - 8}
                y={y + 4}
                className="text-[10px] fill-current font-medium text-muted-app"
                textAnchor="end"
              >
                {Math.round(val)}{ySuffix}
              </text>
            </g>
          );
        })}

        {/* Shaded Area */}
        {trendData.length > 0 && <path d={areaD} fill="url(#areaGradient)" />}

        {/* Line */}
        {trendData.length > 0 && (
          <path
            d={pathD}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Hotspots / Labels */}
        {trendData.map((d, i) => {
          const x = getX(i);
          const y = getY(getValue(d));
          
          let label = '';
          if (d.date) {
            const [year, month, day] = d.date.slice(0, 10).split('-');
            label = year && month && day ? `${Number(day)}/${Number(month)}` : d.date;
          } else {
            label = d.label ?? '';
          }
          
          let step = 1;
          if (pointsCount > 60) {
            step = 10;
          } else if (pointsCount > 20) {
            step = 5;
          } else if (pointsCount > 10) {
            step = 2;
          }
          
          const showLabel = i % step === 0;
          const uniqueKey = d.date ? d.date : `${d.label}-${i}`;

          return (
            <g key={uniqueKey}>
              {showLabel && (
                <text
                  x={x}
                  y={paddingTop + chartHeight + 16}
                  className="text-[9px] font-semibold fill-current text-muted-app"
                  textAnchor="middle"
                >
                  {label}
                </text>
              )}

              {/* Invisible interactive circle */}
              <circle
                cx={x}
                cy={y}
                r="12"
                className="fill-transparent cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />

              {/* Hover dot */}
              <circle
                cx={x}
                cy={y}
                r="5.5"
                className={`transition-all duration-150 pointer-events-none ${
                  hoveredIdx === i
                    ? 'fill-blue-500 stroke-zinc-50 stroke-2 scale-125'
                    : 'fill-blue-500 opacity-0'
                }`}
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredIdx !== null && trendData[hoveredIdx] && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-border-app bg-white p-2 text-xs text-text-app shadow-xl transition-all duration-150"
          style={{
            left: `${(getX(hoveredIdx) / width) * 100}%`,
            top: `${(getY(getValue(trendData[hoveredIdx])) / height) * 100 - 16}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-medium text-[10px] text-muted-app mb-0.5">
            {trendData[hoveredIdx].date ? (
              formatOrganizationDateKey(trendData[hoveredIdx].date, { month: 'short', day: 'numeric' })
            ) : (
              trendData[hoveredIdx].label
            )}
          </div>
          <div className="font-bold text-accent-app">
            {tooltipLabel}: {getValue(trendData[hoveredIdx]).toFixed(1)}{ySuffix}
          </div>
          {trendData[hoveredIdx].total !== undefined && (
            <div className="text-[9px] text-muted-app">
              {trendData[hoveredIdx].completed} / {trendData[hoveredIdx].total} tasks
            </div>
          )}
        </div>
      )}
    </div>
  );
}
