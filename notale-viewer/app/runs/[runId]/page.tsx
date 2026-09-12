import { RunExperience } from "../../../src/components/run-experience";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <RunExperience runId={runId} />;
}
