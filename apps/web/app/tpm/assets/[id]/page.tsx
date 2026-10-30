import { AssetPage } from "@/components/tpm/AssetDetails";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssetPage id={id} />;
}
