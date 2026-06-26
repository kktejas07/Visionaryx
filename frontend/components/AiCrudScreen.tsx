/**
 * Generic CRUD screen factory used by Agents, Automations, MCP, RAG screens.
 * Keeps each screen file small and consistent.
 */
import { ReactNode, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CommandBackground } from '@/components/CommandBackground';
import { GlassCard, GlowOrb } from '@/components/glass';
import { SectionEyebrow, ScreenTitle, ScreenSub, VxButton, VxInput, ErrorBanner } from '@/components/vx';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';

export interface FieldDef { key: string; label: string; placeholder?: string; multiline?: boolean }

export function AiCrudScreen<T extends { id: string }>(props: {
  eyebrow: string;
  title: string;
  subtitle: string;
  emptyCta: string;
  testID: string;
  glowColor?: string;
  fields: FieldDef[];
  fetcher: () => Promise<T[]>;
  creator: (form: Record<string, string>) => Promise<T>;
  deleter: (id: string) => Promise<unknown>;
  renderRow: (item: T, actions: { remove: () => void; extra?: ReactNode }) => ReactNode;
  customActionButton?: ReactNode;
}) {
  const router = useRouter();
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = () => props.fetcher().then(setItems).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []); // eslint-disable-line

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await props.creator(form);
      setOpen(false);
      setForm({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(false); }
  };

  const onDelete = async (id: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete this item?')) return;
    }
    try { await props.deleter(id); await load(); } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <View style={styles.root} testID={props.testID}>
      <CommandBackground />
      <GlowOrb size={360} color={props.glowColor ?? C.electricViolet} opacity={0.15} top={-100} right={-100} />

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.pad}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        ListHeaderComponent={
          <View>
            <SectionEyebrow>{props.eyebrow}</SectionEyebrow>
            <ScreenTitle>{props.title}</ScreenTitle>
            <ScreenSub>{props.subtitle}</ScreenSub>
            <View style={styles.actionsRow}>
              <VxButton
                label={props.emptyCta}
                onPress={() => setOpen(true)}
                icon={<MaterialCommunityIcons name="plus" size={14} color="#fff" />}
                testID={`${props.testID}-add-btn`}
              />
              {props.customActionButton}
            </View>
            <ErrorBanner message={error} />
            <View style={{ marginTop: Space.md }} />
          </View>
        }
        renderItem={({ item }) => (
          <GlassCard pad="md" testID={`${props.testID}-row-${item.id}`}>
            {props.renderRow(item, { remove: () => onDelete(item.id) })}
          </GlassCard>
        )}
        ListEmptyComponent={
          <GlassCard pad="lg" style={{ alignItems: 'center' }}>
            <MaterialCommunityIcons name="auto-fix" size={32} color={C.primary} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySub}>Press “{props.emptyCta}” to create your first one.</Text>
          </GlassCard>
        }
      />

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.scrim}>
          <GlassCard pad="lg" style={styles.modal} blur="strong">
            <SectionEyebrow>New</SectionEyebrow>
            <Text style={styles.modalTitle}>{props.emptyCta}</Text>
            <ScrollView style={{ marginTop: Space.md }} contentContainerStyle={{ gap: Space.md }}>
              {props.fields.map((f) => (
                <VxInput
                  key={f.key}
                  label={f.label}
                  placeholder={f.placeholder}
                  value={form[f.key] || ''}
                  onChangeText={(v) => setForm((s) => ({ ...s, [f.key]: v }))}
                  multiline={f.multiline}
                  testID={`${props.testID}-field-${f.key}`}
                />
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <VxButton label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
              <VxButton label="Create" onPress={onSave} busy={busy} testID={`${props.testID}-create-btn`} />
            </View>
          </GlassCard>
        </View>
      </Modal>
    </View>
  );
}

export const crudStyles = StyleSheet.create({
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  rowIcon: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: C.primaryFaint, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...TextStyles.bodyLarge, color: C.text, fontFamily: F.bodySemibold, fontSize: 16 },
  rowSub: { ...TextStyles.caption, color: C.textMuted, marginTop: 2, fontFamily: F.mono },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md, marginTop: Space.sm, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm, borderWidth: 1 },
  badgeText: { ...TextStyles.label, fontSize: 9, letterSpacing: 1.4 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.lg },
  emptyTitle: { ...TextStyles.h4, color: C.text, marginTop: Space.md },
  emptySub: { ...TextStyles.bodySmall, color: C.textMuted, marginTop: 4, textAlign: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: Space.lg },
  modal: { maxWidth: 560, width: '100%', alignSelf: 'center', maxHeight: '85%' },
  modalTitle: { ...TextStyles.h3, color: C.text, marginTop: Space.xs },
  modalActions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, justifyContent: 'flex-end' },
});
