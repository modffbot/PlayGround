import { redirect } from "next/navigation";
import { registerTournamentAction } from "@/app/actions";
import { Card } from "@/components/ui";
export default async function TournamentRegister({ params, searchParams }: { params: { id: string }, searchParams: { r?: string } }) {
  // Direct register link: /tournaments/[id]/register → registers then redirects
  const res = await registerTournamentAction(params.id);
  redirect(`/tournaments/${params.id}`);
}
