import React from "react";

export const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default function PaginationControls({
  page,
  pageSize,
  totalCount,
  itemLabel = "records",
  loading = false,
  onPageChange,
  onPageSizeChange,
  className = "",
  variant = "light",
}) {
  const count = Number(totalCount || 0);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  const start = count === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, count);
  const singularLabel = itemLabel.endsWith("ies")
    ? `${itemLabel.slice(0, -3)}y`
    : itemLabel.endsWith("s")
      ? itemLabel.slice(0, -1)
      : itemLabel;
  const label = count === 1 ? singularLabel : itemLabel;
  const dark = variant === "dark";
  const borderClass = dark ? "border-gray-700" : "border-slate-200";
  const textClass = dark ? "text-gray-300" : "text-slate-600";
  const mutedClass = dark ? "text-gray-400" : "text-slate-500";
  const strongClass = dark ? "text-gray-100" : "text-slate-700";
  const selectClass = dark
    ? "border-gray-600 bg-gray-800 text-gray-100"
    : "border-slate-300 bg-white text-slate-800";
  const buttonClass = dark
    ? "border-gray-600 text-gray-200 hover:bg-gray-700"
    : "border-slate-300 text-slate-700 hover:bg-slate-50";

  function changePage(nextPage) {
    if (!onPageChange) return;
    onPageChange(Math.min(Math.max(1, nextPage), totalPages));
  }

  return (
    <div className={`flex flex-col gap-3 border-t ${borderClass} px-4 py-3 text-sm ${textClass} lg:flex-row lg:items-center lg:justify-between ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Showing {start.toLocaleString()}-{end.toLocaleString()} of {count.toLocaleString()} {label}
        </span>
        {onPageSizeChange && (
          <label className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
            Per page
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              disabled={loading}
              className={`rounded-md border px-2 py-1 text-sm font-medium normal-case tracking-normal ${selectClass}`}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => changePage(1)}
          disabled={loading || currentPage <= 1}
          className={`rounded-md border px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
        >
          First
        </button>
        <button
          type="button"
          onClick={() => changePage(currentPage - 1)}
          disabled={loading || currentPage <= 1}
          className={`rounded-md border px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
        >
          Previous
        </button>
        <span className={`px-2 font-medium ${strongClass}`}>
          Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={() => changePage(currentPage + 1)}
          disabled={loading || currentPage >= totalPages}
          className={`rounded-md border px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => changePage(totalPages)}
          disabled={loading || currentPage >= totalPages}
          className={`rounded-md border px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
        >
          Last
        </button>
      </div>
    </div>
  );
}
