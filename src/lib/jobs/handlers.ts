import { ScanCancelled, scanRoot } from "@/lib/experiments/scan";
import { runHfImportJob } from "@/lib/hf/import-job";
import { publish } from "@/lib/realtime/bus";
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

  registerHandler("hf_import", runHfImportJob);

  registerHandler("scan", async ({ job, signal, progress }, db) => {
    const rootId = Number(job.payload.rootId);
    try {
      const r = await scanRoot(db, rootId, {
        signal,
        onProgress: (message) => progress(0.5, message),
      });
      publish({ type: "data-changed", scope: "experiments" });
      publish({ type: "data-changed", scope: "datasets" });
      progress(
        1,
        `학습 설정 ${r.nConfigs}개, dataset_info.json ${r.nInfos}개, 데이터 파일 ${r.nFiles}개` +
          (r.nMissing ? ` (없는 파일 ${r.nMissing}개)` : ""),
      );
      return r;
    } catch (err) {
      if (err instanceof ScanCancelled) return { rootId, cancelled: true };
      throw err;
    }
  });
}
