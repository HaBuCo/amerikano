import type { ConfigContext } from 'expo/config';

const googlePlugin = '@react-native-google-signin/google-signin';

function googleIosScheme(clientId: string | undefined) {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId || !clientId.endsWith(suffix) || clientId.startsWith('REPLACE_WITH')) return null;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

export default ({ config }: ConfigContext) => {
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
