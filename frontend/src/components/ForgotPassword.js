import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
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
      const res = await authService.requestPasswordReset(email);
      setMessage(res.data?.detail || "If the email exists, reset instructions have been sent.");
    } catch (err) {
      const data = err.response?.data;
      setError(data?.detail || data?.email?.[0] || "Unable to submit password reset request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-gray-800 rounded-xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-condensed text-white tracking-widest uppercase">
            MPIMS
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Password recovery</p>
        </div>

        {message && (
          <div className="mb-4 bg-green-900/30 border border-green-700 text-green-300 text-sm px-4 py-3 rounded">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-600 text-red-300 text-sm px-4 py-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">
              Account Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="name@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-blue-400 hover:text-blue-300">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
