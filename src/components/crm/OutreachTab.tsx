"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, X, Loader2, MessageSquare, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type OutreachItem = {
  id: string; property_id: string; status: string;
  contact_name: string | null; contact_info: string | null;
  notes: string | null; created_at: string; updated_at: string;
  properties: { id: string; name: string; address: string | null } | null;
};

const STATUSES = ["Not Started", "Contacted", "Meeting Scheduled", "Proposal Sent", "Won", "Lost"] as const;
const STATUS_COLORS: Record<string, string> = {
  "Not Started": "#8a7f74",
  "Contacted": "#4a90d9",
  "Meeting Scheduled": "#e6b422",
  "Proposal Sent": "#e67e22",
  "Won": "#21c354",
  "Lost": "#ff4b4b",
};

export function OutreachTab() {
  const [items, setItems] = useState<OutreachItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerItem, setDrawerItem] = useState<OutreachItem | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/crm/outreach");
    const data = await res.json().catch(() => []);
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateItem = (updated: OutreachItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    if (drawerItem?.id === updated.id) setDrawerItem(updated);
  };

  const handleCreate = async (form: { property_id: string; contact_name: string; contact_info: string }) => {
    const res = await fetch("/api/crm/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      fetchAll();
    }
  };

  if (loading) return <p className="py-12 text-center text-sm text-[#78716C]">加载中…</p>;

  const grouped = STATUSES.map((s) => ({ status: s, items: items.filter((i) => i.status === s) }));

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-[#1C1917]">外联看板</span>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1C1917]/90"
        >
          <Plus className="h-3.5 w-3.5" /> 新增外联
        </button>
      </div>

      {showForm && <NewOutreachForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {grouped.map(({ status, items: col }) => (
          <div key={status} className="flex w-[260px] shrink-0 flex-col">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
              <span className="text-xs font-medium text-[#1C1917]">{status}</span>
              <span className="rounded-full bg-[#F5F5F4] px-1.5 py-0.5 text-[10px] text-[#78716C]">{col.length}</span>
            </div>
            <div className="min-h-[120px] space-y-2 rounded-lg bg-[#FAFAF9] p-2">
              {col.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDrawerItem(item)}
                  className="w-full rounded-lg border border-[#E7E5E4] bg-white p-2.5 text-left transition-colors hover:border-[#1C1917]/30"
                >
                  <div className="text-sm font-medium text-[#1C1917]">{item.properties?.name ?? "未知楼盘"}</div>
                  {item.contact_name && <div className="mt-0.5 text-xs text-[#78716C]">{item.contact_name}</div>}
                  <div className="mt-1 text-[10px] text-[#A8A29E]">
                    {new Date(item.updated_at).toLocaleDateString("zh-CN")}
                  </div>
                  {item.notes && (
                    <div className="mt-1 truncate text-xs text-[#78716C]">{item.notes.split("\n---\n")[0]?.slice(0, 60)}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {drawerItem && (
        <OutreachDrawer
          item={drawerItem}
          onClose={() => setDrawerItem(null)}
          onUpdate={updateItem}
        />
      )}
    </div>
  );
}

function OutreachDrawer({
  item,
  onClose,
  onUpdate,
}: {
  item: OutreachItem;
  onClose: () => void;
  onUpdate: (i: OutreachItem) => void;
}) {
  const [status, setStatus] = useState(item.status);
  const [contactName, setContactName] = useState(item.contact_name ?? "");
  const [contactInfo, setContactInfo] = useState(item.contact_info ?? "");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setStatus(item.status);
    setContactName(item.contact_name ?? "");
    setContactInfo(item.contact_info ?? "");
  }, [item]);

  const saveStatus = async () => {
    setSaving(true);
    const res = await fetch(`/api/crm/outreach/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, contact_name: contactName || null, contact_info: contactInfo || null }),
    });
    const data = await res.json();
    if (!data.error) onUpdate(data);
    setSaving(false);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/crm/outreach/${item.id}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: newNote.trim() }),
    });
    const data = await res.json();
    if (!data.error) onUpdate(data);
    setNewNote("");
    setSaving(false);
  };

  const generateFollowup = async () => {
    setAiLoading(true);
    setAiMsg("");
    const recentNotes = (item.notes ?? "").split("\n---\n").slice(0, 3);
    const res = await fetch("/api/ai/crm-followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: item.properties?.name ?? "", recentNotes }),
    });
    const data = await res.json().catch(() => ({}));
    setAiMsg(data.message ?? data.error ?? "生成失败");
    setAiLoading(false);
  };

  const noteEntries = (item.notes ?? "").split("\n---\n").filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#E7E5E4] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#1C1917]">{item.properties?.name ?? "外联详情"}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid gap-2">
            <label className="text-xs font-medium text-[#78716C]">状态</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="text-xs font-medium text-[#78716C]">联系人</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="姓名" className="rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
            <input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} placeholder="联系方式" className="rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
            <button type="button" onClick={saveStatus} disabled={saving} className="rounded-lg bg-[#1C1917] py-1.5 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50">
              {saving ? "保存中…" : "保存修改"}
            </button>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-medium text-[#1C1917]">备注时间线</h4>
            <button type="button" onClick={generateFollowup} disabled={aiLoading} className="flex items-center gap-1 rounded-lg border border-[#E7E5E4] px-2 py-1 text-[10px] text-[#78716C] hover:bg-[#F5F5F4] disabled:opacity-50">
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
              AI 生成跟进
            </button>
          </div>

          {aiMsg && (
            <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-2 text-xs text-blue-800 whitespace-pre-wrap">{aiMsg}</div>
          )}

          <div className="mb-3 flex gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="输入新备注..."
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              className="flex-1 rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            />
            <button type="button" onClick={addNote} disabled={saving || !newNote.trim()} className="rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs text-white hover:bg-[#1C1917]/90 disabled:opacity-50">
              添加
            </button>
          </div>

          <div className="space-y-2">
            {noteEntries.length === 0 ? (
              <p className="text-xs text-[#78716C]">暂无备注</p>
            ) : (
              noteEntries.map((n, i) => (
                <div key={i} className="rounded-lg bg-[#FAFAF9] px-3 py-2 text-xs text-[#1C1917] whitespace-pre-wrap">{n}</div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewOutreachForm({ onSubmit, onClose }: { onSubmit: (f: { property_id: string; contact_name: string; contact_info: string }) => void; onClose: () => void }) {
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ property_id: "", contact_name: "", contact_info: "" });

  useEffect(() => {
    fetch("/api/crm/properties").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setProperties(d.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
    });
  }, []);

  return (
    <div className="mb-4 rounded-lg border border-[#E7E5E4] bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#1C1917]">新增外联</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={form.property_id} onChange={(e) => setForm((p) => ({ ...p, property_id: e.target.value }))} className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20">
          <option value="">选择楼盘 *</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input value={form.contact_name} onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))} placeholder="联系人" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <input value={form.contact_info} onChange={(e) => setForm((p) => ({ ...p, contact_info: e.target.value }))} placeholder="联系方式" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
      </div>
      <button
        type="button"
        disabled={!form.property_id}
        onClick={() => onSubmit(form)}
        className="mt-3 rounded-lg bg-[#1C1917] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
      >
        创建
      </button>
    </div>
  );
}
