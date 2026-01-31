'use client';

import { useEffect, useState } from 'react';
import { getDashboardStats } from '@/lib/api';
import { 
  Calendar, 
  Users, 
  MessageSquare, 
  Clock,
  TrendingUp,
  Briefcase,
  ArrowUpRight,
  Sparkles,
  Award
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
      iconBg: 'bg-blue-500/10 dark:bg-blue-500/20',
      iconColor: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Conversaciones',
      value: stats?.conversacionesHoy || 0,
      icon: MessageSquare,
      iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400'
    },
    {
      title: 'Total Clientes',
      value: stats?.totalClientes || 0,
      icon: Users,
      iconBg: 'bg-purple-500/10 dark:bg-purple-500/20',
      iconColor: 'text-purple-600 dark:text-purple-400'
    },
    {
      title: 'Pendientes',
      value: stats?.citasPendientes || 0,
      icon: Clock,
      iconBg: 'bg-orange-500/10 dark:bg-orange-500/20',
      iconColor: 'text-orange-600 dark:text-orange-400'
    }
  ];

  return (
    <div className="space-y-8">
      <div className="backdrop-blur-xl bg-white/40 dark:bg-slate-900/40 border border-white/60 dark:border-slate-700/60 rounded-3xl p-8 shadow-xl">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 dark:from-slate-100 dark:via-blue-100 dark:to-purple-100 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-yellow-500" />
          <span>Bienvenido de nuevo</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          
          return (
            <div
              key={index}
              className="backdrop-blur-xl bg-white/60 dark:bg-slate-900/60 border border-white/80 dark:border-slate-700/80 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`${card.iconBg} p-3 rounded-xl`}>
                  <Icon className={`w-6 h-6 ${card.iconColor}`} />
                </div>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{card.title}</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="backdrop-blur-xl bg-white/60 dark:bg-slate-900/60 border border-white/80 dark:border-slate-700/80 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Servicio Popular</h2>
            </div>
          </div>
          
          {stats?.servicioMasSolicitado ? (
            <div className="p-6 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/20 dark:to-purple-500/20">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.servicioMasSolicitado.nombre}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                {stats.servicioMasSolicitado.total} solicitudes
              </p>
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">Sin datos</p>
          )}
        </div>

        <div className="backdrop-blur-xl bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-6 shadow-lg text-white">
          <div className="flex items-center space-x-3 mb-4">
            <Clock className="w-8 h-8" />
            <h3 className="font-semibold">Horario Popular</h3>
          </div>
          {stats?.horarioMasPopular ? (
            <div>
              <p className="text-5xl font-bold">{stats.horarioMasPopular.hora}</p>
              <p className="text-blue-100 mt-2">{stats.horarioMasPopular.total} citas</p>
            </div>
          ) : (
            <p>Sin datos</p>
          )}
        </div>
      </div>
    </div>
  );
}
