import { useEffect, useState, type ReactNode } from "react";
import { Key, Copy, RefreshCw, Shield, Terminal, Zap } from "lucide-react";
import { toast } from "react-toastify";
import PageHeader from "../components/PageHeader";
import { fetchCurrentUser, regenerateApiKey, createOnboardingToken } from "../services/api";
import type { SystemUser } from "../types";

function Step({ num, title, children }: { num: number; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-5 h-5 rounded-full bg-emerald-400/10 text-emerald-400 text-[10px] font-bold flex items-center justify-center">
          {num}
        </span>
        <span className="text-xs font-medium text-gray-300">{title}</span>
      </div>
      {children}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const copy = () => { navigator.clipboard.writeText(code); toast.success("Copied"); };
  return (
    <div className="bg-gray-900 rounded-lg p-3 relative group">
      <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">{code}</pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 p-1 text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Copy size={12} />
      </button>
    </div>
  );
}

function Settings() {
  const [user, setUser] = useState<SystemUser | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [onboardingCmd, setOnboardingCmd] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchCurrentUser().then((u) => setUser(u as SystemUser)).catch(() => {});
  }, []);

  const copyApiKey = () => {
    if (user?.apiKey) {
      navigator.clipboard.writeText(user.apiKey);
      toast.success("API key copied to clipboard");
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm("Are you sure? All connected agents will need to be updated with the new key.")) return;
    setRegenerating(true);
    try {
      const result = (await regenerateApiKey()) as { apiKey: string };
      setUser((prev) => prev ? { ...prev, apiKey: result.apiKey } : prev);
      toast.success("API key regenerated");
    } catch {
      toast.error("Failed to regenerate API key");
    }
    setRegenerating(false);
  };

  const handleGenerateOnboarding = async () => {
    setGenerating(true);
    try {
      const baseUrl = window.location.origin;
      const { token } = await createOnboardingToken({ baseUrl });
      setOnboardingCmd(`npx theoria-cli agent --token ${token}`);
      toast.success("Onboarding token generated (valid 10 min)");
    } catch (err) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Failed to generate token");
    } finally {
      setGenerating(false);
    }
  };

  const maskedKey = user?.apiKey
    ? user.apiKey.slice(0, 8) + "••••••••" + user.apiKey.slice(-4)
    : "";

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your account and API keys" />

      <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-emerald-400/10 p-2 rounded-lg">
            <Shield size={18} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-200">Account</h3>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-amber-400/10 p-2 rounded-lg">
            <Key size={18} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-200">API Key</h3>
            <p className="text-xs text-gray-500">Used by agents to authenticate with the server</p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-3 flex items-center gap-3 mb-4">
          <code className="text-sm font-mono text-gray-300 flex-1 select-all">
            {showKey ? user?.apiKey : maskedKey}
          </code>
          <button type="button" onClick={() => setShowKey(!showKey)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {showKey ? "Hide" : "Show"}
          </button>
          <button type="button" onClick={copyApiKey} className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-400/5 rounded transition-colors" title="Copy">
            <Copy size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => void handleRegenerate()}
          disabled={regenerating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/5 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={regenerating ? "animate-spin" : ""} />
          {regenerating ? "Regenerating..." : "Regenerate API Key"}
        </button>
      </div>

      <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-emerald-400/10 p-2 rounded-lg">
            <Zap size={18} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-200">Zero-config agent onboarding</h3>
            <p className="text-xs text-gray-500">Generate a single-use command your agent host can run to connect.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleGenerateOnboarding()}
          disabled={generating}
          className="px-3 py-1.5 text-sm bg-emerald-400 text-gray-900 font-medium rounded-lg hover:bg-emerald-300 disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate onboarding command"}
        </button>
        {onboardingCmd && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-500">Run this on your remote host (valid for 10 minutes, single-use):</p>
            <CodeBlock code={onboardingCmd} />
          </div>
        )}
      </div>

      <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-blue-400/10 p-2 rounded-lg">
            <Terminal size={18} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-200">Agent Setup</h3>
            <p className="text-xs text-gray-500">Quick guide to install the Theoria agent</p>
          </div>
        </div>
        <div className="space-y-3">
          <Step num={1} title="Create .env file in agent directory">
            <CodeBlock code={`API_KEY=${user?.apiKey ?? "your-api-key"}\nAPI_URL=http://your-server:5000\nSERVER_ID=my-server-name`} />
          </Step>
          <Step num={2} title="Install dependencies">
            <CodeBlock code="cd agent && npm install" />
          </Step>
          <Step num={3} title="Start the agent">
            <CodeBlock code="npm start" />
          </Step>
          <Step num={4} title="Docker (alternative)">
            <CodeBlock code={`docker build -t theoria-agent ./agent\ndocker run -e API_KEY=${user?.apiKey ?? "your-key"} -e API_URL=http://host:5000 -e SERVER_ID=my-server theoria-agent`} />
          </Step>
        </div>
      </div>
    </div>
  );
}

export default Settings;
