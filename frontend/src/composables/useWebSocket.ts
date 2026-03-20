import { onBeforeUnmount, ref } from "vue";

export function useWebSocket(urlFactory: () => string) {
  const socket = ref<WebSocket | null>(null);
  const isConnected = ref(false);
  const lines = ref<string[]>([]);

  function connect() {
    if (socket.value) {
      socket.value.close();
    }

    const ws = new WebSocket(urlFactory());
    socket.value = ws;

    ws.onopen = () => {
      isConnected.value = true;
    };

    ws.onmessage = (event) => {
      lines.value.push(String(event.data));
      if (lines.value.length > 600) {
        lines.value.splice(0, lines.value.length - 600);
      }
    };

    ws.onclose = () => {
      isConnected.value = false;
      socket.value = null;
    };

    ws.onerror = () => {
      isConnected.value = false;
    };
  }

  function disconnect() {
    socket.value?.close();
    socket.value = null;
    isConnected.value = false;
  }

  function clear() {
    lines.value = [];
  }

  onBeforeUnmount(disconnect);

  return {
    isConnected,
    lines,
    connect,
    disconnect,
    clear,
  };
}
