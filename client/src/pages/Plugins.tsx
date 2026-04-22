import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plug, Plus, Trash2, Play, ToggleLeft, ToggleRight, Package,
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
} from "lucide-react";
import { toast } from "react-toastify";
import PageHeader from "../components/PageHeader";
import {
  fetchPlugins, installPlugin, uninstallPlugin,
  createPluginInstance, updatePluginInstance, deletePluginInstance,
  runPluginInstance,
} from "../services/api";
import type {
  PluginsListResponse, InstalledPlugin, PluginInstanceRecord,
  PluginConfigField, PluginResultEvent,
} from "../types";

interface PluginsProps {
  pluginResults?: Record<string, PluginResultEvent>;
}

function formatRelative(iso?: string): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function StatusDot({ status }: { status?: "up" | "down" }) {
  if (!status) return <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />;
  const color = status === "up" ? "bg-emerald-500" : "bg-red-500";
  return <span className={`w-2 h-2 rounded-full ${color} inline-block`} />;
}

function ConfigField({
  name, field, value, onChange,
}: {
  name: string;
  field: PluginConfigField;
  value: unknown;
  onChange: (v: string | number | boolean) => void;
}) {
  const label = name + (field.required ? " *" : "");
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-200">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-emerald-500"
        />
        <span>{label}</span>
        {field.description && <span className="text-xs text-gray-500">— {field.description}</span>}
      </label>
    );
  }
  const inputType =
    field.format === "password" ? "password"
    : field.type === "number" ? "number"
    : "text";
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1">
        {label}
        {field.description && <span className="text-gray-600 ml-2">{field.description}</span>}
      </label>
      {field.enum ? (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
          className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        >
          <option value="">— select —</option>
          {field.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
          ))}
        </select>
      ) : (
        <input
          type={inputType}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
          placeholder={field.default !== undefined ? String(field.default) : ""}
          className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
      )}
    </div>
  );
}

function CreateInstanceForm({
  plugin, onCreated,
}: { plugin: InstalledPlugin; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const schema = plugin.configSchema;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createPluginInstance({ name: plugin.name, config, enabled: true });
      toast.success(`${plugin.displayName} instance created`);
      setOpen(false);
      setConfig({});
      onCreated();
    } catch (err) {
      toast.error((err as Error).message || "Failed to create instance");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
      >
        <Plus size={12} /> Add instance
      </button>
    );
  }

  const fields = schema?.properties ? Object.entries(schema.properties) : [];

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 bg-[#0d1117] border border-gray-700 rounded p-3">
      {fields.length === 0 && (
        <p className="text-xs text-gray-500">This plugin takes no config.</p>
      )}
      {fields.map(([fname, field]) => (
        <ConfigField
          key={fname}
          name={fname}
          field={field}
          value={config[fname]}
          onChange={(v) => setConfig((c) => ({ ...c, [fname]: v }))}
        />
      ))}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Plugins({ pluginResults = {} }: PluginsProps) {
  const [data, setData] = useState<PluginsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [installInput, setInstallInput] = useState("");
  const [installing, setInstalling] = useState(false);

  const refresh = async () => {
    try {
      const d = await fetchPlugins();
      setData(d);
    } catch (err) {
      toast.error((err as Error).message || "Failed to load plugins");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const instancesByPlugin = useMemo(() => {
    const out: Record<string, PluginInstanceRecord[]> = {};
    for (const inst of data?.instances ?? []) {
      (out[inst.name] ??= []).push(inst);
    }
    return out;
  }, [data]);

  const handleInstall = async (e: FormEvent) => {
    e.preventDefault();
    const pkg = installInput.trim();
    if (!pkg) return;
    setInstalling(true);
    try {
      const res = await installPlugin(pkg);
      toast.success(`Installed ${res.name} v${res.version}`);
      setInstallInput("");
      await refresh();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string; error?: string } } }).response?.data;
      toast.error(detail?.detail || detail?.error || (err as Error).message || "Install failed");
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async (name: string) => {
    if (!confirm(`Uninstall ${name}? All instances will be removed.`)) return;
    try {
      await uninstallPlugin(name);
      toast.success(`${name} removed`);
      await refresh();
    } catch (err) {
      toast.error((err as Error).message || "Uninstall failed");
    }
  };

  const handleToggle = async (inst: PluginInstanceRecord) => {
    try {
      await updatePluginInstance(inst.id, { enabled: !inst.enabled });
      await refresh();
    } catch (err) {
      toast.error((err as Error).message || "Toggle failed");
    }
  };

  const handleDelete = async (inst: PluginInstanceRecord) => {
    if (!confirm(`Delete instance of ${inst.displayName}?`)) return;
    try {
      await deletePluginInstance(inst.id);
      toast.success("Instance deleted");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message || "Delete failed");
    }
  };

  const handleRunNow = async (inst: PluginInstanceRecord) => {
    try {
      const res = await runPluginInstance(inst.id);
      if (res.ok) toast.success(`Ran in ${res.durationMs}ms`);
      else toast.error(res.error || `Failed (${res.durationMs}ms)`);
      await refresh();
    } catch (err) {
      toast.error((err as Error).message || "Run failed");
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Package className="mx-auto mb-2 animate-pulse" size={24} />
        Loading plugins…
      </div>
    );
  }

  const installed = data?.installed ?? [];

  return (
    <div>
      <PageHeader
        title="Plugins"
        subtitle="Extend Theoria with community or in-house checks. Install from npm."
      >
        <Plug size={18} className="text-gray-500" />
      </PageHeader>

      {/* Install form */}
      <form onSubmit={handleInstall} className="mt-6 bg-[#161b22] border border-gray-800 rounded-lg p-4 flex gap-2 items-center">
        <Package size={16} className="text-gray-500" />
        <input
          type="text"
          value={installInput}
          onChange={(e) => setInstallInput(e.target.value)}
          placeholder="npm package name, e.g. theoria-plugin-redis"
          className="flex-1 bg-[#0d1117] border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
        <button
          type="submit"
          disabled={installing || !installInput.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded disabled:opacity-50 flex items-center gap-1.5"
        >
          <Plus size={14} />
          {installing ? "Installing…" : "Install"}
        </button>
        <button
          type="button"
          onClick={refresh}
          className="p-2 text-gray-400 hover:text-gray-200"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </form>

      {data?.rootDir && (
        <p className="mt-2 text-xs text-gray-600 font-mono">Plugin dir: {data.rootDir}</p>
      )}

      {/* Installed plugin list */}
      {installed.length === 0 ? (
        <div className="mt-6 p-8 text-center text-gray-500 bg-[#161b22] border border-gray-800 rounded-lg">
          <AlertTriangle className="mx-auto mb-2" size={24} />
          No plugins installed yet.
          <p className="text-xs mt-1">
            Try: <code className="bg-[#0d1117] px-1.5 py-0.5 rounded text-gray-400">theoria-plugin-redis</code>
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {installed.map((plugin) => {
            const instances = instancesByPlugin[plugin.name] ?? [];
            return (
              <div key={plugin.name} className="bg-[#161b22] border border-gray-800 rounded-lg overflow-hidden">
                <div className="p-4 flex items-start justify-between border-b border-gray-800">
                  <div>
                    <h3 className="font-semibold text-gray-100 flex items-center gap-2">
                      {plugin.displayName}
                      <span className="text-xs text-gray-500 font-normal">
                        v{plugin.version} · {plugin.type}
                      </span>
                    </h3>
                    {plugin.description && (
                      <p className="text-sm text-gray-400 mt-1">{plugin.description}</p>
                    )}
                    {plugin.intervalSeconds && (
                      <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                        <Clock size={11} /> runs every {plugin.intervalSeconds}s
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUninstall(plugin.name)}
                    className="text-gray-500 hover:text-red-400"
                    title="Uninstall"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  {instances.length === 0 && (
                    <p className="text-xs text-gray-600">No instances configured.</p>
                  )}
                  {instances.map((inst) => {
                    const live = pluginResults[inst.id];
                    const status = live?.status ?? inst.lastStatus;
                    const latency = live?.latencyMs ?? inst.lastLatencyMs;
                    return (
                      <div key={inst.id} className="bg-[#0d1117] border border-gray-800 rounded p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusDot status={status} />
                          <div className="min-w-0">
                            <div className="text-sm text-gray-100 truncate">
                              {inst.id.slice(0, 8)}…
                            </div>
                            <div className="text-xs text-gray-500 flex gap-3 flex-wrap">
                              <span>last run: {formatRelative(inst.lastRunAt)}</span>
                              {typeof latency === "number" && <span>{Math.round(latency)}ms</span>}
                              {inst.lastError && (
                                <span className="text-red-400 truncate max-w-xs" title={inst.lastError}>
                                  {inst.lastError}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRunNow(inst)}
                            className="p-1.5 text-gray-400 hover:text-emerald-400"
                            title="Run now"
                          >
                            <Play size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggle(inst)}
                            className="p-1.5 text-gray-400 hover:text-gray-200"
                            title={inst.enabled ? "Disable" : "Enable"}
                          >
                            {inst.enabled
                              ? <ToggleRight size={16} className="text-emerald-400" />
                              : <ToggleLeft size={16} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(inst)}
                            className="p-1.5 text-gray-400 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <CreateInstanceForm plugin={plugin} onCreated={refresh} />
                </div>

                {plugin.metrics.length > 0 && (
                  <div className="px-4 pb-4">
                    <div className="text-xs text-gray-500 mb-1">Metrics exposed:</div>
                    <div className="flex flex-wrap gap-1">
                      {plugin.metrics.map((m) => (
                        <span
                          key={m.name}
                          className="text-xs bg-[#0d1117] border border-gray-700 rounded px-2 py-0.5 text-gray-400"
                          title={m.description}
                        >
                          {m.name}{m.unit ? ` (${m.unit})` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Status legend */}
      <div className="mt-6 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-400" /> up</span>
        <span className="flex items-center gap-1"><XCircle size={11} className="text-red-400" /> down</span>
      </div>
    </div>
  );
}
