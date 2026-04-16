import { UnitsSearchPage } from "@/components/apartments/pages/UnitsSearchPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "房源 · 搜索" };

type SP = { [k: string]: string | string[] | undefined };

export default async function RFApartmentsUnitsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  return (
    <UnitsSearchPage
      searchParams={searchParams}
      basePath="/rednote-factory/apartments"
    />
  );
}
