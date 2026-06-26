import { View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  uri: string;
  style?: ViewStyle;
};

export default function MjpegStreamView({ uri, style }: Props) {
  return (
    <View style={[{ flex: 1, backgroundColor: '#000' }, style]}>
      <WebView
        source={{ uri }}
        style={{ flex: 1, backgroundColor: '#000' }}
        scrollEnabled={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
      />
    </View>
  );
}
