// server-saas.js - Servidor Multi-tenant con WhatsApp Cloud API
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Managers
const MultiTenantManager = require('./multi-tenant-manager');
const WebhookHandler = require('./webhook-handler');
const DatabaseSaasManager = require('./database-saas');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || crypto.randomBytes(32).toString('hex');

// Base de datos principal SaaS
const saasDb = new sqlite3.Database('./database/saas.db');

// Multi-tenant manager global
const tenantManager = new MultiTenantManager();

// Webhook handler global
const webhookHandler = new WebhookHandler(tenantManager);

// ========== CONFIGURACIÓN DE SEGURIDAD ==========

app.use(helmet({
    contentSecurityPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
    },
}));

// Rate limiters
const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // 100 requests por minuto
    message: 'Demasiadas solicitudes de webhook'
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // 100 requests
    message: 'Demasiadas solicitudes'
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: 'Demasiados intentos de login'
});

// ========== MULTER PARA UPLOADS ==========

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const clienteSlug = req.params.clienteSlug || 'default';
        const uploadPath = `./public/uploads/${clienteSlug}`;
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'file-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido'));
        }
    }
});

// ========== MIDDLEWARE ==========

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Servir archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ========== WEBHOOKS DE META (NO REQUIEREN AUTH) ==========

// GET: Verificación del webhook
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log('📱 Verificación de webhook recibida');
    
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ Webhook verificado correctamente');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Verificación de webhook fallida');
        res.status(403).send('Forbidden');
    }
});

// POST: Recibir mensajes de WhatsApp
app.post('/webhook', webhookLimiter, async (req, res) => {
    try {
        // Responder inmediatamente a Meta (dentro de 20 segundos)
        res.status(200).send('EVENT_RECEIVED');
        
        // Procesar el webhook de forma asíncrona
        await webhookHandler.handleWebhook(req.body);
        
    } catch (error) {
        console.error('❌ Error procesando webhook:', error);
        // Ya respondimos 200, solo logueamos el error
    }
});

// ========== AUTENTICACIÓN ==========

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// Login de administrador SaaS
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Credenciales requeridas' });
        }
        
        // Buscar admin en BD SaaS
        saasDb.get(
            'SELECT * FROM admins_saas WHERE username = ? AND activo = 1',
            [username],
            async (err, admin) => {
                if (err || !admin) {
                    return res.status(401).json({ error: 'Credenciales incorrectas' });
                }
                
                const validPassword = await bcrypt.compare(password, admin.password_hash);
                
                if (!validPassword) {
                    return res.status(401).json({ error: 'Credenciales incorrectas' });
                }
                
                const token = jwt.sign(
                    { 
                        id: admin.id, 
                        username: admin.username, 
                        rol: 'admin' 
                    },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );
                
                res.json({
                    token,
                    user: {
                        id: admin.id,
                        username: admin.username,
                        nombre: admin.nombre,
                        rol: 'admin'
                    }
                });
            }
        );
        
    } catch (error) {
        console.error('❌ Error en login:', error);
        res.status(500).json({ error: 'Error en login' });
    }
});

// Login de cliente SaaS
app.post('/api/auth/login/cliente/:clienteSlug', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const { clienteSlug } = req.params;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Credenciales requeridas' });
        }
        
        // Buscar cliente
        saasDb.get(
            'SELECT * FROM clientes_saas WHERE slug = ? AND activo = 1',
            [clienteSlug],
            async (err, cliente) => {
                if (err || !cliente) {
                    return res.status(404).json({ error: 'Cliente no encontrado' });
                }
                
                // Verificar credenciales del cliente
                if (username !== cliente.username) {
                    return res.status(401).json({ error: 'Credenciales incorrectas' });
                }
                
                const validPassword = await bcrypt.compare(password, cliente.password_hash);
                
                if (!validPassword) {
                    return res.status(401).json({ error: 'Credenciales incorrectas' });
                }
                
                const token = jwt.sign(
                    { 
                        id: cliente.id, 
                        slug: cliente.slug,
                        nombre: cliente.nombre_negocio,
                        rol: 'cliente' 
                    },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );
                
                res.json({
                    token,
                    user: {
                        id: cliente.id,
                        slug: cliente.slug,
                        nombre: cliente.nombre_negocio,
                        rol: 'cliente'
                    }
                });
            }
        );
        
    } catch (error) {
        console.error('❌ Error en login cliente:', error);
        res.status(500).json({ error: 'Error en login' });
    }
});

// ========== RUTAS PÚBLICAS ==========

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'WhatsApp Bot SaaS'
    });
});

app.get('/', (req, res) => {
    res.json({
        service: 'WhatsApp Bot SaaS Multi-tenant',
        version: '1.0.0',
        endpoints: {
            webhook: '/webhook',
            auth: '/api/auth/login',
            health: '/api/health'
        }
    });
});

// ========== API ADMINISTRADOR SAAS ==========

// Listar todos los clientes
app.get('/api/admin/clientes', authMiddleware, apiLimiter, (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    saasDb.all(
        'SELECT id, slug, nombre_negocio, telefono, email, plan, estado, created_at FROM clientes_saas WHERE activo = 1',
        [],
        (err, clientes) => {
            if (err) {
                return res.status(500).json({ error: 'Error al obtener clientes' });
            }
            res.json(clientes);
        }
    );
});

// Crear nuevo cliente SaaS
app.post('/api/admin/clientes', authMiddleware, apiLimiter, async (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    try {
        const {
            slug,
            nombre_negocio,
            telefono,
            email,
            username,
            password,
            phone_number_id,
            access_token,
            business_account_id,
            config
        } = req.body;
        
        // Validar campos requeridos
        if (!slug || !nombre_negocio || !username || !password) {
            return res.status(400).json({ error: 'Campos requeridos faltantes' });
        }
        
        // Hash de contraseña
        const password_hash = await bcrypt.hash(password, 10);
        
        // Encriptar credenciales de Meta
        const encryptionService = require('./encryption-service');
        const encrypted_access_token = encryptionService.encrypt(access_token);
        
        // Insertar cliente
        saasDb.run(
            `INSERT INTO clientes_saas (
                slug, nombre_negocio, telefono, email, username, password_hash,
                phone_number_id, access_token_encrypted, business_account_id,
                config_json, plan, estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                slug, nombre_negocio, telefono, email, username, password_hash,
                phone_number_id, encrypted_access_token, business_account_id,
                JSON.stringify(config || {}), 'profesional', 'activo'
            ],
            async function(err) {
                if (err) {
                    console.error('Error creando cliente:', err);
                    return res.status(500).json({ error: 'Error al crear cliente' });
                }
                
                // Crear BD individual del cliente
                await tenantManager.createClientDatabase(slug);
                
                res.status(201).json({
                    message: 'Cliente creado exitosamente',
                    clienteId: this.lastID,
                    slug: slug
                });
            }
        );
        
    } catch (error) {
        console.error('❌ Error creando cliente:', error);
        res.status(500).json({ error: 'Error al crear cliente' });
    }
});

// Obtener estadísticas de un cliente
app.get('/api/admin/clientes/:clienteSlug/stats', authMiddleware, apiLimiter, async (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    try {
        const { clienteSlug } = req.params;
        const dbManager = new DatabaseSaasManager(clienteSlug);
        const stats = await dbManager.getDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error('Error obteniendo stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// ========== API CLIENTE INDIVIDUAL ==========

// Dashboard stats del cliente
app.get('/api/cliente/dashboard/stats', authMiddleware, apiLimiter, async (req, res) => {
    if (req.user.rol !== 'cliente') {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    try {
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const stats = await dbManager.getDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// SERVICIOS
app.get('/api/cliente/servicios', authMiddleware, apiLimiter, async (req, res) => {
    try {
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const servicios = await dbManager.getAllServicios();
        res.json(servicios);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
});

app.post('/api/cliente/servicios', authMiddleware, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, precio, descripcion } = req.body;
        
        if (!nombre || !precio) {
            return res.status(400).json({ error: 'Nombre y precio requeridos' });
        }
        
        const imagenPath = req.file ? `/uploads/${req.user.slug}/${req.file.filename}` : null;
        
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const id = await dbManager.createServicio({
            nombre,
            precio: parseFloat(precio),
            descripcion,
            imagen: imagenPath
        });
        
        res.status(201).json({ 
            id, 
            message: 'Servicio creado',
            imagen: imagenPath 
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al crear servicio' });
    }
});

app.put('/api/cliente/servicios/:id', authMiddleware, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, precio, descripcion } = req.body;
        
        let imagenPath = req.body.imagenUrl || null;
        if (req.file) {
            imagenPath = `/uploads/${req.user.slug}/${req.file.filename}`;
        }
        
        const dbManager = new DatabaseSaasManager(req.user.slug);
        await dbManager.updateServicio(req.params.id, {
            nombre,
            precio: parseFloat(precio),
            descripcion,
            imagen: imagenPath
        });
        
        res.json({ message: 'Servicio actualizado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

app.delete('/api/cliente/servicios/:id', authMiddleware, async (req, res) => {
    try {
        const dbManager = new DatabaseSaasManager(req.user.slug);
        await dbManager.deleteServicio(req.params.id);
        res.json({ message: 'Servicio eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// CITAS
app.get('/api/cliente/citas', authMiddleware, async (req, res) => {
    try {
        const { estado, fecha, limit = 100, offset = 0 } = req.query;
        const dbManager = new DatabaseSaasManager(req.user.slug);
        
        let citas;
        if (estado) {
            citas = await dbManager.getCitasByEstado(estado);
        } else if (fecha) {
            citas = await dbManager.getCitasByFecha(fecha);
        } else {
            citas = await dbManager.getAllCitas(parseInt(limit), parseInt(offset));
        }
        
        res.json(citas);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener citas' });
    }
});

app.get('/api/cliente/citas/:id', authMiddleware, async (req, res) => {
    try {
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const cita = await dbManager.getCitaById(req.params.id);
        
        if (!cita) {
            return res.status(404).json({ error: 'Cita no encontrada' });
        }
        
        res.json(cita);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

app.put('/api/cliente/citas/:id/estado', authMiddleware, async (req, res) => {
    try {
        const { estado } = req.body;
        
        if (!['confirmada', 'completada', 'cancelada', 'pendiente'].includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }
        
        const dbManager = new DatabaseSaasManager(req.user.slug);
        await dbManager.updateCitaEstado(req.params.id, estado);
        
        res.json({ message: 'Estado actualizado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

app.delete('/api/cliente/citas/:id', authMiddleware, async (req, res) => {
    try {
        const dbManager = new DatabaseSaasManager(req.user.slug);
        await dbManager.deleteCita(req.params.id);
        res.json({ message: 'Cita eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// CLIENTES (usuarios finales del negocio)
app.get('/api/cliente/clientes', authMiddleware, async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const clientes = await dbManager.getAllClientes(parseInt(limit), parseInt(offset));
        res.json(clientes);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// HORARIOS
app.get('/api/cliente/horarios', authMiddleware, async (req, res) => {
    try {
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const horarios = await dbManager.getAllHorarios();
        res.json(horarios);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

app.post('/api/cliente/horarios', authMiddleware, async (req, res) => {
    try {
        const { dia, hora } = req.body;
        
        if (!dia || !hora) {
            return res.status(400).json({ error: 'Día y hora requeridos' });
        }
        
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const id = await dbManager.createHorario({ dia, hora });
        
        res.status(201).json({ id, message: 'Horario creado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear horario' });
    }
});

app.delete('/api/cliente/horarios/:id', authMiddleware, async (req, res) => {
    try {
        const dbManager = new DatabaseSaasManager(req.user.slug);
        await dbManager.deleteHorario(req.params.id);
        res.json({ message: 'Horario eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// FAQs
app.get('/api/cliente/faqs', authMiddleware, async (req, res) => {
    try {
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const faqs = await dbManager.getAllFAQs();
        res.json(faqs);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

app.post('/api/cliente/faqs', authMiddleware, async (req, res) => {
    try {
        const { pregunta, respuesta } = req.body;
        
        if (!pregunta || !respuesta) {
            return res.status(400).json({ error: 'Pregunta y respuesta requeridas' });
        }
        
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const id = await dbManager.createFAQ({ pregunta, respuesta });
        
        res.status(201).json({ id, message: 'FAQ creado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

app.put('/api/cliente/faqs/:id', authMiddleware, async (req, res) => {
    try {
        const { pregunta, respuesta } = req.body;
        const dbManager = new DatabaseSaasManager(req.user.slug);
        await dbManager.updateFAQ(req.params.id, { pregunta, respuesta });
        res.json({ message: 'FAQ actualizado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

app.delete('/api/cliente/faqs/:id', authMiddleware, async (req, res) => {
    try {
        const dbManager = new DatabaseSaasManager(req.user.slug);
        await dbManager.deleteFAQ(req.params.id);
        res.json({ message: 'FAQ eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// CONVERSACIONES
app.get('/api/cliente/conversaciones/:clienteId', authMiddleware, async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const dbManager = new DatabaseSaasManager(req.user.slug);
        const conversaciones = await dbManager.getConversacionesByCliente(
            req.params.clienteId,
            parseInt(limit)
        );
        res.json(conversaciones);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// ========== MANEJO DE ERRORES ==========

app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err);
    res.status(500).json({ 
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ========== INICIO DEL SERVIDOR ==========

app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   🚀 WHATSAPP BOT SAAS MULTI-TENANT                      ║
    ║                                                           ║
    ║   📡 Servidor corriendo en: http://localhost:${PORT}     ║
    ║   🔐 JWT Secret: ${JWT_SECRET.substring(0, 20)}...                  ║
    ║   🔑 Webhook Token: ${WEBHOOK_VERIFY_TOKEN.substring(0, 20)}...              ║
    ║                                                           ║
    ║   📋 Endpoints principales:                               ║
    ║      GET  /webhook           - Verificación Meta         ║
    ║      POST /webhook           - Recibir mensajes          ║
    ║      POST /api/auth/login    - Login administrador       ║
    ║      GET  /api/health        - Health check              ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    `);
    
    // Verificar variables críticas
    if (!process.env.MASTER_ENCRYPTION_KEY) {
        console.warn('⚠️  ADVERTENCIA: MASTER_ENCRYPTION_KEY no configurado');
    }
    
    if (!process.env.PUBLIC_URL) {
        console.warn('⚠️  ADVERTENCIA: PUBLIC_URL no configurado');
    }
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
    console.log('📴 SIGTERM recibido. Cerrando servidor...');
    saasDb.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 SIGINT recibido. Cerrando servidor...');
    saasDb.close();
    process.exit(0);
});

module.exports = app;
