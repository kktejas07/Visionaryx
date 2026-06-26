import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stitch } from '@/constants/stitchTheme';

type Glyph = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Stitch dock: active tab uses primary + a dot under the icon (overview/code.html).
 */
export function StitchTabIcon({
  name,
  focused,
  color,
  size,
}: {
  name: Glyph;
  focused: boolean;
  color: string;
  size: number;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'flex-start', minHeight: 44 }}>
      <MaterialCommunityIcons name={name} color={color} size={size} />
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          marginTop: 4,
          backgroundColor: focused ? Stitch.primary : 'transparent',
        }}
      />
    </View>
  );
}
