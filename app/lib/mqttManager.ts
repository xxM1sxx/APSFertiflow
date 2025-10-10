import { connectMqtt, disconnectMqtt, addConnectionListener, removeConnectionListener } from './mqtt';

class MqttManager {
  private static instance: MqttManager;
  private isConnecting = false;
  private connectionPromise: Promise<boolean> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): MqttManager {
    if (!MqttManager.instance) {
      MqttManager.instance = new MqttManager();
    }
    return MqttManager.instance;
  }

  async connect(): Promise<boolean> {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting && this.connectionPromise) {
      console.log('🔄 Connection already in progress, waiting...');
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = this.attemptConnection();
    
    try {
      const result = await this.connectionPromise;
      return result;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  private async attemptConnection(): Promise<boolean> {
    try {
      console.log('🔌 Attempting MQTT connection...');
      const connected = await connectMqtt();
      
      if (connected) {
        console.log('✅ MQTT connection successful');
        this.clearReconnectTimer();
      }
      
      return connected;
    } catch (error) {
      console.error('❌ MQTT connection failed:', error);
      this.scheduleReconnect();
      return false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    console.log('⏰ Scheduling reconnection in 10 seconds...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 10000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  disconnect(): void {
    this.clearReconnectTimer();
    disconnectMqtt();
    this.isConnecting = false;
    this.connectionPromise = null;
  }

  onConnectionChange(callback: (connected: boolean) => void): () => void {
    addConnectionListener(callback);
    return () => removeConnectionListener(callback);
  }
}

export default MqttManager;