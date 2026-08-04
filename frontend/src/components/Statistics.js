import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { caseService, dutyRoomService, incidentService, morningBriefService, userService } from "../services/api";

const CASE_STATUSES = [
  { key: "new", label: "New", accent: "blue" },
  { key: "open", label: "Open", accent: "cyan" },
  { key: "tasked", label: "Tasked", accent: "amber" },
  { key: "under_investigation", label: "Under Investigation", accent: "orange" },
  { key: "pending", label: "Pending", accent: "purple" },
  { key: "served", label: "Served", accent: "emerald" },
  { key: "closed", label: "Closed", accent: "slate" },
  { key: "referred", label: "Referred", accent: "rose" },
];

const SERVICE_OPTIONS = [
  { key: "", label: "All Services" },
  { key: "KA", label: "Kenya Army" },
  { key: "KAF", label: "Kenya Air Force" },
  { key: "KN", label: "Kenya Navy" },
];

const REPORT_STATUS_OPTIONS = [
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active/Pending" },
  { key: "all", label: "All" },
  ...CASE_STATUSES.map((status) => ({ key: status.key, label: status.label })),
];

const ACCENT = {
  blue: { text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", bar: "bg-blue-500" },
  cyan: { text: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200", bar: "bg-cyan-500" },
  amber: { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", bar: "bg-amber-500" },
  orange: { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", bar: "bg-orange-500" },
  purple: { text: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", bar: "bg-purple-500" },
  emerald: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", bar: "bg-emerald-500" },
  rose: { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", bar: "bg-rose-500" },
  slate: { text: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200", bar: "bg-slate-500" },
};

function formatNumber(value) {
  if (value === null || value === undefined) return "--";
  return Number(value || 0).toLocaleString();
}

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return localIsoDate(new Date());
}

function monthStartIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function displayDate(value) {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function reportPeriodLabel(report) {
  if (!report) return "";
  if (report.period === "range") {
    return `from ${displayDate(report.date_from)} to ${displayDate(report.date_to)}`;
  }
  return `as of ${displayDate(report.as_at)}`;
}

function reportPeriodSlug(report) {
  if (!report) return todayIso();
  if (report.period === "range") {
    return `${report.date_from || "from"}-to-${report.date_to || "to"}`;
  }
  return report.as_at || todayIso();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function StatCard({ label, value, accent = "slate", sub, to }) {
  const tone = ACCENT[accent] || ACCENT.slate;
  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} p-4`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone.text}`}>{label}</p>
      {to ? (
        <Link
          to={to}
          className="mt-1 inline-flex rounded-md text-3xl font-bold text-slate-950 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {formatNumber(value)}
        </Link>
      ) : (
        <p className="mt-1 text-3xl font-bold text-slate-950">{formatNumber(value)}</p>
      )}
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

function caseFilterLink(param, value) {
  const qs = new URLSearchParams();
  qs.set(param, value || "");
  return `/dashboard/cases?${qs.toString()}`;
}

function serviceCaseLink({ report, service, unitId, offence }) {
  const qs = new URLSearchParams();
  if (report?.status && !["all", "active"].includes(report.status)) {
    qs.set("status", report.status);
  }
  if (service && service !== "not_recorded") qs.set("accused_service", service);
  if (unitId) qs.set("accused_unit", unitId);
  if (offence && offence !== "Not recorded") qs.set("offence", offence);
  if (report?.period === "range") {
    if (report.date_from) qs.set("created_from", report.date_from);
    if (report.date_to) qs.set("created_to", report.date_to);
  } else if (report?.as_at) {
    qs.set("created_to", report.as_at);
  }
  return `/dashboard/cases?${qs.toString()}`;
}

function trafficEntryLink({ report, roadTrafficType, metric }) {
  const qs = new URLSearchParams();
  qs.set("entry_type", "road_traffic_accident");
  if (roadTrafficType && roadTrafficType !== "not_recorded") {
    qs.set("road_traffic_type", roadTrafficType);
  }
  if (metric) {
    qs.set("metric", metric);
  }
  if (report?.period === "range") {
    if (report.date_from) qs.set("date_from", report.date_from);
    if (report.date_to) qs.set("date_to", report.date_to);
  } else if (report?.as_at) {
    qs.set("date_to", report.as_at);
  }
  return `/dashboard/duty-room?${qs.toString()}`;
}

function RankingPanel({ title, subtitle, items, emptyText, accent = "blue", filterParam, valueForLink }) {
  const tone = ACCENT[accent] || ACCENT.blue;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <SectionTitle title={title} subtitle={subtitle} />
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-16 px-3 py-2 text-left font-semibold">Rank</th>
                  <th className="px-3 py-2 text-left font-semibold">Item</th>
                  <th className="w-24 px-3 py-2 text-right font-semibold">Cases</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.slice(0, 10).map((item, index) => (
                  <tr key={`${item.label}-${index}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 align-top">
                      <span className={`inline-flex h-6 min-w-7 items-center justify-center rounded-md px-2 text-xs font-bold ${tone.bg} ${tone.text}`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top font-medium text-slate-800">
                      {item.label || "Not recorded"}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <Link
                        to={caseFilterLink(filterParam, valueForLink ? valueForLink(item) : item.label)}
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${tone.bg} ${tone.text} hover:underline`}
                      >
                        {formatNumber(item.count)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

const getCount = (res) => {
  const d = res?.data;
  if (typeof d?.count === "number") return d.count;
  if (Array.isArray(d)) return d.length;
  return 0;
};

function printServiceReport(report) {
  if (!report) return;
  const periodLabel = reportPeriodLabel(report);
  const sections = (report.services || []).map((service) => {
    const headers = ["Formation / Unit", ...(service.offences || []), "Total"];
    const bodyRows = (service.rows || []).map((row) => [
      row.formation_unit,
      ...(service.offences || []).map((offence) => row.offences?.[offence] || 0),
      row.total || 0,
    ]);
    const subtotalRow = [
      `${service.label} Total`,
      ...(service.offences || []).map((offence) => service.subtotal?.[offence] || 0),
      service.total || 0,
    ];
    const rows = [...bodyRows, subtotalRow];
    return `<h2>${escapeHtml(service.label)} ${escapeHtml(report.status_label)} Cases ${escapeHtml(periodLabel)}</h2>
      <p>Military Police Investigation Management System - Statistics Report</p>
      <table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row, index) => `<tr class="${index === rows.length - 1 ? "total" : ""}">${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }).join("");
  const html = `<!doctype html><html><head><title>Statistics Per Service</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#0f172a;background:#fff}
    h1{color:#075985;text-align:center;text-transform:uppercase;margin:0 0 28px;font-size:28px;letter-spacing:.02em}
    h2{text-align:center;font-size:14px;margin:20px 0 4px;color:#0f172a}
    p{text-align:center;color:#475569;font-size:11px;margin:0 0 12px}
    table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;margin-bottom:22px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}
    th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:center}
    th:first-child,td:first-child{text-align:left}
    th{background:#e2e8f0;color:#334155;text-transform:uppercase;font-size:10px}
    tr:nth-child(even){background:#f8fafc}
    tr.total{background:#dbeafe;color:#0f172a;font-weight:bold}
    tr.total td{border-top:2px solid #93c5fd;border-bottom:0}
  </style></head><body><h1>Statistics Per Service</h1>${sections || "<p>No service report data found.</p>"}<script>window.onload=function(){window.print();}</script></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function exportServiceReportCsv(report) {
  if (!report) return;
  const lines = [
    ["Statistics Per Service"],
    ["Status", report.status_label],
    ["Period", reportPeriodLabel(report)],
    [],
  ];
  (report.services || []).forEach((service) => {
    lines.push([`${service.label} ${report.status_label} Cases ${reportPeriodLabel(report)}`]);
    lines.push(["Formation / Unit", ...(service.offences || []), "Total"]);
    (service.rows || []).forEach((row) => {
      lines.push([
        row.formation_unit,
        ...(service.offences || []).map((offence) => row.offences?.[offence] || 0),
        row.total || 0,
      ]);
    });
    lines.push([
      `${service.label} Total`,
      ...(service.offences || []).map((offence) => service.subtotal?.[offence] || 0),
      service.total || 0,
    ]);
    lines.push([]);
  });
  const csv = lines.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statistics-per-service-${reportPeriodSlug(report)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function printTrafficReport(report) {
  if (!report) return;
  const periodLabel = reportPeriodLabel(report);
  const rows = [
    ...(report.rows || []).map((row) => [
      row.label,
      row.reported || 0,
      row.yankee || 0,
      row.xray || 0,
    ]),
    [
      "Total",
      report.totals?.reported || 0,
      report.totals?.yankee || 0,
      report.totals?.xray || 0,
    ],
  ];
  const html = `<!doctype html><html><head><title>Traffic Incidents Reported</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#0f172a;background:#fff}
    h1{color:#075985;text-align:center;text-transform:uppercase;margin:0 0 6px;font-size:24px;letter-spacing:.02em}
    p{text-align:center;color:#475569;font-size:11px;margin:0 0 16px}
    table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}
    th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:center}
    th:first-child,td:first-child{text-align:left}
    th{background:#e2e8f0;color:#334155;text-transform:uppercase;font-size:10px}
    tr:nth-child(even){background:#f8fafc}
    tr.total{background:#dbeafe;color:#0f172a;font-weight:bold}
    tr.total td{border-top:2px solid #93c5fd;border-bottom:0}
  </style></head><body>
    <h1>Traffic Incidents Reported</h1>
    <p>${escapeHtml(periodLabel)}</p>
    <table>
      <thead><tr><th>Road Traffic Accident Type</th><th>Reported</th><th>Yankee</th><th>X-ray</th></tr></thead>
      <tbody>${rows.map((row, index) => `<tr class="${index === rows.length - 1 ? "total" : ""}">${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
    <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function exportTrafficReportCsv(report) {
  if (!report) return;
  const lines = [
    ["Traffic Incidents Reported"],
    ["Period", reportPeriodLabel(report)],
    ["Road Traffic Accident Type", "Reported", "Yankee", "X-ray"],
  ];
  (report.rows || []).forEach((row) => {
    lines.push([row.label, row.reported || 0, row.yankee || 0, row.xray || 0]);
  });
  lines.push([
    "Total",
    report.totals?.reported || 0,
    report.totals?.yankee || 0,
    report.totals?.xray || 0,
  ]);
  const csv = lines.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `traffic-incidents-${reportPeriodSlug(report)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const TRAFFIC_COUNT_LINK_CLASS = {
  reported: "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100 hover:text-slate-900",
  yankee: "bg-orange-50 text-orange-700 ring-orange-100 hover:bg-orange-100 hover:text-orange-800",
  xray: "bg-rose-50 text-rose-700 ring-rose-100 hover:bg-rose-100 hover:text-rose-800",
};

function TrafficCountLink({ report, roadTrafficType, metric, value, total = false }) {
  const tone = TRAFFIC_COUNT_LINK_CLASS[metric] || TRAFFIC_COUNT_LINK_CLASS.reported;
  return (
    <Link
      to={trafficEntryLink({ report, roadTrafficType, metric })}
      className={`inline-flex min-w-9 justify-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${tone} ${
        total ? "bg-white" : ""
      }`}
    >
      {formatNumber(value)}
    </Link>
  );
}

function TrafficReportPanel({ report, filters, onFiltersChange, loading, error }) {
  const rows = report?.rows || [];
  const totals = report?.totals || { reported: 0, yankee: 0, xray: 0 };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <SectionTitle
            title="Traffic Incidents Reported"
            subtitle="Road Traffic Accident statistics."
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Period
              <select
                value={filters.period}
                onChange={(event) => {
                  const period = event.target.value;
                  onFiltersChange({
                    ...filters,
                    period,
                    date_from: filters.date_from || monthStartIso(),
                    date_to: filters.date_to || filters.as_at || todayIso(),
                  });
                }}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
              >
                <option value="range">Range</option>
                <option value="as_at">As At</option>
              </select>
            </label>
            {filters.period === "range" ? (
              <>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  From
                  <input
                    type="date"
                    value={filters.date_from}
                    onChange={(event) => onFiltersChange({ ...filters, date_from: event.target.value || monthStartIso() })}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  To
                  <input
                    type="date"
                    value={filters.date_to}
                    onChange={(event) => onFiltersChange({ ...filters, date_to: event.target.value || todayIso() })}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
                  />
                </label>
              </>
            ) : (
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                As At
                <input
                  type="date"
                  value={filters.as_at}
                  onChange={(event) => onFiltersChange({ ...filters, as_at: event.target.value || todayIso() })}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => printTrafficReport(report)}
              disabled={!report || loading}
              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              Print
            </button>
            <button
              type="button"
              onClick={() => exportTrafficReportCsv(report)}
              disabled={!report || loading}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 bg-slate-50/60 p-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading traffic incident statistics...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !report ? (
          <p className="text-sm text-slate-500">No traffic incident report data found.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Traffic Incidents Reported" value={totals.reported} accent="blue" to={trafficEntryLink({ report, metric: "reported" })} />
              <StatCard label="Yankee" value={totals.yankee} accent="orange" to={trafficEntryLink({ report, metric: "yankee" })} />
              <StatCard label="X-ray" value={totals.xray} accent="rose" to={trafficEntryLink({ report, metric: "xray" })} />
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="min-w-72 px-4 py-3 text-left font-bold">Road Traffic Accident Type</th>
                    <th className="w-28 px-4 py-3 text-center font-bold">Reported</th>
                    <th className="w-28 px-4 py-3 text-center font-bold">Yankee</th>
                    <th className="w-28 px-4 py-3 text-center font-bold">X-ray</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row) => (
                    <tr key={row.key} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/40">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.label}</td>
                      <td className="px-4 py-3 text-center">
                        <TrafficCountLink report={report} roadTrafficType={row.key} metric="reported" value={row.reported} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <TrafficCountLink report={report} roadTrafficType={row.key} metric="yankee" value={row.yankee} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <TrafficCountLink report={report} roadTrafficType={row.key} metric="xray" value={row.xray} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-blue-200 bg-blue-50 font-bold text-slate-950">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-center">
                      <TrafficCountLink report={report} metric="reported" value={totals.reported} total />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TrafficCountLink report={report} metric="yankee" value={totals.yankee} total />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TrafficCountLink report={report} metric="xray" value={totals.xray} total />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ServiceReportPanel({ report, filters, onFiltersChange, loading, error }) {
  const countLinkClass =
    "inline-flex min-w-9 justify-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100 hover:bg-blue-100 hover:text-blue-800";
  const totalLinkClass =
    "inline-flex min-w-9 justify-center rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50";
  const periodLabel = reportPeriodLabel(report);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <SectionTitle
              title="Statistics Per Service"
              subtitle="Formal tabular report by service, formation/unit, offence, and total."
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Service
              <select
                value={filters.service}
                onChange={(event) => onFiltersChange({ ...filters, service: event.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
              >
                {SERVICE_OPTIONS.map((option) => (
                  <option key={option.key || "all"} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
              <select
                value={filters.status}
                onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
              >
                {REPORT_STATUS_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Period
              <select
                value={filters.period}
                onChange={(event) => {
                  const period = event.target.value;
                  onFiltersChange({
                    ...filters,
                    period,
                    date_from: filters.date_from || monthStartIso(),
                    date_to: filters.date_to || filters.as_at || todayIso(),
                  });
                }}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
              >
                <option value="as_at">As At</option>
                <option value="range">Range</option>
              </select>
            </label>
            {filters.period === "range" ? (
              <>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  From
                  <input
                    type="date"
                    value={filters.date_from}
                    onChange={(event) => onFiltersChange({ ...filters, date_from: event.target.value || monthStartIso() })}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  To
                  <input
                    type="date"
                    value={filters.date_to}
                    onChange={(event) => onFiltersChange({ ...filters, date_to: event.target.value || todayIso() })}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
                  />
                </label>
              </>
            ) : (
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                As At
                <input
                  type="date"
                  value={filters.as_at}
                  onChange={(event) => onFiltersChange({ ...filters, as_at: event.target.value || todayIso() })}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => printServiceReport(report)}
              disabled={!report || loading}
              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              Print
            </button>
            <button
              type="button"
              onClick={() => exportServiceReportCsv(report)}
              disabled={!report || loading}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-50/60 p-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading service report...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !report || (report.services || []).length === 0 || !report.total ? (
          <p className="text-sm text-slate-500">No service report data found.</p>
        ) : (
          <div className="space-y-6">
            {(report.services || []).map((service) => (
              <div key={service.service} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-center sm:flex-1">
                      <h3 className="text-base font-bold text-slate-950">
                        {service.label} {report.status_label} Cases {periodLabel}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">Military Police Investigation Management System - Statistics Report</p>
                    </div>
                    <span className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                      {formatNumber(service.total)} total
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="min-w-56 px-4 py-3 text-left font-bold">Formation / Unit</th>
                        {(service.offences || []).map((offence) => (
                          <th key={offence} className="min-w-32 px-4 py-3 text-center font-bold">{offence}</th>
                        ))}
                        <th className="w-28 px-4 py-3 text-center font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(service.rows || []).map((row) => (
                        <tr key={row.unit_id || row.formation_unit} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/40">
                          <td className="px-4 py-3 font-semibold text-slate-900">{row.formation_unit}</td>
                          {(service.offences || []).map((offence) => {
                            const count = row.offences?.[offence] || 0;
                            return (
                              <td key={offence} className="px-4 py-3 text-center">
                                {count ? (
                                  <Link
                                    to={serviceCaseLink({ report, service: service.service, unitId: row.unit_id, offence })}
                                    className={countLinkClass}
                                  >
                                    {formatNumber(count)}
                                  </Link>
                                ) : (
                                  <span className="text-slate-400">0</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center">
                            <Link
                              to={serviceCaseLink({ report, service: service.service, unitId: row.unit_id })}
                              className={countLinkClass}
                            >
                              {formatNumber(row.total)}
                            </Link>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-blue-200 bg-blue-50 font-bold text-slate-950">
                        <td className="px-4 py-3">{service.label} Total</td>
                        {(service.offences || []).map((offence) => (
                          <td key={offence} className="px-4 py-3 text-center">
                            <Link
                              to={serviceCaseLink({ report, service: service.service, offence })}
                              className={totalLinkClass}
                            >
                              {formatNumber(service.subtotal?.[offence] || 0)}
                            </Link>
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center">
                          <Link
                            to={serviceCaseLink({ report, service: service.service })}
                            className={totalLinkClass}
                          >
                            {formatNumber(service.total)}
                          </Link>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Statistics({ user }) {
  const [activeView, setActiveView] = useState("overview");
  const [statusCounts, setStatusCounts] = useState({});
  const [caseInsights, setCaseInsights] = useState({
    top_hotspots: [],
    top_accused_units: [],
    top_offences: [],
    criminal_offence_types: [],
  });
  const [totalCases, setTotalCases] = useState(null);
  const [incidents, setIncidents] = useState(null);
  const [briefs, setBriefs] = useState(null);
  const [users, setUsers] = useState(null);
  const [serviceReport, setServiceReport] = useState(null);
  const [serviceReportLoading, setServiceReportLoading] = useState(false);
  const [serviceReportError, setServiceReportError] = useState(null);
  const [trafficReport, setTrafficReport] = useState(null);
  const [trafficReportLoading, setTrafficReportLoading] = useState(false);
  const [trafficReportError, setTrafficReportError] = useState(null);
  const [serviceFilters, setServiceFilters] = useState({
    service: "",
    status: "pending",
    period: "as_at",
    as_at: todayIso(),
    date_from: monthStartIso(),
    date_to: todayIso(),
  });
  const [trafficFilters, setTrafficFilters] = useState({
    period: "range",
    as_at: todayIso(),
    date_from: monthStartIso(),
    date_to: todayIso(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canSeeUsers =
    user?.is_superuser || ["admin", "mpc_hqs", "personnel"].includes(user?.role);
  const canSeeBriefs = ["admin", "co", "corps_cmd", "detachment", "mpc_hqs", "bsm", "adj"].includes(
    user?.role
  );
  const canSeeIncidents = [
    "admin", "co", "corps_cmd", "duty_officer", "detachment", "mpc_hqs", "cop", "adj",
  ].includes(user?.role) || user?.is_superuser;

  useEffect(() => {
    const fetches = [
      caseService.statistics(),
      caseService.list({ page_size: 1 }),
      ...CASE_STATUSES.map((s) => caseService.list({ page_size: 1, status: s.key })),
    ];
    if (canSeeIncidents) fetches.push(incidentService.list({ page_size: 1 }));
    if (canSeeBriefs) fetches.push(morningBriefService.list({ page_size: 1 }));
    if (canSeeUsers) fetches.push(userService.list({ page_size: 1 }));

    Promise.all(fetches)
      .then((results) => {
        const [insightsRes, totalRes, ...rest] = results;
        setCaseInsights({
          top_hotspots: insightsRes.data?.top_hotspots || [],
          top_accused_units: insightsRes.data?.top_accused_units || [],
          top_offences: insightsRes.data?.top_offences || [],
          criminal_offence_types: insightsRes.data?.criminal_offence_types || [],
        });
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

  useEffect(() => {
    setServiceReportLoading(true);
    setServiceReportError(null);
    const reportParams = {
      service_report_status: serviceFilters.status,
      service: serviceFilters.service || undefined,
      period: serviceFilters.period,
    };
    if (serviceFilters.period === "range") {
      reportParams.date_from = serviceFilters.date_from || monthStartIso();
      reportParams.date_to = serviceFilters.date_to || todayIso();
    } else {
      reportParams.as_at = serviceFilters.as_at || todayIso();
    }
    caseService.statistics(reportParams)
      .then((res) => setServiceReport(res.data?.service_report || null))
      .catch(() => setServiceReportError("Failed to load service report."))
      .finally(() => setServiceReportLoading(false));
  }, [serviceFilters]);

  useEffect(() => {
    setTrafficReportLoading(true);
    setTrafficReportError(null);
    const reportParams = {
      period: trafficFilters.period,
    };
    if (trafficFilters.period === "range") {
      reportParams.date_from = trafficFilters.date_from || monthStartIso();
      reportParams.date_to = trafficFilters.date_to || todayIso();
    } else {
      reportParams.as_at = trafficFilters.as_at || todayIso();
    }
    dutyRoomService.trafficStatistics(reportParams)
      .then((res) => setTrafficReport(res.data || null))
      .catch(() => setTrafficReportError("Failed to load traffic incident statistics."))
      .finally(() => setTrafficReportLoading(false));
  }, [trafficFilters]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading statistics...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }

  const activeCount =
    (statusCounts.tasked || 0) +
    (statusCounts.under_investigation || 0) +
    (statusCounts.pending || 0);
  const resolvedCount = (statusCounts.served || 0) + (statusCounts.closed || 0);

  return (
    <div className="space-y-6 p-4 text-slate-900 md:p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">System Statistics</h2>
        <p className="text-sm text-slate-600">Live counts and top ten rankings scoped to your access level.</p>
      </div>

      <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveView("overview")}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${activeView === "overview" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Overview & Rankings
        </button>
        <button
          type="button"
          onClick={() => setActiveView("service")}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${activeView === "service" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Service Reports
        </button>
        <button
          type="button"
          onClick={() => setActiveView("traffic")}
          className={`rounded-md px-3 py-2 text-sm font-semibold ${activeView === "traffic" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Traffic Incidents
        </button>
      </div>

      {activeView === "overview" ? (
        <>
          <section>
            <SectionTitle title="Summary" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Total Cases" value={totalCases} accent="blue" />
              <StatCard label="Active" value={activeCount} accent="orange" sub="Tasked, under investigation, pending" />
              <StatCard label="Resolved" value={resolvedCount} accent="emerald" sub="Served and closed" />
              {canSeeIncidents && <StatCard label="Incidents" value={incidents} accent="rose" />}
            </div>
          </section>

          <section>
            <SectionTitle title="Cases by Status" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CASE_STATUSES.map((status) => (
                <StatCard
                  key={status.key}
                  label={status.label}
                  value={statusCounts[status.key]}
                  accent={status.accent}
                />
              ))}
            </div>

            {totalCases > 0 && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status Distribution</p>
                <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                  {CASE_STATUSES.map((status) => {
                    const pct = totalCases > 0 ? ((statusCounts[status.key] || 0) / totalCases) * 100 : 0;
                    if (pct === 0) return null;
                    const tone = ACCENT[status.accent] || ACCENT.slate;
                    return (
                      <div
                        key={status.key}
                        title={`${status.label}: ${statusCounts[status.key]} (${pct.toFixed(1)}%)`}
                        className={`${tone.bar} h-full`}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section>
            <SectionTitle title="Top Ten Case Patterns" subtitle="Ranked by the number of cases in your scope." />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <RankingPanel
                title="Top Ten Hotspots"
                subtitle="Using place of offence"
                items={caseInsights.top_hotspots}
                emptyText="No place of offence has been recorded."
                accent="rose"
                filterParam="place_of_offence"
              />
              <RankingPanel
                title="Top Ten Accused Units"
                subtitle="Using accused unit"
                items={caseInsights.top_accused_units}
                emptyText="No accused unit has been recorded."
                accent="blue"
                filterParam="accused_unit"
                valueForLink={(item) => item.id}
              />
              <RankingPanel
                title="Top Ten Most Committed Offences"
                subtitle="Using offence"
                items={caseInsights.top_offences}
                emptyText="No offence has been recorded."
                accent="amber"
                filterParam="offence"
              />
              <RankingPanel
                title="Criminal Offence Type"
                subtitle="Court Martial and DCI/Civ Police case ranking"
                items={caseInsights.criminal_offence_types}
                emptyText="No criminal offence type has been recorded."
                accent="purple"
                filterParam="criminal_offence_type"
                valueForLink={(item) => item.key}
              />
            </div>
          </section>

          {(canSeeBriefs || canSeeUsers) && (
            <section>
              <SectionTitle title="Other Metrics" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {canSeeBriefs && <StatCard label="Morning Briefs" value={briefs} accent="cyan" />}
                {canSeeUsers && <StatCard label="Users" value={users} accent="purple" />}
              </div>
            </section>
          )}
        </>
      ) : activeView === "service" ? (
        <ServiceReportPanel
          report={serviceReport}
          filters={serviceFilters}
          onFiltersChange={setServiceFilters}
          loading={serviceReportLoading}
          error={serviceReportError}
        />
      ) : (
        <TrafficReportPanel
          report={trafficReport}
          filters={trafficFilters}
          onFiltersChange={setTrafficFilters}
          loading={trafficReportLoading}
          error={trafficReportError}
        />
      )}
    </div>
  );
}
