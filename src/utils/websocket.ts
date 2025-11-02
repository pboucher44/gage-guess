export class GameWebSocket {
  private socket: WebSocket | null = null;
  private messageQueue: any[] = [];
  private manuallyClosed = false;

  constructor(
    private onMessage: (data: any) => void,
    private onError?: (error: any) => void
  ) {}

  connect() {
    const wsUrl = 'wss://xbvcyrcrgoqyhbryqdrd.supabase.co/functions/v1/game-socket';

    this.manuallyClosed = false;
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.flushQueue();
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (this.onError) {
        this.onError(error);
      }
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
      if (!this.manuallyClosed && this.onError) {
        this.onError(new Error('WebSocket connection closed'));
      }
    };
  }

  send(data: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not ready, queuing message');
      this.messageQueue.push(data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.manuallyClosed = true;
      this.socket.close();
      this.socket = null;
    }
    this.messageQueue = [];
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  private flushQueue() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (this.messageQueue.length > 0) {
      const queued = this.messageQueue.shift();
      this.socket.send(JSON.stringify(queued));
    }
  }
}
