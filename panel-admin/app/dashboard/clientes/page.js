'use client';

import { useEffect, useState } from 'react';
import { getClientes, getClienteConversaciones, deleteCliente } from '@/lib/api';
import { Users, MessageSquare, Calendar, Phone, X, Search, Download, Mail, Clock, TrendingUp, Filter, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '@/components/ConfirmModal';

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [conversaciones, setConversaciones] = useState([]);
  const [loadingConversaciones, setLoadingConversaciones] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [clienteAEliminar, setClienteAEliminar] = useState(null);

  useEffect(() => {
    loadClientes();
  }, []);

  const loadClientes = async () => {
    try {
      const data = await getClientes();
      setClientes(data);
    } catch (error) {
      console.error('Error cargando clientes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerConversaciones = async (cliente) => {
    setClienteSeleccionado(cliente);
    setShowModal(true);
    setLoadingConversaciones(true);
    
    try {
      const data = await getClienteConversaciones(cliente.id);
      setConversaciones(data);
    } catch (error) {
      console.error('Error cargando conversaciones:', error);
    } finally {
      setLoadingConversaciones(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setClienteSeleccionado(null);
    setConversaciones([]);
  };

  // Eliminar cliente
  const handleEliminarCliente = (clienteId, clienteNombre) => {
    setClienteAEliminar({ id: clienteId, nombre: clienteNombre });
    setShowConfirmModal(true);
  };

  const confirmarEliminacion = async () => {
    const toastId = toast.loading('Eliminando cliente...');
    
    try {
      await deleteCliente(clienteAEliminar.id);
      setClientes(clientes.filter(c => c.id !== clienteAEliminar.id));
      toast.success('🗑️ Cliente eliminado correctamente', { id: toastId });
    } catch (error) {
      console.error('Error eliminando cliente:', error);
      toast.error('❌ Error al eliminar cliente', { id: toastId });
    }
  };

  // Filtrar clientes
  const clientesFiltrados = clientes
    .filter(cliente => {
      const matchSearch = 
        cliente.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cliente.telefono?.includes(searchTerm) ||
        cliente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cliente.whatsapp_id?.includes(searchTerm);
      
      const matchFiltro = 
        filtro === 'todos' ||
        (filtro === 'con-citas' && cliente.total_citas > 0) ||
        (filtro === 'activos' && cliente.total_mensajes > 0) ||
        (filtro === 'nuevos' && cliente.total_mensajes === 0);
      
      return matchSearch && matchFiltro;
    });

  // Exportar a CSV
  const exportarCSV = () => {
    let csv = 'ID,Nombre,Teléfono,Email,WhatsApp,Total Mensajes,Total Citas,Última Interacción\n';
    
    clientesFiltrados.forEach(cliente => {
      csv += `${cliente.id},`;
      csv += `"${(cliente.nombre || 'Sin nombre').replace(/"/g, '""')}",`;
      csv += `${cliente.telefono || ''},`;
      csv += `"${(cliente.email || '').replace(/"/g, '""')}",`;
      csv += `${cliente.whatsapp_id.replace('@c.us', '').replace('@lid', '')},`;
      csv += `${cliente.total_mensajes || 0},`;
      csv += `${cliente.total_citas || 0},`;
      csv += `"${cliente.ultima_interaccion || 'Nunca'}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fecha = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `clientes-${fecha}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Estadísticas
  const stats = {
    total: clientes.length,
    conMensajes: clientes.filter(c => c.total_mensajes > 0).length,
    conCitas: clientes.filter(c => c.total_citas > 0).length,
    totalMensajes: clientes.reduce((sum, c) => sum + (c.total_mensajes || 0), 0)
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
          <Users className="w-6 h-6 text-blue-600 dark:text-blue-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-500 dark:to-pink-500 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Users className="w-10 h-10" />
              Clientes
            </h1>
            <p className="text-purple-100 dark:text-purple-200">
              Gestiona y analiza todos tus clientes
            </p>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="text-sm text-purple-100">Total de clientes</div>
            </div>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Clientes</p>
              <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">{stats.total}</p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Users className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Con Mensajes</p>
              <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">{stats.conMensajes}</p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
              <MessageSquare className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Con Citas</p>
              <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">{stats.conCitas}</p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Calendar className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Mensajes</p>
              <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">{stats.totalMensajes}</p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
              <TrendingUp className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Búsqueda */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Buscar clientes</h3>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 rounded-xl
                         text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                         focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent
                         transition-all duration-200"
            />
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>Resultados: {clientesFiltrados.length}</span>
            <button 
              onClick={exportarCSV}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Filtrar por estado</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFiltro('todos')}
              className={`p-3 rounded-xl transition-all duration-300 ${
                filtro === 'todos'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Todos</div>
              <div className="text-xl font-bold">{stats.total}</div>
            </button>
            <button
              onClick={() => setFiltro('con-citas')}
              className={`p-3 rounded-xl transition-all duration-300 ${
                filtro === 'con-citas'
                  ? 'bg-purple-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Con Citas</div>
              <div className="text-xl font-bold">{stats.conCitas}</div>
            </button>
            <button
              onClick={() => setFiltro('activos')}
              className={`p-3 rounded-xl transition-all duration-300 ${
                filtro === 'activos'
                  ? 'bg-green-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Activos</div>
              <div className="text-xl font-bold">{stats.conMensajes}</div>
            </button>
            <button
              onClick={() => setFiltro('nuevos')}
              className={`p-3 rounded-xl transition-all duration-300 ${
                filtro === 'nuevos'
                  ? 'bg-orange-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-sm font-medium">Nuevos</div>
              <div className="text-xl font-bold">{clientes.filter(c => c.total_mensajes === 0).length}</div>
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Clientes */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        {clientesFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-20 h-20 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
              No hay clientes {filtro !== 'todos' ? `(${filtro})` : ''}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchTerm ? 'Intenta con otro término de búsqueda' : 'Los clientes aparecerán cuando interactúen con el bot'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-6">
            {clientesFiltrados.map((cliente) => (
              <div
                key={cliente.id}
                className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 hover:shadow-lg hover:scale-[1.01] transition-all duration-300 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  {/* Info del cliente */}
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                      <span className="text-white font-bold text-xl">
                        {cliente.nombre?.charAt(0)?.toUpperCase() || '👤'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                        {cliente.nombre || 'Sin nombre'}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          <span>{cliente.telefono || cliente.whatsapp_id.replace('@c.us', '').replace('@lid', '')}</span>
                        </div>
                        {cliente.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            <span>{cliente.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Estadísticas */}
                  <div className="flex items-center gap-4">
                    <div className="text-center px-4 py-2 bg-green-50 dark:bg-green-900/30 rounded-lg">
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <MessageSquare className="w-4 h-4" />
                        <span className="font-bold">{cliente.total_mensajes || 0}</span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">mensajes</div>
                    </div>
                    <div className="text-center px-4 py-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                      <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                        <Calendar className="w-4 h-4" />
                        <span className="font-bold">{cliente.total_citas || 0}</span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">citas</div>
                    </div>
                  </div>

                  {/* Última interacción y acciones */}
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>
                        {cliente.ultima_interaccion
                          ? new Date(cliente.ultima_interaccion).toLocaleDateString('es-CR')
                          : 'Nunca'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleVerConversaciones(cliente)}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700
                                   text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 font-medium text-sm"
                      >
                        Ver Conversaciones
                      </button>
                      <button
                        onClick={() => handleEliminarCliente(cliente.id, cliente.nombre)}
                        className="px-3 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50
                                   text-red-600 dark:text-red-400 rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
                        title="Eliminar cliente"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Conversaciones */}
      {showModal && clienteSeleccionado && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-pink-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <MessageSquare className="w-6 h-6" />
                    Conversaciones
                  </h2>
                  <p className="text-purple-100 text-sm mt-1">
                    {clienteSeleccionado.nombre || 'Cliente'} • {clienteSeleccionado.telefono || clienteSeleccionado.whatsapp_id.replace('@c.us', '').replace('@lid', '')}
                  </p>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Conversaciones */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-800">
              {loadingConversaciones ? (
                <div className="flex items-center justify-center h-64">
                  <div className="w-12 h-12 border-4 border-purple-200 dark:border-purple-900 border-t-purple-600 dark:border-t-purple-400 rounded-full animate-spin"></div>
                </div>
              ) : conversaciones.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No hay conversaciones registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {conversaciones.map((conv) => (
                    <div
                      key={conv.id}
                      className={`flex ${conv.tipo === 'entrante' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl p-4 shadow-md ${
                          conv.tipo === 'entrante'
                            ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                            : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{conv.mensaje}</p>
                        <p className={`text-xs mt-2 ${conv.tipo === 'entrante' ? 'text-gray-500 dark:text-gray-400' : 'text-purple-100'}`}>
                          {new Date(conv.created_at).toLocaleString('es-CR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <button
                onClick={handleCloseModal}
                className="w-full px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmarEliminacion}
        title="¿Eliminar cliente?"
        message={`Se eliminará a ${clienteAEliminar?.nombre || 'este cliente'} y todas sus conversaciones y citas. Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        type="danger"
      />
    </div>
  );
}