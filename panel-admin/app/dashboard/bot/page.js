'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { 
  Power, 
  RefreshCw, 
  Trash2,
  Activity,
  QrCode,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader,
  Zap,
  Radio,
  Shield,
  Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '@/components/ConfirmModal';

export default function BotControlPage() {
  const [botStatus, setBotStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    loadBotStatus();
    
    // Actualizar estado cada 5 segundos
    const interval = setInterval(loadBotStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Si el bot está esperando QR, intentar obtenerlo
    if (botStatus?.status === 'qr_ready') {
      loadQRCode();
    } else {
      setQrCode(null);
    }
  }, [botStatus?.status]);

  const loadBotStatus = async () => {
    try {
      const data = await api.get('/bot/status');
      setBotStatus(data.data);
      setError(null);
    } catch (error) {
      console.error('Error cargando estado:', error);
      if (error.response?.status !== 401) {
        setError('Error de conexión con el servidor');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadQRCode = async () => {
    try {
      const response = await api.get('/bot/qr');
      setQrCode(response.data.qrCode);
    } catch (error) {
      console.error('Error cargando QR:', error);
    }
  };

  const handleStartBot = async () => {
    setActionLoading(true);
    setError(null);
    const toastId = toast.loading('Iniciando bot...');

    try {
      const response = await api.post('/bot/init');
      setBotStatus(response.data.status);
      toast.success('✅ Bot iniciado correctamente', { id: toastId });
    } catch (error) {
      setError(error.response?.data?.error || 'Error al iniciar el bot');
      toast.error('❌ Error al iniciar el bot', { id: toastId });
      console.error('Error:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopBot = () => {
    setConfirmAction('stop');
    setShowConfirmModal(true);
  };

  const confirmarStopBot = async () => {
    setActionLoading(true);
    setError(null);
    const toastId = toast.loading('Deteniendo bot...');

    try {
      const response = await api.post('/bot/stop');
      setBotStatus(response.data.status);
      toast.success('ℹ️ Bot detenido correctamente', { id: toastId });
    } catch (error) {
      setError(error.response?.data?.error || 'Error al detener el bot');
      toast.error('❌ Error al detener el bot', { id: toastId });
      console.error('Error:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestartBot = () => {
    setConfirmAction('restart');
    setShowConfirmModal(true);
  };

  const confirmarRestartBot = async () => {
    setActionLoading(true);
    setError(null);
    const toastId = toast.loading('Reiniciando bot...');

    try {
      const response = await api.post('/bot/restart');
      setBotStatus(response.data.status);
      toast.success('🔄 Bot reiniciado correctamente', { id: toastId });
    } catch (error) {
      setError(error.response?.data?.error || 'Error al reiniciar el bot');
      toast.error('❌ Error al reiniciar el bot', { id: toastId });
      console.error('Error:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearSession = () => {
    setConfirmAction('clear');
    setShowConfirmModal(true);
  };

  const confirmarClearSession = async () => {
    setActionLoading(true);
    setError(null);
    const toastId = toast.loading('Eliminando sesión...');

    try {
      const response = await api.post('/bot/clear-session');
      setBotStatus(response.data.status);
      toast.success('🗑️ Sesión eliminada. Inicia el bot para escanear nuevo QR', { id: toastId, duration: 5000 });
    } catch (error) {
      setError(error.response?.data?.error || 'Error al limpiar la sesión');
      toast.error('❌ Error al limpiar la sesión', { id: toastId });
      console.error('Error:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusConfig = () => {
    if (!botStatus) return null;

    const statusConfig = {
      connected: { color: 'from-green-500 to-emerald-500', bgColor: 'bg-green-500/20', borderColor: 'border-green-500/30', icon: CheckCircle, text: 'Conectado', pulse: true },
      qr_ready: { color: 'from-yellow-500 to-orange-500', bgColor: 'bg-yellow-500/20', borderColor: 'border-yellow-500/30', icon: QrCode, text: 'Esperando QR', pulse: true },
      starting: { color: 'from-blue-500 to-blue-600', bgColor: 'bg-blue-500/20', borderColor: 'border-blue-500/30', icon: Loader, text: 'Iniciando...', pulse: true },
      stopping: { color: 'from-orange-500 to-orange-600', bgColor: 'bg-orange-500/20', borderColor: 'border-orange-500/30', icon: Loader, text: 'Deteniendo...', pulse: true },
      stopped: { color: 'from-gray-500 to-gray-600', bgColor: 'bg-gray-500/20', borderColor: 'border-gray-500/30', icon: XCircle, text: 'Detenido', pulse: false },
      error: { color: 'from-red-500 to-red-600', bgColor: 'bg-red-500/20', borderColor: 'border-red-500/30', icon: AlertCircle, text: 'Error', pulse: false },
      auth_failed: { color: 'from-red-500 to-pink-500', bgColor: 'bg-red-500/20', borderColor: 'border-red-500/30', icon: XCircle, text: 'Auth Fallida', pulse: false },
      disconnected: { color: 'from-orange-500 to-red-500', bgColor: 'bg-orange-500/20', borderColor: 'border-orange-500/30', icon: AlertCircle, text: 'Desconectado', pulse: false },
      not_initialized: { color: 'from-gray-500 to-gray-600', bgColor: 'bg-gray-500/20', borderColor: 'border-gray-500/30', icon: XCircle, text: 'No Inicializado', pulse: false }
    };

    return statusConfig[botStatus.status] || statusConfig.stopped;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-green-200 dark:border-green-900 border-t-green-600 dark:border-t-green-400 rounded-full animate-spin"></div>
          <Activity className="w-6 h-6 text-green-600 dark:text-green-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig?.icon || Activity;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-500 dark:to-emerald-500 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Activity className="w-10 h-10" />
              Control del Bot
            </h1>
            <p className="text-green-100 dark:text-green-200">
              Administra y monitorea el bot de WhatsApp en tiempo real
            </p>
          </div>
          <div className="hidden md:block">
            <div className={`flex items-center gap-3 px-6 py-3 ${statusConfig?.bgColor} border-2 ${statusConfig?.borderColor} rounded-xl backdrop-blur-sm`}>
              {statusConfig?.pulse && (
                <div className={`w-3 h-3 bg-gradient-to-r ${statusConfig?.color} rounded-full animate-pulse`}></div>
              )}
              <StatusIcon className="w-6 h-6" />
              <span className="font-bold text-lg">{statusConfig?.text}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 rounded-2xl p-6 flex items-start gap-4 animate-shake">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/50 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-bold text-red-800 dark:text-red-300 mb-1">Error del Sistema</h3>
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Estado del Bot */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 bg-gradient-to-br ${statusConfig?.color} rounded-xl flex items-center justify-center shadow-lg`}>
              <Radio className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Estado del Bot</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Monitoreo en tiempo real • Actualización cada 5s</p>
            </div>
          </div>
          <div className="md:hidden">
            <div className={`flex items-center gap-2 px-4 py-2 ${statusConfig?.bgColor} border ${statusConfig?.borderColor} rounded-xl`}>
              <StatusIcon className="w-5 h-5" />
              <span className="font-bold text-sm">{statusConfig?.text}</span>
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Usuarios Activos</p>
            </div>
            <p className="text-4xl font-bold text-gray-800 dark:text-gray-100">{botStatus?.activeUsers || 0}</p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-xl p-6 border-2 border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Citas en Proceso</p>
            </div>
            <p className="text-4xl font-bold text-gray-800 dark:text-gray-100">{botStatus?.appointments || 0}</p>
          </div>

          <div className={`bg-gradient-to-br ${botStatus?.isRunning ? 'from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-200 dark:border-green-800' : 'from-red-50 to-pink-50 dark:from-red-900/30 dark:to-pink-900/30 border-red-200 dark:border-red-800'} rounded-xl p-6 border-2`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${botStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'} rounded-lg flex items-center justify-center`}>
                <Zap className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Estado General</p>
            </div>
            <p className="text-4xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              {botStatus?.isRunning ? (
                <>
                  <span className="w-4 h-4 bg-green-500 rounded-full animate-pulse"></span>
                  Activo
                </>
              ) : (
                <>
                  <span className="w-4 h-4 bg-red-500 rounded-full"></span>
                  Inactivo
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Panel de Control</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Iniciar Bot */}
          <button
            onClick={handleStartBot}
            disabled={actionLoading || botStatus?.isRunning}
            className="flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-green-500 to-emerald-500 
                       hover:from-green-600 hover:to-emerald-600 text-white p-6 rounded-xl 
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 
                       shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
          >
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <Power className="w-7 h-7" />
            </div>
            <span className="font-bold">Iniciar Bot</span>
          </button>

          {/* Detener Bot */}
          <button
            onClick={handleStopBot}
            disabled={actionLoading || !botStatus?.isRunning}
            className="flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-red-500 to-pink-500 
                       hover:from-red-600 hover:to-pink-600 text-white p-6 rounded-xl 
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 
                       shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
          >
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <Power className="w-7 h-7" />
            </div>
            <span className="font-bold">Detener Bot</span>
          </button>

          {/* Reiniciar Bot */}
          <button
            onClick={handleRestartBot}
            disabled={actionLoading || !botStatus?.isRunning}
            className="flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-blue-500 to-indigo-500 
                       hover:from-blue-600 hover:to-indigo-600 text-white p-6 rounded-xl 
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 
                       shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
          >
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <RefreshCw className="w-7 h-7" />
            </div>
            <span className="font-bold">Reiniciar Bot</span>
          </button>

          {/* Limpiar Sesión */}
          <button
            onClick={handleClearSession}
            disabled={actionLoading}
            className="flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-orange-500 to-red-500 
                       hover:from-orange-600 hover:to-red-600 text-white p-6 rounded-xl 
                       disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 
                       shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
          >
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <Trash2 className="w-7 h-7" />
            </div>
            <span className="font-bold">Limpiar Sesión</span>
          </button>
        </div>
      </div>

      {/* QR Code */}
      {qrCode && (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 animate-fadeIn">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg animate-pulse">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Código QR</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Escanea para conectar</p>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/30 dark:to-orange-900/30 rounded-2xl p-8 flex flex-col items-center border-2 border-yellow-200 dark:border-yellow-800">
            <p className="text-gray-700 dark:text-gray-300 mb-6 text-center font-medium">
              📱 Abre WhatsApp → Menú → Dispositivos Vinculados → Vincular Dispositivo
            </p>
            <div className="bg-white p-4 rounded-2xl shadow-2xl">
              <img 
                src={qrCode} 
                alt="QR Code" 
                className="w-64 h-64"
              />
            </div>
            <button
              onClick={loadQRCode}
              className="mt-6 flex items-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white 
                         rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 font-semibold"
            >
              <RefreshCw className="w-5 h-5" />
              <span>Actualizar QR</span>
            </button>
          </div>
        </div>
      )}

      {/* Instrucciones */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-xl font-bold text-blue-800 dark:text-blue-300">📱 Guía de Controles</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Power className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Iniciar Bot</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Activa el servicio y conecta con WhatsApp</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Power className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Detener Bot</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Pausa el bot temporalmente</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Reiniciar Bot</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Útil si hay problemas de conexión</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Limpiar Sesión</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Elimina sesión para escanear nuevo QR</p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={() => {
          if (confirmAction === 'stop') confirmarStopBot();
          else if (confirmAction === 'restart') confirmarRestartBot();
          else if (confirmAction === 'clear') confirmarClearSession();
        }}
        title={
          confirmAction === 'stop' ? '¿Detener el bot?' :
          confirmAction === 'restart' ? '¿Reiniciar el bot?' :
          '¿Limpiar sesión?'
        }
        message={
          confirmAction === 'stop' ? 'El bot dejará de responder mensajes hasta que lo inicies de nuevo.' :
          confirmAction === 'restart' ? 'El bot se reiniciará. Útil si hay problemas de conexión.' :
          'Esto eliminará la sesión actual y necesitarás escanear el QR de nuevo.'
        }
        confirmText={
          confirmAction === 'clear' ? 'Eliminar Sesión' : 'Confirmar'
        }
        type={confirmAction === 'clear' ? 'danger' : 'warning'}
      />
    </div>
  );
}