import React, { useCallback, useEffect, useState } from "react";
import { offenceService } from "../services/api";
import ActionModal from "./common/ActionModal";

const EMPTY_FORM = { category: "", name: "" };

function toArray(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

export default function Offences({ user }) {
  const isSuperuser = !!user?.is_superuser;
  const [offences, setOffences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadOffences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await offenceService.list();
      setOffences(toArray(res.data));
    } catch {
      setError("Failed to load offences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOffences();
  }, [loadOffences]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isSuperuser) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editingId) {
        await offenceService.update(editingId, form);
        setNotice("Offence updated.");
        resetForm();
      } else {
        await offenceService.create(form);
        setNotice("Offence added.");
        await loadOffences();
        const addAnother = window.confirm("Offence saved successfully. Add another offence?");
        resetForm();
        if (addAnother) {
          setForm(EMPTY_FORM);
          setEditingId(null);
        }
        return;
      }
      await loadOffences();
    } catch {
      setError("Failed to save offence.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (offence) => {
    setEditingId(offence.id);
    setForm({ category: offence.category || "", name: offence.name || "" });
    setError("");
    setNotice("");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      await offenceService.delete(deleteTarget.id);
      setNotice("Offence deleted.");
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await loadOffences();
    } catch {
      setError("Failed to delete offence.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white">Offences</h2>
        {!isSuperuser && (
          <span className="rounded border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-400">
            Read only
          </span>
        )}
      </div>

      {(notice || error) && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          error ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-green-500/40 bg-green-500/10 text-green-300"
        }`}>
          {error || notice}
        </div>
      )}

      {isSuperuser && (
        <form onSubmit={handleSubmit} className="mb-5 grid gap-3 rounded-lg border border-gray-700 bg-gray-800 p-4 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            placeholder="Category"
            className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
            required
          />
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Offence name"
            className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
            required
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Add"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-gray-300">Loading...</div>
      ) : offences.length === 0 ? (
        <div className="text-gray-400 italic py-8 text-center">No offences found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow border border-gray-700 bg-gray-800">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-700 text-gray-200 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Offence Name</th>
                {isSuperuser && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {offences.map((offence, index) => (
                <tr
                  key={offence.id}
                  className={
                    (index % 2 === 0 ? "bg-gray-900" : "bg-gray-800") +
                    " hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0"
                  }
                >
                  <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-100">{offence.category}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-100">{offence.name}</td>
                  {isSuperuser && (
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(offence)}
                        className="mr-2 rounded bg-yellow-600 px-2 py-1 text-white hover:bg-yellow-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(offence)}
                        className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    </div>
  );
}
