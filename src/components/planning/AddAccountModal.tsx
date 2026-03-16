"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = ["#4a90d9", "#21c354", "#e67e22", "#9b59b6", "#e74c3c", "#1abc9c", "#f39c12", "#3498db"];

export type GlobalAccount = { id: string; name: string; platform: string; color: string | null; notes: string | null };

export function AddAccountModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (account: GlobalAccount) => void;
}) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("小红书");
  const [color, setColor] = useState(COLORS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), platform: platform.trim() || "小红书", color, notes: notes.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "添加失败");
      return;
    }
    const account = await res.json();
    onSuccess(account);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#1C1917]">新增账号</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-[#78716C] hover:bg-[#F5F5F4]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#78716C]">名称 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm" placeholder="账号名称" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#78716C]">平台</label>
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm" placeholder="小红书" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#78716C]">颜色</label>
            <div className="flex gap-1 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={cn("h-6 w-6 rounded-full border-2", color === c ? "border-[#1C1917]" : "border-transparent")} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#78716C]">备注</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 w-full rounded-lg border border-[#E7E5E4] px-3 text-sm" placeholder="可选" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[#E7E5E4] px-4 text-sm text-[#78716C]">取消</button>
          <button type="button" onClick={submit} disabled={saving || !name.trim()} className="h-9 rounded-lg bg-[#1C1917] px-4 text-sm font-medium text-white disabled:opacity-50">添加</button>
        </div>
      </div>
    </div>
  );
}
