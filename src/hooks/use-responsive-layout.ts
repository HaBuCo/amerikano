import { useWindowDimensions } from 'react-native';

export const TABLET_BREAKPOINT = 700;
export const WIDE_TABLET_BREAKPOINT = 900;

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
  };
}
