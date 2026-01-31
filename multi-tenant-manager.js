/**
 * MULTI-TENANT MANAGER
 * Gestor de múltiples clientes en el sistema SaaS
 * 
 * Características:
 * - Gestión centralizada de clientes
 * - Desencriptación automática de credenciales
 * - Cache de instancias de WhatsApp API
 * - Logs de actividad por cliente
 * - Gestión de límites y cuotas
 * 
 * @version 2.0
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const fs = require('fs');

const { EncryptionService } = require('./encryption-service');

const WhatsAppCloudAPI = require('./whatsapp-cloud-api');

class MultiTenantManager {
    constructor(dbPath = './database/saas.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.encryption = new EncryptionService();
        
        // Cache de instancias de WhatsApp API por cliente
        this.whatsappInstances = new Map();
        
        // Cache de información de clientes
        this.clientCache = new Map();
        
        // TTL del cache: 5 minutos
        this.cacheTTL = 5 * 60 * 1000;
        
        this.initialize();
    }

    /**
     * Inicializa la conexión a la base de datos
     */
    initialize() {
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Error al conectar BD principal:', err);
                    throw err;
                }
                console.log('✅ Base de datos principal conectada');
            });

            this.db.run('PRAGMA journal_mode = WAL');
            
        } catch (error) {
            console.error('❌ Error al inicializar MultiTenantManager:', error);
            throw error;
        }
    }

    /**
     * Wrapper para promisificar consultas
     */
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

    /**
     * Crea un nuevo cliente en el sistema
     * @param {Object} clientData - Datos del cliente
     * @returns {number} - ID del cliente creado
     */
    async createClient(clientData) {
        try {
            // Validar datos requeridos
            const required = ['nombre_negocio', 'email_contacto', 'telefono_contacto', 
                            'meta_phone_number_id', 'meta_access_token', 'meta_business_account_id'];
            
            for (const field of required) {
                if (!clientData[field]) {
                    throw new Error(`Campo requerido faltante: ${field}`);
                }
            }

            // Encriptar credenciales de Meta
            const encryptedPhoneId = this.encryption.encrypt(clientData.meta_phone_number_id);
            const encryptedToken = this.encryption.encrypt(clientData.meta_access_token);
            const encryptedBusinessId = this.encryption.encrypt(clientData.meta_business_account_id);
            
            // Generar token de webhook único para este cliente
            const webhookToken = EncryptionService.generateSecureToken(32);

            // Calcular fecha de próximo pago (30 días)
            const fechaInicio = new Date().toISOString().split('T')[0];
            const fechaProximoPago = new Date();
            fechaProximoPago.setDate(fechaProximoPago.getDate() + 30);

            // Crear paths para archivos del cliente
            const clientId = Date.now(); // Temporal, se reemplaza con el ID real
            const databasePath = `./database/clients/cliente_${clientId}.db`;
            const uploadsPath = `./public/uploads/cliente_${clientId}`;
            const backupsPath = `./backups/cliente_${clientId}`;

            const result = await this.run(`
                INSERT INTO clientes_saas (
                    nombre_negocio, email_contacto, telefono_contacto, nombre_contacto,
                    meta_phone_number_id, meta_access_token, meta_business_account_id,
                    meta_webhook_verify_token, estado, plan, precio_mensual,
                    fecha_inicio, fecha_proximo_pago,
                    database_path, uploads_path, backups_path,
                    bot_activo, mensaje_bienvenida, numero_asesor
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                clientData.nombre_negocio,
                clientData.email_contacto,
                clientData.telefono_contacto,
                clientData.nombre_contacto || null,
                encryptedPhoneId,
                encryptedToken,
                encryptedBusinessId,
                webhookToken,
                clientData.estado || 'activo',
                clientData.plan || 'profesional',
                clientData.precio_mensual || 30000,
                fechaInicio,
                fechaProximoPago.toISOString().split('T')[0],
                databasePath.replace(`_${clientId}`, `_${result.lastID}`),
                uploadsPath.replace(`_${clientId}`, `_${result.lastID}`),
                backupsPath.replace(`_${clientId}`, `_${result.lastID}`),
                1, // bot_activo
                clientData.mensaje_bienvenida || 'Hola! Bienvenido a {negocio}',
                clientData.numero_asesor || null
            ]);

            // Actualizar paths con el ID real
            await this.run(`
                UPDATE clientes_saas 
                SET database_path = ?, uploads_path = ?, backups_path = ?
                WHERE id = ?
            `, [
                `./database/clients/cliente_${result.lastID}.db`,
                `./public/uploads/cliente_${result.lastID}`,
                `./backups/cliente_${result.lastID}`,
                result.lastID
            ]);

            // Crear directorios para el cliente
            await this.createClientDirectories(result.lastID);

            // Crear base de datos individual del cliente
            await this.createClientDatabase(result.lastID);

            // Registrar log
            await this.logActivity(result.lastID, 'cliente_creado', 
                `Cliente ${clientData.nombre_negocio} creado exitosamente`);

            console.log(`✅ Cliente creado: ${clientData.nombre_negocio} (ID: ${result.lastID})`);

            return result.lastID;

        } catch (error) {
            console.error('❌ Error al crear cliente:', error);
            throw error;
        }
    }

    /**
     * Crea directorios necesarios para un cliente
     * @param {number} clientId - ID del cliente
     */
    async createClientDirectories(clientId) {
        const dirs = [
            `./database/clients`,
            `./public/uploads/cliente_${clientId}`,
            `./backups/cliente_${clientId}`
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 Directorio creado: ${dir}`);
            }
        }
    }

    /**
     * Crea la base de datos individual del cliente
     * @param {number} clientId - ID del cliente
     */
    async createClientDatabase(clientId) {
        const dbPath = `./database/clients/cliente_${clientId}.db`;
        
        // Leer schema original (el schema.sql del sistema original)
        const schemaPath = path.join(__dirname, 'schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            throw new Error('Schema original no encontrado');
        }

        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Crear base de datos del cliente
        return new Promise((resolve, reject) => {
            const clientDb = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                clientDb.exec(schema, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    clientDb.close();
                    console.log(`✅ Base de datos creada para cliente ${clientId}`);
                    resolve();
                });
            });
        });
    }

    /**
     * Obtiene información de un cliente
     * @param {number} clientId - ID del cliente
     * @param {boolean} decrypt - Si desencriptar credenciales
     * @returns {Object} - Datos del cliente
     */
    async getClient(clientId, decrypt = true) {
        try {
            // Verificar cache
            const cached = this.clientCache.get(clientId);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
                return cached.data;
            }

            const cliente = await this.get(
                'SELECT * FROM clientes_saas WHERE id = ?',
                [clientId]
            );

            if (!cliente) {
                return null;
            }

            // Desencriptar credenciales si se solicita
            if (decrypt) {
                cliente.meta_phone_number_id = this.encryption.decrypt(cliente.meta_phone_number_id);
                cliente.meta_access_token = this.encryption.decrypt(cliente.meta_access_token);
                cliente.meta_business_account_id = this.encryption.decrypt(cliente.meta_business_account_id);
            }

            // Parsear JSON fields
            if (cliente.ip_permitidas) {
                try {
                    cliente.ip_permitidas = JSON.parse(cliente.ip_permitidas);
                } catch (e) {
                    cliente.ip_permitidas = [];
                }
            }

            // Guardar en cache
            this.clientCache.set(clientId, {
                data: cliente,
                timestamp: Date.now()
            });

            return cliente;

        } catch (error) {
            console.error('❌ Error al obtener cliente:', error);
            throw error;
        }
    }

    /**
     * Obtiene instancia de WhatsApp API para un cliente
     * @param {number} clientId - ID del cliente
     * @returns {WhatsAppCloudAPI} - Instancia configurada
     */
    async getWhatsAppInstance(clientId) {
        try {
            // Verificar si ya existe en cache
            if (this.whatsappInstances.has(clientId)) {
                return this.whatsappInstances.get(clientId);
            }

            // Obtener credenciales del cliente
            const cliente = await this.getClient(clientId, true);

            if (!cliente) {
                throw new Error(`Cliente ${clientId} no encontrado`);
            }

            if (cliente.estado !== 'activo') {
                throw new Error(`Cliente ${clientId} no está activo (estado: ${cliente.estado})`);
            }

            // Crear instancia de WhatsApp API
            const whatsapp = new WhatsAppCloudAPI({
                phoneNumberId: cliente.meta_phone_number_id,
                accessToken: cliente.meta_access_token,
                apiVersion: process.env.META_API_VERSION || 'v21.0'
            });

            // Guardar en cache
            this.whatsappInstances.set(clientId, whatsapp);

            return whatsapp;

        } catch (error) {
            console.error(`❌ Error al obtener instancia WhatsApp para cliente ${clientId}:`, error);
            throw error;
        }
    }

    /**
     * Registra actividad de un cliente
     * @param {number} clientId - ID del cliente
     * @param {string} tipo - Tipo de actividad
     * @param {string} descripcion - Descripción
     * @param {Object} metadata - Datos adicionales
     */
    async logActivity(clientId, tipo, descripcion, metadata = null) {
        try {
            await this.run(`
                INSERT INTO logs_actividad 
                (cliente_saas_id, tipo, descripcion, metadata, timestamp)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                clientId,
                tipo,
                descripcion,
                metadata ? JSON.stringify(metadata) : null
            ]);

        } catch (error) {
            console.error('⚠️ Error al registrar log:', error);
            // No lanzar error, los logs no son críticos
        }
    }

    /**
     * Actualiza uso de API de un cliente
     * @param {number} clientId - ID del cliente
     * @param {string} tipo - 'enviado' o 'recibido'
     */
    async updateApiUsage(clientId, tipo) {
        try {
            const fecha = new Date().toISOString().split('T')[0];
            const campo = tipo === 'enviado' ? 'mensajes_enviados' : 'mensajes_recibidos';

            await this.run(`
                INSERT INTO uso_api (cliente_saas_id, fecha, ${campo})
                VALUES (?, ?, 1)
                ON CONFLICT(cliente_saas_id, fecha) 
                DO UPDATE SET ${campo} = ${campo} + 1
            `, [clientId, fecha]);

        } catch (error) {
            console.error('⚠️ Error al actualizar uso de API:', error);
        }
    }

    /**
     * Verifica límites de rate limiting de un cliente
     * @param {number} clientId - ID del cliente
     * @returns {Object} - {allowed: boolean, reason: string}
     */
    async checkRateLimits(clientId) {
        try {
            const cliente = await this.getClient(clientId, false);
            
            if (!cliente) {
                return { allowed: false, reason: 'Cliente no encontrado' };
            }

            if (cliente.estado !== 'activo') {
                return { allowed: false, reason: 'Cliente no activo' };
            }

            const ahora = new Date();
            const horaActual = ahora.getHours();
            const fechaHoy = ahora.toISOString().split('T')[0];

            // Obtener uso actual
            const uso = await this.get(`
                SELECT mensajes_enviados 
                FROM uso_api 
                WHERE cliente_saas_id = ? AND fecha = ?
            `, [clientId, fechaHoy]);

            const mensajesHoy = uso ? uso.mensajes_enviados : 0;

            // Verificar límite diario
            if (mensajesHoy >= cliente.rate_limit_mensajes_dia) {
                return { 
                    allowed: false, 
                    reason: 'Límite diario excedido',
                    currentUsage: mensajesHoy,
                    limit: cliente.rate_limit_mensajes_dia
                };
            }

            // TODO: Implementar límite por hora si es necesario

            return { allowed: true };

        } catch (error) {
            console.error('Error al verificar rate limits:', error);
            return { allowed: false, reason: 'Error interno' };
        }
    }

    /**
     * Obtiene todos los clientes activos
     * @returns {Array} - Lista de clientes
     */
    async getActiveClients() {
        try {
            return await this.all(
                'SELECT * FROM clientes_saas WHERE estado = ? ORDER BY nombre_negocio',
                ['activo']
            );
        } catch (error) {
            console.error('Error al obtener clientes activos:', error);
            throw error;
        }
    }

    /**
     * Cierra todas las conexiones
     */
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error cerrando BD:', err);
                } else {
                    console.log('✅ Base de datos principal cerrada');
                }
            });
        }

        // Limpiar caches
        this.whatsappInstances.clear();
        this.clientCache.clear();
    }
}

module.exports = MultiTenantManager;
