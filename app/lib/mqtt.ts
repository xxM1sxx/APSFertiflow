import mqtt from 'mqtt';
import type { MqttClient, IClientOptions } from 'mqtt';
import { getUserMqttId, getSession } from './supabase';

// MQTT Configuration (hardcoded here per request, no .env usage)
const MQTT_BROKER = '72350f0b16bb43f2af1b3b453ac66c34.s1.eu.hivemq.cloud';
const MQTT_PORT = 8884;
const MQTT_USERNAME = 'TSADevs';
const MQTT_PASSWORD = 'Tekno2025!';
const MQTT_USE_SSL = true;

// Dynamic MQTT Client ID - will be set per user
let MQTT_CLIENT_ID = 'web-client-default';

// Topic Prefixes - Clean and organized structure
const TOPIC_PREFIX = 'silagung';

// MQTT Topics - No conflicts, single source of truth
export const mqttTopics = {
  // Sensor data topics
  sensor: `${TOPIC_PREFIX}/sensor`,      // ESP32 publishes sensor data here
  
  // Control topics  
  control: `${TOPIC_PREFIX}/control`,     // Web sends control commands here
  
  // System status topics
  system: `${TOPIC_PREFIX}/system`,       // ESP32 publishes system status here
  
  // Configuration topics
  config: `${TOPIC_PREFIX}/config`,       // Configuration messages
  irrigationConfig: `${TOPIC_PREFIX}/irrigation/config`, // Irrigation config
  
  // Legacy topics (for backward compatibility)
  legacy: {
    sensorData: `${TOPIC_PREFIX}/device/sensor`,
    pumpControl: `${TOPIC_PREFIX}/control/pump`,
    systemStatus: `${TOPIC_PREFIX}/status/system`,
    warning: `${TOPIC_PREFIX}/status/warning`
  }
};

// MQTT Client instance
let client: MqttClient | null = null;
let isConnected = false;
let connectionListeners: Array<(connected: boolean) => void> = [];
let messageHandlers: Map<string, (message: string) => void> = new Map();
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let pingInterval: NodeJS.Timeout | null = null;
let lastMessageTime = Date.now();
let isManualDisconnect = false;

/**
 * Initialize MQTT Client ID for current user - Use Supabase user ID
 */
const initializeMqttClientId = async (): Promise<string> => {
  try {
    // Get user session from Supabase
    const { data: session, error: sessionError } = await getSession();
    
    if (sessionError || !session?.session?.user) {
      console.error('❌ User not authenticated, cannot set MQTT Client ID');
      return 'web-client-unauthenticated';
    }
    
    // Use Supabase user ID as MQTT Client ID
    const userId = session.session.user.id;
    MQTT_CLIENT_ID = `web-client-${userId}`;
    console.log('✅ MQTT Client ID set from Supabase user:', MQTT_CLIENT_ID);
    return userId;
    
  } catch (error) {
    console.error('❌ Error initializing MQTT Client ID:', error);
    MQTT_CLIENT_ID = `web-client-error-${Date.now()}`;
    return MQTT_CLIENT_ID;
  }
};

/**
 * Connect to MQTT broker - Updated to use user-specific client ID
 */
export const connectMqtt = async (): Promise<boolean> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Initialize user-specific MQTT Client ID
      MQTT_CLIENT_ID = await initializeMqttClientId();
      
      // Construct broker URL - HiveMQ Cloud WebSocket requires "/mqtt" path
      const brokerUrl = `wss://${MQTT_BROKER}:${MQTT_PORT}/mqtt`;
      
      console.log('✅ Connecting to HiveMQ broker:', brokerUrl);
      console.log('Client ID:', MQTT_CLIENT_ID);
      console.log('Username:', MQTT_USERNAME);
      
      const options: IClientOptions = {
        clientId: MQTT_CLIENT_ID,
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,
        keepalive: 60, // 60 seconds
        reconnectPeriod: 0, // Disable auto-reconnect, we'll handle it manually
        connectTimeout: 30 * 1000, // 30 seconds
        clean: false, // Set to false to maintain session state
        protocol: 'wss',
        protocolVersion: 4,
        will: {
          topic: `${mqttTopics.legacy.warning}`,
          payload: JSON.stringify({ clientId: MQTT_CLIENT_ID, timestamp: Date.now(), status: 'disconnected' }),
          qos: 1,
          retain: false
        },
        // Additional stability options
        resubscribe: false, // We'll handle resubscription manually
        queueQoSZero: false // Don't queue QoS 0 messages
      };

      client = mqtt.connect(brokerUrl, options);

      client.on('connect', () => {
        console.log('✅ Connected to HiveMQ broker with Client ID:', MQTT_CLIENT_ID);
        isConnected = true;
        reconnectAttempts = 0;
        lastMessageTime = Date.now();
        connectionListeners.forEach(listener => listener(true));
        
        // Start ping interval to keep connection alive
        if (pingInterval) {
          clearInterval(pingInterval);
        }
        pingInterval = setInterval(() => {
          if (client && isConnected) {
            // Send a ping by publishing to a heartbeat topic
            publish(`${mqttTopics.control}/heartbeat`, JSON.stringify({ 
              clientId: MQTT_CLIENT_ID, 
              timestamp: Date.now(),
              lastMessage: Date.now() - lastMessageTime 
            }), false, 0);
          }
        }, 30000); // Ping every 30 seconds
        
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
        // Clear ping interval
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        connectionListeners.forEach(listener => listener(false));
        
        // Only trigger reconnect if it's not manual disconnect
        if (!isManualDisconnect) {
          console.log('🔌 Unexpected disconnect, will trigger reconnect...');
          // Notify manager to reconnect (with delay)
          setTimeout(() => {
            connectionListeners.forEach(listener => listener(false)); // Trigger reconnect
          }, 1000); // 1 second delay before notifying manager
        } else {
          console.log('🔌 Manual disconnect detected, no auto-reconnect');
        }
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

    // Update last message time
    lastMessageTime = Date.now();

    console.log(`📨 Received message on ${topic}:`, parsedMessage);
    
    // Special logging for relay status messages
    if (topic === 'silagung/system') {
      console.log('🔄 Processing relay status message from ESP32:', parsedMessage);
    }

    const handler = messageHandlers.get(topic);
    if (handler) {
      console.log(`🎯 Found handler for topic ${topic}, calling handler...`);
      try {
        handler(messageStr);
        console.log(`✅ Handler for ${topic} executed successfully`);
      } catch (error) {
        console.error(`❌ Error in message handler for ${topic}:`, error);
      }
    } else {
      console.log(`⚠️ No handler found for topic ${topic}`);
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
    console.log('🔌 Manual disconnect - cleaning up MQTT connection');
    isManualDisconnect = true; // Mark as manual disconnect
    // Clear ping interval
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    // Clear all message handlers
    messageHandlers.clear();
    // Force close the connection
    client.end(true);
    client = null;
  }
  isConnected = false;
  reconnectAttempts = 0; // Reset reconnect attempts
  connectionListeners.forEach(listener => listener(false));
  // Reset manual disconnect flag after cleanup
  setTimeout(() => {
    isManualDisconnect = false;
  }, 100);
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
  configId: number; // Unique identifier for each configuration
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
 * Interface for multiple irrigation configurations in one payload
 */
export interface MultipleIrrigationConfig {
  configs: IrrigationConfig[];
  timestamp: number;
  totalConfigs: number;
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

/**
 * Send multiple irrigation configurations to ESP32 in one JSON payload
 */
export const sendMultipleIrrigationConfigs = (configs: IrrigationConfig[]): boolean => {
  const topic = mqttTopics.irrigationConfig;
  const payload: MultipleIrrigationConfig = {
    configs: configs,
    timestamp: Date.now(),
    totalConfigs: configs.length
  };
  const message = JSON.stringify(payload);
  
  console.log('Sending multiple irrigation configs to ESP32:', payload);
  console.log(`Total configs in batch: ${configs.length}`);
  
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
  CONTROL_PREFIX
};