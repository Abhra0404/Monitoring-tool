import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BellRing, Plus, Trash2, ToggleLeft, ToggleRight, Send, Mail, MessageSquare } from "lucide-react";
import PageHeader from "../components/PageHeader";
import {
  fetchNotificationChannels, createNotificationChannel,
  deleteNotificationChannel, toggleNotificationChannel, testNotificationChannel,
} from "../services/api";
import { toast } from "react-toastify";

interface ChannelConfig {
  webhookUrl?: string;
  smtpHost?: string;
  smtpPort?: string | number;
  smtpUser?: string;
  smtpPass?: string;
  from?: string;
  to?: string;
}

interface ChannelRecord {
  _id: string;
  type: "slack" | "email";
  name: string;
  config: ChannelConfig;
  isActive?: boolean;
  enabled?: boolean;
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ChannelCard({ channel, onDelete, onToggle, onTest, testing }: {
  channel: ChannelRecord;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onTest: (id: string) => void;
  testing: string | null;
}) {
  const isSlack = channel.type === "slack";
  const Icon = isSlack ? MessageSquare : Mail;

  return (
    <div className={`bg-[#0d1117] rounded-xl border border-gray-800 p-4 flex items-center gap-4 transition-opacity ${!channel.isActive ? "opacity-50" : ""}`}>
      <button type="button" onClick={() => onToggle(channel._id)} className="text-gray-400 hover:text-emerald-400 transition-colors">
        {channel.isActive ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} />}
      </button>
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${isSlack ? "bg-purple-400/10" : "bg-blue-400/10"}`}>
        <Icon size={18} className={isSlack ? "text-purple-400" : "text-blue-400"} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-200 text-sm">{channel.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-700 text-gray-400 uppercase">{channel.type}</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {isSlack
            ? channel.config?.webhookUrl?.replace(/\/T[^/]+\/B[^/]+\/.*/, "/T.../B.../...")
            : `${channel.config?.smtpHost}:${channel.config?.smtpPort} → ${channel.config?.to}`}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onTest(channel._id)}
          disabled={testing === channel._id}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/5 rounded-lg transition-colors disabled:opacity-50"
        >
          <Send size={14} />
          {testing === channel._id ? "Sending..." : "Test"}
        </button>
        <button type="button" onClick={() => onDelete(channel._id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function NotificationSettings() {
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"slack" | "email">("slack");
  const [formName, setFormName] = useState("");
  const [formWebhookUrl, setFormWebhookUrl] = useState("");
  const [formSmtpHost, setFormSmtpHost] = useState("");
  const [formSmtpPort, setFormSmtpPort] = useState("587");
  const [formSmtpUser, setFormSmtpUser] = useState("");
  const [formSmtpPass, setFormSmtpPass] = useState("");
  const [formFrom, setFormFrom] = useState("");
  const [formTo, setFormTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => { void loadData(); }, []);

  async function loadData() {
    try {
      const data = await fetchNotificationChannels();
      setChannels(data as unknown as ChannelRecord[]);
    } catch { toast.error("Failed to load notification channels"); }
    finally { setLoading(false); }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!formName.trim()) { toast.error("Name is required"); return; }
    const config: ChannelConfig = formType === "slack"
      ? { webhookUrl: formWebhookUrl.trim() }
      : {
          smtpHost: formSmtpHost.trim(), smtpPort: formSmtpPort,
          smtpUser: formSmtpUser.trim(), smtpPass: formSmtpPass,
          from: formFrom.trim(), to: formTo.trim(),
        };
    if (formType === "slack" && !config.webhookUrl) { toast.error("Webhook URL is required"); return; }
    if (formType === "email" && (!config.smtpHost || !config.to)) { toast.error("SMTP Host and To address are required"); return; }
    setSaving(true);
    try {
      await createNotificationChannel({ type: formType, name: formName.trim(), config, isActive: true } as unknown as Omit<import('../types').NotificationChannel, '_id'>);
      toast.success("Channel created");
      setShowForm(false);
      resetForm();
      void loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? "Failed to create channel");
    } finally { setSaving(false); }
  }

  async function handleDelete(channelId: string) {
    try {
      await deleteNotificationChannel(channelId);
      setChannels((prev) => prev.filter((c) => c._id !== channelId));
      toast.success("Channel deleted");
    } catch { toast.error("Failed to delete channel"); }
  }

  async function handleToggle(channelId: string) {
    try {
      const updated = (await toggleNotificationChannel(channelId)) as unknown as ChannelRecord;
      setChannels((prev) => prev.map((c) => (c._id === channelId ? updated : c)));
    } catch { toast.error("Failed to toggle channel"); }
  }

  async function handleTest(channelId: string) {
    setTesting(channelId);
    try {
      await testNotificationChannel(channelId);
      toast.success("Test notification sent!");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? "Test failed");
    } finally { setTesting(null); }
  }

  function resetForm() {
    setFormType("slack"); setFormName(""); setFormWebhookUrl("");
    setFormSmtpHost(""); setFormSmtpPort("587"); setFormSmtpUser("");
    setFormSmtpPass(""); setFormFrom(""); setFormTo("");
  }

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Configure alert delivery channels — Slack and Email">
        <button type="button" onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-400/10 text-emerald-400 text-sm font-medium rounded-lg hover:bg-emerald-400/20 transition-colors">
          <Plus size={16} /> Add Channel
        </button>
      </PageHeader>

      {showForm && (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-200 mb-4">New Notification Channel</h3>
          <form onSubmit={(e) => void handleCreate(e)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <FormField label="Channel Type">
                <select value={formType} onChange={(e) => setFormType(e.target.value as "slack" | "email")} className="form-input">
                  <option value="slack">Slack</option>
                  <option value="email">Email (SMTP)</option>
                </select>
              </FormField>
              <FormField label="Channel Name">
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Dev Team Alerts" className="form-input" required />
              </FormField>
            </div>
            {formType === "slack" ? (
              <FormField label="Slack Webhook URL">
                <input type="url" value={formWebhookUrl} onChange={(e) => setFormWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/services/..." className="form-input" required />
              </FormField>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <FormField label="SMTP Host"><input type="text" value={formSmtpHost} onChange={(e) => setFormSmtpHost(e.target.value)} placeholder="smtp.gmail.com" className="form-input" required /></FormField>
                <FormField label="SMTP Port"><input type="number" value={formSmtpPort} onChange={(e) => setFormSmtpPort(e.target.value)} className="form-input" /></FormField>
                <FormField label="SMTP User"><input type="text" value={formSmtpUser} onChange={(e) => setFormSmtpUser(e.target.value)} placeholder="user@gmail.com" className="form-input" /></FormField>
                <FormField label="SMTP Password"><input type="password" value={formSmtpPass} onChange={(e) => setFormSmtpPass(e.target.value)} className="form-input" /></FormField>
                <FormField label="From Address"><input type="email" value={formFrom} onChange={(e) => setFormFrom(e.target.value)} placeholder="alerts@mycompany.com" className="form-input" /></FormField>
                <FormField label="To Address"><input type="email" value={formTo} onChange={(e) => setFormTo(e.target.value)} placeholder="team@mycompany.com" className="form-input" required /></FormField>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-400 text-gray-900 font-medium text-sm rounded-lg hover:bg-emerald-300 transition-colors disabled:opacity-50">
                {saving ? "Creating..." : "Create Channel"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-gray-400 text-sm rounded-lg hover:bg-gray-800 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
        </div>
      ) : channels.length === 0 ? (
        <div className="bg-[#0d1117] rounded-xl border border-gray-800 p-12 text-center">
          <BellRing size={40} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">No notification channels configured</p>
          <p className="text-xs text-gray-600 mt-1">Add Slack or Email channels to receive alert notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((channel) => (
            <ChannelCard
              key={channel._id}
              channel={channel}
              onDelete={(id) => void handleDelete(id)}
              onToggle={(id) => void handleToggle(id)}
              onTest={(id) => void handleTest(id)}
              testing={testing}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default NotificationSettings;
