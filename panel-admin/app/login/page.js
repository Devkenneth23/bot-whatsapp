'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import Cookies from 'js-cookie';
import { Lock, User, Moon, Sun, Bot, Sparkles, Shield, AlertTriangle, Clock } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState(null);
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [showSecurityWarning, setShowSecurityWarning] = useState(false);
  const router = useRouter();

  // Temporizador para recargar cuando termine el bloqueo
  useEffect(() => {
    if (!blockedUntil) return;
    
    const timeRemaining = new Date(blockedUntil) - new Date();
    
    if (timeRemaining > 0) {
      const timer = setTimeout(() => {
        console.log('⏰ Bloqueo finalizado - Recargando página...');
        window.location.reload();
      }, timeRemaining);
      
      return () => clearTimeout(timer);
    }
  }, [blockedUntil]);

  useEffect(() => {
    // Verificar si hay bloqueo guardado en localStorage
    const blockInfo = localStorage.getItem('loginBlock');
    if (blockInfo) {
      const { until, attempts } = JSON.parse(blockInfo);
      if (new Date(until) > new Date()) {
        setBlocked(true);
        setBlockedUntil(until);
      } else {
        localStorage.removeItem('loginBlock');
      }
    }
  }, []);
  

  const validateInput = (input) => {
    // Detectar caracteres sospechosos
    const dangerousPatterns = [
      /[<>]/,  // XSS
      /['";]/,  // SQL injection
      /--|#/,   // SQL comments
      /union|select|insert|update|delete|drop/i  // SQL keywords
    ];
    
    for (let pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setShowSecurityWarning(false);

    // Verificar si está bloqueado
    if (blocked) {
      setError('Tu IP está bloqueada temporalmente por seguridad');
      return;
    }

    // Validar entrada contra inyecciones
    if (!validateInput(username) || !validateInput(password)) {
      setShowSecurityWarning(true);
      setError('Caracteres no permitidos detectados. Intento registrado.');
      console.warn('🚨 Intento de inyección detectado');
      return;
    }

    // Validar longitud
    if (username.length > 50 || password.length > 100) {
      setError('Credenciales exceden longitud máxima');
      return;
    }

    setLoading(true);

    try {
      const data = await login(username, password);
      
      // Login exitoso - limpiar intentos
      localStorage.removeItem('loginBlock');
      setRemainingAttempts(5);
      
      // Guardar token y usuario
      Cookies.set('token', data.token, { expires: 1 });
      Cookies.set('user', JSON.stringify(data.user), { expires: 1 });
      
      // Redirigir al dashboard
      router.push('/dashboard');
    } catch (err) {
      // Manejar respuesta de error del servidor
      const errorData = err.response?.data;
      
      // Si el servidor envía info de bloqueo
      if (errorData?.bloqueadoHasta) {
        setBlocked(true);
        setBlockedUntil(errorData.bloqueadoHasta);
        localStorage.setItem('loginBlock', JSON.stringify({
          until: errorData.bloqueadoHasta,
          attempts: 5
        }));
      }
      
      // Actualizar intentos restantes
      if (errorData?.remainingAttempts !== undefined) {
        setRemainingAttempts(errorData.remainingAttempts);
      } else {
        // Simulación local si el servidor no lo envía
        const newRemaining = Math.max(0, remainingAttempts - 1);
        setRemainingAttempts(newRemaining);
        
        if (newRemaining === 0) {
          const blockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          setBlocked(true);
          setBlockedUntil(blockUntil);
          localStorage.setItem('loginBlock', JSON.stringify({
            until: blockUntil,
            attempts: 5
          }));
        }
      }
      
      setError(errorData?.error || 'Error al iniciar sesión');
      
      // Mostrar advertencia si quedan pocos intentos
      if (remainingAttempts <= 2) {
        setShowSecurityWarning(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Calcular tiempo restante de bloqueo
  const getBlockTimeRemaining = () => {
    if (!blockedUntil) return '';
    const remaining = new Date(blockedUntil) - new Date();
    const minutes = Math.ceil(remaining / 60000);
    return `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden transition-colors duration-500
                      bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50
                      dark:from-gray-900 dark:via-blue-900 dark:to-indigo-900">
        
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-400 dark:bg-purple-600 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-30 animate-[blob_7s_infinite]"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-400 dark:bg-blue-600 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-30 animate-[blob_7s_infinite_2s]"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-400 dark:bg-pink-600 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-xl opacity-30 animate-[blob_7s_infinite_4s]"></div>
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="absolute top-6 right-6 p-3 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm
                     shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 z-10
                     border border-gray-200 dark:border-gray-700"
        >
          {darkMode ? (
            <Sun className="w-5 h-5 text-yellow-500" />
          ) : (
            <Moon className="w-5 h-5 text-indigo-600" />
          )}
        </button>

        {/* Login card */}
        <div className="max-w-md w-full mx-4 relative z-10">
          {/* Glassmorphism card */}
          <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl 
                          border border-gray-200/50 dark:border-gray-700/50 p-8 
                          transform transition-all duration-500 hover:scale-[1.02]">
            
            {/* Security badge */}
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                              bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-xs font-medium text-green-700 dark:text-green-300">
                  Conexión Segura
                </span>
              </div>
            </div>

            {/* Header with icon */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full 
                              bg-gradient-to-br from-blue-500 to-purple-600 mb-4 shadow-lg
                              animate-pulse">
                <Bot className="w-10 h-10 text-white" />
              </div>
              
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 
                             dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-2">
                Panel de Administración
              </h1>
              
              <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
                <Sparkles className="w-4 h-4" />
                <p className="text-sm">Bot WhatsApp Inteligente</p>
                <Sparkles className="w-4 h-4" />
              </div>
            </div>

            {/* Blocked warning */}
            {blocked && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                      Acceso Bloqueado
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                      Demasiados intentos fallidos. Intenta de nuevo en {getBlockTimeRemaining()}.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Security warning */}
            {showSecurityWarning && !blocked && (
              <div className="mb-6 p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                      Advertencia de Seguridad
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                      Quedan {remainingAttempts} intento{remainingAttempts !== 1 ? 's' : ''} antes del bloqueo temporal.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username field */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Usuario
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none
                                  transition-colors duration-200">
                    <User className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 
                                     dark:text-gray-500 dark:group-focus-within:text-blue-400" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={blocked}
                    maxLength={50}
                    className="block w-full pl-10 pr-3 py-3 
                               bg-gray-50 dark:bg-gray-800/50
                               border border-gray-300 dark:border-gray-600
                               text-gray-900 dark:text-gray-100
                               rounded-xl 
                               focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                               focus:border-transparent
                               transition-all duration-200
                               placeholder-gray-400 dark:placeholder-gray-500
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Ingresa tu usuario"
                    required
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Contraseña
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none
                                  transition-colors duration-200">
                    <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500
                                     dark:text-gray-500 dark:group-focus-within:text-blue-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={blocked}
                    maxLength={100}
                    className="block w-full pl-10 pr-3 py-3
                               bg-gray-50 dark:bg-gray-800/50
                               border border-gray-300 dark:border-gray-600
                               text-gray-900 dark:text-gray-100
                               rounded-xl
                               focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                               focus:border-transparent
                               transition-all duration-200
                               placeholder-gray-400 dark:placeholder-gray-500
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              {/* Attempts indicator */}
              {!blocked && remainingAttempts < 5 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Intentos restantes
                  </span>
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          i < remainingAttempts
                            ? 'bg-green-500'
                            : 'bg-red-500'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 
                                text-red-700 dark:text-red-400 px-4 py-3 rounded-xl">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading || blocked}
                className="w-full relative overflow-hidden
                           bg-gradient-to-r from-blue-600 to-purple-600 
                           hover:from-blue-700 hover:to-purple-700
                           dark:from-blue-500 dark:to-purple-500
                           dark:hover:from-blue-600 dark:hover:to-purple-600
                           text-white font-semibold py-3 px-4 rounded-xl
                           shadow-lg hover:shadow-xl
                           transition-all duration-300
                           disabled:opacity-50 disabled:cursor-not-allowed
                           group transform hover:scale-[1.02] active:scale-95"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Iniciando sesión...
                    </>
                  ) : blocked ? (
                    <>
                      <Clock className="w-4 h-4" />
                      Bloqueado temporalmente
                    </>
                  ) : (
                    <>
                      Iniciar Sesión
                      <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                    </>
                  )}
                </span>
                
                {/* Shine effect */}
                {!blocked && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
                                  translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="text-center text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p className="flex items-center justify-center gap-1">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Sistema activo y seguro
                </p>
                {/*<p className="text-gray-400 dark:text-gray-500">
                  Credenciales por defecto: <strong className="text-gray-600 dark:text-gray-300">admin</strong> / <strong className="text-gray-600 dark:text-gray-300">admin123</strong>
                </p>*/}
              </div>
            </div>
          </div>

          {/* Bottom decoration */}
          <div className="text-center mt-6 text-xs text-gray-500 dark:text-gray-400">
            <p>© 2024 Bot WhatsApp • Desarrollado por DEV-K</p>
          </div>
        </div>
      </div>
    </div>
  );
}