import React, { useState } from "react";

export default function OffenceModal({ open, onClose, onSave, user, offences = [] }) {
  const [category, setCategory] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [name, setName] = useState("");
  const [categorySelected, setCategorySelected] = useState(false);
  const isSuperuser = !!user?.is_superuser;

  // Unique categories for dropdown
  const uniqueCategories = Array.from(new Set(offences.map((o) => o.category))).filter(Boolean);

  if (!open || !isSuperuser) return null;

  const handleCategoryChange = (e) => {
    setCategory(e.target.value);
    setCategorySelected(true);
    setCategoryInput("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    let finalCategory = category === "__new__" ? categoryInput : category;
    if (!finalCategory || !name) return;
    onSave({ category: finalCategory, name });
    setCategory("");
    setCategoryInput("");
    setName("");
    setCategorySelected(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">Add Offence</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Offence Category</label>
            <select
              value={category}
              onChange={handleCategoryChange}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:outline-none"
              required
            >
              <option value="" disabled>Select category</option>
              {uniqueCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="__new__">Add new category…</option>
            </select>
          </div>
          {category === "__new__" && (
            <div>
              <input
                value={categoryInput}
                onChange={e => setCategoryInput(e.target.value)}
                placeholder="Enter new category"
                className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:outline-none"
                required
                autoFocus
              />
            </div>
          )}
          {categorySelected && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Offence Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Offence Name"
                className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:outline-none"
                required
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
