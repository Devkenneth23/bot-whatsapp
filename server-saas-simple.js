/**
 * SERVER SAAS - WHATSAPP CLOUD API
 * Servidor principal del sistema multi-tenant
 * 
 * Integra:
 * - Webhook de WhatsApp Cloud API
 * - API REST para gestión
 * - Dashboard multi-tenant
 * - Gestión de clientes
 * 
 * @version 2.0
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const MultiTenantManager = require('./multi-tenant-manager');
const WebhookHandler = require('./webhook-handler');
const BotControllerCloud = require('./bot-controller-cloud');
const DatabaseManager = require('./database-saas');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Managers globales
const tenantManager = new MultiTenantManager();
const webhookHandler = new WebhookHandler(tenantManager);

// Cache de instancias de bot por cliente
const botInstances = new Map();

// ========================================
// WEBHOOK ENDPOINTS
// ========================================

/**
 * GET /webhook - Verificación de webhook de Meta
 */
app.get('/webhook', (req, res) => {
    const result = webhookHandler.verifyWebhook(req.query);
    
    if (result.success) {
        res.status(200).send(result.challenge);
    } else {
        res.status(403).send('Forbidden');
    }
});

/**
 * POST /webhook - Recibir mensajes de WhatsApp
 */
app.post('/webhook', async (req, res) => {
    // Responder rápido a Meta (200 OK)
    res.status(200).send('EVENT_RECEIVED');
    
    // Procesar webhook asíncronamente
    try {
        const signature = req.headers['x-hub-signature-256'];
        await webhookHandler.processWebhook(req.body, signature);
    } catch (error) {
        console.error('Error procesando webhook:', error);
    }
});

// ========================================
// MANEJO DE MENSAJES
// ========================================

/**
 * Escuchar mensajes del webhook y pasarlos al bot correspondiente
 */
webhookHandler.on('message', async (data) => {
    try {
        const { clientId, message } = data;
        
        // Obtener o crear instancia del bot para este cliente
        let bot = botInstances.get(clientId);
        
        if (!bot) {
            // Crear nueva instancia del bot
            const cliente = await tenantManager.getClient(clientId);
            const whatsapp = await tenantManager.getWhatsAppInstance(clientId);
            const db = new DatabaseManager(cliente.database_path);
            
            // Obtener configuración del bot
            const config = {
                nombreNegocio: cliente.nombre_negocio,
                mensajeBienvenida: cliente.mensaje_bienvenida || 'Hola! Bienvenido a {negocio}',
                numeroAsesor: cliente.numero_asesor,
                opciones: {
                    verServicios: true,
                    precios: true,
                    agendar: true,
                    ubicacion: true,
                    horarios: true,
                    faq: true
                },
                ubicacion: 'Dirección del negocio',
                horarios: 'Horarios de atención'
            };
            
            bot = new BotControllerCloud(clientId, config, db, whatsapp);
            await bot.start();
            
            botInstances.set(clientId, bot);
            console.log(`✅ Bot iniciado para cliente ${clientId}`);
        }
        
        // Pasar mensaje al bot
        await bot.handleMessage(message);
        
        // Actualizar uso de API
        await tenantManager.updateApiUsage(clientId, 'recibido');
        
    } catch (error) {
        console.error('Error manejando mensaje:', error);
    }
});

// ========================================
// API - GESTIÓN DE CLIENTES
// ========================================

/**
 * POST /api/clients - Crear nuevo cliente
 */
app.post('/api/clients', async (req, res) => {
    try {
        const clientData = req.body;
        
        // Validar datos requeridos
        const required = ['nombre_negocio', 'email_contacto', 'telefono_contacto',
                         'meta_phone_number_id', 'meta_access_token', 'meta_business_account_id'];
        
        for (const field of required) {
            if (!clientData[field]) {
                return res.status(400).json({
                    success: false,
                    error: `Campo requerido: ${field}`
                });
            }
        }
        
        const clientId = await tenantManager.createClient(clientData);
        
        res.json({
            success: true,
            clientId: clientId,
            message: 'Cliente creado exitosamente'
        });
        
    } catch (error) {
        console.error('Error creando cliente:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/clients - Listar clientes activos
 */
app.get('/api/clients', async (req, res) => {
    try {
        const clientes = await tenantManager.getActiveClients();
        
        // Ocultar credenciales sensibles
        const clientesSeguros = clientes.map(c => ({
            id: c.id,
            nombre_negocio: c.nombre_negocio,
            email_contacto: c.email_contacto,
            telefono_contacto: c.telefono_contacto,
            estado: c.estado,
            plan: c.plan,
            precio_mensual: c.precio_mensual,
            fecha_inicio: c.fecha_inicio,
            fecha_proximo_pago: c.fecha_proximo_pago,
            created_at: c.created_at
        }));
        
        res.json({
            success: true,
            clientes: clientesSeguros
        });
        
    } catch (error) {
        console.error('Error obteniendo clientes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/clients/:id - Obtener cliente específico
 */
app.get('/api/clients/:id', async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        const cliente = await tenantManager.getClient(clientId, false); // No desencriptar
        
        if (!cliente) {
            return res.status(404).json({
                success: false,
                error: 'Cliente no encontrado'
            });
        }
        
        // Ocultar credenciales
        delete cliente.meta_phone_number_id;
        delete cliente.meta_access_token;
        delete cliente.meta_business_account_id;
        delete cliente.meta_webhook_verify_token;
        
        res.json({
            success: true,
            cliente: cliente
        });
        
    } catch (error) {
        console.error('Error obteniendo cliente:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/clients/:id/status - Estado del bot del cliente
 */
app.get('/api/clients/:id/status', async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        const bot = botInstances.get(clientId);
        
        if (!bot) {
            return res.json({
                success: true,
                status: 'stopped',
                isRunning: false
            });
        }
        
        res.json({
            success: true,
            ...bot.getStatus()
        });
        
    } catch (error) {
        console.error('Error obteniendo estado:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========================================
// API - ENVIAR MENSAJES (Para testing)
// ========================================

/**
 * POST /api/clients/:id/send-message - Enviar mensaje de prueba
 */
app.post('/api/clients/:id/send-message', async (req, res) => {
    try {
        const clientId = parseInt(req.params.id);
        const { to, message } = req.body;
        
        if (!to || !message) {
            return res.status(400).json({
                success: false,
                error: 'Campos requeridos: to, message'
            });
        }
        
        const whatsapp = await tenantManager.getWhatsAppInstance(clientId);
        const result = await whatsapp.sendTextMessage(to, message);
        
        if (result.success) {
            await tenantManager.updateApiUsage(clientId, 'enviado');
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========================================
// API - DASHBOARD (Para futuro)
// ========================================

/**
 * GET /api/dashboard/stats - Estadísticas generales
 */
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const clientes = await tenantManager.getActiveClients();
        
        res.json({
            success: true,
            stats: {
                total_clientes: clientes.length,
                clientes_activos: clientes.filter(c => c.estado === 'activo').length,
                bots_running: botInstances.size
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========================================
// UTILIDADES
// ========================================

/**
 * GET /health - Health check
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        bots_running: botInstances.size
    });
});

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 SERVIDOR SAAS WHATSAPP CLOUD API');
    console.log('='.repeat(50));
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📱 Webhook: http://localhost:${PORT}/webhook`);
    console.log(`📊 Health: http://localhost:${PORT}/health`);
    console.log('');
    console.log('📝 Endpoints:');
    console.log('   POST /api/clients - Crear cliente');
    console.log('   GET  /api/clients - Listar clientes');
    console.log('   GET  /api/clients/:id - Ver cliente');
    console.log('   GET  /api/clients/:id/status - Estado del bot');
    console.log('   POST /api/clients/:id/send-message - Enviar mensaje');
    console.log('='.repeat(50));
});

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Limpieza al cerrar
process.on('SIGTERM', async () => {
    console.log('🛑 Cerrando servidor...');
    
    // Detener todos los bots
    for (const [clientId, bot] of botInstances.entries()) {
        await bot.stop();
        console.log(`✅ Bot ${clientId} detenido`);
    }
    
    // Cerrar BD
    tenantManager.close();
    
    process.exit(0);
});

module.exports = app;
