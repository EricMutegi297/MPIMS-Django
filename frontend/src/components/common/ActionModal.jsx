import React from "react";

const TONE = {
  blue: {
    border: "border-blue-200",
    header: "border-blue-100 bg-blue-50",
    eyebrow: "text-blue-700",
    message: "text-blue-800",
    button: "bg-blue-600 hover:bg-blue-700",
  },
  green: {
    border: "border-green-200",
    header: "border-green-100 bg-green-50",
    eyebrow: "text-green-700",
    message: "text-green-800",
    button: "bg-green-600 hover:bg-green-700",
  },
  amber: {
    border: "border-amber-200",
    header: "border-amber-100 bg-amber-50",
    eyebrow: "text-amber-700",
    message: "text-amber-900",
    button: "bg-blue-600 hover:bg-blue-700",
  },
  red: {
    border: "border-red-200",
    header: "border-red-100 bg-red-50",
    eyebrow: "text-red-700",
    message: "text-red-800",
    button: "bg-red-600 hover:bg-red-700",
  },
};

export default function ActionModal({
  eyebrow,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  savingLabel = "Working...",
  saving = false,
  disabled = false,
  tone = "blue",
  onCancel,
  onConfirm,
}) {
  const style = TONE[tone] || TONE.blue;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      onClick={(event) => event.target === event.currentTarget && !saving && onCancel?.()}
    >
      <div className={`w-full max-w-xl overflow-hidden rounded-lg border ${style.border} bg-white shadow-2xl`}>
        <div className={`border-b px-5 py-4 ${style.header}`}>
          {eyebrow && <p className={`text-xs font-bold uppercase tracking-wide ${style.eyebrow}`}>{eyebrow}</p>}
          <h3 className="mt-1 text-lg font-bold text-slate-950">{title}</h3>
          {message && <p className={`mt-1 text-sm ${style.message}`}>{message}</p>}
        </div>
        {children && <div className="space-y-4 px-5 py-4">{children}</div>}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || disabled}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${style.button}`}
          >
            {saving ? savingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
