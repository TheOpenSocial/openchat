import { IntentDetailScreen } from "@/src/features/intents/intent-detail-screen";

export default async function IntentDetailPage({
  params,
}: {
  params: Promise<{ intentId: string }>;
}) {
  const { intentId } = await params;

  return <IntentDetailScreen intentId={intentId} />;
}
