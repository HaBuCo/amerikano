import { Component, ErrorInfo, ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette as p } from '@/constants/palette';
import { reportError } from '@/monitoring/error-reporting';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const enriched = new Error(error.message);
    enriched.stack = `${error.stack ?? ''}\n${info.componentStack ?? ''}`;
    void reportError(enriched, 'react-boundary', true);
  }

  private recover = () => {
    this.setState({ error: null });
    router.replace('/');
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <View style={s.page}>
      <Text style={s.eyebrow}>OYUN GÜVENLE DURDURULDU</Text>
      <Text style={s.title}>Beklenmeyen bir hata oluştu.</Text>
      <Text style={s.body}>Hata kaydı inceleme için gönderildi. Çevrim içi elin sunucuda, tek oyunculu elin cihazında korunuyor.</Text>
      <Pressable accessibilityRole="button" onPress={this.recover} style={s.button}><Text style={s.buttonText}>Ana menüye dön</Text></Pressable>
    </View>;
  }
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.felt, padding: 28, justifyContent: 'center', gap: 18 },
  eyebrow: { color: p.gold, fontSize: 11, letterSpacing: 2.5, fontWeight: '900' },
  title: { color: p.cream, fontSize: 31, lineHeight: 38, fontWeight: '900' },
  body: { color: p.muted, fontSize: 16, lineHeight: 25 },
  button: { minHeight: 56, borderRadius: 14, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: p.ink, fontSize: 16, fontWeight: '900' },
});
