// database-saas.js - Database Manager Multi-tenant
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class DatabaseSaasManager {
    constructor(clienteSlug) {
        this.clienteSlug = clienteSlug;
        this.dbPath = path.join(__dirname, 'database', 'clients', `${clienteSlug}.db`);
        this.db = null;
        this.initialize();
    }

    initialize() {
        try {
            // Crear directorio si no existe
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Conectar a la base de datos
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error(`❌ Error conectando BD para ${this.clienteSlug}:`, err);
                    throw err;
                }
                console.log(`✅ BD conectada para cliente: ${this.clienteSlug}`);
            });

            // Activar WAL mode para mejor concurrencia
            this.db.run('PRAGMA journal_mode = WAL');
            
            // Crear tablas
            this.createTables();
            
        } catch (error) {
            console.error(`❌ Error inicializando BD para ${this.clienteSlug}:`, error);
            throw error;
        }
    }

    createTables() {
        // Schema para cada cliente individual
        const schema = `
            -- Servicios del negocio
            CREATE TABLE IF NOT EXISTS servicios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                descripcion TEXT,
                precio REAL,
                imagen TEXT,
                activo INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Clientes del negocio (usuarios finales)
            CREATE TABLE IF NOT EXISTS clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                whatsapp_id TEXT UNIQUE NOT NULL,
                telefono TEXT NOT NULL,
                nombre TEXT,
                email TEXT,
                total_citas INTEGER DEFAULT 0,
                total_mensajes INTEGER DEFAULT 0,
                ultima_interaccion DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON clientes(whatsapp_id);
            CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);

            -- Citas agendadas
            CREATE TABLE IF NOT EXISTS citas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER NOT NULL,
                servicio_id INTEGER NOT NULL,
                fecha DATE NOT NULL,
                hora TIME NOT NULL,
                estado TEXT DEFAULT 'pendiente',
                notas TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id),
                FOREIGN KEY (servicio_id) REFERENCES servicios(id)
            );

            CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha);
            CREATE INDEX IF NOT EXISTS idx_citas_cliente ON citas(cliente_id);
            CREATE INDEX IF NOT EXISTS idx_citas_estado ON citas(estado);

            -- Horarios disponibles
            CREATE TABLE IF NOT EXISTS horarios_disponibles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dia_semana TEXT NOT NULL,
                hora TIME NOT NULL,
                activo INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_horarios_dia ON horarios_disponibles(dia_semana);

            -- Preguntas frecuentes
            CREATE TABLE IF NOT EXISTS preguntas_frecuentes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pregunta TEXT NOT NULL,
                respuesta TEXT NOT NULL,
                orden INTEGER DEFAULT 0,
                activo INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Conversaciones (log de mensajes)
            CREATE TABLE IF NOT EXISTS conversaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id INTEGER NOT NULL,
                mensaje TEXT NOT NULL,
                tipo TEXT DEFAULT 'entrante',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cliente_id) REFERENCES clientes(id)
            );

            CREATE INDEX IF NOT EXISTS idx_conversaciones_cliente ON conversaciones(cliente_id);
            CREATE INDEX IF NOT EXISTS idx_conversaciones_timestamp ON conversaciones(timestamp);

            -- Estadísticas diarias
            CREATE TABLE IF NOT EXISTS estadisticas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha DATE UNIQUE NOT NULL,
                total_conversaciones INTEGER DEFAULT 0,
                total_citas INTEGER DEFAULT 0,
                citas_confirmadas INTEGER DEFAULT 0,
                mensajes_recibidos INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_estadisticas_fecha ON estadisticas(fecha);
        `;

        this.db.exec(schema, (err) => {
            if (err) {
                console.error(`❌ Error creando tablas para ${this.clienteSlug}:`, err);
            } else {
                console.log(`✅ Tablas creadas/verificadas para ${this.clienteSlug}`);
            }
        });
    }

    // ========== WRAPPERS PARA PROMESAS ==========
    
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

    // ========== SERVICIOS ==========
    
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

    // ========== CLIENTES ==========
    
    async getOrCreateCliente(whatsappId, numeroReal = null) {
        let cliente = await this.get('SELECT * FROM clientes WHERE whatsapp_id = ?', [whatsappId]);
        
        if (!cliente) {
            // Extraer teléfono limpio
            let telefono;
            if (numeroReal) {
                telefono = numeroReal.replace(/\D/g, '').substring(0, 15);
            } else {
                telefono = whatsappId
                    .replace('@c.us', '')
                    .replace('@lid', '')
                    .replace('@s.whatsapp.net', '')
                    .replace('@g.us', '');
                telefono = telefono.replace(/\D/g, '').substring(0, 15);
            }
            
            console.log(`📞 [${this.clienteSlug}] Nuevo cliente - WhatsApp: ${whatsappId} → Tel: ${telefono}`);
            
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

    async getClienteByWhatsappId(whatsappId) {
        return await this.get('SELECT * FROM clientes WHERE whatsapp_id = ?', [whatsappId]);
    }

    // ========== CITAS ==========
    
    async createCita(data) {
        const result = await this.run(
            'INSERT INTO citas (cliente_id, servicio_id, fecha, hora, notas, estado) VALUES (?, ?, ?, ?, ?, ?)',
            [data.cliente_id, data.servicio_id, data.fecha, data.hora, data.notas || null, 'pendiente']
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

    async getCitasFuturasByCliente(clienteId) {
        const hoy = new Date().toISOString().split('T')[0];
        return await this.all(`
            SELECT c.*, 
                   s.nombre as servicio_nombre, s.precio as servicio_precio
            FROM citas c
            JOIN servicios s ON c.servicio_id = s.id
            WHERE c.cliente_id = ? 
            AND c.fecha >= ?
            AND c.estado NOT IN ('cancelada', 'completada')
            ORDER BY c.fecha, c.hora
        `, [clienteId, hoy]);
    }

    async updateCita(id, data) {
        return await this.run(
            'UPDATE citas SET fecha = ?, hora = ?, notas = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [data.fecha, data.hora, data.notas || null, id]
        );
    }

    async cancelarCita(id, motivo = null) {
        const notas = motivo ? `Cancelada por cliente. Motivo: ${motivo}` : 'Cancelada por cliente';
        return await this.run(
            'UPDATE citas SET estado = ?, notas = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['cancelada', notas, id]
        );
    }

    // ========== HORARIOS ==========
    
    async createHorario(data) {
        const result = await this.run(
            'INSERT INTO horarios_disponibles (dia_semana, hora) VALUES (?, ?)',
            [data.dia.toLowerCase(), data.hora]
        );
        return result.lastID;
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

    async getHorariosByDia(dia) {
        return await this.all(
            'SELECT * FROM horarios_disponibles WHERE dia_semana = ? AND activo = 1 ORDER BY hora',
            [dia.toLowerCase()]
        );
    }

    async getHorariosDisponiblesPorFecha(fecha, diaSemana) {
        // Obtener horarios configurados para ese día
        const horariosConfigurados = await this.all(
            'SELECT hora FROM horarios_disponibles WHERE dia_semana = ? AND activo = 1 ORDER BY hora',
            [diaSemana.toLowerCase()]
        );

        // Obtener horarios ocupados en esa fecha
        const horariosOcupados = await this.all(
            "SELECT hora FROM citas WHERE fecha = ? AND estado != 'cancelada'",
            [fecha]
        );

        // Filtrar disponibles
        const ocupados = new Set(horariosOcupados.map(h => h.hora));
        const disponibles = horariosConfigurados
            .filter(h => !ocupados.has(h.hora))
            .map(h => h.hora);

        return disponibles;
    }

    async deleteHorario(id) {
        return await this.run('UPDATE horarios_disponibles SET activo = 0 WHERE id = ?', [id]);
    }

    // ========== FAQs ==========
    
    async createFAQ(data) {
        const result = await this.run(
            'INSERT INTO preguntas_frecuentes (pregunta, respuesta) VALUES (?, ?)',
            [data.pregunta, data.respuesta]
        );
        return result.lastID;
    }

    async updateFAQ(id, data) {
        return await this.run(
            'UPDATE preguntas_frecuentes SET pregunta = ?, respuesta = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [data.pregunta, data.respuesta, id]
        );
    }

    async deleteFAQ(id) {
        return await this.run('UPDATE preguntas_frecuentes SET activo = 0 WHERE id = ?', [id]);
    }

    async getAllFAQs() {
        return await this.all('SELECT * FROM preguntas_frecuentes WHERE activo = 1 ORDER BY orden, id');
    }

    // ========== CONVERSACIONES ==========
    
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

    // ========== ESTADÍSTICAS ==========
    
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
        const citasPendientes = await this.get("SELECT COUNT(*) as total FROM citas WHERE estado = 'confirmada' OR estado = 'pendiente'");
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

    // ========== BACKUP Y MANTENIMIENTO ==========
    
    async backup(backupPath) {
        return new Promise((resolve, reject) => {
            const backupDb = new sqlite3.Database(backupPath);
            
            this.db.backup(backupDb, (err) => {
                backupDb.close();
                if (err) {
                    console.error(`❌ Error haciendo backup de ${this.clienteSlug}:`, err);
                    reject(err);
                } else {
                    console.log(`✅ Backup creado para ${this.clienteSlug}: ${backupPath}`);
                    resolve();
                }
            });
        });
    }

    async vacuum() {
        return new Promise((resolve, reject) => {
            this.db.run('VACUUM', (err) => {
                if (err) {
                    console.error(`❌ Error ejecutando VACUUM en ${this.clienteSlug}:`, err);
                    reject(err);
                } else {
                    console.log(`✅ VACUUM ejecutado en ${this.clienteSlug}`);
                    resolve();
                }
            });
        });
    }

    // ========== CERRAR CONEXIÓN ==========
    
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error(`❌ Error cerrando BD ${this.clienteSlug}:`, err);
                } else {
                    console.log(`✅ BD cerrada: ${this.clienteSlug}`);
                }
            });
        }
    }
}

module.exports = DatabaseSaasManager;
