import React, { useEffect, useState } from "react";
import { caseService, incidentService, morningBriefService, userService } from "../services/api";

const CASE_STATUSES = [
  { key: "new",                label: "New",                textColor: "text-blue-400",   border: "border-blue-700",   bg: "bg-blue-900/20" },
  { key: "open",               label: "Open",               textColor: "text-cyan-400",   border: "border-cyan-700",   bg: "bg-cyan-900/20" },
  { key: "tasked",             label: "Tasked",             textColor: "text-yellow-400", border: "border-yellow-700", bg: "bg-yellow-900/20" },
  { key: "under_investigation",label: "Under Investigation",textColor: "text-orange-400", border: "border-orange-700", bg: "bg-orange-900/20" },
  { key: "pending",            label: "Pending",            textColor: "text-purple-400", border: "border-purple-700", bg: "bg-purple-900/20" },
  { key: "served",             label: "Served",             textColor: "text-green-400",  border: "border-green-700",  bg: "bg-green-900/20" },
  { key: "closed",             label: "Closed",             textColor: "text-gray-300",   border: "border-gray-600",   bg: "bg-gray-700/30" },
  { key: "referred",           label: "Referred",           textColor: "text-red-400",    border: "border-red-700",    bg: "bg-red-900/20" },
];

function StatCard({ label, value, textColor = "text-white", border = "border-gray-700", bg = "bg-gray-800", sub }) {
  return (
    <div className={`rounded-lg border p-4 ${bg} ${border}`}>
      <p className={`text-xs uppercase tracking-wide opacity-70 ${textColor}`}>{label}</p>
      <p className={`text-3xl font-bold mt-1 ${textColor}`}>
        {value === null || value === undefined ? "—" : value.toLocaleString()}
      </p>
      {sub && <p className="text-xs mt-1 text-gray-500">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </h3>
  );
}

const getCount = (res) => {
  const d = res?.data;
  if (typeof d?.count === "number") return d.count;
  if (Array.isArray(d)) return d.length;
  return 0;
};

export default function Statistics({ user }) {
  const [statusCounts, setStatusCounts] = useState({});
  const [totalCases, setTotalCases] = useState(null);
  const [incidents, setIncidents] = useState(null);
  const [briefs, setBriefs] = useState(null);
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canSeeUsers =
    user?.is_superuser || ["admin", "mpc_hqs", "personnel"].includes(user?.role);
  const canSeeBriefs = ["admin", "co", "corps_cmd", "detachment", "mpc_hqs", "bsm"].includes(
    user?.role
  );
  const canSeeIncidents = [
    "admin", "co", "corps_cmd", "duty_officer", "detachment", "mpc_hqs", "cop",
  ].includes(user?.role) || user?.is_superuser;

  useEffect(() => {
    const fetches = [
      caseService.list({ page_size: 1 }),
      ...CASE_STATUSES.map((s) => caseService.list({ page_size: 1, status: s.key })),
    ];
    if (canSeeIncidents) fetches.push(incidentService.list({ page_size: 1 }));
    if (canSeeBriefs) fetches.push(morningBriefService.list({ page_size: 1 }));
    if (canSeeUsers) fetches.push(userService.list({ page_size: 1 }));

    Promise.all(fetches)
      .then((results) => {
        const [totalRes, ...rest] = results;
        setTotalCases(getCount(totalRes));

        const statusResults = rest.slice(0, CASE_STATUSES.length);
        const otherResults = rest.slice(CASE_STATUSES.length);

        const counts = {};
        CASE_STATUSES.forEach((s, i) => {
          counts[s.key] = getCount(statusResults[i]);
        });
        setStatusCounts(counts);

        let idx = 0;
        if (canSeeIncidents) setIncidents(getCount(otherResults[idx++]));
        if (canSeeBriefs) setBriefs(getCount(otherResults[idx++]));
        if (canSeeUsers) setUsers(getCount(otherResults[idx++]));
      })
      .catch(() => setError("Failed to load statistics."))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading)
    return <div className="p-8 text-gray-400 text-center animate-pulse">Loading statistics…</div>;
  if (error)
    return <div className="p-8 text-red-400 text-center">{error}</div>;

  const activeCount =
    (statusCounts.tasked || 0) +
    (statusCounts.under_investigation || 0) +
    (statusCounts.pending || 0);
  const resolvedCount = (statusCounts.served || 0) + (statusCounts.closed || 0);

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">System Statistics</h2>
        <p className="text-sm text-gray-400 mt-1">Live counts scoped to your access level</p>
      </div>

      {/* Top summary */}
      <div>
        <SectionTitle>Summary</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Cases"
            value={totalCases}
            textColor="text-white"
            border="border-gray-700"
            bg="bg-gray-800"
          />
          <StatCard
            label="Active"
            value={activeCount}
            textColor="text-orange-400"
            border="border-orange-700"
            bg="bg-orange-900/20"
            sub="tasked + under investigation + pending"
          />
          <StatCard
            label="Resolved"
            value={resolvedCount}
            textColor="text-green-400"
            border="border-green-700"
            bg="bg-green-900/20"
            sub="served + closed"
          />
          {canSeeIncidents && (
            <StatCard
              label="Incidents"
              value={incidents}
              textColor="text-red-400"
              border="border-red-700"
              bg="bg-red-900/20"
            />
          )}
        </div>
      </div>

      {/* Case status breakdown */}
      <div>
        <SectionTitle>Cases by Status</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CASE_STATUSES.map((s) => (
            <StatCard
              key={s.key}
              label={s.label}
              value={statusCounts[s.key]}
              textColor={s.textColor}
              border={s.border}
              bg={s.bg}
            />
          ))}
        </div>

        {/* Proportional bar */}
        {totalCases > 0 && (
          <div className="mt-4 bg-gray-800 rounded-lg border border-gray-700 p-4">
            <p className="text-xs text-gray-400 mb-2">Status distribution</p>
            <div className="h-4 rounded-full bg-gray-700 overflow-hidden flex">
              {CASE_STATUSES.map((s) => {
                const pct = totalCases > 0 ? ((statusCounts[s.key] || 0) / totalCases) * 100 : 0;
                if (pct === 0) return null;
                const barColors = {
                  new: "bg-blue-500",
                  open: "bg-cyan-500",
                  tasked: "bg-yellow-500",
                  under_investigation: "bg-orange-500",
                  pending: "bg-purple-500",
                  served: "bg-green-500",
                  closed: "bg-gray-500",
                  referred: "bg-red-500",
                };
                return (
                  <div
                    key={s.key}
                    title={`${s.label}: ${statusCounts[s.key]} (${pct.toFixed(1)}%)`}
                    className={`${barColors[s.key]} h-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {CASE_STATUSES.filter((s) => statusCounts[s.key] > 0).map((s) => (
                <span key={s.key} className={`text-xs ${s.textColor}`}>
                  {s.label}: {statusCounts[s.key]}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Other metrics */}
      {(canSeeBriefs || canSeeUsers) && (
        <div>
          <SectionTitle>Other Metrics</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {canSeeBriefs && (
              <StatCard
                label="Morning Briefs"
                value={briefs}
                textColor="text-blue-400"
                border="border-blue-700"
                bg="bg-blue-900/20"
              />
            )}
            {canSeeUsers && (
              <StatCard
                label="Users"
                value={users}
                textColor="text-purple-400"
                border="border-purple-700"
                bg="bg-purple-900/20"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
