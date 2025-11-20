const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class DatabaseManager {
    constructor(dbPath = './database/bot.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.initialize();
    }

    initialize() {
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Error al conectar BD:', err);
                    throw err;
                }
                console.log('✅ Base de datos conectada');
            });

            this.db.run('PRAGMA journal_mode = WAL');
            this.createTables();
            
        } catch (error) {
            console.error('❌ Error al inicializar BD:', error);
            throw error;
        }
    }

    createTables() {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        this.db.exec(schema, (err) => {
            if (err) {
                console.error('❌ Error creando tablas:', err);
            } else {
                console.log('✅ Tablas creadas');
            }
        });
    }

    // Wrapper para promisificar consultas
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // SERVICIOS
    async getAllServicios() {
        return await this.all('SELECT * FROM servicios WHERE activo = 1 ORDER BY id');
    }

    async getServicioById(id) {
        return await this.get('SELECT * FROM servicios WHERE id = ?', [id]);
    }

    async createServicio(data) {
        const result = await this.run(
            'INSERT INTO servicios (nombre, precio, descripcion, imagen) VALUES (?, ?, ?, ?)',
            [data.nombre, data.precio, data.descripcion, data.imagen || null]
        );
        return result.lastID;
    }

    async updateServicio(id, data) {
        return await this.run(
            'UPDATE servicios SET nombre = ?, precio = ?, descripcion = ?, imagen = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [data.nombre, data.precio, data.descripcion, data.imagen, id]
        );
    }

    async deleteServicio(id) {
        return await this.run('UPDATE servicios SET activo = 0 WHERE id = ?', [id]);
    }

    // CLIENTES
    async getOrCreateCliente(whatsappId) {
        let cliente = await this.get('SELECT * FROM clientes WHERE whatsapp_id = ?', [whatsappId]);
        
        if (!cliente) {
            const telefono = whatsappId.replace('@c.us', '').replace('@lid', '');
            const result = await this.run(
                'INSERT INTO clientes (whatsapp_id, telefono) VALUES (?, ?)',
                [whatsappId, telefono]
            );
            cliente = await this.getClienteById(result.lastID);
        }
        
        return cliente;
    }

    async getClienteById(id) {
        return await this.get('SELECT * FROM clientes WHERE id = ?', [id]);
    }

    async updateCliente(id, data) {
        return await this.run(
            'UPDATE clientes SET nombre = ?, email = ?, ultima_interaccion = CURRENT_TIMESTAMP WHERE id = ?',
            [data.nombre, data.email, id]
        );
    }

    async incrementarMensajesCliente(clienteId) {
        return await this.run(
            'UPDATE clientes SET total_mensajes = total_mensajes + 1, ultima_interaccion = CURRENT_TIMESTAMP WHERE id = ?',
            [clienteId]
        );
    }

    async getAllClientes(limit = 100, offset = 0) {
        return await this.all(
            'SELECT * FROM clientes ORDER BY ultima_interaccion DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
    }

    // CITAS
    async createCita(data) {
        const result = await this.run(
            'INSERT INTO citas (cliente_id, servicio_id, fecha, hora, notas) VALUES (?, ?, ?, ?, ?)',
            [data.cliente_id, data.servicio_id, data.fecha, data.hora, data.notas || null]
        );
        
        await this.run('UPDATE clientes SET total_citas = total_citas + 1 WHERE id = ?', [data.cliente_id]);
        
        return result.lastID;
    }

    async getCitaById(id) {
        return await this.get(`
            SELECT c.*, 
                   cl.nombre as cliente_nombre, cl.whatsapp_id, cl.telefono,
                   s.nombre as servicio_nombre, s.precio as servicio_precio
            FROM citas c
            JOIN clientes cl ON c.cliente_id = cl.id
            JOIN servicios s ON c.servicio_id = s.id
            WHERE c.id = ?
        `, [id]);
    }

    async getCitasByFecha(fecha) {
        return await this.all(`
            SELECT c.*, 
                   cl.nombre as cliente_nombre, cl.telefono,
                   s.nombre as servicio_nombre
            FROM citas c
            JOIN clientes cl ON c.cliente_id = cl.id
            JOIN servicios s ON c.servicio_id = s.id
            WHERE c.fecha = ?
            ORDER BY c.hora
        `, [fecha]);
    }

    async getAllCitas(limit = 100, offset = 0) {
        return await this.all(`
            SELECT c.*, 
                   cl.nombre as cliente_nombre, cl.telefono, cl.whatsapp_id,
                   s.nombre as servicio_nombre, s.precio as servicio_precio
            FROM citas c
            JOIN clientes cl ON c.cliente_id = cl.id
            JOIN servicios s ON c.servicio_id = s.id
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
    }

    async getCitasByEstado(estado) {
        return await this.all(`
            SELECT c.*, 
                   cl.nombre as cliente_nombre, cl.telefono,
                   s.nombre as servicio_nombre, s.precio as servicio_precio
            FROM citas c
            JOIN clientes cl ON c.cliente_id = cl.id
            JOIN servicios s ON c.servicio_id = s.id
            WHERE c.estado = ?
            ORDER BY c.fecha, c.hora
        `, [estado]);
    }

    async updateCitaEstado(id, estado) {
        return await this.run(
            'UPDATE citas SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [estado, id]
        );
    }

    async deleteCita(id) {
        return await this.run('DELETE FROM citas WHERE id = ?', [id]);
    }

    async isHorarioDisponible(fecha, hora) {
        const cita = await this.get(
            "SELECT id FROM citas WHERE fecha = ? AND hora = ? AND estado != 'cancelada'",
            [fecha, hora]
        );
        return !cita;
    }

    // HORARIOS
    async getHorariosByDia(dia) {
        return await this.all(
            'SELECT * FROM horarios_disponibles WHERE dia_semana = ? AND activo = 1 ORDER BY hora',
            [dia.toLowerCase()]
        );
    }

    async getAllHorarios() {
        return await this.all(`
            SELECT * FROM horarios_disponibles 
            WHERE activo = 1 
            ORDER BY 
                CASE dia_semana
                    WHEN 'lunes' THEN 1
                    WHEN 'martes' THEN 2
                    WHEN 'miercoles' THEN 3
                    WHEN 'jueves' THEN 4
                    WHEN 'viernes' THEN 5
                    WHEN 'sabado' THEN 6
                    WHEN 'domingo' THEN 7
                END,
                hora
        `);
    }

    async createHorario(dia, hora) {
        return await this.run(
            'INSERT INTO horarios_disponibles (dia_semana, hora) VALUES (?, ?)',
            [dia.toLowerCase(), hora]
        );
    }

    async deleteHorario(id) {
        return await this.run('UPDATE horarios_disponibles SET activo = 0 WHERE id = ?', [id]);
    }

    // CONVERSACIONES
    async registrarConversacion(clienteId, mensaje, tipo = 'entrante') {
        return await this.run(
            'INSERT INTO conversaciones (cliente_id, mensaje, tipo) VALUES (?, ?, ?)',
            [clienteId, mensaje, tipo]
        );
    }

    async getConversacionesByCliente(clienteId, limit = 50) {
        return await this.all(
            'SELECT * FROM conversaciones WHERE cliente_id = ? ORDER BY timestamp DESC LIMIT ?',
            [clienteId, limit]
        );
    }

    // PREGUNTAS FRECUENTES
    async getAllFAQs() {
        return await this.all('SELECT * FROM preguntas_frecuentes WHERE activo = 1 ORDER BY orden, id');
    }

    // ESTADÍSTICAS
    async getEstadisticasHoy() {
        const hoy = new Date().toISOString().split('T')[0];
        return await this.get('SELECT * FROM estadisticas WHERE fecha = ?', [hoy]);
    }

    async actualizarEstadisticas(fecha) {
        return await this.run(`
            INSERT INTO estadisticas (
                fecha, 
                total_conversaciones, 
                total_citas,
                citas_confirmadas,
                mensajes_recibidos
            )
            SELECT 
                ?,
                (SELECT COUNT(DISTINCT cliente_id) FROM conversaciones WHERE DATE(timestamp) = ?),
                (SELECT COUNT(*) FROM citas WHERE DATE(created_at) = ?),
                (SELECT COUNT(*) FROM citas WHERE DATE(created_at) = ? AND estado = 'confirmada'),
                (SELECT COUNT(*) FROM conversaciones WHERE DATE(timestamp) = ? AND tipo = 'entrante')
            WHERE NOT EXISTS (SELECT 1 FROM estadisticas WHERE fecha = ?)
        `, [fecha, fecha, fecha, fecha, fecha, fecha]);
    }

    async getEstadisticasRango(fechaInicio, fechaFin) {
        return await this.all(
            'SELECT * FROM estadisticas WHERE fecha BETWEEN ? AND ? ORDER BY fecha',
            [fechaInicio, fechaFin]
        );
    }

    async getDashboardStats() {
        const hoy = new Date().toISOString().split('T')[0];
        
        const citasHoy = await this.get('SELECT COUNT(*) as total FROM citas WHERE fecha = ?', [hoy]);
        const citasPendientes = await this.get("SELECT COUNT(*) as total FROM citas WHERE estado = 'confirmada'");
        const conversacionesHoy = await this.get(
            'SELECT COUNT(DISTINCT cliente_id) as total FROM conversaciones WHERE DATE(timestamp) = ?',
            [hoy]
        );
        const totalClientes = await this.get('SELECT COUNT(*) as total FROM clientes');
        const servicioMasSolicitado = await this.get(`
            SELECT s.nombre, COUNT(*) as total
            FROM citas c
            JOIN servicios s ON c.servicio_id = s.id
            GROUP BY c.servicio_id
            ORDER BY total DESC
            LIMIT 1
        `);
        const horarioMasPopular = await this.get(`
            SELECT hora, COUNT(*) as total
            FROM citas
            GROUP BY hora
            ORDER BY total DESC
            LIMIT 1
        `);

        return {
            citasHoy: citasHoy?.total || 0,
            citasPendientes: citasPendientes?.total || 0,
            conversacionesHoy: conversacionesHoy?.total || 0,
            totalClientes: totalClientes?.total || 0,
            servicioMasSolicitado: servicioMasSolicitado || null,
            horarioMasPopular: horarioMasPopular || null
        };
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error cerrando BD:', err);
                } else {
                    console.log('✅ Base de datos cerrada');
                }
            });
        }
    }
}

module.exports = DatabaseManager;