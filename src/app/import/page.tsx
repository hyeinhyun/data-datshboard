import type { Metadata } from "next";

import { ExcelImport } from "@/components/import/excel-import";
import { HfWizard } from "@/components/import/hf-wizard";
import { workerAvailable } from "@/lib/hf/python";
import { listDatapacks } from "@/lib/queries/datapacks";
import { JobList } from "@/components/jobs/job-list";
import { getDb } from "@/lib/db/client";
import { listJobs } from "@/lib/jobs/queue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "가져오기" };
export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initial = tab === "hf" || tab === "jobs" ? tab : "excel";
  const db = getDb();
  const jobs = listJobs(db, 100);
  const datapacks = listDatapacks(db).map((p) => p.name);
  const worker = workerAvailable();
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">가져오기</h2>
        <p className="text-muted-foreground text-sm">
          Excel Manifest와 HuggingFace 데이터셋을 가져오고, 색인·변환 작업 현황을 봅니다.
        </p>
      </div>
      <Tabs defaultValue={initial}>
        <TabsList>
          <TabsTrigger value="excel">Excel Manifest</TabsTrigger>
          <TabsTrigger value="hf">HuggingFace</TabsTrigger>
          <TabsTrigger value="jobs">작업</TabsTrigger>
        </TabsList>
        <TabsContent value="excel" className="mt-4">
          <ExcelImport />
        </TabsContent>
        <TabsContent value="hf" className="mt-4">
          <HfWizard datapacks={datapacks} workerReady={worker.ok} workerReason={worker.reason} />
        </TabsContent>
        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>작업 현황</CardTitle>
              <CardDescription>
                색인·변환 작업의 진행률과 로그. 진행 중인 작업은 실시간으로 갱신됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JobList jobs={jobs} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
