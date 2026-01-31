'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

export default function NotificationSystem() {
  const [notifiedCitas, setNotifiedCitas] = useState(new Set());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const audioRef = useRef(null);

  // Inicializar audio cuando el usuario interactúa
  const enableAudio = () => {
    const selectedSound = localStorage.getItem('notificationSound') || '1';
    const soundFile = `/notification${selectedSound}-sound.mp3`;
    
    const audio = new Audio(soundFile);
    audio.volume = 0.01; // Muy bajo para la prueba
    
    audio.play()
      .then(() => {
        console.log('✅ Audio habilitado');
        setAudioEnabled(true);
        setShowPermissionPrompt(false);
        localStorage.setItem('audioPermissionGranted', 'true');
        audio.pause(); // Pausar inmediatamente
      })
      .catch(err => {
        console.error('❌ Audio bloqueado:', err);
        setAudioEnabled(false);
      });
  };

  // Verificar si ya se dio permiso antes
  useEffect(() => {
    const permissionGranted = localStorage.getItem('audioPermissionGranted');
    if (permissionGranted === 'true') {
      setAudioEnabled(true);
    } else {
      // Mostrar prompt después de 2 segundos
      const timer = setTimeout(() => {
        setShowPermissionPrompt(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const playNotificationSound = () => {
    if (!audioEnabled) {
      console.log('⚠️ Audio no habilitado, solo mostrando notificación visual');
      return;
    }

    try {
      const selectedSound = localStorage.getItem('notificationSound') || '1';
      const soundFile = `/notification${selectedSound}-sound.mp3`;
      
      // Crear nueva instancia cada vez para evitar problemas
      const audio = new Audio(soundFile);
      audio.volume = 0.7;
      
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('🔊 Sonido reproducido correctamente');
          })
          .catch(err => {
            console.log('⚠️ No se pudo reproducir el sonido:', err.message);
            // Si falla, deshabilitar audio y mostrar prompt
            setAudioEnabled(false);
            localStorage.removeItem('audioPermissionGranted');
            setShowPermissionPrompt(true);
          });
      }
    } catch (error) {
      console.error('❌ Error en playNotificationSound:', error);
    }
  };

  useEffect(() => {
    const checkForNewCitas = async () => {
      try {
        console.log('🔍 Checking for new citas...');
        
        const token = document.cookie
          .split('; ')
          .find(row => row.startsWith('token='))
          ?.split('=')[1];

        if (!token) {
          console.log('⚠️ No token found');
          return;
        }

        const response = await fetch('http://localhost:3000/api/citas/nuevas', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        console.log('📡 Response status:', response.status);

        if (!response.ok) {
          console.error('❌ Error response:', response.status);
          return;
        }

        const data = await response.json();
        console.log('📦 Data received:', data);

        const nuevasCitas = data.nuevasCitas || [];
        
        if (nuevasCitas.length > 0) {
          console.log('🎉 NEW CITAS FOUND!', nuevasCitas.length);
          
          // Filtrar solo las que NO hemos notificado
          const citasNoNotificadas = nuevasCitas.filter(
            cita => !notifiedCitas.has(cita.id)
          );

          if (citasNoNotificadas.length > 0) {
            console.log('🆕 Citas no notificadas:', citasNoNotificadas.length);
            
            // Reproducir sonido una sola vez para todas las notificaciones
            playNotificationSound();

            // Mostrar notificación para cada cita nueva
            citasNoNotificadas.forEach(cita => {
              console.log('📢 Showing notification for cita:', cita.id);
              
              toast.custom(
                (t) => (
                  <div className={`${
                    t.visible ? 'animate-enter' : 'animate-leave'
                  } max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
                    <div className="flex-1 w-0 p-4">
                      <div className="flex items-start">
                        <div className="flex-shrink-0 pt-0.5">
                          <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                            <span className="text-2xl">📅</span>
                          </div>
                        </div>
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            Nueva Cita Agendada
                          </p>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {cita.cliente_nombre || 'Cliente'} - {cita.servicio_nombre}
                          </p>
                          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                            📅 {cita.fecha} • 🕐 {cita.hora}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex border-l border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => toast.dismiss(t.id)}
                        className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-green-600 dark:text-green-400 hover:text-green-500 focus:outline-none"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ),
                { duration: 8000 } // 8 segundos para que el usuario pueda leer
              );

              // Marcar como notificada
              setNotifiedCitas(prev => new Set([...prev, cita.id]));
            });
          } else {
            console.log('ℹ️ All citas already notified');
          }
        } else {
          console.log('📭 No new citas');
        }
      } catch (error) {
        console.error('❌ Error checking for new citas:', error);
      }
    };

    // Ejecutar inmediatamente al montar
    checkForNewCitas();

    // Luego cada 10 segundos
    const interval = setInterval(checkForNewCitas, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [notifiedCitas, audioEnabled]);

  return (
    <>
      {/* Prompt para habilitar audio */}
      {showPermissionPrompt && !audioEnabled && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-4 border-2 border-indigo-500 dark:border-indigo-400">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                  <span className="text-xl">🔔</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                  Habilitar Sonido de Notificaciones
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Permite que el sistema reproduzca sonido cuando lleguen nuevas citas
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={enableAudio}
                    className="flex-1 px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Habilitar
                  </button>
                  <button
                    onClick={() => {
                      setShowPermissionPrompt(false);
                      localStorage.setItem('audioPermissionDenied', 'true');
                    }}
                    className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs font-medium hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Ahora no
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de estado de audio */}
      {audioEnabled && (
        <div className="fixed bottom-4 left-4 z-40">
          <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 shadow-lg">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Notificaciones activas
          </div>
        </div>
      )}
    </>
  );
}
