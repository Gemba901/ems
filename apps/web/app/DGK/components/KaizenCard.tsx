"use client";

interface KaizenEntry {
  id: string;
  title: string;
  description: string;
  status: string;
  createdBy: string;
  department: string;
  createdAt: string;
  imageUrl: string;
}

export default function KaizenCard({ entry }: { entry: KaizenEntry }) {
  const statusColors: Record<string, string> = {
    "In Progress": "bg-blue-100 text-blue-800",
    Verification: "bg-yellow-100 text-yellow-800",
    Verified: "bg-green-100 text-green-800",
    Draft: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex flex-col md:flex-row gap-4">
        <img
          src={entry.imageUrl}
          alt={entry.title}
          className="w-full md:w-48 h-32 object-cover rounded-lg"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/images/placeholder.jpg";
          }}
        />
        <div className="flex-1">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-semibold text-gray-900">{entry.title}</h3>
              <p className="text-sm text-gray-500">{entry.id}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[entry.status]}`}
            >
              {entry.status}
            </span>
          </div>
          <p className="text-gray-600 text-sm mb-3">{entry.description}</p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 01-7 7h14a7 7 0 01-7-7z"
                />
              </svg>
              <span>{entry.createdBy}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              <span>{entry.department}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{entry.createdAt}</span>
            </div>
          </div>
        </div>
        <button className="text-gray-400 hover:text-gray-600 p-2">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
