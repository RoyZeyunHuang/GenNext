import { Suspense } from "react";
import { CopywriterClientRAG } from "@/components/copywriter/CopywriterClientRAG";

export default function RednoteFactoryCopywriterRagPage() {
  return (
    <Suspense>
      <CopywriterClientRAG layoutVariant="rednote" />
    </Suspense>
  );
}
