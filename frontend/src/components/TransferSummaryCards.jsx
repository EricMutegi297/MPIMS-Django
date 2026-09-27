import React, { useEffect, useState } from "react";
import { caseService } from "../services/api";

const TransferSummaryCards = () => {
  const [summary, setSummary] = useState({ received: [], released: [] });
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState("received");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    caseService.transferSummary()
      .then(({ data }) => {
        if (active) {
          setSummary({
            received: data?.received || [],
            released: data?.released || [],
          });
        }
      })
      .catch(() => {
        if (active) {
          setSummary({ received: [], released: [] });
          setError("Transfer history could not be loaded.");
        }
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const selectedCases = summary[direction];

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Case Transfers
      </h3>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 7l3-3M7 7l3 3M17 17H7m10 0l-3-3m3 3l-3 3" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-sm text-gray-500">Case Transfers</span>
          <span className="mt-1 block text-2xl font-bold leading-none text-gray-900">
            {loading ? "..." : summary.received.length + summary.released.length}
          </span>
        </span>
        <span className="ml-auto text-xs text-blue-500">
          {open ? "Hide" : "View"}
        </span>
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {open && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-gray-800">Transfer history</h4>
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setDirection("received")}
                className={`rounded px-3 py-1 text-xs ${
                  direction === "received"
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                Transferred In ({summary.received.length})
              </button>
              <button
                type="button"
                onClick={() => setDirection("released")}
                className={`rounded px-3 py-1 text-xs ${
                  direction === "released"
                    ? "bg-gray-600 text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                Transferred Out ({summary.released.length})
              </button>
            </div>
          </div>
          {selectedCases.length === 0 ? (
            <p className="text-sm text-gray-500">No transfer history found.</p>
          ) : (
            selectedCases.map((item) => (
              <div key={`${item.id}-${item.transfer_date}`} className="border-t border-gray-200 pt-3 text-sm">
                <p className="font-medium text-gray-800">
                  {item.case_number || `Case #${item.id}`} {item.title ? `- ${item.title}` : ""}
                </p>
                <p className="text-gray-500">{item.transfer_from} → {item.transfer_to}</p>
                <p className="mt-1 text-gray-600">
                  <span className="font-medium">Reason:</span> {item.transfer_reason}
                </p>
                <p className="text-gray-600">
                  <span className="font-medium">Instructions:</span> {item.transfer_instructions}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};

export default TransferSummaryCards;
