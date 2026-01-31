'use client';

import { useEffect, useState } from 'react';
import { getServicios, createServicio, updateServicio, deleteServicio } from '@/lib/api';
import { Briefcase, Plus, Edit, Trash2, DollarSign, X, Upload, Image as ImageIcon, Search, Filter, Tag } from 'lucide-react';
import toast from 'react-hot-toast';

import ConfirmModal from '@/components/ConfirmModal';

export default function ServiciosPage() {
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [imagenPreview, setImagenPreview] = useState(null);
  const [archivoImagen, setArchivoImagen] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [servicioAEliminar, setServicioAEliminar] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '',
    precio: '',
    precioValor: '',
    moneda: '₡',
    descripcion: '',
    imagenUrl: '',
  });

  useEffect(() => {
    loadServicios();
  }, []);

  const loadServicios = async () => {
    try {
      const data = await getServicios();
      setServicios(data);
    } catch (error) {
      console.error('Error cargando servicios:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (servicio = null) => {
    if (servicio) {
      setEditando(servicio);
      setFormData({
        nombre: servicio.nombre,
        precio: servicio.precio,
        precioValor: servicio.precio?.replace(/[₡$,]/g, '') || '',
        moneda: servicio.precio?.charAt(0) || '₡',
        descripcion: servicio.descripcion,
        imagenUrl: servicio.imagen || '',
      });
      setImagenPreview(servicio.imagen ? `http://localhost:3000${servicio.imagen}` : null);
    } else {
      setEditando(null);
      setFormData({
        nombre: '',
        precio: '',
        precioValor: '',
        moneda: '₡',
        descripcion: '',
        imagenUrl: '',
      });
      setImagenPreview(null);
    }
    setArchivoImagen(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditando(null);
    setFormData({
      nombre: '',
      precio: '',
      precioValor: '',
      moneda: '₡',
      descripcion: '',
      imagenUrl: '',
    });
    setImagenPreview(null);
    setArchivoImagen(null);
  };

  const handleImagenChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La imagen no debe superar 5MB', {
          icon: '📏',
          duration: 4000,
        });
        return;
      }

      if (!file.type.startsWith('image/')) {
        toast.error('Solo se permiten imágenes', {
          icon: '🖼️',
        });
        return;
      }

      setArchivoImagen(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagenPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const toastId = toast.loading(editando ? 'Actualizando servicio...' : 'Creando servicio...');

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('nombre', formData.nombre);
      formDataToSend.append('precio', formData.precio);
      formDataToSend.append('descripcion', formData.descripcion);
      
      if (archivoImagen) {
        formDataToSend.append('imagen', archivoImagen);
      } else if (formData.imagenUrl) {
        formDataToSend.append('imagenUrl', formData.imagenUrl);
      }

      if (editando) {
        await updateServicio(editando.id, formDataToSend);
        toast.success('✅ Servicio actualizado correctamente', { id: toastId });
      } else {
        await createServicio(formDataToSend);
        toast.success('✅ Servicio creado correctamente', { id: toastId });
      }
      
      loadServicios();
      handleCloseModal();
    } catch (error) {
      console.error('Error guardando servicio:', error);
      toast.error('❌ Error al guardar servicio', { id: toastId });
    }
  };

  const handleDelete = async (id) => {
    setServicioAEliminar(id);
    setShowConfirmModal(true);
  };

  const confirmarEliminacion = async () => {
    const toastId = toast.loading('Eliminando servicio...');
    
    try {
      await deleteServicio(servicioAEliminar);
      toast.success('🗑️ Servicio eliminado correctamente', { id: toastId });
      loadServicios();
    } catch (error) {
      toast.error('❌ Error al eliminar servicio', { id: toastId });
    }
  };

  // Filtrar servicios
  const serviciosFiltrados = servicios.filter(servicio =>
    servicio.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    servicio.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    servicio.precio?.includes(searchTerm)
  );

  // Estadísticas
  const precioPromedio = servicios.length > 0
    ? servicios.reduce((sum, s) => sum + parseFloat(s.precio?.replace(/[₡$,]/g, '') || 0), 0) / servicios.length
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
          <Briefcase className="w-6 h-6 text-blue-600 dark:text-blue-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Briefcase className="w-10 h-10" />
              Servicios
            </h1>
            <p className="text-blue-100 dark:text-blue-200">
              Gestiona todos los servicios que ofreces
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-xl hover:bg-blue-50
                       shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 font-semibold"
          >
            <Plus className="w-5 h-5" />
            <span>Nuevo Servicio</span>
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Servicios</p>
              <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">{servicios.length}</p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Briefcase className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Precio Promedio</p>
              <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">
                ₡{Math.round(precioPromedio).toLocaleString('es-CR')}
              </p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
              <DollarSign className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Con Imagen</p>
              <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">
                {servicios.filter(s => s.imagen).length}
              </p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <ImageIcon className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Buscar servicios</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, descripción o precio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 rounded-xl
                       text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                       focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent
                       transition-all duration-200"
          />
        </div>
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          Resultados: {serviciosFiltrados.length}
        </div>
      </div>

      {/* Grid de Servicios */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {serviciosFiltrados.length === 0 ? (
          <div className="col-span-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-12 text-center">
            <Briefcase className="w-20 h-20 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
              {searchTerm ? 'No se encontraron servicios' : 'No hay servicios registrados'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {searchTerm ? 'Intenta con otro término de búsqueda' : 'Comienza creando tu primer servicio'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => handleOpenModal()}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl
                           shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 font-semibold"
              >
                Crear primer servicio
              </button>
            )}
          </div>
        ) : (
          serviciosFiltrados.map((servicio) => (
            <div
              key={servicio.id}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50
                         hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 overflow-hidden group"
            >
              {/* Imagen */}
              <div className="relative h-48 bg-gradient-to-br from-blue-400 to-indigo-500 overflow-hidden">
                {servicio.imagen ? (
                  <img
                    src={`http://localhost:3000${servicio.imagen}`}
                    alt={servicio.nombre}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Briefcase className="w-16 h-16 text-white/30" />
                  </div>
                )}
                <div className="absolute top-3 right-3 px-3 py-1 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-full text-xs font-semibold text-gray-700 dark:text-gray-300">
                  ID: #{servicio.id}
                </div>
              </div>

              {/* Header con precio */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="w-5 h-5" />
                      <h3 className="text-xl font-bold line-clamp-1">{servicio.nombre}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      <span className="text-2xl font-bold">{servicio.precio}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contenido */}
              <div className="p-6 space-y-4">
                <p className="text-gray-600 dark:text-gray-400 line-clamp-3 min-h-[4.5rem]">
                  {servicio.descripcion}
                </p>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-4">
                    <span>Creado: {new Date(servicio.created_at).toLocaleDateString('es-CR')}</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenModal(servicio)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5
                                 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400
                                 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50
                                 transition-all duration-300 font-medium shadow-md hover:shadow-lg"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Editar</span>
                    </button>
                    <button
                      onClick={() => handleDelete(servicio.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5
                                 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400
                                 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50
                                 transition-all duration-300 font-medium shadow-md hover:shadow-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600 text-white sticky top-0 z-10 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Briefcase className="w-6 h-6" />
                  {editando ? 'Editar Servicio' : 'Nuevo Servicio'}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Nombre del Servicio *
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                             rounded-xl text-gray-900 dark:text-gray-100
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Ej: Corte de cabello, Consulta médica, Masaje relajante"
                  required
                />
              </div>

              {/* Precio */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Precio *
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.moneda || '₡'}
                    onChange={(e) => {
                      const moneda = e.target.value;
                      const valor = formData.precioValor || '0';
                      const precioFormateado = `${moneda}${parseInt(valor).toLocaleString('es-CR')}`;
                      setFormData({ 
                        ...formData, 
                        moneda,
                        precio: precioFormateado 
                      });
                    }}
                    className="w-32 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                               rounded-xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="₡">₡ Colones</option>
                    <option value="$">$ Dólares</option>
                  </select>
                  <input
                    type="text"
                    value={formData.precioValor || formData.precio?.replace(/[₡$,]/g, '') || ''}
                    onChange={(e) => {
                      const valor = e.target.value.replace(/[^\d]/g, '');
                      const moneda = formData.moneda || '₡';
                      const precioFormateado = `${moneda}${parseInt(valor || 0).toLocaleString('es-CR')}`;
                      setFormData({ 
                        ...formData, 
                        precioValor: valor,
                        precio: precioFormateado 
                      });
                    }}
                    className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                               rounded-xl text-gray-900 dark:text-gray-100
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="20000"
                    required
                  />
                </div>
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Vista previa: <strong className="text-lg">{formData.precio || '₡0'}</strong>
                  </p>
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Descripción *
                </label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                             rounded-xl text-gray-900 dark:text-gray-100
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="4"
                  placeholder="Descripción detallada del servicio"
                  required
                />
              </div>

              {/* Imagen */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Imagen del Servicio
                </label>

                {imagenPreview && (
                  <div className="mb-4 relative rounded-xl overflow-hidden">
                    <img
                      src={imagenPreview}
                      alt="Preview"
                      className="w-full h-48 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImagenPreview(null);
                        setArchivoImagen(null);
                        setFormData({ ...formData, imagenUrl: '' });
                      }}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {!imagenPreview && (
                  <label className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed 
                                    border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer 
                                    hover:border-blue-500 dark:hover:border-blue-400 transition-colors
                                    bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex flex-col items-center space-y-2">
                      <Upload className="w-10 h-10 text-gray-400" />
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Haz clic para subir imagen</span>
                      <span className="text-xs text-gray-500">PNG, JPG, GIF (máx. 5MB)</span>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImagenChange}
                    />
                  </label>
                )}
              </div>

              {/* Botones */}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 
                             text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800
                             transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white 
                             rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl
                             transition-all duration-300 font-semibold"
                >
                  {editando ? 'Guardar Cambios' : 'Crear Servicio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmarEliminacion}
        title="¿Eliminar servicio?"
        message="Esta acción eliminará el servicio permanentemente. No se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        type="danger"
      />
    </div>
  );
}