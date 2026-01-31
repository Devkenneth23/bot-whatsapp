'use client';

import { useState, useEffect } from 'react';
import { Bell, Clock, MessageSquare, Play, Square, RefreshCw, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Cookies from 'js-cookie';

export default function RecordatoriosConfig() {
  const [config, setConfig] = useState({
    enabled: true,
    horasAntes: 24,
    mensaje: '',
    enviarSegundoRecordatorio: false,
    horasAntesSegundo: 2,
    mensajeSegundo: ''
  });
  
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/recordatorios/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setStats(data);
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const toastId = toast.loading('Guardando configuración...');

    try {
      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/recordatorios/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        toast.success('✅ Configuración guardada', { id: toastId });
        loadConfig();
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast.error('❌ Error al guardar', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleService = async (start) => {
    const toastId = toast.loading(start ? 'Iniciando servicio...' : 'Deteniendo servicio...');

    try {
      const token = Cookies.get('token');
      const response = await fetch(`http://localhost:3000/api/recordatorios/${start ? 'start' : 'stop'}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success(start ? '✅ Servicio iniciado' : '✅ Servicio detenido', { id: toastId });
        loadConfig();
      } else {
        throw new Error('Error');
      }
    } catch (error) {
      toast.error('❌ Error', { id: toastId });
    }
  };

  const handleCheckNow = async () => {
    const toastId = toast.loading('Verificando citas...');

    try {
      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/recordatorios/check-now', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('✅ Verificación completada', { id: toastId });
        loadConfig();
      } else {
        throw new Error('Error');
      }
    } catch (error) {
      toast.error('❌ Error', { id: toastId });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estado del Servicio */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border-2 border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Estado del Servicio
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Recordatorios automáticos de WhatsApp
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              stats?.isRunning 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}>
              {stats?.isRunning ? (
                <><Check className="w-4 h-4" /> Activo</>
              ) : (
                <><X className="w-4 h-4" /> Inactivo</>
              )}
            </span>
          </div>
        </div>

        {/* Estadísticas */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                {stats.total_citas || 0}
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-300">
                Citas futuras
              </div>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {stats.recordatorios_enviados || 0}
              </div>
              <div className="text-sm text-green-600 dark:text-green-300">
                Recordatorios enviados
              </div>
            </div>
            
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                {stats.segundos_recordatorios || 0}
              </div>
              <div className="text-sm text-purple-600 dark:text-purple-300">
                Segundos recordatorios
              </div>
            </div>
          </div>
        )}

        {/* Controles */}
        <div className="flex gap-3">
          {stats?.isRunning ? (
            <button
              onClick={() => handleToggleService(false)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <Square className="w-4 h-4" />
              Detener Servicio
            </button>
          ) : (
            <button
              onClick={() => handleToggleService(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Play className="w-4 h-4" />
              Iniciar Servicio
            </button>
          )}
          
          <button
            onClick={handleCheckNow}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <RefreshCw className="w-4 h-4" />
            Verificar Ahora
          </button>
        </div>
      </div>

      {/* Configuración */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border-2 border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Configuración de Recordatorios
        </h3>

        <div className="space-y-6">
          {/* Habilitar/Deshabilitar */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Habilitar recordatorios automáticos
            </span>
          </label>

          {/* Primer Recordatorio */}
          <div className="border-t pt-6 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h4 className="font-semibold text-gray-900 dark:text-white">
                Primer Recordatorio
              </h4>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Enviar recordatorio (horas antes de la cita)
                </label>
                <select
                  value={config.horasAntes}
                  onChange={(e) => setConfig({ ...config, horasAntes: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                >
                  <option value="1">1 hora antes</option>
                  <option value="2">2 horas antes</option>
                  <option value="6">6 horas antes</option>
                  <option value="12">12 horas antes</option>
                  <option value="24">24 horas antes (1 día)</option>
                  <option value="48">48 horas antes (2 días)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mensaje del recordatorio
                </label>
                <textarea
                  value={config.mensaje}
                  onChange={(e) => setConfig({ ...config, mensaje: e.target.value })}
                  rows="5"
                  className="w-full px-4 py-2 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                  placeholder="Usa {cliente}, {hora}, {servicio}, {fecha}"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Variables disponibles: {'{cliente}'}, {'{hora}'}, {'{servicio}'}, {'{fecha}'}
                </p>
              </div>
            </div>
          </div>

          {/* Segundo Recordatorio */}
          <div className="border-t pt-6 dark:border-gray-700">
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enviarSegundoRecordatorio}
                onChange={(e) => setConfig({ ...config, enviarSegundoRecordatorio: e.target.checked })}
                className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  Segundo Recordatorio
                </h4>
              </div>
            </label>

            {config.enviarSegundoRecordatorio && (
              <div className="space-y-4 ml-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Enviar segundo recordatorio (horas antes)
                  </label>
                  <select
                    value={config.horasAntesSegundo}
                    onChange={(e) => setConfig({ ...config, horasAntesSegundo: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="1">1 hora antes</option>
                    <option value="2">2 horas antes</option>
                    <option value="3">3 horas antes</option>
                    <option value="6">6 horas antes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Mensaje del segundo recordatorio
                  </label>
                  <textarea
                    value={config.mensajeSegundo}
                    onChange={(e) => setConfig({ ...config, mensajeSegundo: e.target.value })}
                    rows="4"
                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                    placeholder="Usa {cliente}, {hora}, {servicio}, {fecha}"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Botón Guardar */}
          <div className="border-t pt-6 dark:border-gray-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <Check className="w-5 h-5" />
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
