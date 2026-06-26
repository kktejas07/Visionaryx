import { Alert, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AiRepository, type McpServerModel } from '@/viewmodels/repositories/aiRepository';
import { AiCrudScreen, crudStyles } from '@/components/AiCrudScreen';
import { PaletteDark as C } from '@/constants/visionTheme';

export default function McpScreen() {
  return (
    <AiCrudScreen<McpServerModel>
      eyebrow="AI · MCP Servers"
      title="Model Context Protocol"
      subtitle="Wire VisionaryX agents to external tools via MCP. Browse mcpmarket.com for ready-made servers (filesystem, web search, GitHub, Slack…) and paste their URL here."
      emptyCta="Connect server"
      testID="ai-mcp-screen"
      glowColor={C.tertiary}
      fields={[
        { key: 'name', label: 'Server name', placeholder: 'Filesystem MCP' },
        { key: 'url', label: 'URL / mcpmarket slug', placeholder: 'https://mcpmarket.com/server/fs-tools' },
        { key: 'description', label: 'Description', placeholder: 'Read-only filesystem access for the perimeter agent', multiline: true },
      ]}
      fetcher={() => AiRepository.listMcp()}
      creator={(form) => AiRepository.addMcp({
        name: form.name || 'Untitled server',
        url: form.url || '',
        description: form.description || '',
      })}
      deleter={(id) => AiRepository.deleteMcp(id)}
      renderRow={(item, { remove }) => (
        <View>
          <View style={crudStyles.rowHead}>
            <View style={[crudStyles.rowIcon, { backgroundColor: C.tertiaryFaint }]}>
              <MaterialCommunityIcons name="connection" size={18} color={C.tertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={crudStyles.rowTitle}>{item.name}</Text>
              <Text style={crudStyles.rowSub} numberOfLines={1}>{item.url}</Text>
            </View>
            <Pressable
              onPress={async () => {
                try {
                  const r = await AiRepository.pingMcp(item.id);
                  Alert.alert('MCP', `${r.status} · tools: ${r.tools.join(', ')}`);
                } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed'); }
              }}
              style={crudStyles.iconBtn}
              testID={`mcp-ping-${item.id}`}
              hitSlop={6}
            >
              <MaterialCommunityIcons name="radar" size={18} color={C.cyan} />
            </Pressable>
            <Pressable onPress={remove} style={crudStyles.iconBtn} hitSlop={6} testID={`mcp-del-${item.id}`}>
              <MaterialCommunityIcons name="trash-can-outline" size={16} color={C.danger} />
            </Pressable>
          </View>
          {item.description ? <Text style={[crudStyles.rowSub, { marginTop: 6, fontFamily: undefined }]}>{item.description}</Text> : null}
          <View style={crudStyles.rowMetaRow}>
            <View style={[crudStyles.badge, {
              borderColor: item.status === 'reachable' ? C.cyan : C.warning,
              backgroundColor: item.status === 'reachable' ? C.cyanFaint : C.warningFaint,
            }]}>
              <Text style={[crudStyles.badgeText, { color: item.status === 'reachable' ? C.cyan : C.warning }]}>
                {(item.status || 'unknown').toUpperCase()}
              </Text>
            </View>
            <Text style={crudStyles.rowSub}>
              {item.last_ping_at ? `pinged ${new Date(item.last_ping_at).toLocaleTimeString()}` : 'not yet pinged'}
            </Text>
          </View>
        </View>
      )}
    />
  );
}
