import React, { useEffect, useState } from "react";
import { offenceService } from "../services/api";

export default function OffencePage({ user }) {
  const [offences, setOffences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category: "", name: "" });
  const [editingId, setEditingId] = useState(null);

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
      fetchOffences();
    } catch (err) {
      alert("Error saving offence");
    }
  };

  const handleEdit = (offence) => {
    setForm({ category: offence.category, name: offence.name });
    setEditingId(offence.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this offence?")) return;
    try {
      await offenceService.delete(id);
      fetchOffences();
    } catch (err) {
      alert("Error deleting offence");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full">
      <div className="w-full max-w-3xl bg-gray-900 rounded-xl shadow-lg p-8 mt-8">
        <h2 className="text-2xl font-bold mb-6 text-white text-center">Offences</h2>
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
                      <button onClick={() => handleDelete(o.id)} className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
