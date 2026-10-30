import { AssetEditor } from "@/components/tpm/AssetEditor";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssetEditor id={id} />;
}
