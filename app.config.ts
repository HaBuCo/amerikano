import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const googlePlugin = '@react-native-google-signin/google-signin';

function googleIosScheme(clientId: string | undefined) {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId || !clientId.endsWith(suffix) || clientId.startsWith('REPLACE_WITH')) return null;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

// Android push needs Firebase. Until google-services.json is added, the app
// still builds and local notifications work; only remote push is unavailable.
function withFirebase(config: ExpoConfig): ExpoConfig {
  if (!existsSync('./google-services.json')) return config;
  return { ...config, android: { ...config.android, googleServicesFile: './google-services.json' } };
}

export default ({ config: baseConfig }: ConfigContext) => {
  const config = withFirebase(baseConfig as ExpoConfig);
  const iosUrlScheme = googleIosScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  if (!iosUrlScheme) return config;

  return {
    ...config,
    plugins: (config.plugins ?? []).map((plugin) => {
      if (!Array.isArray(plugin) || plugin[0] !== googlePlugin) return plugin;
      return [googlePlugin, { ...(plugin[1] ?? {}), iosUrlScheme }];
    }),
  };
};
