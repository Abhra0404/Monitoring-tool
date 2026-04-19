import { useEffect, useState } from "react";
import { Globe2, Save, Copy, ExternalLink, CheckCircle, XCircle, AlertTriangle, Plus, Trash2 } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { fetchStatusPageConfig, updateStatusPageConfig, fetchPublicStatus } from "../services/api";
import { toast } from "react-toastify";

function StatusPage() {
  const [, setConfig] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [customServices, setCustomServices] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const cfg = await fetchStatusPageConfig();
      setConfig(cfg);
      setTitle(cfg.title || "System Status");
      setDescription(cfg.description || "");
      setIsPublic(cfg.isPublic || false);
      setCustomServices(cfg.customServices || []);

      // Load preview if public
      if (cfg.isPublic) {
        try {
          const pub = await fetchPublicStatus();
          setPreview(pub);
        } catch {}
      }
    } catch {
      // first time — no config yet
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateStatusPageConfig({
        title: title.trim(),
        description: description.trim(),
        isPublic,
        customServices,
      });
      setConfig(updated);
      toast.success("Status page updated");
      if (isPublic) {
        try {
          const pub = await fetchPublicStatus();
          setPreview(pub);
        } catch {}
      } else {
        setPreview(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function addCustomService() {
    setCustomServices((prev) => [...prev, { name: "", status: "operational", description: "" }]);
  }

  function updateCustomService(index, field, value) {
    setCustomServices((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function removeCustomService(index) {
    setCustomServices((prev) => prev.filter((_, i) => i !== index));
  }

  const statusUrl = `${window.location.origin}/status`;

  return (
    <div>
      <PageHeader title="Status Page" subtitle="Configure a public status page for your users">
        {isPublic && (
          <a
            href="/status"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/10 text-emerald-400 text-sm font-medium rounded-lg hover:bg-emerald-400/20 transition-colors"
          >
            <ExternalLink size={16} />
            View Live
          </a>
        )}
      </PageHeader>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Config Form */}
          <div>
            <form onSubmit={handleSave}>
              <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-4">
                <h3 className="text-sm font-medium text-gray-200 mb-4">General Settings</h3>
                <div className="space-y-4">
                  <FormField label="Page Title">
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="form-input" placeholder="System Status" />
                  </FormField>
                  <FormField label="Description">
                    <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="form-input" placeholder="Current status of our services" />
                  </FormField>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-200">Public Access</p>
                      <p className="text-xs text-gray-500">Allow anyone to view the status page</p>
                    </div>
                    <button type="button" onClick={() => setIsPublic(!isPublic)} className="text-gray-400 hover:text-emerald-400 transition-colors">
                      {isPublic
                        ? <div className="flex items-center gap-1.5 text-emerald-400"><span className="text-xs font-medium">Enabled</span><div className="w-10 h-5 bg-emerald-400 rounded-full flex items-center justify-end px-0.5"><div className="w-4 h-4 bg-white rounded-full" /></div></div>
                        : <div className="flex items-center gap-1.5 text-gray-500"><span className="text-xs font-medium">Disabled</span><div className="w-10 h-5 bg-gray-700 rounded-full flex items-center px-0.5"><div className="w-4 h-4 bg-gray-400 rounded-full" /></div></div>
                      }
                    </button>
                  </div>
                </div>
              </div>

              {/* Shareable URL */}
              {isPublic && (
                <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-4">
                  <h3 className="text-sm font-medium text-gray-200 mb-3">Shareable URL</h3>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-emerald-400 bg-gray-900 rounded-lg px-3 py-2 truncate">{statusUrl}</code>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(statusUrl); toast.success("URL copied!"); }}
                      className="p-2 text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/5 rounded-lg transition-colors"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Custom Services */}
              <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-200">Custom Services</h3>
                  <button type="button" onClick={addCustomService} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                    <Plus size={14} /> Add
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">Servers and HTTP checks are shown automatically. Add custom entries here.</p>
                {customServices.length === 0 ? (
                  <p className="text-xs text-gray-600">No custom services</p>
                ) : (
                  <div className="space-y-3">
                    {customServices.map((svc, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="text" value={svc.name} onChange={(e) => updateCustomService(i, "name", e.target.value)} placeholder="Service name" className="form-input flex-1 text-xs" />
                        <select value={svc.status} onChange={(e) => updateCustomService(i, "status", e.target.value)} className="form-input w-auto text-xs">
                          <option value="operational">Operational</option>
                          <option value="degraded">Degraded</option>
                          <option value="down">Down</option>
                        </select>
                        <button type="button" onClick={() => removeCustomService(i)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-400 text-gray-900 font-medium text-sm rounded-lg hover:bg-emerald-300 transition-colors disabled:opacity-50">
                <Save size={16} />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>

          {/* Preview */}
          <div>
            <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-gray-200 mb-4">Preview</h3>
              {preview ? (
                <StatusPreview data={preview} />
              ) : (
                <div className="text-center py-8">
                  <Globe2 size={32} className="mx-auto mb-2 text-gray-600" />
                  <p className="text-xs text-gray-500">{isPublic ? "Save to generate preview" : "Enable public access to see preview"}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPreview({ data }) {
  const overallStyles = {
    operational: { bg: "bg-emerald-400/10", text: "text-emerald-400", label: "All Systems Operational", Icon: CheckCircle },
    degraded: { bg: "bg-amber-400/10", text: "text-amber-400", label: "Degraded Performance", Icon: AlertTriangle },
    partial_outage: { bg: "bg-amber-400/10", text: "text-amber-400", label: "Partial Outage", Icon: AlertTriangle },
    major_outage: { bg: "bg-red-400/10", text: "text-red-400", label: "Major Outage", Icon: XCircle },
  };

  const style = overallStyles[data.overall] || overallStyles.operational;

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div className={`${style.bg} rounded-lg p-4 flex items-center gap-3`}>
        <style.Icon size={20} className={style.text} />
        <span className={`text-sm font-medium ${style.text}`}>{style.label}</span>
      </div>

      {/* Servers */}
      {data.servers?.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">Servers</p>
          {data.servers.map((s, i) => (
            <ServiceRow key={i} name={s.name} status={s.status === "online" ? "up" : s.status === "warning" ? "degraded" : "down"} detail={s.status} />
          ))}
        </div>
      )}

      {/* HTTP Checks */}
      {data.httpChecks?.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">Websites</p>
          {data.httpChecks.map((c, i) => (
            <ServiceRow key={i} name={c.name} status={c.status} detail={`${c.uptimePercent?.toFixed(1)}% uptime`} />
          ))}
        </div>
      )}

      {/* Custom */}
      {data.customServices?.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">Services</p>
          {data.customServices.map((s, i) => (
            <ServiceRow key={i} name={s.name} status={s.status === "operational" ? "up" : s.status === "degraded" ? "degraded" : "down"} detail={s.status} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceRow({ name, status, detail }) {
  const dotColor = status === "up" || status === "operational" ? "bg-emerald-400" : status === "degraded" ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-sm text-gray-300">{name}</span>
      </div>
      <span className="text-xs text-gray-500">{detail}</span>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export default StatusPage;
