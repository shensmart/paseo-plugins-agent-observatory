import type { PluginTheme } from "@getpaseo/plugin";
import { Chip, ChipBar } from "./kit";
import { isUnreadCompletion } from "../shared/model";
import type { HostAgent } from "./use-host-directory";

export function HostFilterBar({ theme, hosts, agents, unreadByHost, value, onChange }: {
  theme: PluginTheme; hosts: readonly { serverId: string; label: string; status: string }[]; agents: readonly HostAgent[]; unreadByHost: ReadonlyMap<string, number>; value: string; onChange: (value: string) => void;
}) {
  const allUnread = agents.filter(isUnreadCompletion).length;
  return <ChipBar border theme={theme}>
    <Chip theme={theme} label="全部主机" icon="Globe2" count={allUnread} selected={value === "all"} onPress={() => onChange("all")} />
    {hosts.map(host => <Chip key={host.serverId} theme={theme} label={host.label} count={unreadByHost.get(host.serverId) ?? 0} tone={host.status === "online" ? "info" : "neutral"} selected={value === host.serverId} onPress={() => onChange(host.serverId)} />)}
  </ChipBar>;
}
