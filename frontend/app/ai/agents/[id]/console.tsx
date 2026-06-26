/**
 * Agent Run Console — live tool-trace viewer.
 *
 * Streams agent execution via SSE:
 *   - `delta`        text tokens, rendered with a blinking cursor while live
 *   - `tool_call`    LLM requested an MCP tool — added as a collapsed trace row
 *   - `tool_result`  populates the corresponding row with output / duration
 *   - `done`         final summary, persists run into history
 *
 * Layout: 2-column on desktop (history rail | live trace), single column on mobile.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AiRepository, type AgentModel, type AgentRun, type AgentToolCall, type RunTraceEvent } from '@/viewmodels/repositories/aiRepository';
import { CommandBackground } from '@/components/CommandBackground';
import { GlassCard, GlowOrb } from '@/components/glass';
import { SectionEyebrow, ScreenTitle, VxButton, ErrorBanner } from '@/components/vx';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles, Breakpoint } from '@/constants/visionTheme';

interface LiveToolCall extends AgentToolCall {
  status: 'running' | 'done' | 'error';
  expanded?: boolean;
}

interface LiveTrace {
  runId: string | null;
  sessionId: string | null;
  toolsAvailable: Array<{ key: string; server: string; tool: string; description: string }>;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  text: string;
  toolCalls: LiveToolCall[];
  status: 'idle' | 'streaming' | 'complete' | 'error' | 'cancelled';
  error: string | null;
}

const EMPTY_TRACE: LiveTrace = {
  runId: null, sessionId: null, toolsAvailable: [], startedAt: null,
  finishedAt: null, durationMs: null, text: '', toolCalls: [],
  status: 'idle', error: null,
};

export default function AgentRunConsole() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoint.desktop;

  const [agent, setAgent] = useState<AgentModel | null>(null);
  const [history, setHistory] = useState<AgentRun[]>([]);
  const [trace, setTrace] = useState<LiveTrace>(EMPTY_TRACE);
  const [input, setInput] = useState('Summarise the current perimeter status in two sentences.');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const traceScroll = useRef<ScrollView | null>(null);

  const refreshHistory = useCallback(async () => {
    if (!id) return;
    try {
      const runs = await AiRepository.listAgentRuns(id);
      setHistory(runs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runs');
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    AiRepository.listAgents().then((all) => {
      const found = all.find((a) => a.id === id) || null;
      setAgent(found);
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load agent'));
    void refreshHistory();
  }, [id, refreshHistory]);

  const live = trace.status === 'streaming';

  const startRun = useCallback(async () => {
    if (!id || live || !input.trim()) return;
    setError(null);
    setSelectedRunId(null);
    setTrace({ ...EMPTY_TRACE, status: 'streaming', startedAt: new Date().toISOString() });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await AiRepository.streamAgentTrace(id, input.trim(), (ev: RunTraceEvent) => {
        setTrace((prev) => {
          switch (ev.type) {
            case 'meta':
              return {
                ...prev, runId: ev.run_id, sessionId: ev.session_id,
                toolsAvailable: ev.tools_available, startedAt: ev.started_at,
              };
            case 'delta':
              return { ...prev, text: prev.text + ev.text };
            case 'tool_call':
              return {
                ...prev,
                toolCalls: [
                  ...prev.toolCalls,
                  {
                    id: ev.id, name: ev.name, args: ev.args,
                    output: null, error: null, duration_ms: 0,
                    started_at: ev.started_at, status: 'running', expanded: true,
                  },
                ],
              };
            case 'tool_result':
              return {
                ...prev,
                toolCalls: prev.toolCalls.map((c) =>
                  c.id === ev.id
                    ? {
                        ...c,
                        output: ev.output, error: ev.error ?? null,
                        ok: ev.ok, duration_ms: ev.duration_ms,
                        status: ev.ok ? 'done' : 'error',
                      }
                    : c,
                ),
              };
            case 'done':
              // Optimistically prepend this run to history so we don't need a follow-up GET.
              setHistory((h) => [
                {
                  id: ev.run_id,
                  agent_id: id!,
                  session_id: ev.session_id,
                  input: input.trim(),
                  output: ev.output,
                  tool_calls: ev.tool_calls_detail,
                  model_id: agent?.model_id ?? '',
                  status: 'complete',
                  started_at: prev.startedAt ?? new Date().toISOString(),
                  finished_at: ev.finished_at,
                  duration_ms: ev.duration_ms,
                },
                ...h.filter((r) => r.id !== ev.run_id),
              ]);
              return {
                ...prev,
                status: 'complete', finishedAt: ev.finished_at,
                durationMs: ev.duration_ms,
              };
            case 'error':
              return { ...prev, status: 'error', error: ev.message };
            default:
              return prev;
          }
        });
      }, controller.signal);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Run failed';
      if (msg.includes('aborted') || msg.includes('AbortError')) {
        setTrace((p) => ({ ...p, status: 'cancelled' }));
      } else {
        setTrace((p) => ({ ...p, status: 'error', error: msg }));
        setError(msg);
      }
    } finally {
      abortRef.current = null;
      // History is now updated optimistically from the 'done' SSE event.
      // We still refresh once on cancellation/error so the run-record (which
      // was pre-created at stream start) is reflected.
      if (trace.status !== 'complete') {
        void refreshHistory();
      }
    }
  }, [id, input, live, refreshHistory, agent, trace.status]);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const replay = useCallback((run: AgentRun) => {
    setSelectedRunId(run.id);
    setTrace({
      runId: run.id, sessionId: run.session_id,
      toolsAvailable: [], startedAt: run.started_at,
      finishedAt: run.finished_at, durationMs: run.duration_ms,
      text: run.output,
      toolCalls: run.tool_calls.map((c) => ({
        ...c, status: c.error ? 'error' : 'done',
      })),
      status: 'complete', error: null,
    });
    setInput(run.input);
  }, []);

  const toggleExpanded = useCallback((tid: string) => {
    setTrace((p) => ({
      ...p,
      toolCalls: p.toolCalls.map((c) => (c.id === tid ? { ...c, expanded: !c.expanded } : c)),
    }));
  }, []);

  const statusBadge = useMemo(() => {
    const m: Record<LiveTrace['status'], { label: string; color: string; dot: string }> = {
      idle: { label: 'READY', color: C.textMuted, dot: C.textFaint },
      streaming: { label: 'STREAMING', color: C.cyan, dot: C.cyan },
      complete: { label: 'COMPLETE', color: C.success, dot: C.success },
      cancelled: { label: 'CANCELLED', color: C.warning, dot: C.warning },
      error: { label: 'ERROR', color: C.danger, dot: C.danger },
    };
    return m[trace.status];
  }, [trace.status]);

  return (
    <View style={styles.root} testID="agent-console-screen">
      <CommandBackground />
      <GlowOrb size={460} color={C.electricViolet} opacity={0.16} top={-140} right={-160} />
      <GlowOrb size={340} color={C.cyan} opacity={0.10} bottom={-100} left={-80} />

      <View style={[styles.shell, !isDesktop && styles.shellStack]}>
        {/* History rail */}
        {isDesktop ? (
          <View style={styles.rail} testID="run-history-rail">
            <Text style={styles.railTitle}>RUN HISTORY</Text>
            <ScrollView contentContainerStyle={{ gap: Space.sm, paddingBottom: Space.lg }}>
              {history.length === 0 ? (
                <Text style={styles.empty}>No runs yet. Send a prompt below to start.</Text>
              ) : (
                history.map((r) => {
                  const selected = selectedRunId === r.id;
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => replay(r)}
                      style={[styles.runItem, selected && styles.runItemActive]}
                      testID={`run-item-${r.id}`}
                    >
                      <View style={[styles.dot, { backgroundColor: statusColor(r.status) }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.runItemTime}>{fmtTime(r.started_at)}</Text>
                        <Text style={styles.runItemPrompt} numberOfLines={2}>{r.input}</Text>
                        <View style={styles.runItemFoot}>
                          <Text style={styles.runItemMeta}>{r.duration_ms != null ? `${r.duration_ms}ms` : '—'}</Text>
                          {r.tool_calls.length > 0 ? (
                            <Text style={styles.runItemTools}>{r.tool_calls.length} TOOL</Text>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        ) : null}

        {/* Main pane */}
        <View style={styles.main}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} testID="console-back">
              <MaterialCommunityIcons name="arrow-left" size={16} color={C.textMuted} />
              <Text style={styles.backText}>Agents</Text>
            </Pressable>
            <SectionEyebrow>AI · Run Console</SectionEyebrow>
            <View style={styles.headerRow}>
              <ScreenTitle testID="agent-name">{agent?.name ?? 'Agent'}</ScreenTitle>
              <View style={[styles.statusPill, { borderColor: statusBadge.color }]}>
                <View style={[styles.statusDot, { backgroundColor: statusBadge.dot }]} />
                <Text style={[styles.statusText, { color: statusBadge.color }]}>{statusBadge.label}</Text>
              </View>
            </View>
            {agent ? (
              <Text style={styles.modelLine}>
                <MaterialCommunityIcons name="shape" size={11} color={C.textFaint} />{' '}
                {agent.model_id} · {agent.mcp_servers.length} MCP bound
              </Text>
            ) : null}
            <ErrorBanner message={error} />
          </View>

          {/* Trace canvas */}
          <ScrollView
            ref={traceScroll}
            style={{ flex: 1 }}
            contentContainerStyle={styles.canvas}
            onContentSizeChange={() => traceScroll.current?.scrollToEnd({ animated: true })}
          >
            {/* Input echo */}
            {(trace.text.length > 0 || trace.toolCalls.length > 0 || live) ? (
              <View style={styles.userBlock}>
                <Text style={styles.userLbl}>OPERATOR</Text>
                <Text style={styles.userText}>{input}</Text>
              </View>
            ) : null}

            {/* Tools palette */}
            {trace.toolsAvailable.length > 0 ? (
              <GlassCard pad="md" style={{ marginBottom: Space.md }}>
                <Text style={styles.toolsPaletteLbl}>BOUND TOOL CATALOG</Text>
                <View style={styles.toolsPaletteRow}>
                  {trace.toolsAvailable.map((t) => (
                    <View key={t.key} style={styles.toolChip}>
                      <MaterialCommunityIcons name="connection" size={10} color={C.electricViolet} />
                      <Text style={styles.toolChipText}>{t.key}</Text>
                    </View>
                  ))}
                </View>
              </GlassCard>
            ) : null}

            {/* Interleaved tool calls + assistant text */}
            {trace.toolCalls.length > 0 ? (
              <View style={{ gap: Space.sm, marginBottom: Space.md }}>
                {trace.toolCalls.map((tc) => (
                  <ToolCallRow key={tc.id} call={tc} onToggle={() => toggleExpanded(tc.id)} />
                ))}
              </View>
            ) : null}

            {(trace.text || live) ? (
              <GlassCard pad="md" testID="trace-assistant" style={styles.assistantCard}>
                <Text style={styles.assistantLbl}>AI · OUTPUT</Text>
                <Text style={styles.assistantText} selectable>
                  {trace.text}
                  {live ? <Text style={styles.cursor}>▍</Text> : null}
                </Text>
              </GlassCard>
            ) : null}

            {trace.status === 'complete' && trace.durationMs != null ? (
              <View style={styles.doneRow}>
                <MaterialCommunityIcons name="check-circle" size={12} color={C.success} />
                <Text style={styles.doneText}>
                  Completed in {trace.durationMs}ms · {trace.toolCalls.length} tool {trace.toolCalls.length === 1 ? 'call' : 'calls'}
                </Text>
              </View>
            ) : null}

            {trace.status === 'idle' && trace.toolCalls.length === 0 && !trace.text ? (
              <View style={styles.emptyCanvas}>
                <View style={styles.emptyOrb}>
                  <MaterialCommunityIcons name="robot-happy" size={28} color={C.electricViolet} />
                </View>
                <Text style={styles.emptyHead}>Console ready</Text>
                <Text style={styles.emptyBody}>
                  Send a prompt to stream the agent's response. Each MCP tool call will render as an expandable trace row.
                </Text>
                <Text style={styles.emptyHint}>
                  Tip: Tell the agent to call a tool using {`<tool name="SERVER::TOOL">{"arg":"v"}</tool>`}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Composer */}
          <GlassCard pad="md" style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Send a prompt to the agent…"
              placeholderTextColor={C.textFaint}
              style={styles.composerInput}
              multiline
              editable={!live}
              testID="console-input"
            />
            <View style={styles.composerActions}>
              {live ? (
                <VxButton
                  label="Stop"
                  variant="danger"
                  onPress={cancelRun}
                  icon={<MaterialCommunityIcons name="stop" size={14} color="#fff" />}
                  testID="console-stop-btn"
                />
              ) : (
                <VxButton
                  label="Run"
                  onPress={startRun}
                  disabled={!input.trim()}
                  icon={<MaterialCommunityIcons name="play" size={14} color="#fff" />}
                  testID="console-run-btn"
                />
              )}
            </View>
          </GlassCard>
        </View>
      </View>
    </View>
  );
}

function ToolCallRow({ call, onToggle }: { call: LiveToolCall; onToggle: () => void }) {
  const statusColor =
    call.status === 'running' ? C.cyan : call.status === 'done' ? C.success : C.danger;
  const statusIcon =
    call.status === 'running' ? 'progress-clock' : call.status === 'done' ? 'check' : 'alert';
  return (
    <View style={[styles.toolRow, { borderLeftColor: statusColor }]} testID={`tool-row-${call.id}`}>
      <Pressable onPress={onToggle} style={styles.toolHead} testID={`tool-toggle-${call.id}`}>
        <MaterialCommunityIcons
          name={call.expanded ? 'chevron-down' : 'chevron-right'}
          size={14} color={C.textMuted}
        />
        <View style={[styles.toolIcon, { borderColor: statusColor }]}>
          <MaterialCommunityIcons name={statusIcon} size={11} color={statusColor} />
        </View>
        <Text style={styles.toolName}>{call.name}</Text>
        <View style={styles.toolMeta}>
          {call.duration_ms ? <Text style={styles.toolMs}>{call.duration_ms}ms</Text> : null}
          {call.status === 'running' ? <Text style={[styles.toolMs, { color: C.cyan }]}>…</Text> : null}
        </View>
      </Pressable>
      {call.expanded ? (
        <View style={styles.toolBody}>
          <Text style={styles.toolBodyLbl}>ARGS</Text>
          <View style={styles.toolCode}>
            <Text style={styles.toolCodeText}>{JSON.stringify(call.args, null, 2)}</Text>
          </View>
          {call.output != null || call.error ? (
            <>
              <Text style={[styles.toolBodyLbl, { marginTop: Space.sm }]}>
                {call.error ? 'ERROR' : 'OUTPUT'}
              </Text>
              <View style={[styles.toolCode, call.error && { borderColor: C.danger }]}>
                <Text style={[styles.toolCodeText, call.error && { color: C.danger }]} selectable>
                  {call.error ?? call.output}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.toolPending}>
              <MaterialCommunityIcons name="loading" size={12} color={C.cyan} />
              <Text style={styles.toolPendingText}>Awaiting tool response…</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function statusColor(s: AgentRun['status']): string {
  if (s === 'running') return C.cyan;
  if (s === 'error') return C.danger;
  return C.success;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return ''; }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  shell: { flex: 1, flexDirection: 'row' },
  shellStack: { flexDirection: 'column' },

  // History rail
  rail: {
    width: 280,
    borderRightWidth: 1, borderRightColor: C.border,
    padding: Space.md,
    backgroundColor: 'rgba(15, 15, 23, 0.5)',
  },
  railTitle: { ...TextStyles.label, color: C.textFaint, fontSize: 10, marginBottom: Space.md },
  runItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm,
    padding: Space.sm, borderRadius: Radius.sm,
    backgroundColor: C.surfaceLow, borderWidth: 1, borderColor: C.border,
  },
  runItemActive: { borderColor: C.primary, backgroundColor: C.primaryFaint },
  runItemTime: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono, fontSize: 10 },
  runItemPrompt: { ...TextStyles.bodySmall, color: C.text, marginTop: 2, fontSize: 12 },
  runItemFoot: { flexDirection: 'row', gap: Space.sm, marginTop: 4 },
  runItemMeta: { ...TextStyles.label, color: C.textMuted, fontFamily: F.mono, fontSize: 9 },
  runItemTools: { ...TextStyles.label, color: C.electricViolet, fontSize: 9 },
  empty: { ...TextStyles.caption, color: C.textFaint, fontStyle: 'italic', padding: Space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },

  // Main pane
  main: { flex: 1, flexDirection: 'column', minWidth: 0 },
  header: {
    padding: Space.lg, paddingBottom: Space.md,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Space.sm, alignSelf: 'flex-start' },
  backText: { ...TextStyles.label, color: C.textMuted, fontSize: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: Space.sm },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...TextStyles.label, fontSize: 10, letterSpacing: 1.4 },
  modelLine: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono, marginTop: 6 },

  // Trace canvas
  canvas: { padding: Space.lg, paddingBottom: Space.xl, gap: Space.md, maxWidth: 980, width: '100%', alignSelf: 'center' },

  userBlock: {
    backgroundColor: 'rgba(139, 92, 246, 0.07)',
    borderLeftWidth: 3, borderLeftColor: C.primary,
    paddingVertical: Space.sm + 2, paddingHorizontal: Space.md,
    borderRadius: Radius.sm,
    marginBottom: Space.sm,
  },
  userLbl: { ...TextStyles.label, color: C.primaryAccent, fontSize: 9 },
  userText: { ...TextStyles.body, color: C.text, marginTop: 4, fontSize: 14 },

  // Tools palette
  toolsPaletteLbl: { ...TextStyles.label, color: C.textFaint, fontSize: 9, marginBottom: Space.sm },
  toolsPaletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toolChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.primaryFaint,
    borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3,
  },
  toolChipText: { ...TextStyles.caption, color: C.electricViolet, fontFamily: F.mono, fontSize: 10 },

  // Tool call row
  toolRow: {
    backgroundColor: C.surfaceLow,
    borderRadius: Radius.sm, borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 3, overflow: 'hidden',
  },
  toolHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, padding: Space.sm + 2 },
  toolIcon: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toolName: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.mono, flex: 1, fontSize: 12 },
  toolMeta: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  toolMs: { ...TextStyles.label, color: C.textMuted, fontFamily: F.mono, fontSize: 10 },
  toolBody: { padding: Space.sm + 2, paddingTop: 0, gap: 4 },
  toolBodyLbl: { ...TextStyles.label, color: C.textFaint, fontSize: 9 },
  toolCode: {
    backgroundColor: C.bg,
    borderRadius: Radius.sm,
    borderWidth: 1, borderColor: C.border,
    padding: Space.sm,
  },
  toolCodeText: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.mono, fontSize: 11 },
  toolPending: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, marginTop: 4 },
  toolPendingText: { ...TextStyles.caption, color: C.cyan, fontFamily: F.mono },

  // Assistant card
  assistantCard: {},
  assistantLbl: { ...TextStyles.label, color: C.primaryAccent, fontSize: 9, marginBottom: Space.xs },
  assistantText: { ...TextStyles.body, color: C.text, lineHeight: 22 },
  cursor: { color: C.electricViolet, opacity: 0.85 },

  doneRow: {
    flexDirection: 'row', alignItems: 'center', gap: Space.xs,
    marginTop: Space.sm, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full, backgroundColor: 'rgba(6, 182, 212, 0.10)',
    borderWidth: 1, borderColor: C.successFaint,
  },
  doneText: { ...TextStyles.caption, color: C.success, fontFamily: F.mono, fontSize: 11 },

  // Empty
  emptyCanvas: { alignItems: 'center', padding: Space.xl, gap: Space.sm },
  emptyOrb: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: C.primaryFaint,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Space.sm,
  },
  emptyHead: { ...TextStyles.h4, color: C.text },
  emptyBody: { ...TextStyles.bodySmall, color: C.textMuted, maxWidth: 460, textAlign: 'center' },
  emptyHint: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono, marginTop: Space.sm, maxWidth: 520, textAlign: 'center' },

  // Composer
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm,
    margin: Space.lg, marginTop: 0,
    maxWidth: 980, width: '100%', alignSelf: 'center',
  },
  composerInput: {
    flex: 1, color: C.text, fontFamily: F.body, fontSize: 14,
    minHeight: 44, maxHeight: 160, padding: 0,
  },
  composerActions: { flexDirection: 'row', gap: Space.xs },
});
