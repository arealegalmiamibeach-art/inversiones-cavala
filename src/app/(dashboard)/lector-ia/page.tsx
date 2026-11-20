import { notFound } from "next/navigation";
import { getLectorSession, getLectorStoredFiles } from "@/lib/lector-ia/server";
import { LectorIaClient } from "./lector-ia-client";

export const dynamic = "force-dynamic";

export default async function LectorIaPage() {
  const session = await getLectorSession();
  if (!session) notFound();
  const files = await getLectorStoredFiles(session.supabase);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LectorIaClient access={session.access} storedFiles={files} />
    </div>
  );
}
