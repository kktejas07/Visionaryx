/**
 * Bot Reply — streaming chat with multi-provider model picker.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AiRepository, type ModelInfo } from '@/viewmodels/repositories/aiRepository';
import { CommandBackground } from '@/components/CommandBackground';
import { GlassCard, GlowOrb } from '@/components/glass';
import { SectionEyebrow, ScreenTitle, VxButton } from '@/components/vx';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';

interface Msg { role: 'user' | 'assistant'; text: string; modelId?: string }

const SESSION_ID = `vx-chat-${Date.now()}`;

export default function AiChatScreen() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelId, setModelId] = useState('anthropic:claude-sonnet-4-5-20250929');
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', text: 'Hi! I’m the VisionaryX co-pilot. Ask me anything about the perimeter — cameras, detections, or general AI questions.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<FlatList<Msg> | null>(null);

  useEffect(() => { void AiRepository.listModels().then(setModels).catch(() => undefined); }, []);

  const send = async () => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: msg }, { role: 'assistant', text: '', modelId }]);
    try {
      await AiRepository.streamChat({ session_id: SESSION_ID, message: msg, model_id: modelId }, (delta) => {
        setMsgs((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant') copy[copy.length - 1] = { ...last, text: last.text + delta };
          return copy;
        });
      });
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', text: 'Error: ' + (e instanceof Error ? e.message : 'unknown') }]);
    } finally {
      setBusy(false);
    }
  };

  const grouped = ['anthropic', 'openai', 'gemini'] as const;

  return (
    <View style={styles.root} testID="ai-chat-screen">
      <CommandBackground />
      <GlowOrb size={400} color={C.electricViolet} opacity={0.18} top={-100} right={-150} />

      <View style={styles.header}>
        <SectionEyebrow>AI · Bot Reply</SectionEyebrow>
        <ScreenTitle>Co-pilot chat</ScreenTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modelRow}>
          {grouped.flatMap((p) =>
            models.filter((m) => m.provider === p).map((m) => {
              const active = modelId === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setModelId(m.id)}
                  style={[styles.modelChip, active && styles.modelChipActive]}
                  testID={`model-${m.id}`}
                >
                  <View style={[styles.providerDot, { backgroundColor: providerColor(m.provider) }]} />
                  <Text style={[styles.modelLbl, active && { color: C.text }]}>{m.label}</Text>
                  {m.recommended ? <Text style={styles.recBadge}>REC</Text> : null}
                </Pressable>
              );
            }),
          )}
        </ScrollView>
      </View>

      <FlatList
        ref={scrollRef as any}
        data={msgs}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.msgRow, item.role === 'user' && styles.msgRowUser]}>
            <GlassCard pad="md" style={[styles.bubble, item.role === 'user' && styles.bubbleUser]}>
              <Text style={styles.role}>{item.role === 'user' ? 'YOU' : 'AI'}</Text>
              <Text style={styles.msgText} selectable>
                {item.text || (busy ? '…' : '')}
              </Text>
            </GlassCard>
          </View>
        )}
      />

      <GlassCard pad="md" style={styles.composer}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type a message — Cmd/Enter to send"
          placeholderTextColor={C.textFaint}
          style={styles.composerInput}
          multiline
          onSubmitEditing={Platform.OS === 'web' ? undefined : send}
          testID="ai-chat-input"
        />
        <VxButton
          label={busy ? 'Sending' : 'Send'}
          onPress={send}
          busy={busy}
          icon={<MaterialCommunityIcons name="send" size={14} color="#fff" />}
          testID="ai-chat-send"
        />
      </GlassCard>
    </View>
  );
}

function providerColor(p: string): string {
  return p === 'openai' ? C.cyan : p === 'anthropic' ? C.electricViolet : '#4285F4';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  header: { padding: Space.lg, paddingBottom: 0, maxWidth: 1024, width: '100%', alignSelf: 'center' },
  modelRow: { gap: Space.sm, paddingVertical: Space.md, paddingRight: Space.lg },
  modelChip: {
    flexDirection: 'row', alignItems: 'center', gap: Space.xs,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  modelChipActive: { backgroundColor: C.primaryFaint, borderColor: C.primary },
  providerDot: { width: 6, height: 6, borderRadius: 3 },
  modelLbl: { ...TextStyles.bodySmall, color: C.textMuted, fontFamily: F.bodyMedium, fontSize: 12 },
  recBadge: { ...TextStyles.label, color: C.cyan, fontSize: 8, marginLeft: 2, letterSpacing: 1.4 },

  list: { padding: Space.lg, paddingTop: Space.md, gap: Space.md, maxWidth: 1024, width: '100%', alignSelf: 'center' },
  msgRow: { alignItems: 'flex-start', marginBottom: Space.sm },
  msgRowUser: { alignItems: 'flex-end' },
  bubble: { maxWidth: 720, minWidth: 80 },
  bubbleUser: { backgroundColor: C.primaryFaint, borderColor: 'rgba(208,188,255,0.25)' },
  role: { ...TextStyles.label, color: C.textFaint, fontSize: 9, marginBottom: 4 },
  msgText: { ...TextStyles.body, color: C.text, lineHeight: 22 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm,
    margin: Space.lg, marginTop: 0, maxWidth: 1024, width: '100%', alignSelf: 'center',
  },
  composerInput: {
    flex: 1, color: C.text, fontFamily: F.body, fontSize: 15,
    minHeight: 44, maxHeight: 160,
    padding: 0,
  },
});
