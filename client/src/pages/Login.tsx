import { FormEvent, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { login as apiLogin } from "../services/api";
import useAuthStore from "../stores/authStore";

export default function Login() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const status = useAuthStore((s) => s.status);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiLogin(email, password);
      setTokens(res.user, res.accessToken, res.refreshToken);
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        "Login failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-[#161b22] border border-gray-800 rounded-xl p-8 space-y-4"
        aria-label="login-form"
      >
        <div className="text-white">
          <h1 className="text-xl font-semibold">Sign in to Theoria</h1>
          <p className="text-gray-400 text-sm mt-1">
            Use the credentials shown in <code>~/.theoria/admin-credentials.txt</code> on first run.
          </p>
        </div>

        <label className="block">
          <span className="text-sm text-gray-300">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded bg-[#0d1117] border border-gray-700 px-3 py-2 text-white"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-300">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded bg-[#0d1117] border border-gray-700 px-3 py-2 text-white"
          />
        </label>

        {error && (
          <div role="alert" className="text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
