import { ComparePage } from "@/components/apartments/pages/ComparePage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "房源 · 对比" };

type SP = { [k: string]: string | string[] | undefined };

export default async function RFCompareRoute({
  searchParams,
}: {
  searchParams: SP;
}) {
  return (
    <ComparePage
      searchParams={searchParams}
      basePath="/rednote-factory/apartments"
    />
  );
}
