/**
 * AI Models — catalog of all LLMs available via Emergent LLM key.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AiRepository, type ModelInfo } from '@/viewmodels/repositories/aiRepository';
import { CommandBackground } from '@/components/CommandBackground';
import { GlassCard, GlowOrb } from '@/components/glass';
import { SectionEyebrow, ScreenTitle, ScreenSub } from '@/components/vx';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';

const PROVIDER_COLOR = { openai: C.cyan, anthropic: C.electricViolet, gemini: '#4285F4' } as const;
const PROVIDER_LABEL = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini' } as const;
const TIER_COLOR = { flagship: C.primary, fast: C.cyan, deep: C.electricViolet };

export default function ModelsScreen() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  useEffect(() => { void AiRepository.listModels().then(setModels).catch(() => undefined); }, []);

  const grouped = (['anthropic', 'openai', 'gemini'] as const).map((p) => ({
    provider: p,
    items: models.filter((m) => m.provider === p),
  }));

  return (
    <View style={styles.root} testID="ai-models-screen">
      <CommandBackground />
      <GlowOrb size={380} color={C.cyan} opacity={0.14} top={-120} left={-100} />
      <ScrollView contentContainerStyle={styles.pad}>
        <SectionEyebrow>AI · Models</SectionEyebrow>
        <ScreenTitle>Model catalog</ScreenTitle>
        <ScreenSub>
          Universal Emergent LLM key — call OpenAI, Anthropic, or Google Gemini through one endpoint with one bill.
        </ScreenSub>

        {grouped.map((g) => (
          <View key={g.provider} style={{ marginTop: Space.xl }}>
            <View style={styles.groupHead}>
              <View style={[styles.providerDot, { backgroundColor: PROVIDER_COLOR[g.provider] }]} />
              <Text style={styles.groupLbl}>{PROVIDER_LABEL[g.provider]} · {g.items.length} models</Text>
            </View>

            <View style={styles.grid}>
              {g.items.map((m) => (
                <View key={m.id} style={styles.tileSlot}>
                  <GlassCard pad="md" style={styles.tile} testID={`model-card-${m.id}`}>
                    <View style={styles.tileHead}>
                      <Text style={styles.modelLbl}>{m.label}</Text>
                      {m.recommended ? (
                        <View style={styles.recBadge}>
                          <MaterialCommunityIcons name="star-four-points" size={9} color={C.cyan} />
                          <Text style={styles.recText}>RECOMMENDED</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.modelId}>{m.id}</Text>
                    <View style={styles.statsRow}>
                      <View style={[styles.tierChip, { borderColor: TIER_COLOR[m.tier] + '99' }]}>
                        <Text style={[styles.tierText, { color: TIER_COLOR[m.tier] }]}>{m.tier.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.statText}>{(m.context / 1000).toFixed(0)}K ctx</Text>
                      {m.supports_streaming ? <Text style={styles.statText}>· streaming</Text> : null}
                    </View>
                  </GlassCard>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginBottom: Space.md },
  providerDot: { width: 8, height: 8, borderRadius: 4 },
  groupLbl: { ...TextStyles.label, color: C.text, fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  tileSlot: { flexBasis: 280, flexGrow: 1, minWidth: 260 },
  tile: { gap: Space.sm },
  tileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modelLbl: { ...TextStyles.h4, color: C.text, fontSize: 18 },
  modelId: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, marginTop: 2 },
  recBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.cyanFaint, paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.sm },
  recText: { ...TextStyles.label, color: C.cyan, fontSize: 8, letterSpacing: 1.2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.sm, flexWrap: 'wrap' },
  tierChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm, borderWidth: 1 },
  tierText: { ...TextStyles.label, fontSize: 9, letterSpacing: 1.4 },
  statText: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono },
});
