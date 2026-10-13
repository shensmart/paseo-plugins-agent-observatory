import type { PluginTheme } from "@getpaseo/plugin";
import { Chip, ChipBar } from "./kit";

/** Each host shows the unread results it contributes to the list currently on screen, so the numbers always add up
 *  to the 未读 scope above and never count sessions hidden by the time range / current-vs-archived choice. */
export function HostFilterBar({ theme, hosts, unreadByHost, value, onChange }: {
  theme: PluginTheme; hosts: readonly { serverId: string; label: string; status: string }[]; unreadByHost: ReadonlyMap<string, number>; value: string; onChange: (value: string) => void;
}) {
  const allUnread = hosts.reduce((total, host) => total + (unreadByHost.get(host.serverId) ?? 0), 0);
  return <ChipBar border theme={theme}>
    <Chip theme={theme} label="全部主机" icon="Globe2" count={allUnread} selected={value === "all"} onPress={() => onChange("all")} />
    {hosts.map(host => <Chip key={host.serverId} theme={theme} label={host.label} count={unreadByHost.get(host.serverId) ?? 0} tone={host.status === "online" ? "info" : "neutral"} selected={value === host.serverId} onPress={() => onChange(host.serverId)} />)}
  </ChipBar>;
}
