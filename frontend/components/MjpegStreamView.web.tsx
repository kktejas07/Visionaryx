type Props = {
  uri: string;
  style?: React.CSSProperties;
};

export default function MjpegStreamView({ uri, style }: Props) {
  return (
    <img
      src={uri}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        display: 'block',
        ...(style as React.CSSProperties),
      }}
    />
  );
}
