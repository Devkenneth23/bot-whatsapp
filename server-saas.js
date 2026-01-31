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
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: 'Demasiadas solicitudes de webhook'
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Demasiadas solicitudes'
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: 'Demasiados intentos de login'
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
        res.status(200).send('EVENT_RECEIVED');
        await webhookHandler.handleWebhook(req.body);
    } catch (error) {
        console.error('❌ Error procesando webhook:', error);
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
                    { id: admin.id, username: admin.username, rol: 'admin' },
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
        
        if (!slug || !nombre_negocio || !username || !password) {
            return res.status(400).json({ error: 'Campos requeridos faltantes' });
        }
        
        const password_hash = await bcrypt.hash(password, 10);
        const encryptionService = require('./encryption-service');
        const encrypted_access_token = encryptionService.encrypt(access_token);
        
        saasDb.run(
            `INSERT INTO clientes_saas (
                slug, nombre_negocio, telefono, email, username, password_hash,
                phone_number_id, access_token_encrypted, business_account_id,
                config_json, plan, estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'profesional', 'activo')`,
            [
                slug, nombre_negocio, telefono, email, username, password_hash,
                phone_number_id, encrypted_access_token, business_account_id,
                JSON.stringify(config || {})
            ],
            async function(err) {
                if (err) {
                    console.error('Error creando cliente:', err);
                    return res.status(500).json({ error: 'Error al crear cliente' });
                }
                
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
});

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
