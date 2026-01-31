"use client";

import { useEffect, useState, useRef } from "react";
import RecordatoriosConfig from '@/components/RecordatoriosConfig';
import LogoUploader from '@/components/LogoUploader';
import BackupConfig from '@/components/BackupConfig';
import {
  getConfiguracion,
  updateConfiguracion,
  getHorariosConfig,
  createHorario,
  deleteHorario,
  getFAQsConfig,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  downloadDatabaseBackup,
  downloadClientesCSV,
  downloadCitasCSV,
} from "@/lib/api";
import {
  Settings,
  Building2,
  Clock,
  HelpCircle,
  Users,
  Database,
  Save,
  Plus,
  Edit,
  Trash2,
  X,
  Download,
  Eye,
  EyeOff,
  Shield,
  Volume2,
  Check,
  Bell,
  HardDrive,
} from "lucide-react";
import toast from 'react-hot-toast';
import ConfirmModal from '@/components/ConfirmModal';

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados para cada sección
  const [config, setConfig] = useState(null);
  const [horarios, setHorarios] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  // Modales
  const [showHorarioModal, setShowHorarioModal] = useState(false);
  const [showFAQModal, setShowFAQModal] = useState(false);
  const [showUsuarioModal, setShowUsuarioModal] = useState(false);
  const [editingFAQ, setEditingFAQ] = useState(null);
  const [editingUsuario, setEditingUsuario] = useState(null);

  // Forms
  const [horarioForm, setHorarioForm] = useState({ dia: "lunes", horas: [] });
  const [faqForm, setFaqForm] = useState({ pregunta: "", respuesta: "" });
  const [usuarioForm, setUsuarioForm] = useState({
    username: "",
    password: "",
    nombre_completo: "",
    email: "",
    rol: "empleado",
  });
  const [showPassword, setShowPassword] = useState(false);

  // Estados para selector de sonido
  const [selectedSound, setSelectedSound] = useState(1);
  const [playingSound, setPlayingSound] = useState(null);
  const audioRef = useRef(null);

  const NOTIFICATION_SOUNDS = [
    { id: 1, name: 'Sonido 1', file: '/notification1-sound.mp3' },
    { id: 2, name: 'Sonido 2', file: '/notification2-sound.mp3' },
    { id: 3, name: 'Sonido 3', file: '/notification3-sound.mp3' },
    { id: 4, name: 'Sonido 4', file: '/notification4-sound.mp3' },
  ];

  // Estados para modales de confirmación
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmData, setConfirmData] = useState(null);

  useEffect(() => {
    loadData();
    // Cargar sonido guardado
    const saved = localStorage.getItem('notificationSound');
    if (saved) {
      setSelectedSound(parseInt(saved));
    }
  }, [activeTab]);

  const playSound = (soundId) => {
    const sound = NOTIFICATION_SOUNDS.find(s => s.id === soundId);
    if (!sound) return;

    setPlayingSound(soundId);

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(sound.file);
    audio.volume = 0.7;
    audioRef.current = audio;

    audio.play().catch(err => {
      console.error('Error reproduciendo sonido:', err);
    });

    audio.onended = () => {
      setPlayingSound(null);
    };
  };

  const handleSelectSound = (soundId) => {
    setSelectedSound(soundId);
    localStorage.setItem('notificationSound', soundId.toString());
    toast.success(`Sonido ${soundId} seleccionado`);
    playSound(soundId);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "general") {
        const data = await getConfiguracion();
        setConfig(data);
      } else if (activeTab === "horarios") {
        const data = await getHorariosConfig();
        setHorarios(data);
      } else if (activeTab === "faqs") {
        const data = await getFAQsConfig();
        setFaqs(data);
      } else if (activeTab === "usuarios") {
        const data = await getUsuarios();
        setUsuarios(data);
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneral = async () => {
    setSaving(true);
    const toastId = toast.loading('Guardando configuración...');
    
    try {
      await updateConfiguracion(config);
      toast.success('✅ Configuración guardada correctamente', { id: toastId });
    } catch (error) {
      toast.error('❌ Error al guardar configuración', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateHorario = async () => {
    if (horarioForm.horas.length === 0) {
      toast.error('⚠️ Selecciona al menos una hora');
      return;
    }

    const toastId = toast.loading(`Creando ${horarioForm.horas.length} horario(s)...`);
    
    try {
      // Crear un horario por cada hora seleccionada
      for (const hora of horarioForm.horas) {
        await createHorario({ dia: horarioForm.dia, hora });
      }
      
      setShowHorarioModal(false);
      setHorarioForm({ dia: "lunes", horas: [] });
      loadData();
      toast.success(`✅ ${horarioForm.horas.length} horario(s) creado(s)`, { id: toastId });
    } catch (error) {
      toast.error('❌ Error al crear horarios', { id: toastId });
    }
  };

  const handleDeleteHorario = (id) => {
    setConfirmAction('deleteHorario');
    setConfirmData(id);
    setShowConfirmModal(true);
  };

  const confirmarEliminarHorario = async () => {
    const toastId = toast.loading('Eliminando horario...');
    
    try {
      await deleteHorario(confirmData);
      loadData();
      toast.success('✅ Horario eliminado', { id: toastId });
    } catch (error) {
      toast.error('❌ Error al eliminar horario', { id: toastId });
    }
  };

  const handleSaveFAQ = async () => {
    const toastId = toast.loading(editingFAQ ? 'Actualizando FAQ...' : 'Creando FAQ...');
    
    try {
      if (editingFAQ) {
        await updateFAQ(editingFAQ.id, faqForm);
      } else {
        await createFAQ(faqForm);
      }
      setShowFAQModal(false);
      setEditingFAQ(null);
      setFaqForm({ pregunta: "", respuesta: "" });
      loadData();
      toast.success('✅ FAQ guardada', { id: toastId });
    } catch (error) {
      toast.error('❌ Error al guardar FAQ', { id: toastId });
    }
  };

  const handleDeleteFAQ = (id) => {
    setConfirmAction('deleteFAQ');
    setConfirmData(id);
    setShowConfirmModal(true);
  };

  const confirmarEliminarFAQ = async () => {
    const toastId = toast.loading('Eliminando FAQ...');
    
    try {
      await deleteFAQ(confirmData);
      loadData();
      toast.success('✅ FAQ eliminada', { id: toastId });
    } catch (error) {
      toast.error('❌ Error al eliminar FAQ', { id: toastId });
    }
  };

  const handleSaveUsuario = async () => {
    const toastId = toast.loading(editingUsuario ? 'Actualizando usuario...' : 'Creando usuario...');
    
    try {
      if (editingUsuario) {
        const dataToUpdate = { ...usuarioForm };
        if (!usuarioForm.password) {
          delete dataToUpdate.password;
        }
        delete dataToUpdate.username;
        await updateUsuario(editingUsuario.id, dataToUpdate);
      } else {
        await createUsuario(usuarioForm);
      }
      setShowUsuarioModal(false);
      setEditingUsuario(null);
      setUsuarioForm({
        username: "",
        password: "",
        nombre_completo: "",
        email: "",
        rol: "empleado",
      });
      loadData();
      toast.success('✅ Usuario guardado', { id: toastId });
    } catch (error) {
      toast.error(error.response?.data?.error || '❌ Error al guardar usuario', { id: toastId });
    }
  };

  const handleDeleteUsuario = (id) => {
    setConfirmAction('deleteUsuario');
    setConfirmData(id);
    setShowConfirmModal(true);
  };

  const confirmarEliminarUsuario = async () => {
    const toastId = toast.loading('Eliminando usuario...');
    
    try {
      await deleteUsuario(confirmData);
      loadData();
      toast.success('✅ Usuario eliminado', { id: toastId });
    } catch (error) {
      toast.error(error.response?.data?.error || '❌ Error al eliminar usuario', { id: toastId });
    }
  };

  const tabs = [
    { id: "general", label: "Información General", icon: Building2 },
    { id: "horarios", label: "Horarios", icon: Clock },
    { id: "faqs", label: "FAQs", icon: HelpCircle },
    { id: "usuarios", label: "Usuarios", icon: Users },
    { id: "recordatorios", label: "Recordatorios", icon: Bell },
    { id: "backup", label: "Respaldo", icon: HardDrive },
  ];

  const dias = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo",
  ];

  if (loading && activeTab !== "backup") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-500 dark:to-purple-500 rounded-2xl p-8 text-white shadow-xl flex items-center gap-3">
        <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <Settings className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-4xl font-bold">Configuración</h1>
          <p className="text-indigo-100 dark:text-indigo-200">
            Personaliza tu sistema
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* TAB: GENERAL */}
          {activeTab === "general" && config && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                    Nombre del Negocio *
                  </label>
                  <input
                    type="text"
                    value={config.nombreNegocio}
                    onChange={(e) =>
                      setConfig({ ...config, nombreNegocio: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                    Teléfono *
                  </label>
                  <input
                    type="text"
                    value={config.telefono}
                    onChange={(e) =>
                      setConfig({ ...config, telefono: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={config.email}
                    onChange={(e) =>
                      setConfig({ ...config, email: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                    WhatsApp del Asesor *
                  </label>
                  <input
                    type="text"
                    value={config.numeroAsesor}
                    onChange={(e) =>
                      setConfig({ ...config, numeroAsesor: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 transition-all"
                    placeholder="+50612345678"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                  Dirección *
                </label>
                <input
                  type="text"
                  value={config.direccion}
                  onChange={(e) =>
                    setConfig({ ...config, direccion: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                  Link de Google Maps
                </label>
                <input
                  type="url"
                  value={config.linkMapa}
                  onChange={(e) =>
                    setConfig({ ...config, linkMapa: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 transition-all"
                  placeholder="https://maps.google.com/?q=..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                  Mensaje de Bienvenida *
                </label>
                
                {/* AVISO SOBRE {negocio} */}
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <span className="text-lg">💡</span>
                    <span>
                      <strong>Tip:</strong> Usa{' '}
                      <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-xs font-mono">
                        {'{negocio}'}
                      </code>{' '}
                      para insertar automáticamente el nombre del negocio
                    </span>
                  </p>
                </div>
                
                <textarea
                  value={config.mensajeBienvenida}
                  onChange={(e) =>
                    setConfig({ ...config, mensajeBienvenida: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 transition-all"
                  rows="3"
                  placeholder="¡Hola! Soy el asistente virtual de {negocio}. ¿En qué puedo ayudarte hoy?"
                />
                
                {/* VISTA PREVIA */}
                {config.mensajeBienvenida && config.mensajeBienvenida.includes('{negocio}') && (
                  <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      👁️ Vista previa:
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {config.mensajeBienvenida.replace(
                        '{negocio}',
                        config.nombreNegocio || '[Nombre del Negocio]'
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                  Horarios (para mostrar al cliente)
                </label>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  📅 Configura los horarios que se mostrarán a tus clientes en el bot
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Input 1 - Lunes a Viernes */}
                  <div>
                    <label className="block text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
                      📆 Lunes a Viernes
                    </label>
                    <input
                      type="text"
                      placeholder="9:00 AM - 5:00 PM"
                      value={config.horarios.lunesViernes}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          horarios: {
                            ...config.horarios,
                            lunesViernes: e.target.value,
                          },
                        })
                      }
                      className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>

                  {/* Input 2 - Sábado */}
                  <div>
                    <label className="block text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
                      📆 Sábado
                    </label>
                    <input
                      type="text"
                      placeholder="9:00 AM - 2:00 PM"
                      value={config.horarios.sabado}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          horarios: {
                            ...config.horarios,
                            sabado: e.target.value,
                          },
                        })
                      }
                      className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>

                  {/* Input 3 - Domingo */}
                  <div>
                    <label className="block text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
                      📆 Domingo
                    </label>
                    <input
                      type="text"
                      placeholder="Cerrado"
                      value={config.horarios.domingo}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          horarios: {
                            ...config.horarios,
                            domingo: e.target.value,
                          },
                        })
                      }
                      className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-base font-bold text-gray-900 dark:text-white mb-3">
                  Opciones del Menú del Bot
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.keys(config.opciones).map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={config.opciones[key]}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            opciones: {
                              ...config.opciones,
                              [key]: e.target.checked,
                            },
                          })
                        }
                        className="w-5 h-5 text-indigo-600 dark:text-indigo-400 rounded focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-bold text-gray-900 dark:text-white capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Selector de Sonido de Notificaciones */}
              <div className="mt-8 pt-8 border-t-2 border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-6">
                  <Volume2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      Sonido de Notificaciones
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Selecciona el sonido que se reproducirá cuando llegue una nueva cita
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {NOTIFICATION_SOUNDS.map((sound) => (
                    <button
                      key={sound.id}
                      onClick={() => handleSelectSound(sound.id)}
                      className={`
                        relative p-4 rounded-xl border-2 transition-all duration-200
                        ${selectedSound === sound.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-lg'
                          : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                        }
                        ${playingSound === sound.id ? 'ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-gray-900' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`
                            w-10 h-10 rounded-full flex items-center justify-center transition-colors
                            ${selectedSound === sound.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                            }
                          `}>
                            <Volume2 className="w-5 h-5" />
                          </div>
                          <span className={`
                            font-semibold
                            ${selectedSound === sound.id
                              ? 'text-indigo-700 dark:text-indigo-300'
                              : 'text-gray-700 dark:text-gray-300'
                            }
                          `}>
                            {sound.name}
                          </span>
                        </div>
                        
                        {selectedSound === sound.id && (
                          <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>

                      {playingSound === sound.id && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                          <div className="flex gap-1">
                            <div className="w-1 h-3 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-1 h-3 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-1 h-3 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <span className="font-medium">Reproduciendo...</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <p className="text-sm text-indigo-800 dark:text-indigo-300">
                    💡 <strong>Tip:</strong> Haz clic en cualquier sonido para escucharlo antes de seleccionarlo.
                    El sonido seleccionado se reproducirá automáticamente cuando llegue una nueva cita.
                  </p>
                </div>
              </div>

              {/* Logo del Negocio */}
              <LogoUploader />

              <button
                onClick={handleSaveGeneral}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                <span>{saving ? "Guardando..." : "Guardar Cambios"}</span>
              </button>
            </div>
          )}

          {/* TAB: HORARIOS */}
          {activeTab === "horarios" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-gray-800 dark:text-gray-200 font-medium">
                  Configura los horarios disponibles para agendar citas
                </p>
                <button
                  onClick={() => setShowHorarioModal(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all font-semibold"
                >
                  <Plus className="w-5 h-5" />
                  <span>Nuevo Horario</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {dias.map((dia) => {
                  const horariosDelDia = horarios.filter(
                    (h) => h.dia_semana === dia
                  );
                  return (
                    <div
                      key={dia}
                      className="bg-white dark:bg-gray-800 border-2 border-indigo-200 dark:border-indigo-700 rounded-xl p-4 shadow-md"
                    >
                      <h3 className="font-bold text-lg text-indigo-600 dark:text-indigo-400 capitalize mb-3">
                        {dia}
                      </h3>
                      <div className="space-y-2">
                        {horariosDelDia.length === 0 ? (
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 italic">
                            Sin horarios
                          </p>
                        ) : (
                          horariosDelDia.map((h) => (
                            <div
                              key={h.id}
                              className="flex items-center justify-between bg-indigo-100 dark:bg-indigo-900/30 border-2 border-indigo-300 dark:border-indigo-600 rounded-lg p-3 shadow-sm"
                            >
                              <span className="text-base font-bold text-indigo-900 dark:text-indigo-100">
                                {h.hora}
                              </span>
                              <button
                                onClick={() => handleDeleteHorario(h.id)}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: FAQs */}
          {activeTab === "faqs" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-gray-800 dark:text-gray-200 font-medium">
                  Preguntas frecuentes que responderá el bot
                </p>
                <button
                  onClick={() => {
                    setEditingFAQ(null);
                    setFaqForm({ pregunta: "", respuesta: "" });
                    setShowFAQModal(true);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all font-semibold"
                >
                  <Plus className="w-5 h-5" />
                  <span>Nueva FAQ</span>
                </button>
              </div>

              <div className="space-y-4">
                {faqs.length === 0 ? (
                  <p className="text-center text-gray-700 dark:text-gray-300 py-8 font-medium text-lg">
                    No hay preguntas frecuentes
                  </p>
                ) : (
                  faqs.map((faq) => (
                    <div
                      key={faq.id}
                      className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-md hover:shadow-lg transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                          {faq.pregunta}
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingFAQ(faq);
                              setFaqForm({
                                pregunta: faq.pregunta,
                                respuesta: faq.respuesta,
                              });
                              setShowFAQModal(true);
                            }}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteFAQ(faq.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {faq.respuesta}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: USUARIOS */}
          {activeTab === "usuarios" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-gray-600">
                  Usuarios con acceso al panel administrativo
                </p>
                <button
                  onClick={() => {
                    setEditingUsuario(null);
                    setUsuarioForm({
                      username: "",
                      password: "",
                      nombre_completo: "",
                      email: "",
                      rol: "empleado",
                    });
                    setShowUsuarioModal(true);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all font-semibold"
                >
                  <Plus className="w-5 h-5" />
                  <span>Nuevo Usuario</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Usuario
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Nombre
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Rol
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {usuarios.map((usuario) => (
                      <tr key={usuario.id} className="bg-white dark:bg-gray-800">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          {usuario.username}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {usuario.nombre_completo}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{usuario.email}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              usuario.rol === "admin"
                                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200"
                                : "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                            }`}
                          >
                            {usuario.rol}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              usuario.activo
                                ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                                : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
                            }`}
                          >
                            {usuario.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm gap-2">
                          <button
                            onClick={() => {
                              setEditingUsuario(usuario);
                              setUsuarioForm({
                                username: usuario.username,
                                password: "",
                                nombre_completo: usuario.nombre_completo,
                                email: usuario.email,
                                rol: usuario.rol,
                              });
                              setShowUsuarioModal(true);
                            }}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUsuario(usuario.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: RECORDATORIOS */}
          {activeTab === "recordatorios" && (
            <RecordatoriosConfig />
          )}

          {/* TAB: BACKUP */}
          {activeTab === "backup" && (
            <BackupConfig />
          )}
        </div>
      </div>

      {/* Modal Horario */}
      {/* Modal Horario */}
      {showHorarioModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border-2 border-gray-200 dark:border-gray-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Nuevo Horario</h3>
              <button
                onClick={() => setShowHorarioModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                  Día de la Semana
                </label>
                <select
                  value={horarioForm.dia}
                  onChange={(e) =>
                    setHorarioForm({ ...horarioForm, dia: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  {dias.map((dia) => (
                    <option key={dia} value={dia} className="capitalize">
                      {dia.charAt(0).toUpperCase() + dia.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-base font-bold text-gray-900 dark:text-white mb-3">
                  Hora
                </label>

                {/* Selector Visual de Horas - MULTI-SELECT */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    "8:00 AM",
                    "9:00 AM",
                    "10:00 AM",
                    "11:00 AM",
                    "12:00 PM",
                    "1:00 PM",
                    "2:00 PM",
                    "3:00 PM",
                    "4:00 PM",
                  ].map((hora) => {
                    const isSelected = horarioForm.horas.includes(hora);
                    return (
                      <button
                        key={hora}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            // Deseleccionar
                            setHorarioForm({
                              ...horarioForm,
                              horas: horarioForm.horas.filter(h => h !== hora)
                            });
                          } else {
                            // Seleccionar
                            setHorarioForm({
                              ...horarioForm,
                              horas: [...horarioForm.horas, hora]
                            });
                          }
                        }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-md transform scale-105"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        {hora}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  💡 Selecciona una o varias horas (clic para seleccionar/deseleccionar)
                </p>
              </div>

              {/* Preview */}
              {horarioForm.horas.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
                    <strong>Vista Previa:</strong>{" "}
                    {horarioForm.dia.charAt(0).toUpperCase() + horarioForm.dia.slice(1)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {horarioForm.horas.map(hora => (
                      <span key={hora} className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 rounded text-xs font-medium">
                        {hora}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowHorarioModal(false);
                    setHorarioForm({ dia: "lunes", horas: [] });
                  }}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateHorario}
                  disabled={horarioForm.horas.length === 0}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                >
                  Crear {horarioForm.horas.length > 0 ? `${horarioForm.horas.length} ` : ''}Horario{horarioForm.horas.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal FAQ */}
      {showFAQModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border-2 border-gray-200 dark:border-gray-700 max-w-2xl w-full p-6">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {editingFAQ ? "Editar" : "Nueva"} FAQ
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Pregunta
                </label>
                <input
                  type="text"
                  value={faqForm.pregunta}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, pregunta: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Respuesta
                </label>
                <textarea
                  value={faqForm.respuesta}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, respuesta: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="4"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFAQModal(false)}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveFAQ}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Usuario */}
      {showUsuarioModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border-2 border-gray-200 dark:border-gray-700 max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingUsuario ? "Editar" : "Nuevo"} Usuario
              </h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Usuario
                </label>
                <input
                  type="text"
                  value={usuarioForm.username}
                  onChange={(e) =>
                    setUsuarioForm({ ...usuarioForm, username: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                  disabled={!!editingUsuario}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Contraseña {editingUsuario && "(vacío = no cambiar)"}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={usuarioForm.password}
                    onChange={(e) =>
                      setUsuarioForm({
                        ...usuarioForm,
                        password: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-lg pr-10 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={usuarioForm.nombre_completo}
                  onChange={(e) =>
                    setUsuarioForm({
                      ...usuarioForm,
                      nombre_completo: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Email</label>
                <input
                  type="email"
                  value={usuarioForm.email}
                  onChange={(e) =>
                    setUsuarioForm({ ...usuarioForm, email: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Rol</label>
                <select
                  value={usuarioForm.rol}
                  onChange={(e) =>
                    setUsuarioForm({ ...usuarioForm, rol: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="empleado">Empleado</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowUsuarioModal(false)}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveUsuario}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          if (confirmAction === 'deleteHorario') confirmarEliminarHorario();
          else if (confirmAction === 'deleteFAQ') confirmarEliminarFAQ();
          else if (confirmAction === 'deleteUsuario') confirmarEliminarUsuario();
        }}
        title={
          confirmAction === 'deleteHorario' ? '¿Eliminar horario?' :
          confirmAction === 'deleteFAQ' ? '¿Eliminar FAQ?' :
          '¿Eliminar usuario?'
        }
        message="Esta acción no se puede deshacer."
        confirmText="Eliminar"
        type="danger"
      />
    </div>
  );
}