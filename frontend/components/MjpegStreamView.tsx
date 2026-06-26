import { View, ViewStyle } from 'react-native';

type Props = {
  uri: string;
  style?: ViewStyle;
};

export default function MjpegStreamView({ uri, style }: Props) {
  return <View style={style} />;
}
