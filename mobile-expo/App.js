import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

const BACKEND_URL = 'https://jarvis-backend-3c4z.onrender.com';

const initialMessages = [
  {
    id: 'boot',
    role: 'assistant',
    content: 'Todos los sistemas en linea. Estoy listo para asistirle, Senor.'
  }
];

function parseJarvisStream(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.replace(/^data:\s*/, '').trim())
    .filter((line) => line && line !== '[DONE]')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildHistory(messages) {
  return messages
    .filter((message) => message.id !== 'boot')
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

export default function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [serverStatus, setServerStatus] = useState('Comprobando');
  const [serverModel, setServerModel] = useState('Jarvis');
  const listRef = useRef(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  useEffect(() => {
    let mounted = true;

    async function loadStatus() {
      try {
        const response = await fetch(`${BACKEND_URL}/api/status`);
        const status = await response.json();
        if (!mounted) return;
        setServerStatus(status.status === 'online' ? 'Online' : 'Revisar');
        setServerModel(status.model || 'Jarvis');
      } catch {
        if (!mounted) return;
        setServerStatus('Sin conexion');
      }
    }

    loadStatus();
    const intervalId = setInterval(loadStatus, 30000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages]);

  async function sendMessage() {
    const prompt = input.trim();
    if (!prompt || isSending) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: buildHistory(nextMessages)
        })
      });

      const rawText = await response.text();
      const chunks = parseJarvisStream(rawText);
      const errorChunk = chunks.find((chunk) => chunk.error);

      if (!response.ok || errorChunk) {
        throw new Error(errorChunk?.error || 'Jarvis no pudo responder ahora mismo.');
      }

      const answer = chunks.map((chunk) => chunk.content || '').join('').trim();
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: answer || 'He recibido la solicitud, pero la respuesta llego vacia.'
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `No he podido contactar con Jarvis. ${error.message}`
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function clearChat() {
    setMessages(initialMessages);
  }

  function renderMessage({ item }) {
    const isUser = item.role === 'user';

    return (
      <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.jarvisBubble]}>
          <Text style={styles.messageName}>{isUser ? 'TU' : 'J.A.R.V.I.S'}</Text>
          <Text style={styles.messageText}>{item.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ASISTENTE PERSONAL</Text>
            <Text style={styles.title}>J.A.R.V.I.S</Text>
          </View>
          <View style={styles.statusPanel}>
            <View style={[styles.statusDot, serverStatus === 'Online' && styles.statusDotOnline]} />
            <Text style={styles.statusText}>{serverStatus}</Text>
            <Text style={styles.modelText}>{serverModel}</Text>
          </View>
        </View>

        <View style={styles.corePanel}>
          <View style={styles.coreRing}>
            <View style={styles.coreInner} />
          </View>
          <View style={styles.coreCopy}>
            <Text style={styles.coreTitle}>Sistema activo</Text>
            <Text style={styles.coreSubtitle}>Conectado al backend de Render</Text>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
        />

        {isSending && (
          <View style={styles.thinkingRow}>
            <ActivityIndicator color="#49d9ff" />
            <Text style={styles.thinkingText}>Jarvis esta pensando...</Text>
          </View>
        )}

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Enviar mensaje a Jarvis..."
            placeholderTextColor="#688093"
            multiline
            maxLength={4000}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!canSend}
            onPress={sendMessage}
            style={({ pressed }) => [
              styles.sendButton,
              !canSend && styles.sendButtonDisabled,
              pressed && canSend && styles.sendButtonPressed
            ]}
          >
            <Text style={styles.sendText}>{isSending ? '...' : 'Enviar'}</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" onPress={clearChat} style={styles.clearButton}>
          <Text style={styles.clearText}>Limpiar conversacion</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#06111f'
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  eyebrow: {
    color: '#6fa6bd',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0
  },
  title: {
    color: '#e8f8ff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 2
  },
  statusPanel: {
    alignItems: 'flex-end',
    borderColor: '#16344a',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  statusDot: {
    backgroundColor: '#8a3441',
    borderRadius: 4,
    height: 8,
    marginBottom: 5,
    width: 8
  },
  statusDotOnline: {
    backgroundColor: '#43f6a0'
  },
  statusText: {
    color: '#e8f8ff',
    fontSize: 13,
    fontWeight: '700'
  },
  modelText: {
    color: '#87a5b6',
    fontSize: 10,
    marginTop: 2
  },
  corePanel: {
    alignItems: 'center',
    backgroundColor: '#0a1a2b',
    borderColor: '#174d63',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 14
  },
  coreRing: {
    alignItems: 'center',
    borderColor: '#49d9ff',
    borderRadius: 34,
    borderWidth: 2,
    height: 68,
    justifyContent: 'center',
    marginRight: 14,
    width: 68
  },
  coreInner: {
    backgroundColor: '#49d9ff',
    borderRadius: 14,
    height: 28,
    shadowColor: '#49d9ff',
    shadowOpacity: 0.8,
    shadowRadius: 12,
    width: 28
  },
  coreCopy: {
    flex: 1
  },
  coreTitle: {
    color: '#e8f8ff',
    fontSize: 18,
    fontWeight: '800'
  },
  coreSubtitle: {
    color: '#8ab1c6',
    fontSize: 13,
    marginTop: 4
  },
  messages: {
    flexGrow: 1,
    gap: 10,
    paddingBottom: 10
  },
  messageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row'
  },
  messageRowUser: {
    justifyContent: 'flex-end'
  },
  messageBubble: {
    borderRadius: 8,
    maxWidth: '86%',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  jarvisBubble: {
    backgroundColor: '#0d2538',
    borderColor: '#1b5d75',
    borderWidth: 1
  },
  userBubble: {
    backgroundColor: '#153d35',
    borderColor: '#2b8a72',
    borderWidth: 1
  },
  messageName: {
    color: '#7adfff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 5
  },
  messageText: {
    color: '#eefbff',
    fontSize: 15,
    lineHeight: 21
  },
  thinkingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  thinkingText: {
    color: '#8ab1c6',
    fontSize: 13
  },
  composer: {
    alignItems: 'flex-end',
    backgroundColor: '#091725',
    borderColor: '#1b4e63',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 8
  },
  input: {
    color: '#eefbff',
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 10
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#49d9ff',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    marginLeft: 8,
    minWidth: 76,
    paddingHorizontal: 14
  },
  sendButtonDisabled: {
    backgroundColor: '#203849'
  },
  sendButtonPressed: {
    opacity: 0.8
  },
  sendText: {
    color: '#03111b',
    fontSize: 14,
    fontWeight: '800'
  },
  clearButton: {
    alignItems: 'center',
    paddingTop: 10
  },
  clearText: {
    color: '#6fa6bd',
    fontSize: 13,
    fontWeight: '700'
  }
});
