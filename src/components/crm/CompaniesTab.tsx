"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompanyEmailSection } from "@/components/crm/CompanyEmailSection";

type Contact = { id: string; name: string; title: string | null; phone: string | null; email: string | null; linkedin_url: string | null; is_primary: boolean };
type PropertyLink = { id: string; role: string; properties: { id: string; name: string; address: string | null; area: string | null } | null };
type Company = {
  id: string; name: string; type: string | null; phone: string | null;
  email: string | null; website: string | null; contacts?: Contact[]; property_companies?: PropertyLink[];
};

const COMPANY_TYPES = ["developer", "management", "leasing", "marketing", "other"];

export function CompaniesTab() {
  const [list, setList] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState<Company | null>(null);
  const [detail, setDetail] = useState<Company | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchList = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (typeFilter) params.set("type", typeFilter);
    const res = await fetch(`/api/crm/companies?${params}`);
    const data = await res.json().catch(() => []);
    setList(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search, typeFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/crm/companies/${id}`);
    const data = await res.json().catch(() => null);
    if (data && !data.error) setDetail(data);
  }, []);

  const selectCompany = (c: Company) => {
    setSelected(c);
    setShowForm(false);
    fetchDetail(c.id);
  };

  const handleCreate = async (form: Record<string, string | null>) => {
    const res = await fetch("/api/crm/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      fetchList();
    }
  };

  const handleUpdate = async (id: string, form: Record<string, string | null>) => {
    await fetch(`/api/crm/companies/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    fetchList();
    fetchDetail(id);
  };

  const handleAddContact = async (companyId: string, contact: Record<string, string | boolean>) => {
    await fetch(`/api/crm/companies/${companyId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contact),
    });
    fetchDetail(companyId);
  };

  const handleDeleteCompany = async (id: string) => {
    if (!window.confirm("确定要删除该公司吗？其联系人与楼盘关联将一并删除，且不可恢复。")) return;
    const res = await fetch(`/api/crm/companies/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSelected(null);
      setDetail(null);
      fetchList();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "删除失败");
    }
  };

  const handleDeleteContact = async (companyId: string, contactId: string) => {
    if (!window.confirm("确定要删除该联系人吗？此操作不可恢复。")) return;
    const res = await fetch(`/api/crm/contacts/${contactId}`, { method: "DELETE" });
    if (res.ok) fetchDetail(companyId);
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "删除失败");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-[#1C1917]">公司列表</span>
          <button
            type="button"
            onClick={() => { setShowForm(true); setSelected(null); setDetail(null); }}
            className="flex items-center gap-1 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1C1917]/90"
          >
            <Plus className="h-3.5 w-3.5" /> 新增公司
          </button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#78716C]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索公司..."
            className="w-full rounded-lg border border-[#E7E5E4] bg-white py-2 pl-8 pr-3 text-sm text-[#1C1917] placeholder:text-[#78716C] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20"
          />
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTypeFilter("")}
            className={cn("rounded-md border px-2 py-1 text-xs transition-colors",
              !typeFilter ? "border-[#1C1917] bg-[#1C1917] text-white" : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#F5F5F4]")}
          >
            全部
          </button>
          {COMPANY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={cn("rounded-md border px-2 py-1 text-xs capitalize transition-colors",
                typeFilter === t ? "border-[#1C1917] bg-[#1C1917] text-white" : "border-[#E7E5E4] bg-white text-[#78716C] hover:bg-[#F5F5F4]")}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="max-h-[560px] space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-[#78716C]">加载中…</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#78716C]">暂无公司</p>
          ) : (
            list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCompany(c)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  selected?.id === c.id ? "border-[#1C1917] bg-[#FAFAF9]" : "border-[#E7E5E4] bg-white hover:bg-[#FAFAF9]"
                )}
              >
                <div className="text-sm font-medium text-[#1C1917]">{c.name}</div>
                <div className="mt-0.5 flex gap-2 text-xs text-[#78716C]">
                  {c.type && <span className="rounded bg-[#F5F5F4] px-1.5 py-0.5 capitalize">{c.type}</span>}
                  {c.email && <span>{c.email}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="rounded-lg bg-white p-6 shadow-card">
        {showForm ? (
          <CompanyForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />
        ) : detail ? (
          <CompanyDetail
            company={detail}
            onUpdate={(form) => handleUpdate(detail.id, form)}
            onAddContact={(c) => handleAddContact(detail.id, c)}
            onDeleteCompany={() => handleDeleteCompany(detail.id)}
            onDeleteContact={(contactId) => handleDeleteContact(detail.id, contactId)}
          />
        ) : (
          <p className="py-20 text-center text-sm text-[#78716C]">选择左侧公司查看详情，或点击「新增公司」</p>
        )}
      </div>
    </div>
  );
}

function CompanyDetail({
  company,
  onUpdate,
  onAddContact,
  onDeleteCompany,
  onDeleteContact,
}: {
  company: Company;
  onUpdate: (form: Record<string, string | null>) => void;
  onAddContact: (c: Record<string, string | boolean>) => void;
  onDeleteCompany: () => void;
  onDeleteContact: (contactId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: company.name, type: company.type ?? "", phone: company.phone ?? "", email: company.email ?? "", website: company.website ?? "" });
  const [newContact, setNewContact] = useState(false);
  const [cf, setCf] = useState({ name: "", title: "", phone: "", email: "", linkedin_url: "" });

  useEffect(() => {
    setForm({ name: company.name, type: company.type ?? "", phone: company.phone ?? "", email: company.email ?? "", website: company.website ?? "" });
    setEditing(false);
  }, [company]);

  const inputCls = "rounded-lg border border-[#E7E5E4] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[#1C1917]">{company.name}</h3>
        <div className="flex items-center gap-2">
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-[#E7E5E4] px-3 py-1 text-xs text-[#78716C] hover:bg-[#F5F5F4]">
              编辑
            </button>
          )}
          <button
            type="button"
            onClick={onDeleteCompany}
            className="rounded-lg border border-[#FEE2E2] px-3 py-1 text-xs text-[#DC2626] hover:bg-[#FEF2F2]"
            title="删除公司"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing ? (
        <div className="mb-4 grid gap-2">
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="公司名称" className={inputCls} />
          <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} className={inputCls}>
            <option value="">选择类型</option>
            {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="电话" className={inputCls} />
          <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="邮箱" className={inputCls} />
          <input value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} placeholder="网站" className={inputCls} />
          <div className="flex gap-2">
            <button type="button" onClick={() => { onUpdate({ ...form, type: form.type || null, phone: form.phone || null, email: form.email || null, website: form.website || null }); setEditing(false); }} className="rounded-lg bg-[#1C1917] px-4 py-1.5 text-xs text-white hover:bg-[#1C1917]/90">保存</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-[#E7E5E4] px-4 py-1.5 text-xs text-[#78716C] hover:bg-[#F5F5F4]">取消</button>
          </div>
        </div>
      ) : (
        <div className="mb-4 grid gap-1 text-sm text-[#78716C]">
          {company.type && <div>类型：<span className="capitalize">{company.type}</span></div>}
          {company.phone && <div>电话：{company.phone}</div>}
          {company.email && <div>邮箱：{company.email}</div>}
          {company.website && <div>网站：{company.website}</div>}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium text-[#1C1917]">联系人</h4>
        <button type="button" onClick={() => setNewContact(true)} className="flex items-center gap-1 text-xs text-[#78716C] hover:text-[#1C1917]">
          <Plus className="h-3 w-3" /> 添加
        </button>
      </div>
      {newContact && (
        <div className="mb-3 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-3">
          <div className="grid gap-2">
            <input value={cf.name} onChange={(e) => setCf((p) => ({ ...p, name: e.target.value }))} placeholder="姓名 *" className={inputCls} />
            <input value={cf.title} onChange={(e) => setCf((p) => ({ ...p, title: e.target.value }))} placeholder="职位" className={inputCls} />
            <input value={cf.phone} onChange={(e) => setCf((p) => ({ ...p, phone: e.target.value }))} placeholder="电话" className={inputCls} />
            <input value={cf.email} onChange={(e) => setCf((p) => ({ ...p, email: e.target.value }))} placeholder="邮箱" className={inputCls} />
            <div className="flex gap-2">
              <button type="button" disabled={!cf.name.trim()} onClick={() => { onAddContact({ name: cf.name, title: cf.title || "", phone: cf.phone || "", email: cf.email || "", linkedin_url: cf.linkedin_url || "", is_primary: false }); setCf({ name: "", title: "", phone: "", email: "", linkedin_url: "" }); setNewContact(false); }} className="rounded-lg bg-[#1C1917] px-4 py-1.5 text-xs text-white hover:bg-[#1C1917]/90 disabled:opacity-50">保存</button>
              <button type="button" onClick={() => setNewContact(false)} className="rounded-lg border border-[#E7E5E4] px-4 py-1.5 text-xs text-[#78716C] hover:bg-[#F5F5F4]">取消</button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {(company.contacts ?? []).length === 0 ? (
          <p className="text-xs text-[#78716C]">暂无联系人</p>
        ) : (
          (company.contacts ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-[#E7E5E4] bg-[#FAFAF9] p-2">
              <User className="h-4 w-4 shrink-0 text-[#78716C]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[#1C1917]">
                  {c.name} {c.is_primary && <span className="ml-1 rounded bg-[#1C1917] px-1.5 py-0.5 text-[10px] text-white">主要</span>}
                </div>
                <div className="text-xs text-[#78716C]">{[c.title, c.phone, c.email].filter(Boolean).join(" · ")}</div>
              </div>
              <button
                type="button"
                onClick={() => onDeleteContact(c.id)}
                className="shrink-0 rounded p-1 text-[#78716C] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                title="删除联系人"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <CompanyEmailSection company={company} />

      {(company.property_companies ?? []).length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium text-[#1C1917]">关联楼盘</h4>
          <div className="space-y-1">
            {(company.property_companies ?? []).map((pc) => (
              <div key={pc.id} className="flex items-center gap-2 rounded border border-[#E7E5E4] bg-[#FAFAF9] px-2 py-1.5 text-sm">
                <span className="rounded bg-[#F5F5F4] px-1.5 py-0.5 text-xs capitalize text-[#78716C]">{pc.role}</span>
                <span className="text-[#1C1917]">{pc.properties?.name ?? "未知"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyForm({ onSubmit, onClose }: { onSubmit: (f: Record<string, string | null>) => void; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", type: "", phone: "", email: "", website: "" });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#1C1917]">新增公司</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3">
        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="公司名称 *" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <select value={form.type} onChange={(e) => set("type", e.target.value)} className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20">
          <option value="">选择类型</option>
          {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="电话" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="邮箱" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="网站" className="rounded-lg border border-[#E7E5E4] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1917]/20" />
        <button
          type="button"
          disabled={!form.name.trim()}
          onClick={() => onSubmit({ name: form.name.trim(), type: form.type || null, phone: form.phone || null, email: form.email || null, website: form.website || null })}
          className="rounded-lg bg-[#1C1917] py-2 text-sm font-medium text-white hover:bg-[#1C1917]/90 disabled:opacity-50"
        >
          保存
        </button>
      </div>
    </div>
  );
}
