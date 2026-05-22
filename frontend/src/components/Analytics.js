import React, { useEffect, useState } from "react";
import api from "../axiosConfig";

function MetricCard({ label, value, unit = "", color = "text-white", sub }) {
  const display = value === null || value === undefined ? "—" : `${value}${unit}`;
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{display}</p>
      {sub && <p className="text-xs mt-1 text-gray-500">{sub}</p>}
    </div>
  );
}

function rateColor(pct) {
  if (pct === null || pct === undefined) return "text-gray-400";
  if (pct >= 75) return "text-green-400";
  if (pct >= 50) return "text-yellow-400";
  return "text-red-400";
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get("/api/cases/analytics/")
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load analytics. You may not have permission to view this data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="p-8 text-gray-400 text-center animate-pulse">Loading analytics…</div>
    );
  if (error)
    return <div className="p-8 text-red-400 text-center">{error}</div>;
  if (!data) return null;

  const slippage =
    data.avg_team_resolution_days !== null && data.avg_team_window_days !== null
      ? Math.round((data.avg_team_resolution_days - data.avg_team_window_days) * 10) / 10
      : null;

  const varianceColor =
    data.avg_days_variance === null
      ? "text-gray-400"
      : data.avg_days_variance <= 0
      ? "text-green-400"
      : "text-red-400";

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Case Resolution Analytics</h2>
        <p className="text-sm text-gray-400 mt-1">
          Deadline-based performance metrics — scoped to your visibility level
        </p>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="On-time Resolution Rate"
          value={data.on_time_rate_pct}
          unit="%"
          color={rateColor(data.on_time_rate_pct)}
          sub="resolved on or before deadline"
        />
        <MetricCard
          label="Currently Overdue"
          value={data.currently_overdue}
          color={data.currently_overdue > 0 ? "text-red-400" : "text-green-400"}
          sub="active cases past deadline"
        />
        <MetricCard
          label="Avg Deadline Variance"
          value={data.avg_days_variance}
          unit=" days"
          color={varianceColor}
          sub={
            data.avg_days_variance === null
              ? null
              : data.avg_days_variance <= 0
              ? "avg days early"
              : "avg days late"
          }
        />
        <MetricCard
          label="Cases with Deadline"
          value={data.total_with_deadline}
          color="text-blue-400"
          sub="of all cases in scope"
        />
      </div>

      {/* Resolution breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Resolution Breakdown
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Resolved" value={data.resolved_total} color="text-white" />
          <MetricCard label="Resolved On Time" value={data.resolved_on_time} color="text-green-400" />
          <MetricCard label="Resolved Late" value={data.resolved_late} color="text-red-400" />
          <MetricCard
            label="On-time %"
            value={data.on_time_rate_pct}
            unit="%"
            color={rateColor(data.on_time_rate_pct)}
          />
        </div>

        {/* Progress bar */}
        {data.resolved_total > 0 && (
          <div className="mt-4 bg-gray-800 rounded-lg border border-gray-700 p-4">
            <p className="text-xs text-gray-400 mb-2">On-time vs Late (resolved cases)</p>
            <div className="h-5 rounded-full bg-gray-700 overflow-hidden flex">
              <div
                className="bg-green-500 h-full transition-all duration-700"
                style={{ width: `${data.on_time_rate_pct || 0}%` }}
              />
              <div
                className="bg-red-500 h-full transition-all duration-700"
                style={{ width: `${100 - (data.on_time_rate_pct || 0)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1.5">
              <span className="text-green-400">On-time: {data.resolved_on_time}</span>
              <span className="text-red-400">Late: {data.resolved_late}</span>
            </div>
          </div>
        )}
      </div>

      {/* Team performance */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Team Performance (assignment-to-close)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Avg Window Given"
            value={data.avg_team_window_days}
            unit=" days"
            color="text-blue-400"
            sub="deadline − team assigned date"
          />
          <MetricCard
            label="Avg Time Taken"
            value={data.avg_team_resolution_days}
            unit=" days"
            color={
              data.avg_team_resolution_days !== null && data.avg_team_window_days !== null
                ? data.avg_team_resolution_days <= data.avg_team_window_days
                  ? "text-green-400"
                  : "text-red-400"
                : "text-white"
            }
            sub="served_at − team assigned date"
          />
          <MetricCard
            label="Avg Slippage"
            value={slippage}
            unit=" days"
            color={slippage === null ? "text-gray-400" : slippage <= 0 ? "text-green-400" : "text-red-400"}
            sub="time taken − window (neg = early)"
          />
        </div>
      </div>

      {/* Battalion breakdown — HQ admin only */}
      {data.by_battalion && data.by_battalion.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Battalion Breakdown
          </h3>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-700 bg-gray-800/80">
                  <th className="px-4 py-3 text-left">Battalion</th>
                  <th className="px-4 py-3 text-right">w/ Deadline</th>
                  <th className="px-4 py-3 text-right">Resolved</th>
                  <th className="px-4 py-3 text-right">On Time</th>
                  <th className="px-4 py-3 text-right">On-time %</th>
                  <th className="px-4 py-3 text-right">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.by_battalion.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-700 last:border-0 hover:bg-gray-700/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-white font-medium">{row.battalion}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{row.total_with_deadline}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{row.resolved_total}</td>
                    <td className="px-4 py-3 text-right text-green-400">{row.resolved_on_time}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={rateColor(row.on_time_rate_pct)}>
                        {row.on_time_rate_pct !== null ? `${row.on_time_rate_pct}%` : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={row.currently_overdue > 0 ? "text-red-400 font-semibold" : "text-gray-400"}>
                        {row.currently_overdue}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No data hint */}
      {data.total_with_deadline === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
          <p className="font-medium">No deadline data yet</p>
          <p className="text-sm mt-1">
            Resolution analytics become available once cases are assigned an investigation deadline.
          </p>
        </div>
      )}
    </div>
  );
}
