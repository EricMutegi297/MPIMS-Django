import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { caseService, dutyRoomService } from "../services/api";

const STATUS_COLORS = {
  new: "#2563eb",
  open: "#0891b2",
  tasked: "#d97706",
  under_investigation: "#4f46e5",
  pending: "#ea580c",
  served: "#7c3aed",
  closed: "#16a34a",
  referred: "#e11d48",
};

const TYPE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#e11d48"];
const RANK_COLORS = ["#2563eb", "#0891b2", "#16a34a", "#d97706", "#7c3aed", "#e11d48"];

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStartIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIso() {
  return localIsoDate(new Date());
}

function caseFilterLink(param, value) {
  const qs = new URLSearchParams();
  if (value) qs.set(param, value);
  return `/dashboard/cases?${qs.toString()}`;
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyChart({ text = "No graph data available." }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function MetricTile({ label, value, tone = "blue" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone] || tones.blue}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-950">{formatNumber(value)}</p>
    </div>
  );
}

function DonutChart({ data, totalLabel = "Total" }) {
  const rows = data.filter((item) => Number(item.count || 0) > 0);
  const total = rows.reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (!total) return <EmptyChart />;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="grid gap-4 md:grid-cols-[220px,1fr] md:items-center">
      <svg viewBox="0 0 120 120" className="mx-auto h-[220px] w-[220px]" role="img" aria-label={totalLabel}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="16" />
        {rows.map((item, index) => {
          const length = (Number(item.count || 0) / total) * circumference;
          const circle = (
            <circle
              key={item.key || item.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={item.color || TYPE_COLORS[index % TYPE_COLORS.length]}
              strokeWidth="16"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
          );
          offset += length;
          return circle;
        })}
        <text x="60" y="56" textAnchor="middle" className="fill-slate-900 text-[18px] font-bold">
          {formatNumber(total)}
        </text>
        <text x="60" y="72" textAnchor="middle" className="fill-slate-500 text-[8px] font-semibold uppercase tracking-wide">
          {totalLabel}
        </text>
      </svg>
      <div className="space-y-2">
        {rows.map((item, index) => {
          const pct = total ? (Number(item.count || 0) / total) * 100 : 0;
          return (
            <Link
              key={item.key || item.label}
              to={item.to || "#"}
              className="grid grid-cols-[14px,1fr,auto] items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span
                className="h-3.5 w-3.5 rounded-sm"
                style={{ backgroundColor: item.color || TYPE_COLORS[index % TYPE_COLORS.length] }}
              />
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              <span className="font-semibold text-slate-950">{formatNumber(item.count)} ({pct.toFixed(1)}%)</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function LineChart({ data }) {
  const rows = data || [];
  const max = Math.max(1, ...rows.map((item) => Number(item.count || 0)));
  const hasData = rows.some((item) => Number(item.count || 0) > 0);
  if (!rows.length || !hasData) return <EmptyChart text="No monthly case trend yet." />;

  const width = 680;
  const height = 260;
  const pad = { top: 24, right: 24, bottom: 42, left: 42 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const points = rows.map((item, index) => {
    const x = pad.left + (rows.length === 1 ? chartW / 2 : (index / (rows.length - 1)) * chartW);
    const y = pad.top + chartH - (Number(item.count || 0) / max) * chartH;
    return { ...item, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = `${path} L ${points[points.length - 1].x} ${pad.top + chartH} L ${points[0].x} ${pad.top + chartH} Z`;
  const labelStep = rows.length > 8 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full" role="img" aria-label="Monthly case trend line graph">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = pad.top + chartH - ratio * chartH;
        return (
          <g key={ratio}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e2e8f0" />
            <text x={pad.left - 10} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {Math.round(max * ratio)}
            </text>
          </g>
        );
      })}
      <path d={area} fill="#dbeafe" opacity="0.75" />
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => (
        <g key={point.month || point.label}>
          <circle cx={point.x} cy={point.y} r="4" fill="#2563eb" stroke="#fff" strokeWidth="2" />
          {index % labelStep === 0 && (
            <text x={point.x} y={height - 15} textAnchor="middle" className="fill-slate-500 text-[10px]">
              {point.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function VerticalBarChart({ data }) {
  const rows = data.filter((item) => Number(item.count || 0) > 0);
  const max = Math.max(1, ...rows.map((item) => Number(item.count || 0)));
  if (!rows.length) return <EmptyChart />;

  const width = 720;
  const height = 280;
  const pad = { top: 24, right: 16, bottom: 58, left: 38 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const slot = chartW / rows.length;
  const barW = Math.min(54, slot * 0.62);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full" role="img" aria-label="Case status bar graph">
      {[0, 0.5, 1].map((ratio) => {
        const y = pad.top + chartH - ratio * chartH;
        return (
          <g key={ratio}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e2e8f0" />
            <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {Math.round(max * ratio)}
            </text>
          </g>
        );
      })}
      {rows.map((item, index) => {
        const value = Number(item.count || 0);
        const barH = (value / max) * chartH;
        const x = pad.left + index * slot + (slot - barW) / 2;
        const y = pad.top + chartH - barH;
        return (
          <g key={item.key || item.label}>
            <rect x={x} y={y} width={barW} height={barH} rx="5" fill={item.color || STATUS_COLORS[item.key] || "#2563eb"} />
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-slate-800 text-[12px] font-semibold">
              {formatNumber(value)}
            </text>
            <text x={x + barW / 2} y={height - 30} textAnchor="middle" className="fill-slate-500 text-[10px]">
              {item.shortLabel || item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function HorizontalRankBars({ data, linkParam, valueForLink, emptyText }) {
  const rows = data.filter((item) => Number(item.count || 0) > 0).slice(0, 10);
  const max = Math.max(1, ...rows.map((item) => Number(item.count || 0)));
  if (!rows.length) return <EmptyChart text={emptyText} />;

  return (
    <div className="space-y-3">
      {rows.map((item, index) => {
        const value = Number(item.count || 0);
        const pct = Math.max(4, (value / max) * 100);
        const target = valueForLink ? valueForLink(item) : item.label;
        return (
          <Link
            key={`${item.label}-${index}`}
            to={caseFilterLink(linkParam, target)}
            className="block rounded-md p-2 hover:bg-slate-50"
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-800">{index + 1}. {item.label || "Not recorded"}</span>
              <span className="font-semibold text-slate-950">{formatNumber(value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: RANK_COLORS[index % RANK_COLORS.length] }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function GroupedTrafficBars({ rows }) {
  const visibleRows = rows.filter((item) => Number(item.reported || 0) || Number(item.yankee || 0) || Number(item.xray || 0));
  const max = Math.max(1, ...visibleRows.flatMap((item) => [item.reported || 0, item.yankee || 0, item.xray || 0]));
  if (!visibleRows.length) return <EmptyChart text="No traffic graph data for this period." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> Reported</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Injured</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-600" /> Dead</span>
      </div>
      {visibleRows.map((item) => (
        <div key={item.key} className="grid gap-2 md:grid-cols-[170px,1fr] md:items-center">
          <p className="truncate text-sm font-medium text-slate-800">{item.label}</p>
          <div className="space-y-1.5">
            {[
              ["reported", "bg-blue-600"],
              ["yankee", "bg-amber-500"],
              ["xray", "bg-rose-600"],
            ].map(([key, cls]) => {
              const value = Number(item[key] || 0);
              return (
                <div key={key} className="grid grid-cols-[1fr,42px] items-center gap-2">
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.max(0, (value / max) * 100)}%` }} />
                  </div>
                  <span className="text-right text-xs font-semibold text-slate-700">{formatNumber(value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Graphs({ user }) {
  const [caseStats, setCaseStats] = useState(null);
  const [trafficStats, setTrafficStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    Promise.allSettled([
      caseService.statistics(),
      dutyRoomService.trafficStatistics({
        period: "range",
        date_from: monthStartIso(),
        date_to: todayIso(),
      }),
    ]).then(([caseResult, trafficResult]) => {
      if (!mounted) return;
      if (caseResult.status === "fulfilled") {
        setCaseStats(caseResult.value.data || {});
      } else {
        setError("Failed to load graph data.");
      }
      if (trafficResult.status === "fulfilled") {
        setTrafficStats(trafficResult.value.data || null);
      }
    }).finally(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const statusData = useMemo(() => (
    toArray(caseStats?.status_breakdown).map((item) => ({
      ...item,
      color: STATUS_COLORS[item.key] || "#64748b",
      shortLabel: item.label === "Under Investigation" ? "Under Inv." : item.label,
      to: caseFilterLink("status", item.key),
    }))
  ), [caseStats]);

  const criminalTypeData = useMemo(() => (
    toArray(caseStats?.criminal_offence_types).map((item, index) => ({
      ...item,
      color: TYPE_COLORS[index % TYPE_COLORS.length],
      to: caseFilterLink("criminal_offence_type", item.key),
    }))
  ), [caseStats]);

  const activeTotal = statusData
    .filter((item) => ["tasked", "under_investigation", "pending"].includes(item.key))
    .reduce((sum, item) => sum + Number(item.count || 0), 0);
  const resolvedTotal = statusData
    .filter((item) => ["served", "closed"].includes(item.key))
    .reduce((sum, item) => sum + Number(item.count || 0), 0);

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading graphs...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-400">{error}</div>;
  }

  return (
    <div className="min-h-screen space-y-6 bg-slate-100 p-4 text-slate-900 md:p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">Graphs</h2>
        <p className="text-sm text-slate-600">Visual case and occurrence patterns scoped to {user?.role === "corps_cmd" ? "Corps Command" : "your dashboard"}.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Total Cases" value={caseStats?.total_cases} tone="blue" />
        <MetricTile label="Active Cases" value={activeTotal} tone="amber" />
        <MetricTile label="Resolved Cases" value={resolvedTotal} tone="emerald" />
        <MetricTile label="Traffic Reports" value={trafficStats?.totals?.reported} tone="rose" />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartPanel title="Cases by Status" subtitle="Doughnut graph">
          <DonutChart data={statusData} totalLabel="Cases" />
        </ChartPanel>

        <ChartPanel title="Monthly Case Trend" subtitle="Line graph, last 12 months">
          <LineChart data={toArray(caseStats?.monthly_case_trend)} />
        </ChartPanel>

        <ChartPanel title="Status Volumes" subtitle="Vertical bar graph">
          <VerticalBarChart data={statusData} />
        </ChartPanel>

        <ChartPanel title="Case Type Split" subtitle="Doughnut graph">
          <DonutChart data={criminalTypeData} totalLabel="Types" />
        </ChartPanel>

        <ChartPanel title="Top Offences" subtitle="Horizontal bar graph">
          <HorizontalRankBars
            data={toArray(caseStats?.top_offences)}
            linkParam="offence"
            emptyText="No offence graph data yet."
          />
        </ChartPanel>

        <ChartPanel title="Top Hotspots" subtitle="Horizontal bar graph">
          <HorizontalRankBars
            data={toArray(caseStats?.top_hotspots)}
            linkParam="place_of_offence"
            emptyText="No hotspot graph data yet."
          />
        </ChartPanel>

        <ChartPanel title="Accused Units" subtitle="Horizontal bar graph">
          <HorizontalRankBars
            data={toArray(caseStats?.top_accused_units)}
            linkParam="accused_unit"
            valueForLink={(item) => item.id}
            emptyText="No accused unit graph data yet."
          />
        </ChartPanel>

        <ChartPanel title="Road Traffic Incidents" subtitle="Grouped bar graph">
          <GroupedTrafficBars rows={toArray(trafficStats?.rows)} />
        </ChartPanel>
      </div>
    </div>
  );
}
