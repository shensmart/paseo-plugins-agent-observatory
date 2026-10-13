import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";

type Agent = Awaited<ReturnType<PluginClientContext["paseo"]["agents"]["list"]>>["entries"][number]["agent"];

/** Adds a one-click 「观测台」 pill above every Agent composer. */
export function contributeObservationPills(client: PluginClientContext) {
  const pills = new Map<string, PluginButtonRegistration>();
  const lifetime = new AbortController();
  const register = (agent: Agent) => {
    if (lifetime.signal.aborted || !agent.workspaceId || pills.has(agent.id)) return;
    pills.set(agent.id, client.addComposerPill({
      id: "observatory",
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: {
        title: "打开当前 Agent 的观测台",
        icon: "Activity",
        label: "观测台",
        behavior: { kind: "action", onPress: () => client.openSurface("observatory") },
      },
    }));
  };
  const remove = (agentId: string) => { pills.get(agentId)?.remove(); pills.delete(agentId); };
  const removeAll = () => { for (const pill of pills.values()) pill.remove(); pills.clear(); };
  void client.paseo.agents.list({ subscribe: {}, signal: lifetime.signal }).then(({ subscription }) => {
    subscription.subscribe({
      snapshot: ({ entries }) => { removeAll(); for (const { agent } of entries) register(agent); },
      update: message => {
        if (message.type !== "agent_update") return;
        if (message.payload.kind === "remove") remove(message.payload.agentId); else register(message.payload.agent);
      },
    });
  }).catch(error => { if (!lifetime.signal.aborted) console.error("Agent observatory pill observation failed", error); });
  return () => { lifetime.abort(); removeAll(); };
}
