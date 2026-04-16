"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { NYC_CAMPUSES } from "@/lib/apartments/constants";

export function CompareSchoolPicker({ current }: { current: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <select
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        next.set("school", e.target.value);
        router.push(`?${next.toString()}`);
      }}
      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
    >
      {NYC_CAMPUSES.map((c) => (
        <option key={c.shortName} value={c.shortName}>
          → {c.shortName}
        </option>
      ))}
    </select>
  );
}
