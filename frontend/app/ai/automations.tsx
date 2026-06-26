import { Alert, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AiRepository, type AutomationModel } from '@/viewmodels/repositories/aiRepository';
import { AiCrudScreen, crudStyles } from '@/components/AiCrudScreen';
import { PaletteDark as C } from '@/constants/visionTheme';

export default function AutomationsScreen() {
  return (
    <AiCrudScreen<AutomationModel>
      eyebrow="AI · Automations"
      title="Agentic workflows"
      subtitle="Multi-step workflows that fire on triggers — alert events, schedules, or manual runs. Each step can call an LLM, MCP tool, or webhook."
      emptyCta="New automation"
      testID="ai-automations-screen"
      glowColor={C.cyan}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'Auto-redact unknown faces' },
        { key: 'description', label: 'Description', placeholder: 'Runs every time an unrecognized entry alert fires...', multiline: true },
        { key: 'trigger', label: 'Trigger (manual / alert / schedule)', placeholder: 'manual' },
      ]}
      fetcher={() => AiRepository.listAutomations()}
      creator={(form) => AiRepository.createAutomation({
        name: form.name || 'Untitled automation',
        description: form.description || '',
        trigger: form.trigger || 'manual',
        steps: [],
        enabled: true,
      })}
      deleter={(id) => AiRepository.deleteAutomation(id)}
      renderRow={(item, { remove }) => (
        <View>
          <View style={crudStyles.rowHead}>
            <View style={[crudStyles.rowIcon, { backgroundColor: C.cyanFaint }]}>
              <MaterialCommunityIcons name="sitemap" size={18} color={C.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={crudStyles.rowTitle}>{item.name}</Text>
              <Text style={crudStyles.rowSub}>trigger: {item.trigger} · {item.steps.length} steps</Text>
            </View>
            <Pressable
              onPress={async () => {
                try {
                  const r = await AiRepository.runAutomation(item.id);
                  Alert.alert('Automation', `Ran ${item.name}. ${r.ok ? 'OK' : 'Failed'}`);
                } catch (e) {
                  Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
                }
              }}
              style={crudStyles.iconBtn}
              testID={`auto-run-${item.id}`}
              hitSlop={6}
            >
              <MaterialCommunityIcons name="play-circle" size={20} color={C.cyan} />
            </Pressable>
            <Pressable onPress={remove} style={crudStyles.iconBtn} hitSlop={6} testID={`auto-del-${item.id}`}>
              <MaterialCommunityIcons name="trash-can-outline" size={16} color={C.danger} />
            </Pressable>
          </View>
          {item.description ? <Text style={[crudStyles.rowSub, { marginTop: 6, fontFamily: undefined }]}>{item.description}</Text> : null}
          <View style={crudStyles.rowMetaRow}>
            <View style={[crudStyles.badge, { borderColor: C.cyan, backgroundColor: C.cyanFaint }]}>
              <Text style={[crudStyles.badgeText, { color: C.cyan }]}>{(item.trigger || 'manual').toUpperCase()}</Text>
            </View>
            <Text style={crudStyles.rowSub}>{item.runs} runs · last {item.last_run_at ? new Date(item.last_run_at).toLocaleTimeString() : '—'}</Text>
          </View>
        </View>
      )}
    />
  );
}
