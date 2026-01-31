'use client';

import { useEffect, useState } from 'react';
import { getEstadisticas } from '@/lib/api';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  Users, 
  DollarSign,
  Clock,
  MessageSquare,
  Award,
  Target,
  Percent,
  Download,
  RefreshCw,
  Activity
} from 'lucide-react';

export default function EstadisticasPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('7dias');

  useEffect(() => {
    loadEstadisticas();
  }, [periodo]);

  const loadEstadisticas = async () => {
    setLoading(true);
    try {
      const data = await getEstadisticas(periodo);
      setStats(data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportarReporte = () => {
    // Generar CSV con las estadísticas
    let csv = 'REPORTE DE ESTADÍSTICAS\n\n';
    csv += `Período: ${periodos.find(p => p.value === periodo)?.label}\n`;
    csv += `Generado: ${new Date().toLocaleString('es-CR')}\n\n`;
    
    csv += 'RESUMEN GENERAL\n';
    csv += `Total Citas,${stats?.citas?.total || 0}\n`;
    csv += `Clientes Nuevos,${stats?.clientes?.nuevos || 0}\n`;
    csv += `Conversaciones,${stats?.conversaciones?.total || 0}\n`;
    csv += `Ingresos Proyectados,${stats?.ingresos?.formateado || '₡0'}\n\n`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `estadisticas-${periodo}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
          <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>
    );
  }

  const periodos = [
    { value: '7dias', label: 'Últimos 7 días' },
    { value: '30dias', label: 'Últimos 30 días' },
    { value: 'mes', label: 'Este mes' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-500 dark:to-blue-500 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <BarChart3 className="w-10 h-10" />
              Estadísticas
            </h1>
            <p className="text-indigo-100 dark:text-indigo-200">
              Análisis y métricas detalladas del negocio
            </p>
          </div>
          <div className="flex gap-3">
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="px-6 py-3 bg-white/20 backdrop-blur-sm border-2 border-white/30 rounded-xl
                         text-white font-medium focus:ring-2 focus:ring-white/50 focus:border-white/50
                         transition-all cursor-pointer"
            >
              {periodos.map(p => (
                <option key={p.value} value={p.value} className="text-gray-900">{p.label}</option>
              ))}
            </select>
            <button
              onClick={loadEstadisticas}
              className="px-4 py-3 bg-white/20 backdrop-blur-sm border-2 border-white/30 rounded-xl
                         hover:bg-white/30 transition-all"
              title="Actualizar"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={exportarReporte}
              className="px-4 py-3 bg-white text-indigo-600 rounded-xl hover:bg-indigo-50
                         transition-all shadow-lg font-medium flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              <span className="hidden md:inline">Exportar</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Citas */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Calendar className="w-7 h-7 text-white" />
            </div>
            <TrendingUp className="w-6 h-6 text-green-500" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Citas</p>
          <p className="text-4xl font-bold text-gray-800 dark:text-gray-100">{stats?.citas?.total || 0}</p>
        </div>

        {/* Clientes Nuevos */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
              <Users className="w-7 h-7 text-white" />
            </div>
            <TrendingUp className="w-6 h-6 text-green-500" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Clientes Nuevos</p>
          <p className="text-4xl font-bold text-gray-800 dark:text-gray-100">{stats?.clientes?.nuevos || 0}</p>
        </div>

        {/* Conversaciones */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <MessageSquare className="w-7 h-7 text-white" />
            </div>
            <TrendingUp className="w-6 h-6 text-green-500" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Conversaciones</p>
          <p className="text-4xl font-bold text-gray-800 dark:text-gray-100">{stats?.conversaciones?.total || 0}</p>
        </div>

        {/* Ingresos Proyectados */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:scale-105 transition-transform duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
              <DollarSign className="w-7 h-7 text-white" />
            </div>
            <TrendingUp className="w-6 h-6 text-green-500" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Ingresos Proyectados</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">{stats?.ingresos?.formateado || '₡0'}</p>
        </div>
      </div>

      {/* Estado de Citas y Conversión */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estado de Citas */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Estado de Citas</h2>
          </div>

          <div className="space-y-4">
            {stats?.citas?.porEstado && stats.citas.porEstado.length > 0 ? (
              stats.citas.porEstado.map((item) => {
                const colores = {
                  pendiente: 'from-yellow-400 to-yellow-500',
                  confirmada: 'from-blue-400 to-blue-500',
                  completada: 'from-green-400 to-green-500',
                  cancelada: 'from-red-400 to-red-500'
                };
                
                const porcentaje = ((item.total / stats.citas.total) * 100).toFixed(1);
                
                return (
                  <div key={item.estado}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
                        {item.estado}
                      </span>
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                        {item.total} ({porcentaje}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                      <div
                        className={`bg-gradient-to-r ${colores[item.estado]} h-3 rounded-full transition-all duration-700 shadow-lg`}
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <Activity className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No hay datos de citas</p>
              </div>
            )}
          </div>
        </div>

        {/* Tasa de Conversión */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
              <Target className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Métricas de Clientes</h2>
          </div>

          <div className="space-y-6">
            <div className="text-center py-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-2xl border-2 border-green-200 dark:border-green-800">
              <div className="flex items-center justify-center mb-3">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                  <Percent className="w-8 h-8 text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Tasa de Conversión</p>
              <p className="text-6xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {stats?.clientes?.tasaConversion || 0}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                {stats?.clientes?.conCitas || 0} de {stats?.clientes?.total || 0} clientes agendaron citas
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-4 text-center border border-blue-200 dark:border-blue-800">
                <Users className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">{stats?.clientes?.total || 0}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total Clientes</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/30 rounded-xl p-4 text-center border border-green-200 dark:border-green-800">
                <Calendar className="w-8 h-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">{stats?.clientes?.conCitas || 0}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Con Citas</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Servicios Más Solicitados */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
            <Award className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Servicios Más Solicitados</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Ranking
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Servicio
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Precio
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Total Citas
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Popularidad
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {stats?.servicios?.masSolicitados && stats.servicios.masSolicitados.length > 0 ? (
                stats.servicios.masSolicitados.map((servicio, index) => {
                  const maxCitas = Math.max(...stats.servicios.masSolicitados.map(s => s.total_citas));
                  const porcentaje = maxCitas > 0 ? (servicio.total_citas / maxCitas) * 100 : 0;
                  
                  const medallas = ['🥇', '🥈', '🥉'];
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-3xl">{medallas[index] || `#${index + 1}`}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{servicio.nombre}</span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{servicio.precio}</span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{servicio.total_citas}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-700 shadow-lg"
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="px-4 py-12 text-center">
                    <Award className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">No hay datos de servicios</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Horarios Más Populares */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Horarios Más Populares</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {stats?.horarios?.masPopulares && stats.horarios.masPopulares.length > 0 ? (
            stats.horarios.masPopulares.map((horario, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 
                           rounded-xl p-4 text-center border-2 border-orange-200 dark:border-orange-800
                           hover:scale-105 transition-transform duration-300 shadow-lg"
              >
                <Clock className="w-8 h-8 text-orange-600 dark:text-orange-400 mx-auto mb-3" />
                <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">{horario.hora}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{horario.total} citas</p>
                <div className="mt-3 flex items-center justify-center gap-1">
                  {[...Array(Math.min(5, horario.total))].map((_, i) => (
                    <div key={i} className="w-2 h-2 bg-orange-500 dark:bg-orange-400 rounded-full animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-5 text-center py-12">
              <Clock className="w-16 h-16 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No hay datos de horarios</p>
            </div>
          )}
        </div>
      </div>

      {/* Actividad Diaria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Citas por Día */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Citas por Día</h2>
          </div>

          <div className="space-y-3">
            {stats?.citas?.porDia && stats.citas.porDia.length > 0 ? (
              stats.citas.porDia.map((dia) => {
                const fecha = new Date(dia.fecha + 'T00:00:00');
                const maxCitas = Math.max(...stats.citas.porDia.map(d => d.total));
                const porcentaje = (dia.total / maxCitas) * 100;
                
                return (
                  <div key={dia.fecha}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {fecha.toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{dia.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-blue-400 to-blue-500 h-3 rounded-full transition-all duration-700 shadow-lg"
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No hay datos disponibles</p>
              </div>
            )}
          </div>
        </div>

        {/* Conversaciones por Día */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Conversaciones por Día</h2>
          </div>

          <div className="space-y-3">
            {stats?.conversaciones?.porDia && stats.conversaciones.porDia.length > 0 ? (
              stats.conversaciones.porDia.map((dia) => {
                const fecha = new Date(dia.fecha + 'T00:00:00');
                const maxConv = Math.max(...stats.conversaciones.porDia.map(d => d.total));
                const porcentaje = (dia.total / maxConv) * 100;
                
                return (
                  <div key={dia.fecha}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {fecha.toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{dia.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-green-400 to-green-500 h-3 rounded-full transition-all duration-700 shadow-lg"
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No hay datos disponibles</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}