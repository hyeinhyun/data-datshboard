import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PagePlaceholderProps = {
  title: string;
  description: string;
  phase: string;
  features: string[];
};

/** Temporary page body used until the real screen lands in its phase. */
export function PagePlaceholder({ title, description, phase, features }: PagePlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <Badge variant="secondary">{phase}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>예정 기능</CardTitle>
          <CardDescription>이 화면에서 제공할 기능입니다. 아직 구현 전입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
