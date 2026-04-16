import { BuildingsGridPage } from "@/components/apartments/pages/BuildingsGridPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "房源 · 楼盘" };

type SP = { [k: string]: string | string[] | undefined };

export default async function RFApartmentsBuildingsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  return (
    <BuildingsGridPage
      searchParams={searchParams}
      basePath="/rednote-factory/apartments"
    />
  );
}
