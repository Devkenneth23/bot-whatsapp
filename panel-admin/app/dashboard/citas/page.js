'use client';

import { useEffect, useState } from 'react';
import { getCitas, updateCitaEstado, deleteCita } from '@/lib/api';
import { Calendar, Clock, User, Phone, Briefcase, DollarSign, CheckCircle, XCircle, Trash2 } from 'lucide-react';

export default function CitasPage() {
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todas');

  useEffect(() => {
    loadCitas();
  }, [filtro]);

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
    try {
      await updateCitaEstado(id, nuevoEstado);
      loadCitas();
    } catch (error) {
      alert('Error al cambiar estado');
    }
  };

  const handleEliminar = async (id) => {
    if (confirm('¿Estás seguro de eliminar esta cita?')) {
      try {
        await deleteCita(id);
        loadCitas();
      } catch (error) {
        alert('Error al eliminar cita');
      }
    }
  };

  const getEstadoBadge = (estado) => {
    const estilos = {
      confirmada: 'bg-blue-100 text-blue-800',
      completada: 'bg-green-100 text-green-800',
      cancelada: 'bg-red-100 text-red-800',
    };
    return estilos[estado] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Gestión de Citas</h1>
        <p className="text-gray-600 mt-2">Administra todas las citas agendadas</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex items-center space-x-4">
          <span className="font-semibold text-gray-700">Filtrar por:</span>
          <button
            onClick={() => setFiltro('todas')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filtro === 'todas'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Todas ({citas.length})
          </button>
          <button
            onClick={() => setFiltro('confirmada')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filtro === 'confirmada'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Confirmadas
          </button>
          <button
            onClick={() => setFiltro('completada')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filtro === 'completada'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Completadas
          </button>
          <button
            onClick={() => setFiltro('cancelada')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filtro === 'cancelada'
                ? 'bg-red-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Canceladas
          </button>
        </div>
      </div>

      {/* Lista de Citas */}
      <div className="space-y-4">
        {citas.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No hay citas {filtro !== 'todas' ? filtro + 's' : ''}</p>
          </div>
        ) : (
          citas.map((cita) => (
            <div
              key={cita.id}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${getEstadoBadge(
                        cita.estado
                      )}`}
                    >
                      {cita.estado.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-500">ID: #{cita.id}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-gray-700">
                        <User className="w-4 h-4" />
                        <span className="font-semibold">{cita.cliente_nombre || 'Sin nombre'}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-600">
                        <Phone className="w-4 h-4" />
                        <span>{cita.telefono}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-600">
                        <Briefcase className="w-4 h-4" />
                        <span>{cita.servicio_nombre}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>{cita.fecha}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>{cita.hora}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-600">
                        <DollarSign className="w-4 h-4" />
                        <span className="font-semibold">{cita.servicio_precio}</span>
                      </div>
                    </div>
                  </div>

                  {cita.notas && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600">
                        <strong>Notas:</strong> {cita.notas}
                      </p>
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="ml-4 flex flex-col space-y-2">
                  {cita.estado === 'confirmada' && (
                    <>
                      <button
                        onClick={() => handleCambiarEstado(cita.id, 'completada')}
                        className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Completar</span>
                      </button>
                      <button
                        onClick={() => handleCambiarEstado(cita.id, 'cancelada')}
                        className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Cancelar</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleEliminar(cita.id)}
                    className="flex items-center space-x-2 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
