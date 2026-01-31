'use client';

import { useEffect, useState } from 'react';
import { getCitas, updateCitaEstado, deleteCita } from '@/lib/api';
import { Calendar, Clock, User, Phone, Briefcase, DollarSign, CheckCircle, XCircle, Trash2, Filter, Search, Download, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '@/components/ConfirmModal';

export default function CitasPage() {
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [citaAEliminar, setCitaAEliminar] = useState(null);

  useEffect(() => {
    loadCitas();
  }, [filtro]);

  // Auto-refresh cada 10 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      loadCitas();
    }, 10000); // 10 segundos

    return () => clearInterval(interval);
  }, [filtro]); // Se reinicia si cambia el filtro

  const loadCitas = async () => {
    try {
      const params = filtro !== 'todas' ? { estado: filtro } : {};
      const data = await getCitas(params);
      setCitas(data);
    } catch (error) {
      console.error('Error cargando citas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCambiarEstado = async (id, nuevoEstado) => {
    const toastId = toast.loading('Actualizando estado...');
    
    try {
      await updateCitaEstado(id, nuevoEstado);
      toast.success('✅ Estado actualizado', { id: toastId });
      loadCitas();
    } catch (error) {
      toast.error('❌ Error al cambiar estado', { id: toastId });
    }
  };

  const handleEliminar = (id) => {
    setCitaAEliminar(id);
    setShowConfirmModal(true);
  };

  const confirmarEliminacion = async () => {
    const toastId = toast.loading('Eliminando cita...');
    
    try {
      await deleteCita(citaAEliminar);
      toast.success('🗑️ Cita eliminada', { id: toastId });
      loadCitas();
    } catch (error) {
      toast.error('❌ Error al eliminar', { id: toastId });
    }
  };

  const getEstadoBadge = (estado) => {
    const estilos = {
      confirmada: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      completada: 'bg-green-500/20 text-green-400 border-green-500/30',
      cancelada: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return estilos[estado] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getEstadoIcon = (estado) => {
    switch(estado) {
      case 'confirmada': return '📅';
      case 'completada': return '✅';
      case 'cancelada': return '❌';
      default: return '📋';
    }
  };

  const citasFiltradas = citas.filter(cita => 
    cita.cliente_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cita.telefono?.includes(searchTerm) ||
    cita.servicio_nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Función para exportar a CSV
  const exportarCSV = () => {
    // Encabezados del CSV
    let csv = 'ID,Cliente,Teléfono,Servicio,Fecha,Hora,Precio,Estado,Notas\n';
    
    // Agregar datos
    citasFiltradas.forEach(cita => {
      csv += `${cita.id},`;
      csv += `"${(cita.cliente_nombre || 'Sin nombre').replace(/"/g, '""')}",`;
      csv += `${cita.telefono || ''},`;
      csv += `"${cita.servicio_nombre.replace(/"/g, '""')}",`;
      csv += `${cita.fecha},`;
      csv += `${cita.hora},`;
      csv += `"${cita.servicio_precio}",`;
      csv += `${cita.estado},`;
      csv += `"${(cita.notas || '').replace(/"/g, '""')}"\n`;
    });
    
    // Crear blob y descargar
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fecha = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `citas-${filtro}-${fecha}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Contar por estado
  const contadores = {
    todas: citas.length,
    confirmada: citas.filter(c => c.estado === 'confirmada').length,
    completada: citas.filter(c => c.estado === 'completada').length,
    cancelada: citas.filter(c => c.estado === 'cancelada').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
          <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Calendar className="w-10 h-10" />
              Gestión de Citas
            </h1>
            <p className="text-blue-100 dark:text-blue-200">
              Administra y da seguimiento a todas las citas agendadas
            </p>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold">{citas.length}</div>
              <div className="text-sm text-blue-100">Total de citas</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Filtros */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Filtrar por estado</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFiltro('todas')}
              className={`p-3 rounded-xl transition-all duration-300 ${
                filtro === 'todas'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Todas</div>
              <div className="text-xl font-bold">{contadores.todas}</div>
            </button>
            <button
              onClick={() => setFiltro('confirmada')}
              className={`p-3 rounded-xl transition-all duration-300 ${
                filtro === 'confirmada'
                  ? 'bg-blue-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Confirmadas</div>
              <div className="text-xl font-bold">{contadores.confirmada}</div>
            </button>
            <button
              onClick={() => setFiltro('completada')}
              className={`p-3 rounded-xl transition-all duration-300 ${
                filtro === 'completada'
                  ? 'bg-green-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Completadas</div>
              <div className="text-xl font-bold">{contadores.completada}</div>
            </button>
            <button
              onClick={() => setFiltro('cancelada')}
              className={`p-3 rounded-xl transition-all duration-300 ${
                filtro === 'cancelada'
                  ? 'bg-red-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Canceladas</div>
              <div className="text-xl font-bold">{contadores.cancelada}</div>
            </button>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Buscar citas</h3>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, teléfono o servicio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 rounded-xl
                         text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                         focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent
                         transition-all duration-200"
            />
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>Resultados: {citasFiltradas.length}</span>
            <button 
              onClick={exportarCSV}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Citas */}
      <div className="space-y-4">
        {citasFiltradas.length === 0 ? (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-12 text-center">
            <Calendar className="w-20 h-20 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
              No hay citas {filtro !== 'todas' ? filtro + 's' : ''}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchTerm ? 'Intenta con otro término de búsqueda' : 'Las citas aparecerán aquí cuando sean agendadas'}
            </p>
          </div>
        ) : (
          citasFiltradas.map((cita, index) => (
            <div
              key={cita.id}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 
                         hover:shadow-2xl hover:scale-[1.01] transition-all duration-300"
            >
              <div className="flex flex-col lg:flex-row items-start justify-between gap-6">
                <div className="flex-1 w-full">
                  {/* Header de la cita */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getEstadoIcon(cita.estado)}</span>
                      <span className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${getEstadoBadge(cita.estado)}`}>
                        {cita.estado.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      ID: #{String(cita.id).padStart(4, '0')}
                    </span>
                  </div>

                  {/* Información de la cita */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                          <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Cliente</div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">
                            {cita.cliente_nombre || 'Sin nombre'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                          <Phone className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Teléfono</div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{cita.telefono}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                          <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Servicio</div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{cita.servicio_nombre}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                          <Calendar className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Fecha</div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{cita.fecha}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                        <div className="w-10 h-10 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center">
                          <Clock className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Hora</div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{cita.hora}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center">
                          <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <div className="text-xs text-green-600 dark:text-green-400">Precio</div>
                          <div className="font-bold text-lg text-green-700 dark:text-green-300">{cita.servicio_precio}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notas */}
                  {cita.notas && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                      <div className="flex items-start gap-2">
                        <span className="text-lg">📝</span>
                        <div>
                          <div className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-1">Notas</div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{cita.notas}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex lg:flex-col gap-2 w-full lg:w-auto">
                  {/* Botones para citas PENDIENTES */}
                  {cita.estado === 'pendiente' && (
                    <>
                      <button
                        onClick={() => handleCambiarEstado(cita.id, 'confirmada')}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 
                                   bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700
                                   text-white rounded-xl shadow-lg hover:shadow-xl
                                   transition-all duration-300 transform hover:scale-105 font-medium"
                      >
                        <Check className="w-5 h-5" />
                        <span className="whitespace-nowrap">Confirmar</span>
                      </button>
                      <button
                        onClick={() => handleCambiarEstado(cita.id, 'cancelada')}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 
                                   bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700
                                   text-white rounded-xl shadow-lg hover:shadow-xl
                                   transition-all duration-300 transform hover:scale-105 font-medium"
                      >
                        <XCircle className="w-5 h-5" />
                        <span className="whitespace-nowrap">Cancelar</span>
                      </button>
                    </>
                  )}
                  
                  {/* Botones para citas CONFIRMADAS */}
                  {cita.estado === 'confirmada' && (
                    <>
                      <button
                        onClick={() => handleCambiarEstado(cita.id, 'completada')}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 
                                   bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700
                                   text-white rounded-xl shadow-lg hover:shadow-xl
                                   transition-all duration-300 transform hover:scale-105 font-medium"
                      >
                        <CheckCircle className="w-5 h-5" />
                        <span className="whitespace-nowrap">Completar</span>
                      </button>
                      <button
                        onClick={() => handleCambiarEstado(cita.id, 'cancelada')}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 
                                   bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700
                                   text-white rounded-xl shadow-lg hover:shadow-xl
                                   transition-all duration-300 transform hover:scale-105 font-medium"
                      >
                        <XCircle className="w-5 h-5" />
                        <span className="whitespace-nowrap">Cancelar</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleEliminar(cita.id)}
                    className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 
                               bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                               text-gray-700 dark:text-gray-300 rounded-xl shadow-md hover:shadow-lg
                               transition-all duration-300 transform hover:scale-105 font-medium"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span className="whitespace-nowrap">Eliminar</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmarEliminacion}
        title="¿Eliminar cita?"
        message="Esta acción eliminará la cita permanentemente."
        confirmText="Eliminar"
        type="danger"
      />
    </div>
  );
}