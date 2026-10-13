import { useMemo } from "react";
import { getPaseoClient, useHosts } from "@getpaseo/plugin/client";
import type { AgentProjectPlacement, AgentRecord, AgentSource } from "../shared/model";
import { normalizeAgent } from "../shared/model";
import { useForeground } from "./use-foreground";
import { useQuery } from "@tanstack/react-query";

export interface HostAgent extends AgentRecord {
  hostId: string;
  hostLabel: string;
  nativeId: string;
}
export interface HostDirectoryState {
  agents: HostAgent[];
  error: string | null;
}

async function fetchHostAgents(host: ReturnType<typeof useHosts>[number]): Promise<HostAgent[]> {
  if (host.status !== "online") return [];
  const paseo = getPaseoClient(host.serverId);
  const entries: Array<{ agent: AgentSource; project?: AgentProjectPlacement | null }> = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.agents.list({
      filter: { includeArchived: true }, sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 200, ...(cursor ? { cursor } : {}) }, timeout: 8000,
    });
    entries.push(...page.entries as Array<{ agent: AgentSource; project?: AgentProjectPlacement | null }>);
    cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor ?? undefined : undefined;
  } while (cursor);
  return entries.map(entry => {
    const native = normalizeAgent(entry.agent, { project: entry.project });
    return { ...native, id: `${host.serverId}:${native.id}`, parentAgentId: native.parentAgentId ? `${host.serverId}:${native.parentAgentId}` : null,
      nativeId: native.id, hostId: host.serverId, hostLabel: host.label };
  });
}

export function useHostDirectory() {
  const hosts = useHosts(), active = useForeground();
  const hostKey = useMemo(() => hosts.map(host => `${host.serverId}:${host.status}`).join("|"), [hosts]);
  const query = useQuery({
    queryKey: ["agent-observatory", "host-directory", hostKey],
    queryFn: async () => {
      const results = await Promise.all(hosts.map(async host => {
        try { return { host, agents: await fetchHostAgents(host) }; }
        catch { return { host, agents: [], error: true }; }
      }));
      const agents = results.flatMap(result => result.agents).sort((a, b) => Date.parse(b.lastActivityAt || b.updatedAt || b.createdAt || "") - Date.parse(a.lastActivityAt || a.updatedAt || a.createdAt || ""));
      return { agents, error: results.some(result => "error" in result) ? "部分主机暂时无法读取" : null } satisfies HostDirectoryState;
    },
    enabled: active && hosts.length > 1,
    refetchInterval: active && hosts.length > 1 ? 15_000 : false,
    staleTime: 2_000,
    retry: false,
  });
  return { hosts, data: query.data, loading: query.isPending, error: query.error?.message ?? query.data?.error ?? null };
}
