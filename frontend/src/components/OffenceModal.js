import React, { useState } from "react";
import ActionModal from "./common/ActionModal";

export default function OffenceModal({
  open,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  user,
  offences = [],
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [category, setCategory] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const isSuperuser = !!user?.is_superuser;

  if (!open) return null;

  const grouped = offences.reduce((acc, offence) => {
    const cat = offence.category || "Uncategorised";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(offence);
    return acc;
  }, {});
  const categories = Object.keys(grouped).sort();
  const uniqueCategories = Array.from(new Set(offences.map((o) => o.category))).filter(Boolean).sort();

  const resetForm = () => {
    setCategory("");
    setCategoryInput("");
    setName("");
    setEditing(null);
    setShowForm(false);
    setError("");
  };

  const startAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (offence) => {
    setEditing(offence);
    setCategory(offence.category || "");
    setCategoryInput("");
    setName(offence.name || "");
    setShowForm(true);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const finalCategory = category === "__new__" ? categoryInput.trim() : category;
    if (!finalCategory || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const payload = { category: finalCategory, name: name.trim() };
      if (editing) {
        await onUpdate?.(editing.id, payload);
      } else {
        await onSave?.(payload);
      }
      resetForm();
    } catch {
      setError(`Failed to ${editing ? "update" : "save"} offence.`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete?.(deleteTarget.id);
      setDeleteTarget(null);
      if (editing?.id === deleteTarget.id) {
        resetForm();
      }
    } catch {
      setError("Failed to delete offence.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-gray-800 rounded-xl w-full max-w-lg shadow-2xl border border-gray-700 flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="text-base font-semibold text-white">Offences</h2>
            <div className="flex items-center gap-3">
              {isSuperuser && !showForm && (
                <button
                  type="button"
                  onClick={startAdd}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Offence
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-5 mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {offences.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm">No offences recorded yet.</p>
                {isSuperuser && <p className="text-xs mt-1">Click "Add Offence" to add one.</p>}
              </div>
            ) : (
              categories.map((cat) => (
                <div key={cat}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-400 mb-1.5">{cat}</p>
                  <div className="rounded-lg border border-gray-700 overflow-hidden">
                    {grouped[cat].map((offence, index) => (
                      <div
                        key={offence.id}
                        className={`px-4 py-2.5 text-sm text-gray-200 flex items-center justify-between gap-3 ${
                          index !== 0 ? "border-t border-gray-700/60" : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                          <span className="truncate">{offence.name}</span>
                        </div>
                        {isSuperuser && (
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(offence)}
                              className="text-xs font-medium text-yellow-300 hover:text-yellow-200"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(offence)}
                              className="text-xs font-medium text-red-300 hover:text-red-200"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {showForm && isSuperuser && (
            <div className="border-t border-gray-700 px-5 py-4">
              <p className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wide">
                {editing ? "Edit Offence" : "New Offence"}
              </p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => { setCategory(e.target.value); setCategoryInput(""); }}
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  >
                    <option value="" disabled>Select category</option>
                    {uniqueCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__new__">Add new category...</option>
                  </select>
                </div>
                {category === "__new__" && (
                  <div>
                    <input
                      value={categoryInput}
                      onChange={(e) => setCategoryInput(e.target.value)}
                      placeholder="New category name"
                      className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                      autoFocus
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Offence Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter offence name"
                    className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={saving}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                  >
                    {saving ? "Saving..." : editing ? "Save Changes" : "Save Offence"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ActionModal
          eyebrow="Delete Offence"
          title="Delete this offence?"
          message="This removes the offence from the offence register."
          tone="red"
          confirmLabel="Delete Offence"
          savingLabel="Deleting..."
          saving={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-bold text-slate-950">{deleteTarget.name}</p>
            <p className="mt-1 text-slate-600">{deleteTarget.category}</p>
          </div>
        </ActionModal>
      )}
    </>
  );
}
