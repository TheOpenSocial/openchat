import { IntentDetailScreen } from "@/src/features/intents/intent-detail-screen";

export default function IntentDetailPage({
  params,
}: {
  params: { intentId: string };
}) {
  return <IntentDetailScreen intentId={params.intentId} />;
}
