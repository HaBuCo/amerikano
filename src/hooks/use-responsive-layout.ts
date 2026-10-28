import { useWindowDimensions } from 'react-native';

export const TABLET_BREAKPOINT = 700;
export const WIDE_TABLET_BREAKPOINT = 900;
// A phone on its side is wide but short; tablets stay at least this tall in landscape.
export const SHORT_LANDSCAPE_HEIGHT = 600;

export function useResponsiveLayout() {
  const dimensions = useWindowDimensions();
  const width = Math.max(1, Number.isFinite(dimensions.width) ? dimensions.width : 1);
  const height = Math.max(1, Number.isFinite(dimensions.height) ? dimensions.height : 1);
  const isTablet = width >= TABLET_BREAKPOINT;
  const isLandscape = width > height;

  return {
    width,
    height,
    fontScale: dimensions.fontScale || 1,
    isTablet,
    isLandscape,
    isWideTablet: width >= WIDE_TABLET_BREAKPOINT,
    isTabletLandscape: isTablet && isLandscape,
    isPhoneLandscape: isLandscape && height < SHORT_LANDSCAPE_HEIGHT,
  };
}
