import React, { useState } from 'react';
import type { DwmsDashboardTrendPoint } from '@/services/dwms.service';
import { formatOrganizationDateKey } from '../../utils/organizationDate';

type SVGLineChartProps = {
  trendData: DwmsDashboardTrendPoint[];
  valueKey?: keyof DwmsDashboardTrendPoint;
  ySuffix?: string;
  tooltipLabel?: string;
  height?: number;
  variant?: 'line' | 'bar';
};

export default function SVGLineChart({
  trendData,
  valueKey = 'value',
  ySuffix = '',
  tooltipLabel = 'Value',
  height = 220,
  variant = 'line'
}: SVGLineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!trendData || trendData.length === 0) {
    return (
      <div className={`flex items-center justify-center rounded-2xl border border-dashed border-border-app bg-bg-app/50 text-sm text-muted-app ${height <= 180 ? 'h-36' : 'h-48'}`}>
        No trend data available.
      </div>
    );
  }

  const width = 600;
  const isCompact = height <= 180;
  const paddingLeft = isCompact ? 42 : 48;
  const paddingRight = isCompact ? 16 : 22;
  const paddingTop = isCompact ? 14 : 20;
  const paddingBottom = isCompact ? 28 : 34;

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

  const maxScale = ySuffix.trim() === '%' ? 100 : (maxValInData > 0 ? Math.ceil(maxValInData * 1.1) : 10);

  const pointsCount = trendData.length;
  const getX = (index: number) => pointsCount === 1 ? paddingLeft + chartWidth / 2 : paddingLeft + (index * (chartWidth / (pointsCount - 1)));
  const getY = (val: number) => {
    const v = Math.max(0, Math.min(maxScale, val));
    return paddingTop + chartHeight - (v / maxScale) * chartHeight;
  };
  const barWidth = Math.max(3, Math.min(24, (chartWidth / Math.max(pointsCount, 1)) * 0.62));

  let pathD = '';

  trendData.forEach((d, i) => {
    const x = getX(i);
    const y = getY(getValue(d));
    if (i === 0) {
      pathD = `M ${x} ${y}`;
    } else {
      pathD += ` L ${x} ${y}`;
    }
  });

  const maxXAxisLabels = isCompact ? 5 : 7;
  const xLabelStep = Math.max(1, Math.ceil((pointsCount - 1) / Math.max(maxXAxisLabels - 1, 1)));
  const shouldShowXAxisLabel = (index: number) => (
    index === 0 || index === pointsCount - 1 || index % xLabelStep === 0
  );

  return (
    <div className="relative w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full select-none overflow-visible"
        role="img"
        aria-label={`${tooltipLabel} trend across ${pointsCount} data point${pointsCount === 1 ? '' : 's'}`}
      >

        {/* Horizontal grid lines */}
        {[0, 25, 50, 75, 100].map((percent) => {
          const val = (percent / 100) * maxScale;
          const y = getY(val);
          return (
            <g key={percent}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke={percent === 0 ? "#cbd5e1" : "#e2e8f0"}
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 8}
                y={y + 4}
                className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} fill-slate-500 font-medium`}
                textAnchor="end"
              >
                {Math.round(val)}{ySuffix}
              </text>
            </g>
          );
        })}

        {variant === 'line' && trendData.length > 0 && (
          <path
            d={pathD}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {variant === 'bar' && trendData.map((d, i) => {
          const value = getValue(d);
          const y = getY(value);
          const baseline = paddingTop + chartHeight;
          return (
            <rect
              key={`bar-${d.date ?? d.label ?? i}`}
              x={getX(i) - barWidth / 2}
              y={y}
              width={barWidth}
              height={Math.max(0, baseline - y)}
              rx="2"
              className="fill-blue-500/80"
            />
          );
        })}

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
          
          const showLabel = shouldShowXAxisLabel(i);
          const uniqueKey = d.date ? d.date : `${d.label}-${i}`;

          return (
            <g key={uniqueKey}>
              {showLabel && (
                <text
                  x={x}
                  y={paddingTop + chartHeight + 16}
                  className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} fill-slate-500 font-medium`}
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
                tabIndex={0}
                aria-label={`${label}: ${getValue(d).toFixed(1)}${ySuffix}`}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onFocus={() => setHoveredIdx(i)}
                onBlur={() => setHoveredIdx(null)}
              />

              {/* Data point / active point */}
              <circle
                cx={x}
                cy={y}
                r={hoveredIdx === i ? "5" : "3"}
                className={`transition-all duration-150 pointer-events-none ${
                  hoveredIdx === i || pointsCount <= 12 || i === pointsCount - 1
                    ? 'fill-white stroke-blue-600 stroke-2'
                    : 'fill-blue-600 opacity-0'
                }`}
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredIdx !== null && trendData[hoveredIdx] && (
        <div
          className="pointer-events-none absolute z-10 min-w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-lg transition-all duration-150"
          style={{
            left: `${(getX(hoveredIdx) / width) * 100}%`,
            top: `${(getY(getValue(trendData[hoveredIdx])) / height) * 100 - 16}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="mb-1 text-[10px] font-medium text-slate-500">
            {trendData[hoveredIdx].date ? (
              formatOrganizationDateKey(trendData[hoveredIdx].date, { month: 'short', day: 'numeric' })
            ) : (
              trendData[hoveredIdx].label
            )}
          </div>
          <div className="font-semibold tabular-nums text-slate-950">
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
