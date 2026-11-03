import { ActivityIndicator, View } from 'react-native';

// The browser sign-in returns here; lib/oauth.ts finishes the sign-in and the root layout routes onward.
export default function AuthCallback() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
}
