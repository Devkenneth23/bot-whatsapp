'use client';

import { useState, useEffect } from 'react';
import { Upload, Image as ImageIcon, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Cookies from 'js-cookie';

export default function LogoUploader() {
  const [logo, setLogo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [currentLogo, setCurrentLogo] = useState(null);

  useEffect(() => {
    loadCurrentLogo();
  }, []);

  const loadCurrentLogo = async () => {
    try {
      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/config/logo', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.logo_path) {
          setCurrentLogo(`http://localhost:3000${data.logo_path}`);
        }
      }
    } catch (error) {
      console.error('Error cargando logo:', error);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes');
      return;
    }

    // Validar tamaño (máx 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('La imagen no debe superar 2MB');
      return;
    }

    setLogo(file);

    // Generar preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!logo) return;

    setUploading(true);
    const toastId = toast.loading('Subiendo logo...');

    try {
      const formData = new FormData();
      formData.append('logo', logo);

      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/config/logo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('✅ Logo subido correctamente', { id: toastId });
        setCurrentLogo(`http://localhost:3000${data.logo_path}`);
        setPreview(null);
        setLogo(null);
        
        // Recargar la página para actualizar el sidebar
        setTimeout(() => window.location.reload(), 1000);
      } else {
        throw new Error('Error al subir logo');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('❌ Error al subir logo', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    const toastId = toast.loading('Eliminando logo...');

    try {
      const token = Cookies.get('token');
      const response = await fetch('http://localhost:3000/api/config/logo', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('✅ Logo eliminado', { id: toastId });
        setCurrentLogo(null);
        setPreview(null);
        setLogo(null);
        
        // Recargar para actualizar sidebar
        setTimeout(() => window.location.reload(), 1000);
      } else {
        throw new Error('Error al eliminar');
      }
    } catch (error) {
      toast.error('❌ Error al eliminar logo', { id: toastId });
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border-2 border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-6">
        <ImageIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Logo del Negocio
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Se mostrará en el dashboard y en mensajes de WhatsApp
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Preview del logo actual o nuevo */}
        {(currentLogo || preview) && (
          <div className="flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600">
            <div className="text-center">
              <img
                src={preview || currentLogo}
                alt="Logo"
                className="max-h-32 max-w-full mx-auto rounded-lg shadow-lg"
              />
              {currentLogo && !preview && (
                <button
                  onClick={handleDelete}
                  className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <X className="w-4 h-4" />
                  Eliminar Logo
                </button>
              )}
            </div>
          </div>
        )}

        {/* Upload area */}
        <div>
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-10 h-10 mb-3 text-gray-400" />
              <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold">Click para subir</span> o arrastra
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                PNG, JPG o WEBP (máx. 2MB)
              </p>
            </div>
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleFileSelect}
            />
          </label>
        </div>

        {/* Botón de upload si hay archivo seleccionado */}
        {preview && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                setPreview(null);
                setLogo(null);
              }}
              className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <Check className="w-5 h-5" />
              {uploading ? 'Subiendo...' : 'Guardar Logo'}
            </button>
          </div>
        )}

        {/* Info */}
        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
          <p className="text-sm text-indigo-800 dark:text-indigo-300">
            <strong>💡 Tip:</strong> Se recomienda usar un logo cuadrado o circular con fondo transparente para mejores resultados.
            El logo se mostrará en el sidebar del dashboard y se enviará junto al mensaje de bienvenida del bot de WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
