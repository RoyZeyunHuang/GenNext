import { UnitDetailPage } from "@/components/apartments/pages/UnitDetailPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RFUnitDetailRoute({
  params,
}: {
  params: { id: string };
}) {
  const id = decodeURIComponent(params.id);
  return <UnitDetailPage id={id} basePath="/rednote-factory/apartments" />;
}
