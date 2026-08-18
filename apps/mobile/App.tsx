import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';

type Pool = { id: string; concursoId: string; cotasDisponiveis: number; totalCotas: number; valorCota: string; taxaAdministracaoPct: string; status: string; teveGanhador: boolean; numerosApostados: number[] };

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export default function App() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void SecureStore.getItemAsync('access_token');
    void fetch(`${apiUrl}/boloes`).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPools(await response.json() as Pool[]);
    }).catch(() => setError('Sem conexão com o catálogo. Verifique a rede e tente novamente.')).finally(() => setLoading(false));
  }, []);

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><View style={styles.container}><Text style={styles.kicker}>CONCURSOS OFICIAIS</Text><Text style={styles.title}>Bolões com clareza em cada etapa.</Text><Text style={styles.subtitle}>Valor do jogo, taxa e status da cota sempre separados.</Text>{loading ? <ActivityIndicator color="#0b6bcb" size="large" /> : error ? <View style={styles.card}><Text style={styles.error}>{error}</Text></View> : <FlatList data={pools} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} ListEmptyComponent={<View style={styles.card}><Text style={styles.cardTitle}>Nenhum bolão disponível</Text><Text style={styles.muted}>O catálogo aparecerá quando houver bolões cadastrados na API.</Text></View>} renderItem={({ item }) => <View style={styles.card}><Text style={styles.pill}>{item.status}</Text><Text style={styles.cardTitle}>Concurso {item.concursoId.slice(0, 8)}</Text><Text style={styles.muted}>Números: {item.numerosApostados.join(' · ')}</Text><Text style={styles.price}>R$ {item.valorCota}</Text><Text style={styles.muted}>{item.cotasDisponiveis} de {item.totalCotas} cotas disponíveis</Text>{item.teveGanhador && <Text style={styles.pill}>Teve cotista premiado</Text>}<Pressable style={styles.button}><Text style={styles.buttonText}>Ver detalhes</Text></Pressable></View>} />}</View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#f4f7fb' }, container: { flex: 1, padding: 24 }, kicker: { color: '#0b6bcb', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginTop: 12 }, title: { color: '#122033', fontSize: 34, fontWeight: '800', lineHeight: 38, marginTop: 12 }, subtitle: { color: '#5c687a', fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 24 }, list: { gap: 14, paddingBottom: 24 }, card: { backgroundColor: '#fff', borderColor: '#dfe7f1', borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 }, cardTitle: { color: '#122033', fontSize: 17, fontWeight: '700', marginTop: 10 }, muted: { color: '#5c687a', fontSize: 14, lineHeight: 21, marginTop: 8 }, price: { color: '#122033', fontSize: 22, fontWeight: '800', marginTop: 12 }, pill: { alignSelf: 'flex-start', backgroundColor: '#e8f2ff', borderRadius: 20, color: '#07498e', fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 }, button: { alignItems: 'center', backgroundColor: '#0b6bcb', borderRadius: 10, marginTop: 16, paddingVertical: 12 }, buttonText: { color: '#fff', fontWeight: '700' }, error: { color: '#8b2d2d', fontSize: 14, lineHeight: 21 } });
