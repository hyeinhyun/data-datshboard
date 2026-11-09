import { notFound, redirect } from "next/navigation";

import { getDb } from "@/lib/db/client";
import { getSample } from "@/lib/queries/samples";
import { samplesHref } from "@/lib/sample-filters";

export const dynamic = "force-dynamic";

/** Deep link: /samples/123 → the explorer scoped to that sample's variant with the sheet open. */
export default async function SampleDeepLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sample = getSample(getDb(), Number(id));
  if (!sample) notFound();
  redirect(samplesHref({ variantId: sample.variantId }, { sample: sample.id }));
}
