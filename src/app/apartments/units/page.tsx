import { UnitsSearchPage } from "@/components/apartments/pages/UnitsSearchPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "房源搜索 · 公寓" };

type SP = { [k: string]: string | string[] | undefined };

export default async function UnitsPage({ searchParams }: { searchParams: SP }) {
  return <UnitsSearchPage searchParams={searchParams} basePath="/apartments" />;
}
