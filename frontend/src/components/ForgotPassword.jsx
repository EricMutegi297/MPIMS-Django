import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";
import AuthFrame from "./AuthFrame";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useAutoDismiss(message, setMessage);
  useAutoDismiss(error, setError);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const res = await authService.requestPasswordReset(identifier);
      setMessage(res.data?.detail || "If the account exists, reset instructions have been sent.");
    } catch (err) {
      const data = err.response?.data;
      setError(data?.detail || data?.identifier?.[0] || data?.email?.[0] || "Unable to submit password reset request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame subtitle="Password recovery">
      {message && (
        <div className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block font-serif text-base font-bold text-black sm:text-lg">
              Email or Service Number
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="w-full rounded-md border border-slate-400 bg-white px-3 py-2.5 text-center text-base text-slate-900 placeholder-slate-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="name@example.com or 151297"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mx-auto block rounded-md bg-black px-6 py-2.5 font-serif text-base font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
      </form>

      <div className="mt-4 text-center">
        <Link to="/login" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
          Back to sign in
        </Link>
      </div>
    </AuthFrame>
  );
}
