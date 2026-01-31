// reminder-service.js - Servicio de recordatorios automáticos
const cron = require('node-cron');

class ReminderService {
    constructor(db, botController) {
        this.db = db;
        this.botController = botController;
        this.cronJobs = [];
        this.isRunning = false;
        
        // Configuración por defecto
        this.config = {
            enabled: true,
            horasAntes: 24, // Horas antes de la cita para enviar recordatorio
            mensaje: '👋 Hola {cliente}!\n\n' +
                    '📅 Te recordamos tu cita para mañana:\n\n' +
                    '🕐 *Hora:* {hora}\n' +
                    '💼 *Servicio:* {servicio}\n\n' +
                    '¿Confirmas tu asistencia? Responde *SÍ* o *NO*',
            enviarSegundoRecordatorio: false,
            horasAntesSegundo: 2,
            mensajeSegundo: '🔔 Recordatorio: Tu cita es HOY a las {hora} para {servicio}. ¡Te esperamos!'
        };
    }

    // Cargar configuración desde base de datos
    async loadConfig() {
        try {
            const config = await this.db.get('SELECT * FROM configuracion WHERE id = 1');
            if (config && config.recordatorios) {
                const recordatorios = JSON.parse(config.recordatorios);
                this.config = { ...this.config, ...recordatorios };
            }
        } catch (error) {
            console.log('⚠️ Usando configuración por defecto de recordatorios');
        }
    }

    // Guardar configuración en base de datos
    async saveConfig(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            
            await this.db.run(
                'UPDATE configuracion SET recordatorios = ? WHERE id = 1',
                [JSON.stringify(this.config)]
            );
            
            console.log('✅ Configuración de recordatorios guardada');
            
            // Reiniciar servicio con nueva configuración
            if (this.isRunning) {
                await this.stop();
                await this.start();
            }
        } catch (error) {
            console.error('❌ Error guardando configuración:', error);
            throw error;
        }
    }

    // Iniciar servicio de recordatorios
    async start() {
        if (this.isRunning) {
            console.log('⚠️ Servicio de recordatorios ya está corriendo');
            return;
        }

        await this.loadConfig();

        if (!this.config.enabled) {
            console.log('⚠️ Recordatorios deshabilitados en configuración');
            return;
        }

        console.log('🔔 Iniciando servicio de recordatorios...');

        // Ejecutar cada 30 minutos
        const job = cron.schedule('*/30 * * * *', async () => {
            await this.checkAndSendReminders();
        });

        this.cronJobs.push(job);
        this.isRunning = true;

        console.log('✅ Servicio de recordatorios iniciado');
        console.log(`   - Revisa cada 30 minutos`);
        console.log(`   - Envía recordatorio ${this.config.horasAntes}h antes`);
        
        // Ejecutar una vez al iniciar
        await this.checkAndSendReminders();
    }

    // Detener servicio
    stop() {
        console.log('⏹️ Deteniendo servicio de recordatorios...');
        
        this.cronJobs.forEach(job => job.stop());
        this.cronJobs = [];
        this.isRunning = false;
        
        console.log('✅ Servicio de recordatorios detenido');
    }

    // Verificar y enviar recordatorios
    async checkAndSendReminders() {
        if (!this.botController || !this.botController.client) {
            console.log('⚠️ Bot no disponible, saltando verificación de recordatorios');
            return;
        }

        try {
            console.log('🔍 Verificando citas para recordatorios...');

            const ahora = new Date();
            const horaLimite = new Date(ahora.getTime() + (this.config.horasAntes * 60 * 60 * 1000));
            
            // Formatear fechas para SQL
            const ahoraStr = this.formatDateTimeForSQL(ahora);
            const horaLimiteStr = this.formatDateTimeForSQL(horaLimite);

            // Buscar citas que necesitan recordatorio
            const citas = await new Promise((resolve, reject) => {
                this.db.db.all(`
                    SELECT 
                        c.*,
                        cl.nombre as cliente_nombre,
                        cl.whatsapp_id,
                        s.nombre as servicio_nombre
                    FROM citas c
                    JOIN clientes cl ON c.cliente_id = cl.id
                    JOIN servicios s ON c.servicio_id = s.id
                    WHERE c.estado IN ('pendiente', 'confirmada')
                    AND c.recordatorio_enviado = 0
                    AND datetime(c.fecha || ' ' || c.hora) BETWEEN ? AND ?
                `, [ahoraStr, horaLimiteStr], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            console.log(`📋 Encontradas ${citas.length} citas para recordatorio`);

            for (const cita of citas) {
                await this.sendReminder(cita);
            }

            // Segundo recordatorio (si está habilitado)
            if (this.config.enviarSegundoRecordatorio) {
                await this.checkSecondReminders();
            }

        } catch (error) {
            console.error('❌ Error verificando recordatorios:', error);
        }
    }

    // Verificar y enviar segundos recordatorios
    async checkSecondReminders() {
        try {
            const ahora = new Date();
            const horaLimite = new Date(ahora.getTime() + (this.config.horasAntesSegundo * 60 * 60 * 1000));
            
            const ahoraStr = this.formatDateTimeForSQL(ahora);
            const horaLimiteStr = this.formatDateTimeForSQL(horaLimite);

            const citas = await new Promise((resolve, reject) => {
                this.db.db.all(`
                    SELECT 
                        c.*,
                        cl.nombre as cliente_nombre,
                        cl.whatsapp_id,
                        s.nombre as servicio_nombre
                    FROM citas c
                    JOIN clientes cl ON c.cliente_id = cl.id
                    JOIN servicios s ON c.servicio_id = s.id
                    WHERE c.estado IN ('pendiente', 'confirmada')
                    AND c.recordatorio_enviado = 1
                    AND c.segundo_recordatorio_enviado = 0
                    AND datetime(c.fecha || ' ' || c.hora) BETWEEN ? AND ?
                `, [ahoraStr, horaLimiteStr], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            console.log(`📋 Encontradas ${citas.length} citas para segundo recordatorio`);

            for (const cita of citas) {
                await this.sendSecondReminder(cita);
            }

        } catch (error) {
            console.error('❌ Error verificando segundos recordatorios:', error);
        }
    }

    // Enviar recordatorio individual
    async sendReminder(cita) {
        try {
            if (!cita.whatsapp_id) {
                console.log(`⚠️ Cita ${cita.id}: Cliente sin WhatsApp`);
                return;
            }

            // Formatear mensaje
            const mensaje = this.config.mensaje
                .replace('{cliente}', cita.cliente_nombre)
                .replace('{hora}', cita.hora)
                .replace('{servicio}', cita.servicio_nombre)
                .replace('{fecha}', cita.fecha);

            // Asegurar formato correcto del número
            let numeroCliente = cita.whatsapp_id;
            if (!numeroCliente.includes('@')) {
                numeroCliente = numeroCliente + '@c.us';
            }

            console.log(`📤 Enviando recordatorio a ${cita.cliente_nombre} (${numeroCliente})`);

            await this.botController.client.sendMessage(numeroCliente, mensaje);

            // Marcar como enviado
            await this.db.run(
                'UPDATE citas SET recordatorio_enviado = 1, recordatorio_enviado_at = datetime("now") WHERE id = ?',
                [cita.id]
            );

            console.log(`✅ Recordatorio enviado para cita ${cita.id}`);

        } catch (error) {
            console.error(`❌ Error enviando recordatorio para cita ${cita.id}:`, error);
        }
    }

    // Enviar segundo recordatorio
    async sendSecondReminder(cita) {
        try {
            if (!cita.whatsapp_id) return;

            const mensaje = this.config.mensajeSegundo
                .replace('{cliente}', cita.cliente_nombre)
                .replace('{hora}', cita.hora)
                .replace('{servicio}', cita.servicio_nombre)
                .replace('{fecha}', cita.fecha);

            let numeroCliente = cita.whatsapp_id;
            if (!numeroCliente.includes('@')) {
                numeroCliente = numeroCliente + '@c.us';
            }

            console.log(`📤 Enviando 2do recordatorio a ${cita.cliente_nombre}`);

            await this.botController.client.sendMessage(numeroCliente, mensaje);

            await this.db.run(
                'UPDATE citas SET segundo_recordatorio_enviado = 1, segundo_recordatorio_enviado_at = datetime("now") WHERE id = ?',
                [cita.id]
            );

            console.log(`✅ Segundo recordatorio enviado para cita ${cita.id}`);

        } catch (error) {
            console.error(`❌ Error enviando 2do recordatorio para cita ${cita.id}:`, error);
        }
    }

    // Formatear fecha para SQL
    formatDateTimeForSQL(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    // Obtener estadísticas
    async getStats() {
        try {
            const stats = await new Promise((resolve, reject) => {
                this.db.db.get(`
                    SELECT 
                        COUNT(*) as total_citas,
                        SUM(CASE WHEN recordatorio_enviado = 1 THEN 1 ELSE 0 END) as recordatorios_enviados,
                        SUM(CASE WHEN segundo_recordatorio_enviado = 1 THEN 1 ELSE 0 END) as segundos_recordatorios
                    FROM citas
                    WHERE estado IN ('pendiente', 'confirmada')
                    AND datetime(fecha || ' ' || hora) > datetime('now')
                `, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            return {
                ...stats,
                isRunning: this.isRunning,
                config: this.config
            };
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            return null;
        }
    }
}

module.exports = ReminderService;
