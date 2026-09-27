import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { authService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";
import AuthFrame from "./AuthFrame";

export default function ResetPassword() {
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ new_password: "", confirm_password: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useAutoDismiss(message, setMessage);
  useAutoDismiss(error, setError);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    if (form.new_password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await authService.confirmPasswordReset({
        uid,
        token,
        new_password: form.new_password,
      });
      setMessage(res.data?.detail || "Password reset successfully.");
      window.setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.token?.[0] ||
          data?.new_password?.[0] ||
          data?.non_field_errors?.[0] ||
          "Unable to reset password. Request a new reset link."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame subtitle="Create a new password">
      {message && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block font-serif text-xl font-bold text-black">
              New Password
            </label>
            <input
              type="password"
              name="new_password"
              value={form.new_password}
              onChange={handleChange}
              minLength={6}
              required
              className="w-full rounded-md border border-slate-400 bg-white px-4 py-3 text-center text-lg text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="mb-2 block font-serif text-xl font-bold text-black">
              Confirm Password
            </label>
            <input
              type="password"
              name="confirm_password"
              value={form.confirm_password}
              onChange={handleChange}
              minLength={6}
              required
              className="w-full rounded-md border border-slate-400 bg-white px-4 py-3 text-center text-lg text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mx-auto block rounded-md bg-black px-7 py-3 font-serif text-lg font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
      </form>

      <div className="mt-6 text-center">
        <Link to="/forgot-password" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
          Request a new link
        </Link>
      </div>
    </AuthFrame>
  );
}
