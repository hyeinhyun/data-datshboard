import { IndexCancelled, indexVariant } from "@/lib/indexer/index-variant";
import { getVariant } from "@/lib/queries/datasets";
import { registerHandler } from "./queue";

type GlobalWithFlag = typeof globalThis & { __sftDashboardHandlers?: boolean };

/** Registers every job handler once per process. Call before enqueueing. */
export function ensureHandlers(): void {
  const g = globalThis as GlobalWithFlag;
  if (g.__sftDashboardHandlers) return;
  g.__sftDashboardHandlers = true;

  registerHandler("index", async ({ job, signal, progress }, db) => {
    const variantId = Number(job.payload.variantId);
    const ref = getVariant(db, variantId);
    const label = ref ? `${ref.dataset} / ${ref.kind}` : `variant ${variantId}`;
    progress(0, `${label} 색인 시작`);
    try {
      const result = await indexVariant(db, variantId, {
        signal,
        onProgress: ({ done, bytesRead, bytesTotal }) =>
          progress(
            bytesTotal ? bytesRead / bytesTotal : 0,
            `${label} · ${done.toLocaleString("ko-KR")}개`,
          ),
      });
      progress(1, `${label} · ${result.nSamples.toLocaleString("ko-KR")}개 색인 완료`);
      return { variantId, nSamples: result.nSamples };
    } catch (err) {
      if (err instanceof IndexCancelled) return { variantId, cancelled: true };
      throw err;
    }
  });
}
