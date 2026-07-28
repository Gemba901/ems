import React from 'react';

type RadialProgressProps = {
  percent: number;
  size?: number;
  strokeWidth?: number;
};

export default function RadialProgress({ percent, size = 60, strokeWidth = 6 }: RadialProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  let color = 'stroke-rose-500';
  if (percent >= 80) color = 'stroke-emerald-500';
  else if (percent >= 50) color = 'stroke-amber-500';

  return (
    <div className="relative flex items-center justify-center font-sans" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="stroke-border-app"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`${color} transition-all duration-500 ease-out`}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className="absolute text-xs font-bold text-text-app">{percent}%</span>
    </div>
  );
}
