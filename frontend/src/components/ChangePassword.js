import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/api";
import useAutoDismiss from "../hooks/useAutoDismiss";

function EyeIcon({ hidden }) {
  if (hidden) {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.6 10.6a2 2 0 102.8 2.8M9.9 4.2A10.4 10.4 0 0112 4c4.8 0 8.7 3.1 10 7.5a10.8 10.8 0 01-3.1 4.9M6.2 6.2A10.8 10.8 0 002 11.5C3.3 15.9 7.2 19 12 19c1.4 0 2.7-.3 3.9-.8" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 10V7a4 4 0 00-8 0v3M6 10h12v10H6V10z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function PasswordInput({ label, name, value, shown, error, autoComplete, placeholder, onChange, onToggle }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <div className="relative mt-1">
        <input
          type={shown ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`h-11 w-full rounded-md border bg-white px-3 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 ${
            error
              ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              : "border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          }`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={shown ? `Hide ${label}` : `Show ${label}`}
          title={shown ? `Hide ${label}` : `Show ${label}`}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <EyeIcon hidden={shown} />
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </label>
  );
}

function normalizeMessage(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(" ");
  return String(value);
}

export default function ChangePassword({ user, onPasswordChanged }) {
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
  useAutoDismiss(serverError, setServerError);

  const rules = useMemo(() => {
    const password = form.new_password;
    return [
      { label: "At least 8 characters", met: password.length >= 8 },
      { label: "Contains an uppercase letter", met: /[A-Z]/.test(password) },
      { label: "Contains a number", met: /\d/.test(password) },
      { label: "Different from current password", met: Boolean(password) && password !== form.old_password },
      { label: "Confirmation matches", met: Boolean(password) && password === form.confirm_password },
    ];
  }, [form.old_password, form.new_password, form.confirm_password]);

  const strength = rules.filter((rule) => rule.met).length;
  const strengthLabel = strength === 0 ? "Not started" : strength < 3 ? "Weak" : strength < rules.length ? "Good" : "Ready";
  const strengthTone = strength === 0 ? "bg-slate-200" : strength < 3 ? "bg-rose-500" : strength < rules.length ? "bg-blue-500" : "bg-emerald-500";

  const toggleShow = (field) => {
    setShow((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setServerError("");
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.old_password) nextErrors.old_password = "Current password is required.";
    if (!form.new_password) nextErrors.new_password = "New password is required.";
    else if (form.new_password.length < 8) nextErrors.new_password = "Must be at least 8 characters.";
    else if (form.new_password === form.old_password) nextErrors.new_password = "New password cannot be the same as current password.";
    if (!form.confirm_password) nextErrors.confirm_password = "Confirm the new password.";
    else if (form.new_password !== form.confirm_password) nextErrors.confirm_password = "Passwords do not match.";
    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    setServerError("");
    try {
      const response = await authService.changePassword({
        old_password: form.old_password,
        new_password: form.new_password,
      });
      onPasswordChanged?.(response.data?.user);
      setSuccess(true);
      const nextPath = response.data?.totpSetupRequired ? "/dashboard/authenticator" : "/dashboard";
      setTimeout(() => navigate(nextPath), 1200);
    } catch (error) {
      const data = error?.response?.data;
      if (data?.old_password) {
        setErrors((prev) => ({ ...prev, old_password: normalizeMessage(data.old_password) }));
      } else if (data?.new_password) {
        setErrors((prev) => ({ ...prev, new_password: normalizeMessage(data.new_password) }));
      } else {
        setServerError(data?.detail || data?.error || "Failed to change password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const accountName = [user?.rank, user?.name].filter(Boolean).join(" ") || "Signed in user";
  const unitLabel = user?.detachment_name || user?.battalion_name || "MPIMS";
  const forcedChange = Boolean(user?.must_change_password);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase text-blue-600">MPIMS</p>
            <h1 className="text-xl font-bold text-slate-950">Account Security</h1>
          </div>
          {!forcedChange && (
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeftIcon />
              Dashboard
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[0.85fr,1.15fr]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-600 text-white">
                <LockIcon />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">{accountName}</p>
                <p className="text-xs text-slate-500">{user?.service_number || "--"}</p>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs font-semibold uppercase text-slate-500">Unit</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{unitLabel}</dd>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs font-semibold uppercase text-slate-500">Status</dt>
                <dd className="mt-1">
                  <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${forcedChange ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {forcedChange ? "Password change required" : "Password managed"}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Password Strength</p>
              <span className="text-xs font-semibold text-slate-500">{strengthLabel}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${strengthTone} transition-all`}
                style={{ width: `${Math.max(8, (strength / rules.length) * 100)}%` }}
              />
            </div>
            <ul className="mt-4 space-y-2">
              {rules.map((rule) => (
                <li key={rule.label} className="flex items-center gap-2 text-sm text-slate-600">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${rule.met ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-300"}`}>
                    {rule.met && <CheckIcon />}
                  </span>
                  <span>{rule.label}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-950">Change Password</h2>
            <p className="mt-1 text-sm text-slate-500">
              {forcedChange ? "Set a new password to continue." : "Update your sign-in password."}
            </p>
          </div>

          <div className="p-5 sm:p-6">
            {success ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-emerald-600 text-white">
                  <CheckIcon />
                </div>
                <p className="mt-4 text-lg font-bold text-emerald-900">Password changed</p>
                <p className="mt-1 text-sm text-emerald-700">Redirecting to dashboard...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {forcedChange && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                    Your account requires a password change before accessing the dashboard.
                  </div>
                )}

                {serverError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {serverError}
                  </div>
                )}

                <PasswordInput
                  label="Current Password"
                  name="old_password"
                  value={form.old_password}
                  shown={show.old_password}
                  error={errors.old_password}
                  autoComplete="current-password"
                  placeholder="Enter current password"
                  onChange={handleChange}
                  onToggle={() => toggleShow("old_password")}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <PasswordInput
                    label="New Password"
                    name="new_password"
                    value={form.new_password}
                    shown={show.new_password}
                    error={errors.new_password}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    onChange={handleChange}
                    onToggle={() => toggleShow("new_password")}
                  />
                  <PasswordInput
                    label="Confirm Password"
                    name="confirm_password"
                    value={form.confirm_password}
                    shown={show.confirm_password}
                    error={errors.confirm_password}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    onChange={handleChange}
                    onToggle={() => toggleShow("confirm_password")}
                  />
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                  {!forcedChange && (
                    <button
                      type="button"
                      onClick={() => navigate("/dashboard")}
                      className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LockIcon />
                    {loading ? "Changing..." : "Change Password"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
