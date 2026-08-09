import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const value = identifier.trim();
    setError("");
    setSuccess("");
    if (!value) {
      setError("Enter your service number or email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await authService.requestPasswordReset({ identifier: value });
      setSuccess(
        res.data?.detail ||
          "If the account exists, a password reset link has been sent to the registered email."
      );
    } catch (err) {
      const data = err?.response?.data;
      setError(
        data?.identifier ||
          data?.detail ||
          data?.non_field_errors?.[0] ||
          "Password reset could not be requested."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">MPIMS Account Recovery</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Forgot Password</h1>
          <p className="mt-2 text-sm text-gray-400">
            Enter your service number or registered email to receive a reset link.
          </p>
        </div>

        <div className="rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl sm:p-8">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-100">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Service Number or Email
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setError("");
                }}
                autoComplete="username"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                placeholder="e.g. MP123456 or user@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mt-5 w-full text-center text-sm text-gray-400 transition-colors hover:text-white"
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
