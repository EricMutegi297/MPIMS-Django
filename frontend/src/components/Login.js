import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authService } from "../services/api";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const timedOut = params.get("timeout") === "1";
  const passwordSet = params.get("password-set") === "1";
  const [form, setForm] = useState({ service_number: "", password: "", otp_code: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authService.login(
        form.service_number,
        form.password,
        mfaRequired ? form.otp_code : ""
      );
      if (res.data.mfaRequired) {
        setMfaRequired(true);
        setError("");
        return;
      }
      const user = res.data.user;
      if (user.must_change_password) {
        navigate("/dashboard/change-password");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.otp_code ||
          err.response?.data?.non_field_errors?.[0] ||
          "Login failed. Check your credentials."
      );
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
          <p className="text-gray-400 mt-1 text-sm">
            Military Police Investigation Management System
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-600 text-red-300 text-sm px-4 py-3 rounded">
            {error}
          </div>
        )}

        {!error && timedOut && (
          <div className="mb-4 bg-yellow-900/30 border border-yellow-700 text-yellow-100 text-sm px-4 py-3 rounded">
            You were signed out after 15 minutes of inactivity.
          </div>
        )}

        {!error && passwordSet && (
          <div className="mb-4 bg-green-900/30 border border-green-700 text-green-100 text-sm px-4 py-3 rounded">
            Password set successfully. Sign in to continue.
          </div>
        )}

        {mfaRequired && (
          <div className="mb-4 bg-blue-900/30 border border-blue-700 text-blue-200 text-sm px-4 py-3 rounded">
            Enter the 6-digit code from Google Authenticator.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-1">
              Service Number
            </label>
            <input
              type="text"
              name="service_number"
              value={form.service_number}
              onChange={handleChange}
              required
              className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. MP123456"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-gray-300 text-sm font-medium">
                Password
              </label>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={form.password}
                onChange={handleChange}
                required
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2.5 pr-11 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-200 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  /* Eye-off icon */
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7a9.77 9.77 0 012.168-3.168m2.336-1.868A9.956 9.956 0 0112 5c5 0 9 4 9 7a9.956 9.956 0 01-1.504 2.496M9.88 9.88A3 3 0 0114.12 14.12M3 3l18 18" />
                  </svg>
                ) : (
                  /* Eye icon */
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {mfaRequired && (
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-1">
                Authenticator Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                name="otp_code"
                value={form.otp_code}
                onChange={handleChange}
                required
                maxLength={6}
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest"
                placeholder="000000"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Signing in..." : mfaRequired ? "Verify Code" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
