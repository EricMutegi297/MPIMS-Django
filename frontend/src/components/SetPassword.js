import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authService } from "../services/api";

export default function SetPassword() {
  const navigate = useNavigate();
  const { uid, token } = useParams();
  const [form, setForm] = useState({ new_password: "", confirm_password: "" });
  const [show, setShow] = useState({ new_password: false, confirm_password: false });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setServerError("");
  };

  const toggleShow = (field) => {
    setShow((current) => ({ ...current, [field]: !current[field] }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.new_password) {
      nextErrors.new_password = "Password is required.";
    } else if (form.new_password.length < 8) {
      nextErrors.new_password = "Password must be at least 8 characters.";
    }
    if (!form.confirm_password) {
      nextErrors.confirm_password = "Confirm your password.";
    } else if (form.new_password !== form.confirm_password) {
      nextErrors.confirm_password = "Passwords do not match.";
    }
    return nextErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    setServerError("");
    try {
      await authService.setPassword({
        uid,
        token,
        new_password: form.new_password,
        confirm_password: form.confirm_password,
      });
      setSuccess(true);
      window.setTimeout(() => navigate("/login?password-set=1", { replace: true }), 1600);
    } catch (err) {
      const data = err?.response?.data;
      if (data?.new_password) {
        setErrors((current) => ({
          ...current,
          new_password: Array.isArray(data.new_password) ? data.new_password[0] : data.new_password,
        }));
      } else if (data?.confirm_password) {
        setErrors((current) => ({
          ...current,
          confirm_password: Array.isArray(data.confirm_password) ? data.confirm_password[0] : data.confirm_password,
        }));
      } else {
        setServerError(
          data?.token ||
            data?.detail ||
            data?.non_field_errors?.[0] ||
            "This setup link is invalid or has expired."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field) =>
    `w-full bg-gray-700 border rounded-lg px-3 py-2.5 pr-11 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 transition-colors ${
      errors[field]
        ? "border-red-500 focus:ring-red-500/40"
        : "border-gray-600 focus:ring-blue-500/40 focus:border-blue-500"
    }`;

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">MPIMS Account Security</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Create Your Password</h1>
          <p className="mt-2 text-sm text-gray-400">
            Choose a private password for your MPIMS account.
          </p>
        </div>

        <div className="rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl sm:p-8">
          {success ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-white">Password created</p>
              <p className="mt-1 text-sm text-gray-400">Redirecting to sign in...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {serverError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {serverError}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={show.new_password ? "text" : "password"}
                    value={form.new_password}
                    onChange={(e) => updateField("new_password", e.target.value)}
                    autoComplete="new-password"
                    className={inputClass("new_password")}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow("new_password")}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition-colors hover:text-white"
                    aria-label={show.new_password ? "Hide password" : "Show password"}
                  >
                    {show.new_password ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={show.confirm_password ? "text" : "password"}
                    value={form.confirm_password}
                    onChange={(e) => updateField("confirm_password", e.target.value)}
                    autoComplete="new-password"
                    className={inputClass("confirm_password")}
                    placeholder="Re-enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow("confirm_password")}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition-colors hover:text-white"
                    aria-label={show.confirm_password ? "Hide password" : "Show password"}
                  >
                    {show.confirm_password ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Saving..." : "Set Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
