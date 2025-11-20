'use client';

import { useEffect, useState } from 'react';
import { getServicios, createServicio, updateServicio, deleteServicio } from '@/lib/api';
import { Briefcase, Plus, Edit, Trash2, DollarSign, X, Upload, Image as ImageIcon } from 'lucide-react';

export default function ServiciosPage() {
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [imagenPreview, setImagenPreview] = useState(null);
  const [archivoImagen, setArchivoImagen] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '',
    precio: '',
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
        descripcion: servicio.descripcion,
        imagenUrl: servicio.imagen || '',
      });
      setImagenPreview(servicio.imagen ? `http://localhost:3000${servicio.imagen}` : null);
    } else {
      setEditando(null);
      setFormData({
        nombre: '',
        precio: '',
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
      descripcion: '',
      imagenUrl: '',
    });
    setImagenPreview(null);
    setArchivoImagen(null);
  };

  const handleImagenChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validar tamaño (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen no debe superar 5MB');
        return;
      }

      // Validar tipo
      if (!file.type.startsWith('image/')) {
        alert('Solo se permiten imágenes');
        return;
      }

      setArchivoImagen(file);
      
      // Crear preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagenPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

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
      } else {
        await createServicio(formDataToSend);
      }
      
      loadServicios();
      handleCloseModal();
    } catch (error) {
      console.error('Error guardando servicio:', error);
      alert('Error al guardar servicio');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('¿Estás seguro de eliminar este servicio?')) {
      try {
        await deleteServicio(id);
        loadServicios();
      } catch (error) {
        alert('Error al eliminar servicio');
      }
    }
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Servicios</h1>
          <p className="text-gray-600 mt-2">Gestiona los servicios que ofreces</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nuevo Servicio</span>
        </button>
      </div>

      {/* Grid de Servicios */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {servicios.length === 0 ? (
          <div className="col-span-full bg-white rounded-lg shadow-md p-8 text-center">
            <Briefcase className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No hay servicios registrados</p>
            <button
              onClick={() => handleOpenModal()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Crear primer servicio
            </button>
          </div>
        ) : (
          servicios.map((servicio) => (
            <div
              key={servicio.id}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden"
            >
              {/* Imagen del servicio */}
              {servicio.imagen && (
                <div className="h-48 bg-gray-200 overflow-hidden">
                  <img
                    src={`http://localhost:3000${servicio.imagen}`}
                    alt={servicio.nombre}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Header del servicio */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                <div className="flex items-center space-x-3 mb-2">
                  <Briefcase className="w-6 h-6" />
                  <h3 className="text-xl font-bold">{servicio.nombre}</h3>
                </div>
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-5 h-5" />
                  <span className="text-2xl font-bold">{servicio.precio}</span>
                </div>
              </div>

              {/* Contenido */}
              <div className="p-6">
                <p className="text-gray-600 mb-4">{servicio.descripcion}</p>

                <div className="text-sm text-gray-500 mb-4">
                  <p>ID: #{servicio.id}</p>
                  <p>
                    Creado: {new Date(servicio.created_at).toLocaleDateString('es-CR')}
                  </p>
                </div>

                {/* Acciones */}
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleOpenModal(servicio)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Editar</span>
                  </button>
                  <button
                    onClick={() => handleDelete(servicio.id)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
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

      {/* Modal de Crear/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-bold text-gray-800">
                {editando ? 'Editar Servicio' : 'Nuevo Servicio'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Servicio *
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ej: Consulta Legal"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precio *
                </label>
                <input
                  type="text"
                  value={formData.precio}
                  onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ej: ₡20,000"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción *
                </label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) =>
                    setFormData({ ...formData, descripcion: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="4"
                  placeholder="Descripción detallada del servicio"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Imagen del Servicio (opcional)
                </label>

                {/* Preview de imagen */}
                {imagenPreview && (
                  <div className="relative">
                    <img
                      src={imagenPreview}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-lg"
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

                {/* Botón de upload solo si NO hay imagen */}
                {!imagenPreview && (
                  <label className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                    <div className="flex flex-col items-center space-y-2">
                      <Upload className="w-10 h-10 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">
                        Haz clic para subir una imagen
                      </span>
                      <span className="text-xs text-gray-500">
                        PNG, JPG, GIF, WEBP (máx. 5MB)
                      </span>
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
              <div className="flex space-x-4 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editando ? 'Guardar Cambios' : 'Crear Servicio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}