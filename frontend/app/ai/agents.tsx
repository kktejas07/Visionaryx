/**
 * Agents — list + create with MCP server tool-binding.
 */
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AiRepository, type AgentModel, type McpServerModel, type ModelInfo } from '@/viewmodels/repositories/aiRepository';
import { CommandBackground } from '@/components/CommandBackground';
import { GlassCard, GlowOrb } from '@/components/glass';
import { SectionEyebrow, ScreenTitle, ScreenSub, VxButton, VxInput, ErrorBanner } from '@/components/vx';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';

export default function AgentsScreen() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentModel[]>([]);
  const [mcpList, setMcpList] = useState<McpServerModel[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [prompt, setPrompt] = useState('You are a helpful VisionaryX agent.');
  const [modelId, setModelId] = useState('anthropic:claude-sonnet-4-5-20250929');
  const [boundMcp, setBoundMcp] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      const [a, m, mods] = await Promise.all([
        AiRepository.listAgents(),
        AiRepository.listMcp(),
        AiRepository.listModels(),
      ]);
      setAgents(a); setMcpList(m); setModels(mods);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await AiRepository.createAgent({
        name: name.trim() || 'Untitled agent',
        description: desc.trim(),
        system_prompt: prompt.trim() || 'You are a helpful VisionaryX agent.',
        model_id: modelId,
        tools: [],
        mcp_servers: Array.from(boundMcp),
        enabled: true,
      });
      setOpen(false);
      setName(''); setDesc(''); setPrompt('You are a helpful VisionaryX agent.'); setBoundMcp(new Set());
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (Platform.OS === 'web' && !window.confirm('Delete this agent?')) return;
    try { await AiRepository.deleteAgent(id); await load(); } catch (e) { Alert.alert('Error', String(e)); }
  };

  return (
    <View style={styles.root} testID="ai-agents-screen">
      <CommandBackground />
      <GlowOrb size={380} color={C.electricViolet} opacity={0.15} top={-100} right={-100} />

      <FlatList
        data={agents}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.pad}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        ListHeaderComponent={
          <View>
            <SectionEyebrow>AI · Agents</SectionEyebrow>
            <ScreenTitle>Autonomous agents</ScreenTitle>
            <ScreenSub>System-prompted agents with attached MCP tools. Each run gets its tool catalog injected into the system prompt.</ScreenSub>
            <View style={{ marginTop: Space.lg, flexDirection: 'row', gap: Space.sm }}>
              <VxButton label="New agent" onPress={() => setOpen(true)}
                icon={<MaterialCommunityIcons name="plus" size={14} color="#fff" />}
                testID="agents-add-btn" />
            </View>
            <ErrorBanner message={error} />
            <View style={{ marginTop: Space.md }} />
          </View>
        }
        renderItem={({ item }) => (
          <GlassCard pad="md" testID={`agent-row-${item.id}`}>
            <View style={styles.rowHead}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="robot-happy" size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>{item.model_id}</Text>
              </View>
              <Pressable onPress={() => remove(item.id)} style={styles.iconBtn} hitSlop={6} testID={`agent-del-${item.id}`}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={C.danger} />
              </Pressable>
            </View>
            {item.description ? <Text style={[styles.rowSub, { marginTop: 6 }]}>{item.description}</Text> : null}
            <View style={styles.metaRow}>
              <View style={[styles.badge, { borderColor: C.cyan, backgroundColor: C.cyanFaint }]}>
                <Text style={[styles.badgeText, { color: C.cyan }]}>{item.runs} RUNS</Text>
              </View>
              {item.mcp_servers && item.mcp_servers.length > 0 ? (
                <View style={[styles.badge, { borderColor: C.electricViolet, backgroundColor: C.primaryFaint }]}>
                  <MaterialCommunityIcons name="connection" size={9} color={C.electricViolet} />
                  <Text style={[styles.badgeText, { color: C.electricViolet }]}>
                    {item.mcp_servers.length} MCP
                  </Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => router.push(`/ai/agents/${item.id}/console` as any)}
                style={styles.consoleBtn}
                testID={`agent-console-${item.id}`}
              >
                <MaterialCommunityIcons name="console-line" size={12} color={C.electricViolet} />
                <Text style={styles.consoleBtnText}>RUN CONSOLE</Text>
                <MaterialCommunityIcons name="arrow-right" size={11} color={C.electricViolet} />
              </Pressable>
            </View>
          </GlassCard>
        )}
        ListEmptyComponent={
          <GlassCard pad="lg" style={{ alignItems: 'center' }}>
            <MaterialCommunityIcons name="robot-outline" size={32} color={C.primary} />
            <Text style={styles.emptyTitle}>No agents yet</Text>
            <Text style={styles.emptySub}>Create one to start orchestrating LLM + MCP tools.</Text>
          </GlassCard>
        }
      />

      {/* Create modal with tool-binding */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.scrim}>
          <GlassCard pad="lg" style={styles.modal} blur="strong">
            <SectionEyebrow>New agent</SectionEyebrow>
            <Text style={styles.modalTitle}>Compose</Text>
            <ScrollView style={{ marginTop: Space.md }} contentContainerStyle={{ gap: Space.md, paddingBottom: Space.md }}>
              <VxInput label="Name" value={name} onChangeText={setName} placeholder="Perimeter Triage" testID="agent-name" />
              <VxInput label="Description" value={desc} onChangeText={setDesc} placeholder="Triages unknown person alerts…" testID="agent-desc" />
              <VxInput label="System prompt" value={prompt} onChangeText={setPrompt} multiline testID="agent-prompt" />

              <Text style={styles.label}>MODEL</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Space.xs, paddingVertical: 4 }}>
                {models.map((m) => {
                  const active = modelId === m.id;
                  return (
                    <Pressable key={m.id} onPress={() => setModelId(m.id)}
                      style={[styles.modelChip, active && styles.modelChipActive]}
                      testID={`agent-model-${m.id}`}>
                      <Text style={[styles.modelLbl, active && { color: C.text }]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>MCP TOOLS</Text>
              {mcpList.length === 0 ? (
                <Text style={styles.helper}>No MCP servers registered yet — add some in AI → MCP Servers.</Text>
              ) : (
                <View style={{ gap: Space.xs }}>
                  {mcpList.map((s) => {
                    const checked = boundMcp.has(s.id);
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setBoundMcp((prev) => {
                          const n = new Set(prev);
                          if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                          return n;
                        })}
                        style={[styles.mcpRow, checked && styles.mcpRowActive]}
                        testID={`agent-mcp-${s.id}`}
                      >
                        <View style={[styles.checkbox, checked && { backgroundColor: C.primary, borderColor: C.primary }]}>
                          {checked ? <MaterialCommunityIcons name="check" size={12} color="#fff" /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mcpName}>{s.name}</Text>
                          <Text style={styles.mcpUrl} numberOfLines={1}>{s.url}</Text>
                        </View>
                        <View style={[styles.statusDot, { backgroundColor: s.status === 'reachable' ? C.cyan : C.warning }]} />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <VxButton label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
              <VxButton label="Create agent" onPress={save} busy={busy} testID="agent-create-btn" />
            </View>
          </GlassCard>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  rowIcon: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: C.primaryFaint, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...TextStyles.bodyLarge, color: C.text, fontFamily: F.bodySemibold, fontSize: 16 },
  rowSub: { ...TextStyles.caption, color: C.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.sm, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm, borderWidth: 1 },
  badgeText: { ...TextStyles.label, fontSize: 9, letterSpacing: 1.4 },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
  emptyTitle: { ...TextStyles.h4, color: C.text, marginTop: Space.md },
  emptySub: { ...TextStyles.bodySmall, color: C.textMuted, marginTop: 4 },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: Space.lg },
  modal: { maxWidth: 600, width: '100%', alignSelf: 'center', maxHeight: '88%' },
  modalTitle: { ...TextStyles.h3, color: C.text, marginTop: 4 },
  modalActions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, justifyContent: 'flex-end' },
  label: { ...TextStyles.label, color: C.textMuted, marginTop: Space.xs },
  helper: { ...TextStyles.caption, color: C.textFaint, fontStyle: 'italic' },
  modelChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  modelChipActive: { backgroundColor: C.primaryFaint, borderColor: C.primary },
  modelLbl: { ...TextStyles.label, color: C.textMuted, fontSize: 10 },

  mcpRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, padding: Space.sm, backgroundColor: C.surface2, borderRadius: Radius.sm, borderWidth: 1, borderColor: C.border },
  mcpRowActive: { borderColor: C.primary, backgroundColor: C.primaryFaint },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  mcpName: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  mcpUrl: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono },
  statusDot: { width: 6, height: 6, borderRadius: 3 },

  consoleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: C.electricViolet,
    backgroundColor: C.primaryFaint,
  },
  consoleBtnText: { ...TextStyles.label, color: C.electricViolet, fontSize: 9, letterSpacing: 1.4 },
});
