import type { ComponentType } from "react";
import type { PluginAgentPanelProps, PluginClientContext, PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { AgentDashboard, ObservatoryHub, WorkspaceDashboard } from "./client/dashboard";
import { ScheduleSurface } from "./client/schedule-board";
import { focusScheduleRuns, type ScheduleFocus } from "./client/schedule-focus";
import { contributeObservationPills } from "./client/observation-pill";

/**
 * Paseo 0.11 titles a page opened with `openSurface` (rather than from its sidebar item) by the screen's own title, and
 * `addSurface` used the id there ("schedule-runs"). `addScreen` takes a title; 0.9 hosts without it keep `addSurface`.
 */
type ScreenHost = PluginClientContext & { addScreen?: (screen: { id: string; title: string; Component: ComponentType<PluginSurfaceProps> }) => unknown };
function addTitledSurface(client: PluginClientContext, id: string, title: string, Component: ComponentType<PluginSurfaceProps>) {
  const host = client as ScreenHost;
  if (typeof host.addScreen === "function") host.addScreen({ id, title, Component }); else client.addSurface(id, Component);
}

export default function contribute(client: PluginClientContext) {
  const cleanupPills = contributeObservationPills(client);
  // An Agent's 定时任务 card opens 定时运行 on its schedule.
  const openSchedules = (focus: ScheduleFocus) => { focusScheduleRuns(focus); client.openSurface("schedule-runs"); };
  const Overview = (props: PluginSurfaceProps) => <ObservatoryHub {...props} onOpenSchedules={openSchedules} />;
  const Workspace = (props: PluginWorkspacePanelProps) => <WorkspaceDashboard {...props} onOpenSchedules={openSchedules} />;
  const Inspector = (props: PluginAgentPanelProps) => <AgentDashboard {...props} onOpenSchedules={openSchedules} />;
  addTitledSurface(client, "observatory", "Agent 观测台", Overview);
  client.addSidebarItem({ id: "observatory", title: "Agent 观测台", icon: "Orbit", surface: "observatory" });
  // 定时运行 sits under the host's own 计划 (manage schedules) and shows what they produced.
  addTitledSurface(client, "schedule-runs", "定时运行", ScheduleSurface);
  client.addSidebarItem({ id: "schedule-runs", title: "定时运行", icon: "CalendarClock", surface: "schedule-runs" });
  client.addWorkspacePanel({ id: "workspace-observatory", title: "Agent 观测台", icon: "Activity", context: "workspace", Component: Workspace });
  client.addWorkspacePanel({ id: "agent-inspector", title: "执行详情", icon: "ScanLine", context: "agent", Component: Inspector });
  client.addCommandCenterItem({ id: "open-observatory", title: "打开 Agent 观测台", icon: "Orbit", context: "global", onSelect({openSurface}) { openSurface("observatory"); } });
  client.addCommandCenterItem({ id: "open-schedule-runs", title: "打开定时运行", icon: "CalendarClock", context: "global", onSelect({openSurface}) { openSurface("schedule-runs"); } });
  client.addCommandCenterItem({ id: "inspect-workspace", title: "观测当前工作区", icon: "Activity", context: "workspace", onSelect({openPanel}) { openPanel("workspace-observatory"); } });
  client.addCommandCenterItem({ id: "inspect-agent", title: "观测当前 agent", icon: "ScanLine", context: "agent", onSelect({openPanel}) { openPanel("agent-inspector"); } });
  client.addSlashCommand({ name: "observe", argumentHint: "", description: "查看当前 agent 的执行详情与子任务", context: "agent", onSubmit({openPanel}) { openPanel("agent-inspector"); } });
  return () => { cleanupPills(); };
}
