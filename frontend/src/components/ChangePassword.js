import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";

export default function ChangePassword({ user }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    old_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [show, setShow] = useState({
    old_password: false,
    new_password: false,
    confirm_password: false,
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const toggleShow = (field) =>
    setShow((prev) => ({ ...prev, [field]: !prev[field] }));

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrors((prev) => ({ ...prev, [e.target.name]: "" }));
    setServerError("");
  };

  const validate = () => {
    const errs = {};
    if (!form.old_password) errs.old_password = "Current password is required.";
    if (!form.new_password) errs.new_password = "New password is required.";
    else if (form.new_password.length < 8) errs.new_password = "Must be at least 8 characters.";
    if (!form.confirm_password) errs.confirm_password = "Please confirm your new password.";
    else if (form.new_password !== form.confirm_password)
      errs.confirm_password = "Passwords do not match.";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setLoading(true);
    try {
      await authService.changePassword({
        old_password: form.old_password,
        new_password: form.new_password,
      });
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err) {
      const data = err?.response?.data;
      if (data?.old_password) setErrors((p) => ({ ...p, old_password: data.old_password }));
      else if (data?.new_password) setErrors((p) => ({ ...p, new_password: data.new_password }));
      else setServerError(data?.detail || data?.error || "Failed to change password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-start justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-white">Change Password</h1>
          {user?.must_change_password && (
            <p className="mt-2 text-sm text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-3 py-2">
              You must change your password before continuing.
            </p>
          )}
          {!user?.must_change_password && (
            <p className="mt-1 text-sm text-gray-400">
              Update your account password below.
            </p>
          )}
        </div>

        {/* Card */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 sm:p-8">
          {success ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-semibold text-lg">Password changed!</p>
              <p className="text-gray-400 text-sm mt-1">Redirecting to dashboard...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {serverError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
                  {serverError}
                </div>
              )}

              {/* Current password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={show.old_password ? "text" : "password"}
                    name="old_password"
                    value={form.old_password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    className={`w-full bg-gray-700 border rounded-lg px-3 py-2.5 pr-10 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 transition-colors ${
                      errors.old_password
                        ? "border-red-500 focus:ring-red-500/40"
                        : "border-gray-600 focus:ring-blue-500/40 focus:border-blue-500"
                    }`}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow("old_password")}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {show.old_password ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {errors.old_password && (
                  <p className="mt-1 text-xs text-red-400">{errors.old_password}</p>
                )}
              </div>

              {/* New password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={show.new_password ? "text" : "password"}
                    name="new_password"
                    value={form.new_password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    className={`w-full bg-gray-700 border rounded-lg px-3 py-2.5 pr-10 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 transition-colors ${
                      errors.new_password
                        ? "border-red-500 focus:ring-red-500/40"
                        : "border-gray-600 focus:ring-blue-500/40 focus:border-blue-500"
                    }`}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow("new_password")}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {show.new_password ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {errors.new_password && (
                  <p className="mt-1 text-xs text-red-400">{errors.new_password}</p>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={show.confirm_password ? "text" : "password"}
                    name="confirm_password"
                    value={form.confirm_password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    className={`w-full bg-gray-700 border rounded-lg px-3 py-2.5 pr-10 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 transition-colors ${
                      errors.confirm_password
                        ? "border-red-500 focus:ring-red-500/40"
                        : "border-gray-600 focus:ring-blue-500/40 focus:border-blue-500"
                    }`}
                    placeholder="Re-enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow("confirm_password")}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {show.confirm_password ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {errors.confirm_password && (
                  <p className="mt-1 text-xs text-red-400">{errors.confirm_password}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors mt-2"
              >
                {loading ? "Changing..." : "Change Password"}
              </button>
            </form>
          )}
        </div>

        {/* User info footer */}
        {user && (
          <p className="mt-4 text-center text-xs text-gray-600">
            Logged in as {user.rank ? `${user.rank} ` : ""}{user.name} . {user.service_number}
          </p>
        )}
      </div>
    </div>
  );
}
