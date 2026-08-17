import React from "react";
import ActionModal from "./ActionModal";

function titleCase(value) {
  const text = String(value || "record").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Record";
}

export default function AddAnotherModal({
  itemLabel = "record",
  title,
  message,
  detail,
  addLabel,
  doneLabel = "Done",
  onAddAnother,
  onDone,
}) {
  const label = titleCase(itemLabel);

  return (
    <ActionModal
      eyebrow="Created"
      title={title || `${label} created successfully`}
      message={message || `The ${itemLabel} has been saved.`}
      tone="green"
      confirmLabel={addLabel || `Add Another ${label}`}
      cancelLabel={doneLabel}
      onCancel={onDone}
      onConfirm={onAddAnother}
    >
      {detail && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-900">
          {detail}
        </div>
      )}
    </ActionModal>
  );
}
