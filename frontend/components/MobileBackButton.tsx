import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PaletteDark as C, FontFamily as F, Radius, Space } from '@/constants/visionTheme';

type Props = {
  label?: string;
  href?: string;
};

export default function MobileBackButton({ label = 'Back', href }: Props) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  if (width >= 1024) return null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => (href ? router.push(href as any) : router.back())}
        style={styles.btn}
        hitSlop={8}
      >
        <MaterialCommunityIcons name="chevron-left" size={20} color={C.primaryAccent} />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    paddingBottom: 0,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  label: {
    color: C.primaryAccent,
    fontFamily: F.bodySemibold,
    fontSize: 14,
  },
});
