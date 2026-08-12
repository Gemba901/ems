'use client';

interface Props {
  title: string;
  value: number;
  trend?: string;
}

export default function SummaryCard({ title, value, trend }: Props) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <div className="flex items-end justify-between">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {trend && <span className="text-sm font-medium text-green-600">{trend}</span>}
      </div>
    </div>
  );
}