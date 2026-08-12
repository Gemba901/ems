"use client";

import { useState } from "react";
import Link from "next/link";
import SummaryCard from "./components/SummaryCard";
import KaizenCard from "./components/KaizenCard";

const MOCK_DATA = {
  myKaizens: 12,
  inProgress: 4,
  pendingVerification: 7,
  verifiedThisMonth: 28,
  verifiedTrend: "↑ 12%",
};

const MOCK_ENTRIES = [
  {
    id: "#KZ-8821",
    title: "Shadow Board for CNC-04 Tools",
    description: "Organized tool storage for CNC machine 04",
    status: "In Progress",
    createdBy: "Marcus Chen",
    department: "Machining",
    createdAt: "2 hours ago",
    imageUrl: "/images/kaizen-8821.jpg",
  },
  {
    id: "#KZ-8794",
    title: "Pallet Flow Optimization in Lane 4",
    description: "Improved pallet flow efficiency",
    status: "Verification",
    createdBy: "Sarah Jenkins",
    department: "Logistics",
    createdAt: "1 day ago",
    imageUrl: "/images/kaizen-8794.jpg",
  },
  {
    id: "#KZ-8752",
    title: "Ergonomic Assembly Jig Redesign",
    description: "Reduced worker strain and improved precision",
    status: "Verified",
    createdBy: "Alex Volkov",
    department: "Assembly Line B",
    createdAt: "3 days ago",
    imageUrl: "/images/kaizen-8752.jpg",
  },
  {
    id: "#KZ-8701",
    title: "HMI Interface Localization",
    description: "Multi-language support for operator interface",
    status: "Draft",
    createdBy: "James Miller",
    department: "Machining",
    createdAt: "5 days ago",
    imageUrl: "/images/kaizen-8701.jpg",
  },
];

const departments = [
  "All Departments",
  "Machining",
  "Logistics",
  "Assembly Line B",
];
const statuses = ["All", "In Progress", "Verification", "Verified", "Draft"];

export default function DailyGembaKaizenPage() {
  const [selectedTab, setSelectedTab] = useState("My Kaizens");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedDepartment, setSelectedDepartment] =
    useState("All Departments");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  const filteredEntries = MOCK_ENTRIES.filter((entry) => {
    const matchesSearch =
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      selectedStatus === "All" || entry.status === selectedStatus;
    const matchesDepartment =
      selectedDepartment === "All Departments" ||
      entry.department === selectedDepartment;

    return matchesSearch && matchesStatus && matchesDepartment;
  });

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">KAIZEN</p>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Daily Gemba Kaizen
            </h1>
            <p className="text-gray-600">
              Track problems, improvements, and benefits raised on the shop
              floor.
            </p>
          </div>
          <Link href="/DGK/new">
            <button className="bg-black text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors">
              + New Kaizen
            </button>
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard title="My Kaizens" value={MOCK_DATA.myKaizens} />
          <SummaryCard
            title="In Progress"
            value={MOCK_DATA.inProgress}
            trend="+1 today"
          />
          <SummaryCard
            title="Pending Verification"
            value={MOCK_DATA.pendingVerification}
          />
          <SummaryCard
            title="Verified This Month"
            value={MOCK_DATA.verifiedThisMonth}
            trend="↑ 12%"
          />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {["My Kaizens", "My Department", "Pending My Verification"].map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={`
                  pb-4 px-1 text-sm font-medium transition-colors
                  ${
                    selectedTab === tab
                      ? "border-b-2 border-black text-black"
                      : "border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }
                `}
                >
                  {tab}
                </button>
              ),
            )}
          </nav>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-center mb-6">
          <div className="flex-1 w-full">
            <input
              type="text"
              placeholder="Filter by title or ID..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedStatus("All");
              setSelectedDepartment("All Departments");
            }}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            Clear Filters
          </button>
        </div>

        {/* Kaizen List */}
        <div className="space-y-4">
          {paginatedEntries.length > 0 ? (
            paginatedEntries.map((entry) => (
              <KaizenCard key={entry.id} entry={entry} />
            ))
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <p className="text-gray-500">No Kaizen entries found.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6">
            <p className="text-sm text-gray-600">
              Showing {paginatedEntries.length} of {filteredEntries.length}{" "}
              Kaizens
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
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
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
