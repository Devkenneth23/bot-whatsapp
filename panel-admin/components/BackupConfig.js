'use client';

import { useState, useEffect } from 'react';
import { Database, Calendar, Download, Play, Square, RefreshCw, Check, Clock, HardDrive, Cloud, Mail, Link as LinkIcon, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Cookies from 'js-cookie';

export default function BackupConfig() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  
  // Estados para Google Drive
  const [driveStatus, setDriveStatus] = useState(null);
  const [driveEmail, setDriveEmail] = useState('');
  const [driveEnabled, setDriveEnabled] = useState(false);
  const [connectingDrive, setConnectingDrive] = useState(false);

  useEffect(() => {
    loadStatus();
    loadDriveStatus();
    
    // Verificar si volvió de autorización de Google Drive
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('drive_connected') === 'true') {
      toast.success('✅ Google Drive conectado exitosamente');
      // Limpiar URL
      window.history.replaceState({}, document.title, window.location.pathname);
      loadDriveStatus();
    } else if (urlParams.get('error')) {
      toast.error('❌ Error conectando Google Drive');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const loadStatus = async () => {
    try {
      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/backup/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error cargando estado:', error);
      toast.error('Error al cargar estado de backups');
    } finally {
      setLoading(false);
    }
  };

  const loadDriveStatus = async () => {
    try {
      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/google-drive/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setDriveStatus(data);
        setDriveEnabled(data.configured || false);
        setDriveEmail(data.email || '');
      }
    } catch (error) {
      console.error('Error cargando estado de Drive:', error);
    }
  };

  const handleConnectDrive = async () => {
    if (!driveEmail || !driveEmail.includes('@')) {
      toast.error('Por favor ingresa un email válido');
      return;
    }

    setConnectingDrive(true);
    const toastId = toast.loading('Conectando con Google Drive...');

    try {
      const token = Cookies.get('token');
      
      // 1. Guardar configuración
      await fetch('http://localhost:3000/api/google-drive/config', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled: true, email: driveEmail })
      });

      // 2. Obtener URL de autorización
      const authResponse = await fetch('http://localhost:3000/api/google-drive/auth-url', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (authResponse.ok) {
        const { authUrl } = await authResponse.json();
        
        toast.success('Redirigiendo a Google...', { id: toastId });
        
        // 3. Abrir ventana de autorización
        window.location.href = authUrl;
      } else {
        throw new Error('Error obteniendo URL de autorización');
      }
    } catch (error) {
      toast.error('Error conectando con Google Drive', { id: toastId });
      setConnectingDrive(false);
    }
  };

  const handleDisconnectDrive = async () => {
    const toastId = toast.loading('Desconectando Google Drive...');

    try {
      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/google-drive/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Google Drive desconectado', { id: toastId });
        setDriveStatus({ configured: false, connected: false, email: null });
        setDriveEnabled(false);
        setDriveEmail('');
        loadDriveStatus();
      } else {
        throw new Error('Error');
      }
    } catch (error) {
      toast.error('Error desconectando Drive', { id: toastId });
    }
  };

  const handleToggleDrive = async (enabled) => {
    try {
      const token = Cookies.get('token');
      await fetch('http://localhost:3000/api/google-drive/config', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled, email: driveEmail })
      });

      setDriveEnabled(enabled);
      toast.success(enabled ? 'Backups a Drive habilitados' : 'Backups a Drive deshabilitados');
      loadDriveStatus();
    } catch (error) {
      toast.error('Error actualizando configuración');
    }
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    const toastId = toast.loading('Creando backup...');

    try {
      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/backup/create', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`✅ Backup creado: ${data.backup.sizeMB} MB`, { id: toastId });
        loadStatus();
      } else {
        throw new Error('Error al crear backup');
      }
    } catch (error) {
      toast.error('❌ Error al crear backup', { id: toastId });
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadBackup = async (filename) => {
    try {
      const token = Cookies.get('token');
      window.location.href = `http://localhost:3000/api/backup/download/${filename}?token=${token}`;
      toast.success('Descargando backup...');
    } catch (error) {
      toast.error('Error al descargar backup');
    }
  };

  const handleToggleService = async (start) => {
    const toastId = toast.loading(start ? 'Iniciando...' : 'Deteniendo...');

    try {
      const token = Cookies.get('token');
      const response = await fetch(`http://localhost:3000/api/backup/${start ? 'start' : 'stop'}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success(start ? '✅ Servicio iniciado' : '✅ Servicio detenido', { id: toastId });
        loadStatus();
      } else {
        throw new Error('Error');
      }
    } catch (error) {
      toast.error('❌ Error', { id: toastId });
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-CR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Backups Automáticos
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sistema de respaldo programado
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              status?.running
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}>
              {status?.running ? (
                <><Check className="w-4 h-4" /> Activo</>
              ) : (
                <><Square className="w-4 h-4" /> Inactivo</>
              )}
            </span>
          </div>
        </div>

        {/* Info del Servicio */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <div>
                <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  Programación
                </div>
                <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                  {status?.schedule || 'No configurado'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <HardDrive className="w-8 h-8 text-green-600 dark:text-green-400" />
              <div>
                <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                  Total Backups
                </div>
                <div className="text-lg font-bold text-green-700 dark:text-green-300">
                  {status?.totalBackups || 0}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              <div>
                <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">
                  Último Backup
                </div>
                <div className="text-sm font-bold text-purple-700 dark:text-purple-300">
                  {status?.lastBackup ? formatDate(status.lastBackup.created) : 'Nunca'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Controles */}
        <div className="flex gap-3">
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {creating ? 'Creando...' : 'Crear Backup Ahora'}
          </button>

          <button
            onClick={loadStatus}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>

          {status?.running ? (
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
        </div>
      </div>

      {/* Lista de Backups */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border-2 border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Backups Disponibles
        </h3>

        {status?.backups && status.backups.length > 0 ? (
          <div className="space-y-2">
            {status.backups.map((backup, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {backup.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(backup.created)} • {backup.sizeMB} MB
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadBackup(backup.name)}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                >
                  <Download className="w-4 h-4" />
                  Descargar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No hay backups disponibles. Crea uno ahora.
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>💡 Información:</strong> Los backups se crean automáticamente cada sábado a las 12:00 AM.
          Se mantienen los últimos 4 backups (aproximadamente 1 mes). Puedes crear backups manuales en cualquier momento.
        </p>
      </div>

      {/* Google Drive Integration */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border-2 border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-6">
          <Cloud className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Google Drive
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sube backups automáticamente a tu Google Drive
            </p>
          </div>
        </div>

        {/* Estado de conexión */}
        {driveStatus?.connected ? (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                <div>
                  <div className="text-sm font-medium text-green-800 dark:text-green-300">
                    Conectado a Google Drive
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400">
                    {driveStatus.email}
                  </div>
                </div>
              </div>
              <button
                onClick={handleDisconnectDrive}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
              >
                Desconectar
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                📧 Email de Google Drive
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={driveEmail}
                  onChange={(e) => setDriveEmail(e.target.value)}
                  placeholder="tucorreo@gmail.com"
                  className="flex-1 px-4 py-2 bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleConnectDrive}
                  disabled={connectingDrive || !driveEmail}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LinkIcon className="w-4 h-4" />
                  {connectingDrive ? 'Conectando...' : 'Conectar'}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Se abrirá una ventana para autorizar el acceso a tu Google Drive
              </p>
            </div>
          </div>
        )}

        {/* Toggle de backup automático a Drive */}
        {driveStatus?.connected && (
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                Subir backups automáticamente
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Los backups se subirán a tu Google Drive cada sábado
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={driveEnabled}
                onChange={(e) => handleToggleDrive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        )}

        {/* Info sobre Drive */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-800 dark:text-blue-300">
            <strong>🔐 Seguridad:</strong> Tus backups se guardan en TU Google Drive personal. 
            Solo tú tienes acceso a ellos. Se mantienen los últimos 4 backups automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
