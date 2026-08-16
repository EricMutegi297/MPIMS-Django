import React, { useEffect, useState } from "react";
import { offenceService } from "../services/api";
import ActionModal from "./common/ActionModal";

export default function OffencePage({ user }) {
  const [offences, setOffences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category: "", name: "" });
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const fetchOffences = async () => {
    setLoading(true);
    try {
      const res = await offenceService.list();
      setOffences(Array.isArray(res.data.results) ? res.data.results : res.data);
    } catch (err) {
      console.error("[Offences API error]", err, err?.response);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOffences();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await offenceService.update(editingId, form);
      } else {
        await offenceService.create(form);
      }
      setForm({ category: "", name: "" });
      setEditingId(null);
      setNotice(editingId ? "Offence updated." : "Offence added.");
      setError("");
      fetchOffences();
    } catch (err) {
      setError("Error saving offence.");
    }
  };

  const handleEdit = (offence) => {
    setForm({ category: offence.category, name: offence.name });
    setEditingId(offence.id);
  };

  const handleDelete = (offence) => {
    setDeleteTarget(offence);
    setError("");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await offenceService.delete(deleteTarget.id);
      setNotice("Offence deleted.");
      setDeleteTarget(null);
      fetchOffences();
    } catch (err) {
      setError("Error deleting offence.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full">
      <div className="w-full max-w-3xl bg-gray-900 rounded-xl shadow-lg p-8 mt-8">
        <h2 className="text-2xl font-bold mb-6 text-white text-center">Offences</h2>
        {(notice || error) && (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
            {error || notice}
          </div>
        )}
        <form onSubmit={handleSubmit} className="mb-8 flex flex-col md:flex-row gap-2 md:gap-4 items-center justify-center">
          <input
            name="category"
            value={form.category}
            onChange={handleChange}
            placeholder="Category"
            className="px-3 py-2 rounded border border-gray-600 bg-gray-800 text-white w-full md:w-1/3"
            required
          />
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Offence Name"
            className="px-3 py-2 rounded border border-gray-600 bg-gray-800 text-white w-full md:w-1/3"
            required
          />
          <div className="flex gap-2 w-full md:w-auto">
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded w-full md:w-auto">
              {editingId ? "Update" : "Add"} Offence
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm({ category: "", name: "" }); }} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded w-full md:w-auto">
                Cancel
              </button>
            )}
          </div>
        </form>
        {loading ? (
          <div className="text-gray-300 text-center">Loading...</div>
        ) : (
          <div className="overflow-x-auto rounded-lg shadow border border-gray-700 bg-gray-800">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-gray-700 text-gray-200 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Offence Name</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {offences.map((o, idx) => (
                  <tr key={o.id} className={idx % 2 === 0 ? "bg-gray-900" : "bg-gray-800"}>
                    <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-100">{o.category}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-100">{o.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <button onClick={() => handleEdit(o)} className="mr-2 px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded">Edit</button>
                      <button onClick={() => handleDelete(o)} className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {deleteTarget && (
        <ActionModal
          eyebrow="Delete Offence"
          title="Delete this offence?"
          message="This removes the offence from the offence register."
          tone="red"
          confirmLabel="Delete Offence"
          savingLabel="Deleting..."
          saving={Boolean(deletingId)}
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
