'use client';

import { useEffect, useState } from 'react';
import { getDashboardStats } from '@/lib/api';
import { 
  Calendar, 
  Users, 
  MessageSquare, 
  Clock,
  TrendingUp,
  Briefcase
} from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Citas Hoy',
      value: stats?.citasHoy || 0,
      icon: Calendar,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Citas Pendientes',
      value: stats?.citasPendientes || 0,
      icon: Clock,
      color: 'bg-yellow-500',
      bgColor: 'bg-yellow-50',
    },
    {
      title: 'Conversaciones Hoy',
      value: stats?.conversacionesHoy || 0,
      icon: MessageSquare,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Total Clientes',
      value: stats?.totalClientes || 0,
      icon: Users,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-600 mt-2">Bienvenido al panel de administración</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-800">{card.value}</p>
                </div>
                <div className={`${card.bgColor} p-3 rounded-lg`}>
                  <Icon className={`${card.color.replace('bg-', 'text-')} w-6 h-6`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Additional Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Servicio Más Solicitado */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-indigo-100 p-2 rounded-lg">
              <Briefcase className="text-indigo-600 w-5 h-5" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Servicio Más Solicitado</h2>
          </div>
          
          {stats?.servicioMasSolicitado ? (
            <div className="space-y-2">
              <p className="text-2xl font-bold text-gray-800">
                {stats.servicioMasSolicitado.nombre}
              </p>
              <p className="text-gray-600">
                {stats.servicioMasSolicitado.total} solicitudes
              </p>
            </div>
          ) : (
            <p className="text-gray-500">No hay datos disponibles</p>
          )}
        </div>

        {/* Horario Más Popular */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-green-100 p-2 rounded-lg">
              <TrendingUp className="text-green-600 w-5 h-5" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Horario Más Popular</h2>
          </div>
          
          {stats?.horarioMasPopular ? (
            <div className="space-y-2">
              <p className="text-2xl font-bold text-gray-800">
                {stats.horarioMasPopular.hora}
              </p>
              <p className="text-gray-600">
                {stats.horarioMasPopular.total} citas agendadas
              </p>
            </div>
          ) : (
            <p className="text-gray-500">No hay datos disponibles</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg p-6 text-white">
        <h2 className="text-xl font-semibold mb-4">Acciones Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/dashboard/citas"
            className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg p-4 transition-all"
          >
            <Calendar className="w-6 h-6 mb-2" />
            <p className="font-semibold">Ver Citas</p>
          </a>
          <a
            href="/dashboard/clientes"
            className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg p-4 transition-all"
          >
            <Users className="w-6 h-6 mb-2" />
            <p className="font-semibold">Ver Clientes</p>
          </a>
          <a
            href="/dashboard/bot"
            className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg p-4 transition-all"
          >
            <MessageSquare className="w-6 h-6 mb-2" />
            <p className="font-semibold">Control Bot</p>
          </a>
        </div>
      </div>
    </div>
  );
}
