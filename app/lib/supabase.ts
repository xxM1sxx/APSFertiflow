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