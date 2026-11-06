// react-native-qrcode-styled ships types that its package exports don't expose; declare what we use.
declare module 'react-native-qrcode-styled' {
  import type { ComponentType } from 'react';
  import type { StyleProp, ViewStyle } from 'react-native';

  const QRCodeStyled: ComponentType<{
    data?: string;
    pieceSize?: number;
    padding?: number;
    color?: string;
    style?: StyleProp<ViewStyle>;
  }>;
  export default QRCodeStyled;
}
