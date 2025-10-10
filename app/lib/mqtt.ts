import mqtt from 'mqtt';
import type { MqttClient, IClientOptions } from 'mqtt';

// MQTT Configuration (hardcoded here per request, no .env usage)
const MQTT_BROKER = '164d4421be27493fac52acabe1391e0f.s1.eu.hivemq.cloud';
const MQTT_PORT = 8884;
const MQTT_USERNAME = 'TSADevs';
const MQTT_PASSWORD = 'Tekno2025!';
// Generate unique client ID to prevent conflicts
const MQTT_CLIENT_ID = `web-client-1`;
const MQTT_USE_SSL = true;

// Topic Prefixes
const TOPIC_PREFIX = 'silagung';
const DEVICE_PREFIX = `${TOPIC_PREFIX}/device`;
const CONTROL_PREFIX = `${TOPIC_PREFIX}/control`;
const STATUS_PREFIX = `${TOPIC_PREFIX}/status`;

// MQTT Topics
export const mqttTopics = {
  sensorData: `${DEVICE_PREFIX}/sensor`,
  pumpControl: `${CONTROL_PREFIX}/pump`,
  systemStatus: `${STATUS_PREFIX}/system`,
  warning: `${STATUS_PREFIX}/warning`,
  control: `${TOPIC_PREFIX}/controll`,  // Topic for direct control as requested
  irrigationConfig: `${TOPIC_PREFIX}/irrigation/config`
};

// MQTT Client instance
let client: MqttClient | null = null;
let isConnected = false;
let connectionListeners: Array<(connected: boolean) => void> = [];
let messageHandlers: Map<string, (message: string) => void> = new Map();
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

/**
 * Connect to MQTT broker - Updated based on reference code
 */
export const connectMqtt = (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    try {
      // Construct broker URL - HiveMQ Cloud WebSocket requires "/mqtt" path
      const brokerUrl = `wss://${MQTT_BROKER}:${MQTT_PORT}/mqtt`;
      
      console.log('✅ Connecting to HiveMQ broker:', brokerUrl);
      console.log('Client ID:', MQTT_CLIENT_ID);
      console.log('Username:', MQTT_USERNAME);
      
      const options: IClientOptions = {
        clientId: MQTT_CLIENT_ID,
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,
        keepalive: 30,
        reconnectPeriod: 5000,
        connectTimeout: 10 * 1000,
        clean: true,
        protocol: 'wss',
        protocolVersion: 4,
        will: {
          topic: `${STATUS_PREFIX}/disconnect`,
          payload: JSON.stringify({ clientId: MQTT_CLIENT_ID, timestamp: Date.now() }),
          qos: 1,
          retain: false
        }
      };

      client = mqtt.connect(brokerUrl, options);

      client.on('connect', () => {
        console.log('✅ Connected to HiveMQ broker');
        isConnected = true;
        reconnectAttempts = 0;
        connectionListeners.forEach(listener => listener(true));
        // Removed subscribeToTopics() call
        resolve(true);
      });

      client.on('error', (error) => {
        console.error('❌ MQTT connection error:', error);
        isConnected = false;
        connectionListeners.forEach(listener => listener(false));
        reject(error);
      });

      client.on('close', () => {
        console.log('🔌 MQTT connection closed');
        isConnected = false;
        connectionListeners.forEach(listener => listener(false));
      });

      client.on('reconnect', () => {
        reconnectAttempts++;
        console.log(`🔄 Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
        
        if (reconnectAttempts >= maxReconnectAttempts) {
          console.error('❌ Max reconnection attempts reached');
          client?.end(true); // Force close
          // Reset for future connections
          setTimeout(() => {
            reconnectAttempts = 0;
            console.log('🔄 Resetting reconnection attempts, ready for manual reconnect');
          }, 30000); // Wait 30 seconds before allowing reconnection
        }
      });

      client.on('message', (topic, message) => {
        handleMessage(topic, message);
      });

    } catch (error) {
      console.error('❌ Failed to connect to MQTT broker:', error);
      reject(error);
    }
  });
};

/**
 * Handle incoming messages
 */
const handleMessage = (topic: string, message: Buffer): void => {
  try {
    const messageStr = message.toString();
    let parsedMessage: any;

    try {
      parsedMessage = JSON.parse(messageStr);
    } catch {
      parsedMessage = messageStr;
    }

    console.log(`📨 Received message on ${topic}:`, parsedMessage);

    const handler = messageHandlers.get(topic);
    if (handler) {
      try {
        handler(messageStr);
      } catch (error) {
        console.error(`❌ Error in message handler for ${topic}:`, error);
      }
    }
  } catch (error) {
    console.error(`❌ Error handling message for ${topic}:`, error);
  }
};

/**
 * Subscribe to specific topic with handler
 */
export const subscribe = (topic: string, handler: (message: string) => void): void => {
  messageHandlers.set(topic, handler);
  
  if (client && isConnected) {
    client.subscribe(topic, (error) => {
      if (error) {
        console.error(`❌ Failed to subscribe to ${topic}:`, error);
      } else {
        console.log(`✅ Subscribed to ${topic}`);
      }
    });
  }
};

/**
 * Unsubscribe from topic
 */
export const unsubscribe = (topic: string): void => {
  messageHandlers.delete(topic);
  
  if (client && isConnected) {
    client.unsubscribe(topic, (error) => {
      if (error) {
        console.error(`❌ Failed to unsubscribe from ${topic}:`, error);
      } else {
        console.log(`✅ Unsubscribed from ${topic}`);
      }
    });
  }
};

/**
 * Publish message to topic
 */
export const publish = (topic: string, message: any, retain: boolean = false): boolean => {
  if (!client || !isConnected) {
    console.error('❌ MQTT client not connected');
    return false;
  }

  try {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    client.publish(topic, messageStr, { retain }, (error) => {
      if (error) {
        console.error(`❌ Failed to publish to ${topic}:`, error);
      } else {
        console.log(`✅ Published to ${topic}:`, message);
      }
    });
    return true;
  } catch (error) {
    console.error(`❌ Error publishing to ${topic}:`, error);
    return false;
  }
};

/**
 * Disconnect from MQTT broker
 */
export const disconnectMqtt = (): void => {
  if (client) {
    console.log('🔌 Disconnecting from MQTT broker');
    // Clear all message handlers
    messageHandlers.clear();
    // Force close the connection
    client.end(true);
    client = null;
  }
  isConnected = false;
  reconnectAttempts = 0; // Reset reconnect attempts
  connectionListeners.forEach(listener => listener(false));
};

/**
 * Add connection status listener
 */
export const addConnectionListener = (listener: (connected: boolean) => void): void => {
  connectionListeners.push(listener);
  // Immediately notify with current status
  listener(isConnected);
};

/**
 * Remove connection status listener
 */
export const removeConnectionListener = (listener: (connected: boolean) => void): void => {
  const index = connectionListeners.indexOf(listener);
  if (index !== -1) {
    connectionListeners.splice(index, 1);
  }
};

/**
 * Publish message to topic
 */
export const publishMessage = (topic: string, message: string): void => {
  if (client && isConnected) {
    console.log(`Publishing to ${topic}: ${message}`);
    client.publish(topic, message);
  } else {
    console.warn('MQTT client not connected, cannot publish message');
  }
};

/**
 * Subscribe to topic
 */
export const subscribeTopic = (topic: string, callback: (message: string) => void): void => {
  if (client && isConnected) {
    console.log(`Subscribing to ${topic}`);
    messageHandlers.set(topic, callback);
    client.subscribe(topic, (error) => {
      if (error) {
        console.error(`Error subscribing to ${topic}:`, error);
      } else {
        console.log(`Successfully subscribed to ${topic}`);
      }
    });
  } else {
    console.warn('MQTT client not connected, cannot subscribe to topic');
  }
};

/**
 * Unsubscribe from topic
 */
export const unsubscribeTopic = (topic: string): void => {
  if (client && isConnected) {
    console.log(`Unsubscribing from ${topic}`);
    messageHandlers.delete(topic);
    client.unsubscribe(topic);
  } else {
    console.warn('MQTT client not connected, cannot unsubscribe from topic');
  }
};

/**
 * Interface for irrigation configuration data
 */
export interface IrrigationConfig {
  landName: string;
  phaseName: string;
  waterRequirement: number; // L/hari (total kebutuhan harian)
  waterPerSchedule: number; // L/jadwal (kebutuhan per jadwal penyiraman)
  targetEC: number; // mS/cm
  irrigationType: 'air' | 'air_nutrisi';
  schedules: Array<{
    time: string; // HH:MM format
    isActive: boolean;
  }>;
}

/**
 * Send irrigation configuration to ESP32
 */
export const sendIrrigationConfig = (config: IrrigationConfig): boolean => {
  const topic = mqttTopics.irrigationConfig;
  const message = JSON.stringify(config);
  
  console.log('Sending irrigation config to ESP32:', config);
  
  return publish(topic, message, true); // retain = true untuk menyimpan konfigurasi terakhir
};

// Export other constants
export {
  MQTT_BROKER,
  MQTT_PORT,
  MQTT_USERNAME,
  MQTT_PASSWORD,
  MQTT_CLIENT_ID,
  MQTT_USE_SSL,
  TOPIC_PREFIX,
  DEVICE_PREFIX,
  CONTROL_PREFIX,
  STATUS_PREFIX
};