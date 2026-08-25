import { StyleSheet } from 'react-native';

/**
 * Shared chrome for the floating circular map controls (LocateButton,
 * BreadcrumbButton): same 46px button, shadow, and small status-badge
 * shape. Each keeps its own icon content local — a ring-and-dot vs a plain
 * dot — since that's genuinely different between them; only the chrome
 * around it was duplicated.
 */
export const floatingControlStyles = StyleSheet.create({
  badge: {
    fontSize: 11,
    color: '#5d5347',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
    overflow: 'hidden',
  },
  button: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
