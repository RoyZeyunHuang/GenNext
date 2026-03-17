"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, Loader2, MessageSquare, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = ["Pitched", "Meeting", "Negotiating", "Won", "Lost"] as const;
const STAGE_COLORS: Record<string, string> = {
  "Not Started": "#8a7f74",
  Pitched: "#4a90d9",
  Meeting: "#e6b422",
  Negotiating: "#e67e22",
  Won: "#21c354",
  Lost: "#ff4b4b",
};
const STAGE_LABELS: Record<string, string> = {
  "Not Started": "Not Started",
  Pitched: "Pitched",
  Meeting: "Meeting",
  Negotiating: "Negotiating",
  Won: "Won",
  Lost: "终止",
};
const DEAL_STATUS_LABELS: Record<string, string> = {
  Active: "正常推进",
  "Need Follow Up": "需要跟进",
  "On Hold": "暂停",
};
const DEAL_STATUS_CARD_CLASS: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800",
  "Need Follow Up": "bg-amber-100 text-amber-800",
  "On Hold": "bg-[#E7E5E4] text-[#44403C]",
};
const LOST_REASONS = [
  { value: "Signed w/ Others", label: "被别人签了" },
  { value: "No Budget", label: "没有预算" },
  { value: "No Response", label: "没有回应" },
  { value: "Not Interested", label: "对方不感兴趣" },
  { value: "Other", label: "其他" },
] as const;

type OutreachItem = {
  id: string;
  property_id: string;
  stage: string;
  deal_status: string;
  lost_reason: string | null;
  price: string | null;
  term: string | null;
  contact_name: string | null;
  contact_info: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  properties: {
    id: string;
    name: string;
    address: string | null;
    property_companies?: { role: string; companies: { name: string } | null }[];
  } | null;
};

function extractLatestNote(notes: string | null): string {
  if (!notes) return "";
  const first = notes.split("\n---\n")[0] ?? "";
  const withoutTimestamp = first.replace(/^\[[^\]]*]\s*/, "");
  return withoutTimestamp.trim();
}

function lastNotePreview(notes: string | null, maxLines = 2): string {
  const base = extractLatestNote(notes);
  if (!base) return "";
  const lines = base.split("\n").filter(Boolean);
  const joined = lines.slice(0, maxLines).join(" ");
  return joined.slice(0, 80) + (joined.length > 80 ? "…" : "");
}

export function OutreachTab() {
  const [items, setItems] = useState<OutreachItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerItem, setDrawerItem] = useState<OutreachItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [dragItem, setDragItem] = useState<OutreachItem | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [lostModal, setLostModal] = useState<{ item: OutreachItem; toStage: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importToast, setImportToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/crm/outreach");
    const data = await res.json().catch(() => []);
    const list = Array.isArray(data) ? data : [];
    setItems(
      list.map((o: Record<string, unknown>) => ({
        ...o,
        stage: (o.stage ?? o.status ?? "Not Started") as string,
        deal_status: (o.deal_status ?? "Active") as string,
      })) as OutreachItem[]
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const updateItem = useCallback((updated: OutreachItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    if (drawerItem?.id === updated.id) setDrawerItem(updated);
  }, [drawerItem?.id]);

  // Excel 导入能力保留在后端，但前端入口隐藏

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

  const moveStage = async (item: OutreachItem, newStage: string, lostReason?: string) => {
    const res = await fetch(`/api/crm/outreach/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage, ...(lostReason !== undefined && { lost_reason: lostReason }) }),
    });
    if (res.ok) {
      const data = await res.json();
      updateItem(data);
      setLostModal(null);
    }
    setDragItem(null);
    setDragOverStage(null);
  };

  const onDrop = (stage: string) => {
    if (!dragItem) return;
    if (stage === "Lost") {
      setLostModal({ item: dragItem, toStage: stage });
    } else {
      moveStage(dragItem, stage);
    }
    setDragOverStage(null);
  };

  if (loading) return <p className="py-12 text-center text-sm text-[#78716C]">加载中…</p>;

  const grouped = STAGES.map((s) => ({ stage: s, items: items.filter((i) => i.stage === s) }));

  return (
    <div className="relative">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#1C1917]">外联看板</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1C1917]/90"
          >
            <Plus className="h-3.5 w-3.5" /> 新增外联
          </button>
        </div>
      </div>
      {/* Excel 导入 toast 保留逻辑，当前入口已隐藏，如后续需要可重新启用 */}

      {showForm && <NewOutreachForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {grouped.map(({ stage, items: col }) => (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage(stage);
            }}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(stage);
            }}
            className={cn(
              "flex w-[260px] shrink-0 flex-col rounded-lg transition-colors",
              dragOverStage === stage ? "bg-[#E7E5E4]/50" : ""
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
              <span className="text-xs font-medium text-[#1C1917]">{STAGE_LABELS[stage] ?? stage}</span>
              <span className="rounded-full bg-[#F5F5F4] px-1.5 py-0.5 text-[10px] text-[#78716C]">{col.length}</span>
            </div>
            <div className="min-h-[120px] space-y-2 rounded-lg bg-[#FAFAF9] p-2">
              {col.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDragItem(item)}
                  onDragEnd={() => setDragItem(null)}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDrawerItem(item)}
                  className="cursor-grab rounded-lg border border-[#E7E5E4] bg-white p-2.5 text-left transition-colors hover:border-[#1C1917]/30 active:cursor-grabbing"
                >
                  <div className="font-semibold text-[#1C1917]">{item.properties?.name ?? "未知楼盘"}</div>
                  {(() => {
                    const dev = item.properties?.property_companies?.find((pc) => pc.role === "developer")?.companies?.name;
                    if (!dev) return null;
                    return <div className="mt-0.5 text-xs text-[#78716C]">{dev}</div>;
                  })()}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", DEAL_STATUS_CARD_CLASS[item.deal_status] ?? DEAL_STATUS_CARD_CLASS.Active)}>
                      {DEAL_STATUS_LABELS[item.deal_status] ?? item.deal_status}
                    </span>
                  </div>
                  {(item.price || item.term) && (
                    <div className="mt-0.5 text-[10px] text-[#A8A29E]">
                      {[item.price, item.term].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {item.notes && (
                    <div className="mt-1 line-clamp-2 text-xs text-[#78716C]">
                      {lastNotePreview(item.notes)}
                    </div>
                  )}
                  {item.notes && item.contact_name && (
                    <div className="mt-1 text-[10px] text-[#78716C]">主要联系人：{item.contact_name}</div>
                  )}
                  <div className="mt-1 text-[10px] text-[#A8A29E]">{new Date(item.updated_at).toLocaleDateString("zh-CN")}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {lostModal && (
        <LostReasonModal
          item={lostModal.item}
          onSelect={(reason) => {
            moveStage(lostModal.item, "Lost", reason);
            setLostModal(null);
          }}
          onClose={() => {
            setLostModal(null);
            setDragItem(null);
          }}
        />
      )}

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

function LostReasonModal({
  item,
  onSelect,
  onClose,
}: {
  item: OutreachItem;
  onSelect: (reason: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <h4 className="mb-2 text-sm font-medium text-[#1C1917]">选择未成功原因</h4>
        <p className="mb-3 text-xs text-[#78716C]">{item.properties?.name ?? "该楼盘"}</p>
        <div className="space-y-1.5">
          {LOST_REASONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              className="block w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-left text-sm text-[#1C1917] hover:bg-[#FAFAF9]"
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-lg border border-[#E7E5E4] py-2 text-xs text-[#78716C] hover:bg-[#F5F5F4]">
          取消
        </button>
      </div>
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
  const [stage, setStage] = useState(item.stage ?? "Not Started");
  const [dealStatus, setDealStatus] = useState(item.deal_status ?? "Active");
  const [lostReason, setLostReason] = useState(item.lost_reason ?? "");
  const [contactName, setContactName] = useState(item.contact_name ?? "");
  const [contactInfo, setContactInfo] = useState(item.contact_info ?? "");
  const [price, setPrice] = useState(item.price ?? "");
  const [term, setTerm] = useState(item.term ?? "");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setStage(item.stage ?? "Not Started");
    setDealStatus(item.deal_status ?? "Active");
    setLostReason(item.lost_reason ?? "");
    setContactName(item.contact_name ?? "");
    setContactInfo(item.contact_info ?? "");
    setPrice(item.price ?? "");
    setTerm(item.term ?? "");
  }, [item]);

  const isTerminal = stage === "Won" || stage === "Lost";

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/crm/outreach/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        deal_status: isTerminal ? item.deal_status : dealStatus,
        lost_reason: stage === "Lost" ? lostReason || null : null,
        contact_name: contactName || null,
        contact_info: contactInfo || null,
        price: price || null,
        term: term || null,
      }),
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
          <h3 className="text-lg font-semibold text-[#1C1917]">{item.properties?.name ?? "外联详情"}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-[#78716C]">Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s] ?? s}</option>
              ))}
            </select>
            {stage === "Lost" && (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-[#78716C]">未成功原因</label>
                <select
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  className="w-full rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
                >
                  <option value="">选择原因</option>
                  {LOST_REASONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-[#78716C]">Deal Status</label>
            <div className="flex gap-2">
              {(["Active", "Need Follow Up", "On Hold"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={isTerminal}
                  onClick={() => setDealStatus(s)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    dealStatus === s ? "border-[#1C1917] bg-[#1C1917] text-white" : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#F5F5F4]",
                    isTerminal && "cursor-not-allowed opacity-50"
                  )}
                >
                  {DEAL_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 grid gap-2">
            <label className="text-xs font-medium text-[#78716C]">联系人</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="姓名"
              className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            />
            <input
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="联系方式"
              className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="$1,299"
              className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="2 Weeks"
              className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
            />
            <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-[#1C1917] py-2 text-xs font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50">
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

function NewOutreachForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (f: { property_id: string; contact_name: string; contact_info: string }) => void;
  onClose: () => void;
}) {
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
        <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          value={form.property_id}
          onChange={(e) => setForm((p) => ({ ...p, property_id: e.target.value }))}
          className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
        >
          <option value="">选择楼盘 *</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
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
