import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { getSession, signOut, supabase, updatePassword, updateUserProfile, getPlantingPhases, createPlantingPhase, updatePlantingPhase, deletePlantingPhase, getFertigationLands, updateFertigationLand, getIrrigationSchedules, createIrrigationSchedule, updateIrrigationSchedule, deleteIrrigationSchedule, getIrrigationSchedulesByPhase } from '../lib/supabase';
import type { PlantingPhase, FertigationLand, IrrigationSchedule } from '../lib/supabase';
import { subscribeTopic, unsubscribeTopic, publish, mqttTopics, sendIrrigationConfig, sendMultipleIrrigationConfigs, type IrrigationConfig } from '../lib/mqtt';
import MqttManager from '../lib/mqttManager';
import '../styles/auth.scss';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [user, setUser] = useState<any>(null);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [mqttStatus, setMqttStatus] = useState('Belum terhubung');
  const [userProfile, setUserProfile] = useState({
    full_name: '',
    phone: '',
    email: ''
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [updateMessage, setUpdateMessage] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const navigate = useNavigate();

  // Relay states for controlling valves and pump
  const [relayStates, setRelayStates] = useState({
    valve1: false,
    valve2: false,
    valve3: false,
    valve4: false,
    valve5: false,
    pump: false
  });

  // VFD frequency state for pump control
  const [pumpFrequency, setPumpFrequency] = useState(50); // Default 50 Hz
  
  // Sensor data state
  const [sensorData, setSensorData] = useState({
    waterFlow: 0,      // L/min
    pressure: 0,       // Bar
    ec: 0,             // μs/cm
    ph: 0,             // pH
    nitrogen: 0,       // mg/kg
    phosphorus: 0,     // mg/kg
    potassium: 0,      // mg/kg
    temperature: 0     // °C
  });

  // Planting phases states
  const [plantingPhases, setPlantingPhases] = useState<PlantingPhase[]>([]);
  const [phaseForm, setPhaseForm] = useState({
    nama_fase_tanam: '',
    kebutuhan_air: '',
    target_ec: '',
    jenis_irigasi: 'air_nutrisi' as 'air' | 'air_nutrisi'
  });
  const [editingPhase, setEditingPhase] = useState<PlantingPhase | null>(null);
  const [isPhaseLoading, setIsPhaseLoading] = useState(false);
  const [phaseMessage, setPhaseMessage] = useState('');

  // Fertigation management states
  const [fertigationLands, setFertigationLands] = useState<FertigationLand[]>([]);
  const [irrigationSchedules, setIrrigationSchedules] = useState<IrrigationSchedule[]>([]);
  const [fertigationLoading, setFertigationLoading] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ time: '08:00' });

  // Phase irrigation schedule states
  const [phaseIrrigationSchedules, setPhaseIrrigationSchedules] = useState<IrrigationSchedule[]>([]);
  const [selectedPhaseForSchedule, setSelectedPhaseForSchedule] = useState<string | null>(null);
  const [phaseScheduleForm, setPhaseScheduleForm] = useState({ time: '08:00' });
  const [isPhaseScheduleLoading, setIsPhaseScheduleLoading] = useState(false);

  // Fertigation management phase schedules
  const [fertigationPhaseSchedules, setFertigationPhaseSchedules] = useState<{[phaseId: string]: IrrigationSchedule[]}>({});

  // Map UI controls to relay numbers
  const relayMapping = {
    valve1: 1, // Nutrisi
    valve2: 2, // Air
    valve3: 3, // Lahan 1
    valve4: 4, // Lahan 2
    valve5: 5, // Lahan 3
    pump: 6    // Pompa
  };

  const toggleRelay = (relayName: keyof typeof relayStates) => {
    // Update local state
    const newState = !relayStates[relayName];
    setRelayStates(prev => ({
      ...prev,
      [relayName]: newState
    }));
    
    // Publish to MQTT
    const relayNumber = relayMapping[relayName];
    const message = { [`relay${relayNumber}`]: newState ? "on" : "off" };
    
    console.log(`Publishing control message for ${relayName}:`, message);
    publish(mqttTopics.control, message);
  };

  // Handler untuk menerima data sensor dari MQTT
  const handleSensorData = (message: string) => {
    try {
      // Clean up the message before parsing
      // Remove any extra spaces, newlines, or special characters that might cause parsing issues
      let cleanMessage = message.trim();
      
      // Try to handle the case where the message might be a string representation of an object
      if (cleanMessage.startsWith("{ ") && cleanMessage.endsWith(" }")) {
        // Convert the string representation to a proper JSON string
        cleanMessage = cleanMessage.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
        // Replace single quotes with double quotes for JSON compatibility
        cleanMessage = cleanMessage.replace(/'/g, '"');
      }
      
      const data = JSON.parse(cleanMessage);
      console.log('Received sensor data:', data);
      
      // Update sensor data state dengan data yang diterima
      setSensorData({
        waterFlow: data.waterFlow || data.water_flow || 0,
        pressure: data.pressure || 0,
        ec: data.ec || data.conductivity || 0,
        ph: data.ph || 0,
        nitrogen: data.nitrogen || data.n || 0,
        phosphorus: data.phosphorus || data.p || 0,
        potassium: data.potassium || data.k || 0,
        temperature: data.temperature || data.temp || 0
      });
    } catch (error) {
      console.error('Error parsing sensor data:', error);
      // Log the problematic message for debugging
      console.log('Problematic message:', message);
    }
  };

  useEffect(() => {
    const mqttManager = MqttManager.getInstance();
    let connectionCleanup: (() => void) | null = null;

    const checkSession = async () => {
      try {
        const { data: session } = await getSession();
        if (!session.session) {
          navigate('/login');
        } else {
          setUser(session.session.user);
          setUserProfile({
            full_name: session.session.user.user_metadata?.full_name || '',
            phone: session.session.user.user_metadata?.phone || '',
            email: session.session.user.email || ''
          });
          // Load planting phases data
          loadPlantingPhases();
          // Load fertigation data
          loadFertigationData();
          
          // Setup MQTT connection with manager
          setMqttStatus('Menghubungkan...');
          
          // Listen to connection status changes
          connectionCleanup = mqttManager.onConnectionChange((connected) => {
            setMqttConnected(connected);
            if (connected) {
              setMqttStatus('Terhubung ke MQTT broker');
              // Subscribe ke topik sensor
              subscribeTopic('silagung/sensor', handleSensorData);
            } else {
              setMqttStatus('Koneksi MQTT terputus');
            }
          });

          // Attempt connection
          mqttManager.connect().catch((mqttError) => {
            console.error('MQTT connection error:', mqttError);
            setMqttStatus(`Gagal terhubung ke MQTT broker: ${mqttError?.message || 'Unknown error'}`);
          });
        }
      } catch (error) {
        console.error('Session check error:', error);
        navigate('/login');
      } finally {
        // Pastikan loading selalu di-set ke false
        setLoading(false);
      }
    };
    checkSession();
    
    // Cleanup: Putuskan koneksi MQTT saat komponen unmount
    return () => {
      unsubscribeTopic('silagung/sensor');
      if (connectionCleanup) {
        connectionCleanup();
      }
      mqttManager.disconnect();
    };
  }, [navigate]);



  const handleSignOut = async () => {
    setLogoutLoading(true);
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    setIsUpdating(true);
    setUpdateMessage('');
    
    try {
      const { error } = await updateUserProfile({
        full_name: userProfile.full_name,
        phone: userProfile.phone
      });
      
      if (error) {
        setUpdateMessage(`Error: ${error.message}`);
      } else {
        setUpdateMessage('Profil berhasil diperbarui!');
      }
    } catch (error) {
      setUpdateMessage('Terjadi kesalahan saat memperbarui profil');
    } finally {
      setIsUpdating(false);
    }
  };

  // Planting phases CRUD functions
  const loadPlantingPhases = async () => {
    try {
      const { data, error } = await getPlantingPhases();
      if (error) {
        setPhaseMessage(`Error: ${error.message}`);
      } else {
        setPlantingPhases(data || []);
      }
    } catch (error) {
      setPhaseMessage('Terjadi kesalahan saat memuat data fase tanam');
    }
  };

  const handlePhaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPhaseLoading(true);
    setPhaseMessage('');

    try {
      const phaseData: any = {
        nama_fase_tanam: phaseForm.nama_fase_tanam,
        jenis_irigasi: phaseForm.jenis_irigasi
      };

      // Only include kebutuhan_air if irrigation type requires water
      if (phaseForm.jenis_irigasi === 'air' || phaseForm.jenis_irigasi === 'air_nutrisi') {
        phaseData.kebutuhan_air = parseFloat(phaseForm.kebutuhan_air);
      }

      // Only include target_ec if irrigation type requires nutrients
      if (phaseForm.jenis_irigasi === 'air_nutrisi') {
        phaseData.target_ec = parseFloat(phaseForm.target_ec);
      }

      if (editingPhase) {
        const { error } = await updatePlantingPhase(editingPhase.id!, phaseData);
        if (error) {
          setPhaseMessage(`Error: ${error.message}`);
        } else {
          setPhaseMessage('Fase tanam berhasil diperbarui!');
          setEditingPhase(null);
        }
      } else {
        const { error } = await createPlantingPhase(phaseData);
        if (error) {
          setPhaseMessage(`Error: ${error.message}`);
        } else {
          setPhaseMessage('Fase tanam berhasil ditambahkan!');
        }
      }

      setPhaseForm({ nama_fase_tanam: '', kebutuhan_air: '', target_ec: '', jenis_irigasi: 'air_nutrisi' });
      loadPlantingPhases();
    } catch (error) {
      setPhaseMessage('Terjadi kesalahan saat menyimpan data');
    } finally {
      setIsPhaseLoading(false);
    }
  };

  const handleEditPhase = (phase: PlantingPhase) => {
    setEditingPhase(phase);
    setPhaseForm({
      nama_fase_tanam: phase.nama_fase_tanam,
      kebutuhan_air: phase.kebutuhan_air?.toString() || '',
      target_ec: phase.target_ec?.toString() || '',
      jenis_irigasi: phase.jenis_irigasi || 'air_nutrisi'
    });
  };

  const handleDeletePhase = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus fase tanam ini?\n\nCatatan: Jika fase ini sedang digunakan oleh lahan fertigasi, maka lahan tersebut akan otomatis diatur ke "Tidak ada fase" dan Anda dapat memilih fase lain nanti.')) {
      try {
        const { error } = await deletePlantingPhase(id);
        if (error) {
          setPhaseMessage(`Error: ${error.message}`);
        } else {
          setPhaseMessage('Fase tanam berhasil dihapus! Lahan yang menggunakan fase ini telah diatur ulang.');
          loadPlantingPhases();
          // Reload fertigation data to reflect changes
          loadFertigationData();
        }
      } catch (error) {
        setPhaseMessage('Terjadi kesalahan saat menghapus data');
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingPhase(null);
    setPhaseForm({ nama_fase_tanam: '', kebutuhan_air: '', target_ec: '', jenis_irigasi: 'air_nutrisi' });
  };

  // Fertigation management functions
  const loadFertigationData = async () => {
    setFertigationLoading(true);
    try {
      const { data: landsData, error: landsError } = await getFertigationLands();
      if (landsError) {
        console.error('Error loading fertigation lands:', landsError);
        return;
      }
      
      setFertigationLands(landsData || []);
      
      // Load all irrigation schedules
      const allSchedules: IrrigationSchedule[] = [];
      for (const land of landsData || []) {
        const { data: schedules, error: schedulesError } = await getIrrigationSchedules(land.id);
        if (!schedulesError && schedules) {
          allSchedules.push(...schedules);
        }
      }
      setIrrigationSchedules(allSchedules);

      // Load phase-based irrigation schedules for fertigation management display
      const phaseSchedulesMap: {[phaseId: string]: IrrigationSchedule[]} = {};
      const uniquePhaseIds = [...new Set(landsData?.map(land => land.current_phase_id).filter(Boolean) || [])];
      
      for (const phaseId of uniquePhaseIds) {
        const { data: phaseSchedules, error: phaseSchedulesError } = await getIrrigationSchedulesByPhase(phaseId);
        if (!phaseSchedulesError && phaseSchedules) {
          phaseSchedulesMap[phaseId] = phaseSchedules;
        }
      }
      setFertigationPhaseSchedules(phaseSchedulesMap);
    } catch (error) {
      console.error('Error loading fertigation data:', error);
    } finally {
      setFertigationLoading(false);
    }
  };

  const updateLandPhase = async (landId: string, phaseId: string) => {
    try {
      const { error } = await updateFertigationLand(landId, { current_phase_id: phaseId });
      if (error) {
        console.error('Error updating land phase:', error);
        return;
      }
      // Reload data to get updated phase info
      await loadFertigationData();
      
      // Send all lands configuration to ESP32 via MQTT in one batch
      await sendAllLandsConfigToESP32();
    } catch (error) {
      console.error('Error updating land phase:', error);
    }
  };

  // Function to send irrigation configuration to ESP32
  const sendIrrigationConfigToESP32 = async (landId: string, phaseId: string) => {
    try {
      // Find the land and phase data
      const land = fertigationLands.find(l => l.id === landId);
      const phase = plantingPhases.find(p => p.id === phaseId);
      
      if (!land || !phase) {
        console.error('Land or phase not found for MQTT config');
        return;
      }

      // Get irrigation schedules for this phase
      const { data: schedules, error: schedulesError } = await getIrrigationSchedulesByPhase(phaseId);
      if (schedulesError) {
        console.error('Error getting irrigation schedules:', schedulesError);
        return;
      }

      // Calculate water per schedule based on active schedules
      const activeSchedules = (schedules || []).filter(schedule => schedule.is_active);
      const activeScheduleCount = activeSchedules.length;
      const waterPerSchedule = activeScheduleCount > 0 ? 
        Math.round((phase.kebutuhan_air || 0) / activeScheduleCount * 100) / 100 : // Round to 2 decimal places
        0;

      // Generate configId based on land name
      let configId = 1; // Default configId
      if (land.name.toLowerCase().includes('lahan 1')) {
        configId = 1;
      } else if (land.name.toLowerCase().includes('lahan 2')) {
        configId = 2;
      } else if (land.name.toLowerCase().includes('lahan 3')) {
        configId = 3;
      } else {
        // If land name doesn't match pattern, use a hash-based approach or sequential ID
        // For now, we'll use the first character of landId as a simple approach
        const landIndex = fertigationLands.findIndex(l => l.id === landId);
        configId = landIndex >= 0 ? landIndex + 1 : 1;
      }

      // Prepare irrigation configuration data
      const irrigationConfig: IrrigationConfig = {
        configId: configId,
        landName: land.name,
        phaseName: phase.nama_fase_tanam,
        waterRequirement: phase.kebutuhan_air || 0,
        waterPerSchedule: waterPerSchedule,
        targetEC: phase.target_ec || 0,
        irrigationType: phase.jenis_irigasi,
        schedules: (schedules || []).map(schedule => ({
          time: schedule.time,
          isActive: schedule.is_active
        }))
      };

      // Send to ESP32 via MQTT
      const success = sendIrrigationConfig(irrigationConfig);
      
      if (success) {
        console.log(`Irrigation configuration sent to ESP32 successfully for ${land.name} (Config ID: ${configId})`);
      } else {
        console.error('Failed to send irrigation configuration to ESP32');
      }
    } catch (error) {
      console.error('Error sending irrigation config to ESP32:', error);
    }
  };

  // Function to send all lands configuration to ESP32 in one batch payload
  const sendAllLandsConfigToESP32 = async () => {
    try {
      const allConfigs: IrrigationConfig[] = [];

      for (const land of fertigationLands) {
        if (land.current_phase_id) {
          const phase = plantingPhases.find(p => p.id === land.current_phase_id);
          if (!phase) {
            console.warn(`Phase not found for land ${land.name}`);
            continue;
          }

          // Get irrigation schedules for this phase
          const { data: schedules, error: schedulesError } = await getIrrigationSchedulesByPhase(land.current_phase_id);
          if (schedulesError) {
            console.error(`Error getting irrigation schedules for ${land.name}:`, schedulesError);
            continue;
          }

          // Calculate water per schedule based on active schedules
          const activeSchedules = (schedules || []).filter(schedule => schedule.is_active);
          const activeScheduleCount = activeSchedules.length;
          const waterPerSchedule = activeScheduleCount > 0 ? 
            Math.round((phase.kebutuhan_air || 0) / activeScheduleCount * 100) / 100 : // Round to 2 decimal places
            0;

          // Generate configId based on land name
          let configId = 1; // Default configId
          if (land.name.toLowerCase().includes('lahan 1')) {
            configId = 1;
          } else if (land.name.toLowerCase().includes('lahan 2')) {
            configId = 2;
          } else if (land.name.toLowerCase().includes('lahan 3')) {
            configId = 3;
          } else {
            // If land name doesn't match pattern, use a hash-based approach or sequential ID
            const landIndex = fertigationLands.findIndex(l => l.id === land.id);
            configId = landIndex >= 0 ? landIndex + 1 : 1;
          }

          // Prepare irrigation configuration data
          const irrigationConfig: IrrigationConfig = {
            configId: configId,
            landName: land.name,
            phaseName: phase.nama_fase_tanam,
            waterRequirement: phase.kebutuhan_air || 0,
            waterPerSchedule: waterPerSchedule,
            targetEC: phase.target_ec || 0,
            irrigationType: phase.jenis_irigasi,
            schedules: (schedules || []).map(schedule => ({
              time: schedule.time,
              isActive: schedule.is_active
            }))
          };

          allConfigs.push(irrigationConfig);
        }
      }

      if (allConfigs.length > 0) {
        // Send all configurations in one batch payload
        const success = sendMultipleIrrigationConfigs(allConfigs);
        
        if (success) {
          console.log(`Successfully sent ${allConfigs.length} irrigation configurations in one batch to ESP32`);
          console.log('Batch payload contains configs for:', allConfigs.map(config => config.landName).join(', '));
        } else {
          console.error('Failed to send batch irrigation configuration to ESP32');
        }
      } else {
        console.log('No configured lands found to send to ESP32');
      }
    } catch (error) {
      console.error('Error sending batch config to ESP32:', error);
    }
  };

  const addIrrigationSchedule = async (landId: string, time?: string) => {
    try {
      const newSchedule = {
        land_id: landId,
        time: time || scheduleForm.time,
        is_active: true
      };
      
      const { error } = await createIrrigationSchedule(newSchedule);
      if (error) {
        console.error('Error adding irrigation schedule:', error);
        return;
      }
      
      // Reset form and hide it
      setScheduleForm({ time: '08:00' });
      setShowScheduleForm(null);
      
      // Reload all fertigation data to get updated schedules
      await loadFertigationData();
    } catch (error) {
      console.error('Error adding irrigation schedule:', error);
    }
  };

  const removeIrrigationSchedule = async (scheduleId: string, landId: string) => {
    try {
      const { error } = await deleteIrrigationSchedule(scheduleId);
      if (error) {
        console.error('Error removing irrigation schedule:', error);
        return;
      }
      
      // Reload all fertigation data to get updated schedules
      await loadFertigationData();
    } catch (error) {
      console.error('Error removing irrigation schedule:', error);
    }
  };

  const updateIrrigationScheduleField = async (scheduleId: string, landId: string, field: string, value: any) => {
    try {
      const updates: Partial<IrrigationSchedule> = { [field]: value };
      const { error } = await updateIrrigationSchedule(scheduleId, updates);
      if (error) {
        console.error('Error updating irrigation schedule:', error);
        return;
      }
      
      // Reload all fertigation data to get updated schedules
      await loadFertigationData();
    } catch (error) {
      console.error('Error updating irrigation schedule:', error);
    }
  };

  // Phase irrigation schedule functions
  const loadPhaseIrrigationSchedules = async (phaseId: string) => {
    setIsPhaseScheduleLoading(true);
    try {
      const { data, error } = await getIrrigationSchedulesByPhase(phaseId);
      if (error) {
        console.error('Error loading phase irrigation schedules:', error);
        return;
      }
      setPhaseIrrigationSchedules(data || []);
    } catch (error) {
      console.error('Error loading phase irrigation schedules:', error);
    } finally {
      setIsPhaseScheduleLoading(false);
    }
  };

  const addPhaseIrrigationSchedule = async (phaseId: string) => {
    setIsPhaseScheduleLoading(true);
    try {
      const newSchedule = {
        phase_id: phaseId,
        time: phaseScheduleForm.time,
        is_active: true
      };
      
      const { error } = await createIrrigationSchedule(newSchedule);
      if (error) {
        console.error('Error adding phase irrigation schedule:', error);
        return;
      }
      
      // Reset form
      setPhaseScheduleForm({ time: '08:00' });
      
      // Reload schedules for this phase
      await loadPhaseIrrigationSchedules(phaseId);
      
      // Send updated irrigation configuration to ESP32 for all lands using this phase
      await sendPhaseConfigToESP32(phaseId);
    } catch (error) {
      console.error('Error adding phase irrigation schedule:', error);
    } finally {
      setIsPhaseScheduleLoading(false);
    }
  };

  // Function to send phase configuration to ESP32 for all lands using this phase
  const sendPhaseConfigToESP32 = async (phaseId: string) => {
    try {
      // Send all lands configuration to ESP32 via MQTT in one batch
      await sendAllLandsConfigToESP32();
    } catch (error) {
      console.error('Error sending phase config to ESP32:', error);
    }
  };

  const removePhaseIrrigationSchedule = async (scheduleId: string, phaseId: string) => {
    try {
      const { error } = await deleteIrrigationSchedule(scheduleId);
      if (error) {
        console.error('Error removing phase irrigation schedule:', error);
        return;
      }
      
      // Reload schedules for this phase
      await loadPhaseIrrigationSchedules(phaseId);
    } catch (error) {
      console.error('Error removing phase irrigation schedule:', error);
    }
  };

  const updatePhaseIrrigationScheduleField = async (scheduleId: string, phaseId: string, field: string, value: any) => {
    try {
      const updates: Partial<IrrigationSchedule> = { [field]: value };
      const { error } = await updateIrrigationSchedule(scheduleId, updates);
      if (error) {
        console.error('Error updating phase irrigation schedule:', error);
        return;
      }
      
      // Reload schedules for this phase
      await loadPhaseIrrigationSchedules(phaseId);
      
      // Send updated irrigation configuration to ESP32 for all lands using this phase
      await sendPhaseConfigToESP32(phaseId);
    } catch (error) {
      console.error('Error updating phase irrigation schedule:', error);
    }
  };

  const handleUpdatePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setUpdateMessage('Password baru dan konfirmasi password tidak cocok');
      return;
    }
    
    if (passwordForm.newPassword.length < 6) {
      setUpdateMessage('Password baru harus minimal 6 karakter');
      return;
    }

    setIsUpdating(true);
    setUpdateMessage('');
    
    try {
      const { error } = await updatePassword(passwordForm.newPassword);
      
      if (error) {
        setUpdateMessage(`Error: ${error.message}`);
      } else {
        setUpdateMessage('Password berhasil diperbarui!');
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      }
    } catch (error) {
      setUpdateMessage('Terjadi kesalahan saat memperbarui password');
    } finally {
      setIsUpdating(false);
    }
  };

  // Render the direct control panel
  const renderDirectControlPanel = () => {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Kontrol Langsung</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Valve Controls */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-700 mb-3">Kontrol Valve</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Valve Nutrisi</span>
                <button
                  onClick={() => toggleRelay('valve1')}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    relayStates.valve1 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {relayStates.valve1 ? 'ON' : 'OFF'}
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="font-medium">Valve Air</span>
                <button
                  onClick={() => toggleRelay('valve2')}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    relayStates.valve2 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {relayStates.valve2 ? 'ON' : 'OFF'}
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="font-medium">Valve Lahan 1</span>
                <button
                  onClick={() => toggleRelay('valve3')}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    relayStates.valve3 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {relayStates.valve3 ? 'ON' : 'OFF'}
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="font-medium">Valve Lahan 2</span>
                <button
                  onClick={() => toggleRelay('valve4')}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    relayStates.valve4 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {relayStates.valve4 ? 'ON' : 'OFF'}
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="font-medium">Valve Lahan 3</span>
                <button
                  onClick={() => toggleRelay('valve5')}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    relayStates.valve5 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {relayStates.valve5 ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
          
          {/* Pump Control */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-700 mb-3">Kontrol Pompa</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Pompa</span>
                <button
                  onClick={() => toggleRelay('pump')}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    relayStates.pump 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {relayStates.pump ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Sensor Data Display */}
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-700 mb-3">Data Sensor</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-sm text-blue-700">Aliran Air</div>
              <div className="text-xl font-semibold">{sensorData.waterFlow} L/min</div>
            </div>
            
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-sm text-green-700">Tekanan</div>
              <div className="text-xl font-semibold">{sensorData.pressure} Bar</div>
            </div>
            
            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="text-sm text-purple-700">EC</div>
              <div className="text-xl font-semibold">{sensorData.ec} μs/cm</div>
            </div>
            
            <div className="bg-yellow-50 p-3 rounded-lg">
              <div className="text-sm text-yellow-700">pH</div>
              <div className="text-xl font-semibold">{sensorData.ph}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg fixed h-full overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-blue-600">SiLagung</h2>
          <p className="text-sm text-gray-500 mt-1">Smart Fertigation System</p>
          
          {/* MQTT Status */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">MQTT Status:</span>
              <span className={`text-xs px-2 py-1 rounded ${mqttConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {mqttConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <p className="text-xs text-gray-500">{mqttStatus}</p>
          </div>
        </div>
        
        <nav className="mt-6">
          <div className="px-4 space-y-2">
            <button 
              onClick={() => setActiveMenu('dashboard')}
              className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors ${
                activeMenu === 'dashboard' 
                  ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700' 
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z" />
              </svg>
              Direct Controll
            </button>
            
            <button 
              onClick={() => setActiveMenu('analytics')}
              className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors ${
                activeMenu === 'analytics' 
                  ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700' 
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Manage Irrigation
            </button>
            
            <button 
              onClick={() => setActiveMenu('settings')}
              className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors ${
                activeMenu === 'settings' 
                  ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700' 
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Setting
            </button>
            
            <button 
              onClick={() => setActiveMenu('account')}
              className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors ${
                activeMenu === 'account' 
                  ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700' 
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Account
            </button>
          </div>
          
          <div className="mt-8 px-4">
            <button 
              onClick={handleSignOut}
              disabled={logoutLoading}
              className={`w-full flex items-center px-4 py-3 text-left rounded-lg text-red-600 hover:bg-red-50 transition-colors ${logoutLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {logoutLoading ? (
                <div className="loading-spinner mr-3"></div>
              ) : (
                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              )}
              {logoutLoading ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 ml-64">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {activeMenu === 'dashboard' && 'Direct Controll'}
            {activeMenu === 'analytics' && 'Manage Irrigation'}
            {activeMenu === 'settings' && 'Setting'}
            {activeMenu === 'account' && 'Account'}
          </h1>
          <p className="text-gray-600 mt-2">
            {activeMenu === 'dashboard' && 'Kontrol langsung sistem fertigasi dan monitoring sensor'}
            {activeMenu === 'analytics' && 'Kelola jadwal penyiraman dan lahan fertigasi'}
            {activeMenu === 'settings' && 'Konfigurasi fase tanam dan parameter fertigasi'}
            {activeMenu === 'account' && 'Kelola informasi akun dan keamanan Anda'}
          </p>
        </div>
        
        {/* Dashboard Content */}
        {activeMenu === 'dashboard' && (
          <>
            {/* Sensor Data Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Water Flow Sensor */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Water Flow</p>
                    <p className="text-2xl font-bold text-gray-900">{sensorData.waterFlow.toFixed(1)}</p>
                    <p className="text-sm text-blue-600 mt-1">L/min</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-full">
                    {/* Droplet Faucet SVG Icon */}
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0L12 2.69zM12 12v6m-3-3h6" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* Pressure Sensor */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pressure</p>
                    <p className="text-2xl font-bold text-gray-900">{sensorData.pressure.toFixed(1)}</p>
                    <p className="text-sm text-green-600 mt-1">Bar</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-full">
                    {/* Pressure gauge icon with needle */}
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {/* Gauge body */}
                      <circle cx="12" cy="12" r="9" strokeWidth="1.5" stroke="currentColor" fill="none"/>
                      {/* Needle pointing to 2 o'clock */}
                      <line x1="12" y1="12" x2="17" y2="7" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round"/>
                      {/* Center pivot */}
                      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                      {/* Scale marks */}
                      <line x1="7" y1="12" x2="8" y2="12" strokeWidth="1" stroke="currentColor"/>
                      <line x1="12" y1="7" x2="12" y2="8" strokeWidth="1" stroke="currentColor"/>
                      <line x1="17" y1="12" x2="16" y2="12" strokeWidth="1" stroke="currentColor"/>
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* EC Sensor */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">EC (Conductivity)</p>
                    <p className="text-2xl font-bold text-gray-900">{sensorData.ec.toFixed(1)}</p>
                    <p className="text-sm text-yellow-600 mt-1">us/cm</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-full">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* pH Sensor */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">pH Level</p>
                    <p className="text-2xl font-bold text-gray-900">{sensorData.ph.toFixed(1)}</p>
                    <p className="text-sm text-purple-600 mt-1">pH</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-full flex items-center justify-center">
                    <span className="text-purple-600 font-bold text-lg">pH</span>
                  </div>
                </div>
              </div>
            </div>

            {/* NPK Sensors */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Nitrogen Sensor */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Nitrogen (N)</p>
                    <p className="text-2xl font-bold text-gray-900">{sensorData.nitrogen.toFixed(0)}</p>
                    <p className="text-sm text-indigo-600 mt-1">mg/kg(mg/L)</p>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded-full">
                    <span className="text-indigo-600 font-bold text-lg">N</span>
                  </div>
                </div>
              </div>
              
              {/* Phosphorus Sensor */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Phosphorus (P)</p>
                    <p className="text-2xl font-bold text-gray-900">{sensorData.phosphorus.toFixed(0)}</p>
                    <p className="text-sm text-orange-600 mt-1">mg/kg(mg/L)</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold text-black-600">P</span>
                  </div>
                </div>
              </div>
              
              {/* Potassium Sensor */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Potassium (K)</p>
                    <p className="text-2xl font-bold text-gray-900">{sensorData.potassium.toFixed(0)}</p>
                    <p className="text-sm text-pink-600 mt-1">mg/kg(mg/L)</p>
                  </div>
                  <div className="p-3 bg-pink-50 rounded-full">
                    <span className="text-xl font-bold text-pink-600">K</span>
                  </div>
                </div>
              </div>
              
              {/* Temperature Sensor */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Temperature</p>
                    <p className="text-2xl font-bold text-gray-900">{sensorData.temperature.toFixed(1)}</p>
                    <p className="text-sm text-red-600 mt-1">°C</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-full">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4v10.54a4 4 0 11-4 0V4a2 2 0 012-2h0a2 2 0 012 2z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Relay Control Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Valve & Pump</h3>
              
              {/* Valve Controls */}
              <div className="mb-6">
                <h4 className="text-lg font-medium text-gray-700 mb-4">Valve Control</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    { num: 1, label: 'Valve Nutrisi', type: 'nutrisi' },
                    { num: 2, label: 'Air', type: 'air' },
                    { num: 3, label: 'Lahan 1', type: 'lahan' },
                    { num: 4, label: 'Lahan 2', type: 'lahan' },
                    { num: 5, label: 'Lahan 3', type: 'lahan' }
                  ].map(({ num, label, type }) => {
                    // Allow all valves to be controlled manually regardless of irrigation type
                    const isDisabled = false;
                    
                    return (
                      <div key={num} className={`p-4 rounded-lg ${isDisabled ? 'bg-gray-100 opacity-50' : 'bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <div className={`p-2 rounded-full ${isDisabled ? 'bg-gray-200' : 'bg-blue-100'}`}>
                              <svg className={`w-5 h-5 ${isDisabled ? 'text-gray-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                              </svg>
                            </div>
                            <span className={`text-sm font-medium ${isDisabled ? 'text-gray-400' : 'text-gray-700'}`}>{label}</span>
                          </div>
                          {isDisabled && (
                            <span className="text-xs text-red-500 font-medium">Disabled</span>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${isDisabled ? 'text-gray-400' : 'text-gray-500'}`}>
                            {relayStates[`valve${num}` as keyof typeof relayStates] ? 'ON' : 'OFF'}
                          </span>
                          <button
                            onClick={() => !isDisabled && toggleRelay(`valve${num}` as keyof typeof relayStates)}
                            disabled={isDisabled}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                              isDisabled 
                                ? 'bg-gray-300 cursor-not-allowed' 
                                : relayStates[`valve${num}` as keyof typeof relayStates]
                                  ? 'bg-blue-600' 
                                  : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                relayStates[`valve${num}` as keyof typeof relayStates] && !isDisabled
                                  ? 'translate-x-6' 
                                  : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pump Control */}
              <div>
                <h4 className="text-lg font-medium text-gray-700 mb-4">Pump Control</h4>
                <div className="bg-gray-50 p-6 rounded-lg max-w-md">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-green-100 rounded-full">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-lg font-medium text-gray-700">Water Pump</span>
                        <p className="text-sm text-gray-500">Main irrigation pump</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${relayStates.pump ? 'text-green-600' : 'text-gray-500'}`}>
                        Status: {relayStates.pump ? 'RUNNING' : 'STOPPED'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {relayStates.pump ? 'Pump is active' : 'Pump is inactive'}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleRelay('pump')}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                        relayStates.pump ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          relayStates.pump ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  
                  {/* VFD Frequency Control */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-gray-700">
                        VFD Frequency
                      </label>
                      <span className="text-sm font-semibold text-blue-600">
                        {pumpFrequency} Hz
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs text-gray-500">0</span>
                      <div className="flex-1 relative">
                        <input
                          type="range"
                          min="0"
                          max="60"
                          step="1"
                          value={pumpFrequency}
                          onChange={(e) => setPumpFrequency(Number(e.target.value))}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                          disabled={!relayStates.pump}
                          style={{
                            WebkitAppearance: 'none',
                            background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${(pumpFrequency / 60) * 100}%, #E5E7EB ${(pumpFrequency / 60) * 100}%, #E5E7EB 100%)`
                          }}
                        />
                        <style jsx="true">{`
                          input[type="range"]::-webkit-slider-thumb {
                            appearance: none;
                            width: 20px;
                            height: 20px;
                            border-radius: 50%;
                            background: #3B82F6;
                            cursor: pointer;
                            border: 2px solid #ffffff;
                            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                          }
                          input[type="range"]::-moz-range-thumb {
                            width: 20px;
                            height: 20px;
                            border-radius: 50%;
                            background: #3B82F6;
                            cursor: pointer;
                            border: 2px solid #ffffff;
                            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                          }
                          input[type="range"]:disabled {
                            opacity: 0.5;
                            cursor: not-allowed;
                          }
                          input[type="range"]:disabled::-webkit-slider-thumb {
                            cursor: not-allowed;
                            background: #9CA3AF;
                          }
                          input[type="range"]:disabled::-moz-range-thumb {
                            cursor: not-allowed;
                            background: #9CA3AF;
                          }
                        `}</style>
                      </div>
                      <span className="text-xs text-gray-500">60</span>
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-xs text-gray-400">Min</span>
                      <span className="text-xs text-gray-400">Max</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </>
        )}

        {/* Analytics Content - Page 2 */}
        {activeMenu === 'analytics' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 7.172V5L8 4z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Manajemen Fertigasi</h2>
                <p className="text-gray-600 mb-4">Kelola jadwal penyiraman dan fase tanam untuk setiap lahan fertigasi.</p>
                
                {/* Send All Button */}
                <div className="mt-6">
                  <button
                    onClick={sendAllLandsConfigToESP32}
                    className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium text-sm inline-flex items-center space-x-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    <span>Save Konfigurasi</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Land Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {fertigationLands.map((land) => {
                return (
                  <div key={land.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-semibold text-gray-900">{land.name}</h3>
                      <div className={`p-3 rounded-full ${land.is_active ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <svg className={`w-6 h-6 ${land.is_active ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 0l4 4M7 7l4-4M5.99 5.99l-1.06 1.06m1.06 8.49l-1.06 1.06M12 21v-1m0 0l4-4m-4 4l-4-4m8.49-1.99l1.06-1.06m-1.06-8.49l1.06-1.06M3 12h1m0 0l4 4M3 12l4-4m8 8h1m0 0l-4 4m4-4l-4-4" />
                        </svg>
                      </div>
                    </div>

                    {/* Phase Selection */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Fase Tanam Saat Ini
                      </label>
                      <select
                        value={land.current_phase_id || ''}
                        onChange={(e) => updateLandPhase(land.id, e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                      >
                        <option value="">Pilih Fase Tanam</option>
                        {plantingPhases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.nama_fase_tanam}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Current Phase Info */}
                    {land.current_phase_id && (
                      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        {(() => {
                          const selectedPhase = plantingPhases.find(p => p.id === land.current_phase_id);
                          return selectedPhase ? (
                            <div>
                              <p className="font-semibold text-blue-800 text-lg mb-2">{selectedPhase.nama_fase_tanam}</p>
                              <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                                <div>
                                  <p className="text-blue-600 font-medium">Kebutuhan Air</p>
                                  <p className="text-blue-800 text-lg font-semibold">{selectedPhase.kebutuhan_air} L/hari</p>
                                </div>
                                <div>
                                  <p className="text-blue-600 font-medium">Target EC</p>
                                  <p className="text-blue-800 text-lg font-semibold">{selectedPhase.target_ec} mS/cm</p>
                                </div>
                                <div>
                                  <p className="text-blue-600 font-medium">Jenis Irigasi</p>
                                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                    selectedPhase.jenis_irigasi === 'air' ? 'bg-green-100 text-green-800' :
                                    'bg-green-100 text-green-800'
                                  }`}>
                                    {selectedPhase.jenis_irigasi === 'air' ? 'Air Saja' :
                                     'Air + Nutrisi'}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Irrigation Schedules for this Phase */}
                              <div className="mt-4 pt-4 border-t border-blue-200">
                                <p className="text-blue-600 font-medium mb-3">Jadwal Penyiraman</p>
                                {fertigationPhaseSchedules[land.current_phase_id] && fertigationPhaseSchedules[land.current_phase_id].length > 0 ? (
                                  <div className="space-y-2">
                                    {fertigationPhaseSchedules[land.current_phase_id].map((schedule, index) => (
                                      <div key={schedule.id || index} className="flex items-center justify-between bg-white p-2 rounded border">
                                        <div className="flex items-center space-x-3">
                                          <div className={`w-3 h-3 rounded-full ${schedule.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                          <span className="text-blue-800 font-medium">{schedule.time}</span>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded ${
                                          schedule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                                        }`}>
                                          {schedule.is_active ? 'Aktif' : 'Nonaktif'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-blue-500 text-sm italic">Belum ada jadwal penyiraman untuk fase ini</p>
                                )}
                              </div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {/* Status */}
                    <div className="text-center">
                      <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                        land.current_phase_id ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {land.current_phase_id ? 'Fase Aktif' : 'Belum Dikonfigurasi'}
                      </div>
                      <p className="text-xs text-gray-500 mt-4">
                        Jadwal penyiraman diatur di menu Konfigurasi Fase
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Settings Content - Page 3 */}
        {activeMenu === 'settings' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Pengaturan Fase Tanam</h2>
                <p className="text-gray-600 mb-6">Kelola fase tanam dengan kebutuhan air dan target EC untuk sistem Fertigasi.</p>
              </div>
            </div>

            {/* Form untuk menambah/edit fase tanam */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingPhase ? 'Edit Fase Tanam' : 'Tambah Fase Tanam Baru'}
              </h3>
              
              {phaseMessage && (
                <div className={`p-4 rounded-lg mb-4 ${
                  phaseMessage.includes('Error') 
                    ? 'bg-red-50 text-red-700 border border-red-200' 
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}>
                  {phaseMessage}
                </div>
              )}

              <form onSubmit={handlePhaseSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nama Fase Tanam
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Contoh: Fase Vegetatif"
                      value={phaseForm.nama_fase_tanam}
                      onChange={(e) => setPhaseForm(prev => ({ ...prev, nama_fase_tanam: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Jenis Irigasi
                    </label>
                    <select
                      required
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      value={phaseForm.jenis_irigasi}
                      onChange={(e) => setPhaseForm(prev => ({ ...prev, jenis_irigasi: e.target.value as 'air' | 'air_nutrisi' }))}
                    >
                      <option value="air_nutrisi">Air + Nutrisi</option>
                      <option value="air">Air Saja</option>
                    </select>
                  </div>
                  
                  {(phaseForm.jenis_irigasi === 'air' || phaseForm.jenis_irigasi === 'air_nutrisi') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Kebutuhan Air (L/hari)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Contoh: 2.5"
                        value={phaseForm.kebutuhan_air}
                        onChange={(e) => setPhaseForm(prev => ({ ...prev, kebutuhan_air: e.target.value }))}
                      />
                    </div>
                  )}
                  
                  {phaseForm.jenis_irigasi === 'air_nutrisi' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Target EC (mS/cm)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        required
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Contoh: 1.2"
                        value={phaseForm.target_ec}
                        onChange={(e) => setPhaseForm(prev => ({ ...prev, target_ec: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
                
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isPhaseLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPhaseLoading ? 'Menyimpan...' : (editingPhase ? 'Update Fase' : 'Tambah Fase')}
                  </button>
                  
                  {editingPhase && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors font-medium"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Tabel fase tanam */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Daftar Fase Tanam</h3>
              
              {plantingPhases.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                    </svg>
                  </div>
                  <p className="text-gray-500">Belum ada fase tanam yang ditambahkan.</p>
                  <p className="text-sm text-gray-400 mt-1">Gunakan form di atas untuk menambah fase tanam baru.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Nama Fase</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Kebutuhan Air</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Target EC</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Jenis Irigasi</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Tanggal Dibuat</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plantingPhases.map((phase) => (
                        <tr key={phase.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-900">{phase.nama_fase_tanam}</td>
                          <td className="py-3 px-4 text-gray-700">{phase.kebutuhan_air} L/hari</td>
                          <td className="py-3 px-4 text-gray-700">{phase.target_ec} mS/cm</td>
                          <td className="py-3 px-4 text-gray-700">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              phase.jenis_irigasi === 'air' ? 'bg-green-100 text-green-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {phase.jenis_irigasi === 'air' ? 'Air Saja' :
                               'Air + Nutrisi'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-500 text-sm">
                            {phase.created_at ? new Date(phase.created_at).toLocaleDateString('id-ID') : '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => handleEditPhase(phase)}
                                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedPhaseForSchedule(phase.id!);
                                  loadPhaseIrrigationSchedules(phase.id!);
                                }}
                                className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 transition-colors"
                              >
                                Jadwal
                              </button>
                              <button
                                onClick={() => handleDeletePhase(phase.id!)}
                                className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 transition-colors"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Jadwal Penyiraman per Fase */}
            {selectedPhaseForSchedule && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Jadwal Penyiraman - {plantingPhases.find(p => p.id === selectedPhaseForSchedule)?.nama_fase_tanam}
                  </h3>
                  <button
                    onClick={() => {
                      setSelectedPhaseForSchedule(null);
                      setPhaseIrrigationSchedules([]);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Form tambah jadwal */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Tambah Jadwal Penyiraman</h4>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Waktu Penyiraman</label>
                      <input
                        type="time"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        value={phaseScheduleForm.time}
                        onChange={(e) => setPhaseScheduleForm({ time: e.target.value })}
                      />
                    </div>
                    <button
                      onClick={() => addPhaseIrrigationSchedule(selectedPhaseForSchedule)}
                      disabled={isPhaseScheduleLoading}
                      className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPhaseScheduleLoading ? 'Menambah...' : 'Tambah'}
                    </button>
                  </div>
                </div>

                {/* Daftar jadwal */}
                <div>
                  <h4 className="text-md font-medium text-gray-900 mb-3">Daftar Jadwal Penyiraman</h4>
                  {phaseIrrigationSchedules.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-gray-500">Belum ada jadwal penyiraman untuk fase ini.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {phaseIrrigationSchedules.map((schedule) => (
                        <div key={schedule.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <input
                              type="time"
                              value={schedule.time}
                              onChange={(e) => updatePhaseIrrigationScheduleField(schedule.id, selectedPhaseForSchedule, 'time', e.target.value)}
                              className="p-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            />
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={schedule.is_active}
                                onChange={(e) => updatePhaseIrrigationScheduleField(schedule.id, selectedPhaseForSchedule, 'is_active', e.target.checked)}
                                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                              />
                              <span className="text-sm text-gray-700">Aktif</span>
                            </label>
                          </div>
                          <button
                            onClick={() => removePhaseIrrigationSchedule(schedule.id, selectedPhaseForSchedule)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Account Content - Page 4 */}
        {activeMenu === 'account' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Informasi Akun</h2>
                <p className="text-gray-600 mb-6">Kelola informasi akun dan keamanan Anda di sini.</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* User Information */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Informasi Pengguna</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-900">{userProfile.email || 'Tidak tersedia'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
                    <input
                      type="text"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Masukkan nama lengkap"
                      value={userProfile.full_name}
                      onChange={(e) => setUserProfile(prev => ({ ...prev, full_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Telepon</label>
                    <input
                      type="tel"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Masukkan nomor telepon"
                      value={userProfile.phone}
                      onChange={(e) => setUserProfile(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                  {updateMessage && (
                    <div className={`p-3 rounded-lg text-sm ${
                      updateMessage.includes('Error') || updateMessage.includes('tidak cocok') || updateMessage.includes('minimal')
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-green-50 text-green-700 border border-green-200'
                    }`}>
                      {updateMessage}
                    </div>
                  )}
                  <button 
                    onClick={handleUpdateProfile}
                    disabled={isUpdating}
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpdating ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </div>
              
              {/* Password Update */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ubah Password</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password Saat Ini</label>
                    <input
                      type="password"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Masukkan password saat ini"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password Baru</label>
                    <input
                      type="password"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Masukkan password baru"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi Password Baru</label>
                    <input
                      type="password"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Konfirmasi password baru"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    />
                  </div>
                  <button 
                    onClick={handleUpdatePassword}
                    disabled={isUpdating}
                    className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUpdating ? 'Mengubah...' : 'Ubah Password'}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Account Security */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Keamanan Akun</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Two-Factor Authentication</p>
                      <p className="text-xs text-gray-500">Tambahan keamanan untuk akun Anda</p>
                    </div>
                    <div className="w-10 h-6 bg-gray-300 rounded-full relative cursor-pointer">
                      <div className="w-4 h-4 bg-white rounded-full absolute left-1 top-1 transition-transform"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Email Notifications</p>
                      <p className="text-xs text-gray-500">Terima notifikasi melalui email</p>
                    </div>
                    <div className="w-10 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                      <div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1 transition-transform"></div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-green-800">Akun Terverifikasi</p>
                        <p className="text-xs text-green-600">Email Anda telah terverifikasi</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-blue-800">Login Terakhir</p>
                        <p className="text-xs text-blue-600">Hari ini, 14:30 WIB</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}