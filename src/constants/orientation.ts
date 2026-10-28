import type { ModalProps } from 'react-native';

// iOS modals default to portrait only, which rotates a landscape table back to portrait.
export const MODAL_ORIENTATIONS: ModalProps['supportedOrientations'] = ['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right'];
