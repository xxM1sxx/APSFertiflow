import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function signUp(email: string, password: string, metadata?: { name?: string; phone?: string }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    phone: metadata?.phone, // Set phone directly for auth.users.phone field
    options: {
      data: {
        full_name: metadata?.name,
        phone: metadata?.phone, // Also store in metadata for consistency
      }
    }
  });
  return { data, error };
}

/**
 * Get latest sensor reading from database
 */
export async function getLatestSensorReading() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { data: null, error: new Error('User not authenticated') };
  }

  const { data, error } = await supabase
    .from('sensor_readings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return { data, error };
}

/**
 * Save sensor data to database
 */
export async function saveSensorReading(sensorData: {
  water_flow: number;
  pressure: number;
  ec: number;
  ultrasonic1: number;
  ultrasonic2: number;
  device_id?: string;
}) {
  const { data: session } = await getSession();
  const userId = session?.session?.user?.id;
  
  const { data, error } = await supabase
    .from('sensor_readings')
    .insert([{
      user_id: userId,
      water_flow: sensorData.water_flow,
      pressure: sensorData.pressure,
      ec: sensorData.ec,
      ultrasonic1: sensorData.ultrasonic1,
      ultrasonic2: sensorData.ultrasonic2,
      mqtt_client_id: sensorData.device_id || 'esp32-default',
      created_at: new Date().toISOString()
    }]);
  
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  return { data, error };
}

export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });
  return { data, error };
}

export async function updateUserProfile(updates: { full_name?: string; phone?: string }) {
  const { data, error } = await supabase.auth.updateUser({
    data: updates
  });
  return { data, error };
}

// Planting Phases CRUD Functions
export interface PlantingPhase {
  id?: string;
  nama_fase_tanam: string;
  kebutuhan_air?: number | null;
  target_ec?: number | null;
  jenis_irigasi: 'air' | 'air_nutrisi';
  created_at?: string;
  updated_at?: string;
}

export async function getPlantingPhases() {
  const { data, error } = await supabase
    .from('planting_phases')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function createPlantingPhase(phase: Omit<PlantingPhase, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('planting_phases')
    .insert([phase])
    .select()
    .single();
  return { data, error };
}

export async function updatePlantingPhase(id: string, updates: Partial<Omit<PlantingPhase, 'id' | 'created_at' | 'updated_at'>>) {
  const { data, error } = await supabase
    .from('planting_phases')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function deletePlantingPhase(id: string) {
  const { data, error } = await supabase
    .from('planting_phases')
    .delete()
    .eq('id', id);
  return { data, error };
}

// Fertigation Lands Types and Functions
export interface FertigationLand {
  id: string;
  name: string;
  current_phase_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IrrigationSchedule {
  id: string;
  land_id?: string;
  phase_id?: string;
  time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Fertigation Lands CRUD
export async function getFertigationLands() {
  const { data, error } = await supabase
    .from('fertigation_lands')
    .select(`
      *,
      planting_phases (
        id,
        nama_fase_tanam,
        kebutuhan_air,
        target_ec
      )
    `)
    .order('name');
  return { data, error };
}

export async function updateFertigationLand(id: string, updates: Partial<FertigationLand>) {
  const { data, error } = await supabase
    .from('fertigation_lands')
    .update(updates)
    .eq('id', id)
    .select();
  return { data, error };
}

// Irrigation Schedules CRUD
export async function getIrrigationSchedules(landId?: string, phaseId?: string) {
  let query = supabase
    .from('irrigation_schedules')
    .select('*');
  
  if (landId) {
    query = query.eq('land_id', landId);
  }
  
  if (phaseId) {
    query = query.eq('phase_id', phaseId);
  }
  
  const { data, error } = await query.order('time');
  return { data, error };
}

export async function getIrrigationSchedulesByPhase(phaseId: string) {
  const { data, error } = await supabase
    .from('irrigation_schedules')
    .select('*')
    .eq('phase_id', phaseId)
    .order('time');
  return { data, error };
}

export async function createIrrigationSchedule(schedule: Omit<IrrigationSchedule, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('irrigation_schedules')
    .insert(schedule)
    .select();
  return { data, error };
}

export async function updateIrrigationSchedule(id: string, updates: Partial<IrrigationSchedule>) {
  const { data, error } = await supabase
    .from('irrigation_schedules')
    .update(updates)
    .eq('id', id)
    .select();
  return { data, error };
}

export async function deleteIrrigationSchedule(id: string) {
  const { data, error } = await supabase
    .from('irrigation_schedules')
    .delete()
    .eq('id', id);
  return { data, error };
}

// User MQTT ID Types and Functions
export interface UserMqttId {
  id: string;
  user_id: string;
  mqtt_id: string;
  created_at: string;
  updated_at: string;
}

// Get or create MQTT ID for current user
export async function getUserMqttId(): Promise<{ data: string | null; error: any }> {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { data: null, error: userError || new Error('User not authenticated') };
    }

    // Check if user already has an MQTT ID
    const { data: existingMqttId, error: fetchError } = await supabase
      .from('user_mqtt_ids')
      .select('mqtt_id')
      .eq('user_id', user.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      return { data: null, error: fetchError };
    }

    // If MQTT ID exists, return it
    if (existingMqttId) {
      return { data: existingMqttId.mqtt_id, error: null };
    }

    // Generate new MQTT ID using database function
    const { data: newMqttId, error: generateError } = await supabase
      .rpc('generate_unique_mqtt_id');

    if (generateError) {
      return { data: null, error: generateError };
    }

    // Insert new MQTT ID for user
    const { data: insertedData, error: insertError } = await supabase
      .from('user_mqtt_ids')
      .insert({
        user_id: user.id,
        mqtt_id: newMqttId
      })
      .select('mqtt_id')
      .single();

    if (insertError) {
      return { data: null, error: insertError };
    }

    return { data: insertedData.mqtt_id, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

// Get MQTT ID for a specific user (admin function)
export async function getMqttIdForUser(userId: string): Promise<{ data: string | null; error: any }> {
  const { data, error } = await supabase
    .from('user_mqtt_ids')
    .select('mqtt_id')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return { data: null, error };
  }

  return { data: data?.mqtt_id || null, error: null };
}

// Regenerate MQTT ID for current user
export async function regenerateUserMqttId(): Promise<{ data: string | null; error: any }> {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { data: null, error: userError || new Error('User not authenticated') };
    }

    // Generate new MQTT ID
    const { data: newMqttId, error: generateError } = await supabase
      .rpc('generate_unique_mqtt_id');

    if (generateError) {
      return { data: null, error: generateError };
    }

    // Update or insert MQTT ID
    const { data: upsertedData, error: upsertError } = await supabase
      .from('user_mqtt_ids')
      .upsert({
        user_id: user.id,
        mqtt_id: newMqttId,
        updated_at: new Date().toISOString()
      })
      .select('mqtt_id')
      .single();

    if (upsertError) {
      return { data: null, error: upsertError };
    }

    return { data: upsertedData.mqtt_id, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

// Relay Status Interface and Functions
export interface RelayStatus {
  id?: string;
  user_id?: string;
  relay1: boolean;
  relay2: boolean;
  relay3: boolean;
  relay4: boolean;
  relay5: boolean;
  relay6: boolean;
  pump: boolean;
  updated_at?: string;
  created_at?: string;
}

export async function getRelayStatus() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { data: null, error: new Error('User not authenticated') };
  }

  const { data, error } = await supabase
    .from('valve_status')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1);
  
  // Return the first record if exists, otherwise return null
  return { 
    data: data && data.length > 0 ? data[0] : null, 
    error 
  };
}

export async function upsertRelayStatus(relayStatus: Omit<RelayStatus, 'id' | 'user_id' | 'created_at' | 'updated_at'>) {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { data: null, error: new Error('User not authenticated') };
  }

  const { data, error } = await supabase
    .from('valve_status')
    .upsert({
      user_id: user.id,
      ...relayStatus,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  
  return { data, error };
}

export async function createRelayStatus(relayStatus: Omit<RelayStatus, 'id' | 'user_id' | 'created_at' | 'updated_at'>) {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { data: null, error: new Error('User not authenticated') };
  }

  const { data, error } = await supabase
    .from('relay_status')
    .insert([{
      user_id: user.id,
      ...relayStatus
    }])
    .select()
    .single();
  
  return { data, error };
}