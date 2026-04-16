import { BuildingDetailPage } from "@/components/apartments/pages/BuildingDetailPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RFBuildingDetailRoute({
  params,
}: {
  params: { slug: string };
}) {
  const slug = decodeURIComponent(params.slug);
  return (
    <BuildingDetailPage slug={slug} basePath="/rednote-factory/apartments" />
  );
}
