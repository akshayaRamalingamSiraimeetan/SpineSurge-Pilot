import { Image, StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';
import type { Case } from '@/lib/types';
import { Overlay } from './MeasureCanvas';

/** Non-interactive image + annotations at a fixed width (share card, thumbnails). */
export function AnnotatedImage({ c, width }: { c: Case; width: number }) {
  const s = width / c.image.width;
  const height = c.image.height * s;
  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <Image source={{ uri: c.image.uri }} style={{ width, height }} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Overlay
          image={c.image}
          measurements={c.measurements}
          calibration={c.calibration}
          activeTool={null}
          draft={[]}
          selectedId={null}
          onAddPoint={() => {}}
          onMovePoint={() => {}}
          onSelect={() => {}}
          view={{ s, tx: 0, ty: 0 }}
          cursor={null}
        />
      </Svg>
    </View>
  );
}
