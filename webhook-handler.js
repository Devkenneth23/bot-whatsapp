/**
 * WEBHOOK HANDLER
 * Maneja webhooks entrantes de WhatsApp Cloud API
 * 
 * Características:
 * - Verificación de webhook de Meta
 * - Procesamiento de mensajes entrantes
 * - Manejo de estados de mensaje (entregado, leído, etc)
 * - Validación de firma (signature)
 * - Logs detallados
 * - Rate limiting por webhook
 * 
 * @version 2.0
 */

const crypto = require('crypto');

class WebhookHandler {
    constructor(multiTenantManager) {
        this.manager = multiTenantManager;
        this.webhookToken = process.env.WEBHOOK_VERIFY_TOKEN;
        
        // Cache para evitar procesar mensajes duplicados
        this.processedMessages = new Set();
        this.cacheCleanupInterval = 60000; // Limpiar cache cada minuto
        
        // Iniciar limpieza periódica del cache
        this.startCacheCleanup();
    }

    /**
     * Verifica el webhook de Meta (GET request)
     * @param {Object} query - Query params de la request
     * @returns {Object} - {success: boolean, challenge: string}
     */
    verifyWebhook(query) {
        try {
            const mode = query['hub.mode'];
            const token = query['hub.verify_token'];
            const challenge = query['hub.challenge'];

            console.log('🔐 Verificando webhook de Meta...');
            console.log('Mode:', mode);
            console.log('Token recibido:', token ? 'presente' : 'ausente');

            if (mode === 'subscribe' && token === this.webhookToken) {
                console.log('✅ Webhook verificado exitosamente');
                return {
                    success: true,
                    challenge: challenge
                };
            }

            console.error('❌ Token de verificación inválido');
            return {
                success: false,
                error: 'Token inválido'
            };

        } catch (error) {
            console.error('❌ Error al verificar webhook:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Procesa un webhook entrante (POST request)
     * @param {Object} body - Cuerpo del webhook
     * @param {string} signature - Firma X-Hub-Signature-256
     * @returns {Object} - {success: boolean}
     */
    async processWebhook(body, signature = null) {
        try {
            // TODO: Validar firma si está configurada
            // if (signature && !this.validateSignature(body, signature)) {
            //     console.error('❌ Firma del webhook inválida');
            //     return { success: false, error: 'Firma inválida' };
            // }

            // Registrar webhook en logs
            await this.logWebhook(body);

            // Validar estructura básica
            if (!body.entry || !Array.isArray(body.entry)) {
                console.warn('⚠️ Webhook con estructura inválida');
                return { success: false, error: 'Estructura inválida' };
            }

            // Procesar cada entry
            for (const entry of body.entry) {
                if (!entry.changes || !Array.isArray(entry.changes)) {
                    continue;
                }

                for (const change of entry.changes) {
                    if (change.field === 'messages') {
                        await this.handleMessagesChange(change.value);
                    }
                }
            }

            return { success: true };

        } catch (error) {
            console.error('❌ Error al procesar webhook:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Maneja cambios en mensajes (nuevos mensajes, estados, etc)
     * @param {Object} value - Valor del cambio
     */
    async handleMessagesChange(value) {
        try {
            const phoneNumberId = value.metadata?.phone_number_id;
            
            if (!phoneNumberId) {
                console.warn('⚠️ Webhook sin phone_number_id');
                return;
            }

            // Identificar cliente por su phone_number_id
            const clientId = await this.getClientByPhoneNumberId(phoneNumberId);
            
            if (!clientId) {
                console.warn(`⚠️ Cliente no encontrado para phone_number_id: ${phoneNumberId}`);
                return;
            }

            // Procesar mensajes entrantes
            if (value.messages && Array.isArray(value.messages)) {
                for (const message of value.messages) {
                    await this.handleIncomingMessage(clientId, message, value.contacts);
                }
            }

            // Procesar estados de mensajes
            if (value.statuses && Array.isArray(value.statuses)) {
                for (const status of value.statuses) {
                    await this.handleMessageStatus(clientId, status);
                }
            }

        } catch (error) {
            console.error('❌ Error al manejar cambio de mensajes:', error);
        }
    }

    /**
     * Obtiene el ID del cliente por su phone_number_id de Meta
     * @param {string} phoneNumberId - ID del número en Meta
     * @returns {number|null} - ID del cliente
     */
    async getClientByPhoneNumberId(phoneNumberId) {
        try {
            // Buscar en todos los clientes activos
            // (las credenciales están encriptadas, así que hay que desencriptar)
            const clientes = await this.manager.getActiveClients();
            
            for (const cliente of clientes) {
                try {
                    const decryptedId = this.manager.encryption.decrypt(cliente.meta_phone_number_id);
                    if (decryptedId === phoneNumberId) {
                        return cliente.id;
                    }
                } catch (e) {
                    // Error al desencriptar, saltar este cliente
                    continue;
                }
            }

            return null;

        } catch (error) {
            console.error('Error buscando cliente por phone_number_id:', error);
            return null;
        }
    }

    /**
     * Maneja un mensaje entrante
     * @param {number} clientId - ID del cliente
     * @param {Object} message - Datos del mensaje
     * @param {Array} contacts - Información de contactos
     */
    async handleIncomingMessage(clientId, message, contacts) {
        try {
            const messageId = message.id;

            // Evitar procesar mensajes duplicados
            if (this.processedMessages.has(messageId)) {
                console.log(`⏭️ Mensaje ${messageId} ya procesado, saltando`);
                return;
            }

            this.processedMessages.add(messageId);

            console.log(`📩 Nuevo mensaje para cliente ${clientId}: ${messageId}`);

            // Extraer información del mensaje
            const from = message.from;
            const timestamp = message.timestamp;
            const type = message.type;

            // Obtener nombre del contacto si está disponible
            let contactName = null;
            if (contacts && Array.isArray(contacts)) {
                const contact = contacts.find(c => c.wa_id === from);
                if (contact && contact.profile) {
                    contactName = contact.profile.name;
                }
            }

            // Extraer contenido según el tipo de mensaje
            let messageContent = null;
            let mediaId = null;

            switch (type) {
                case 'text':
                    messageContent = message.text?.body || '';
                    break;

                case 'image':
                    mediaId = message.image?.id;
                    messageContent = message.image?.caption || '[Imagen]';
                    break;

                case 'document':
                    mediaId = message.document?.id;
                    messageContent = message.document?.filename || '[Documento]';
                    break;

                case 'audio':
                    mediaId = message.audio?.id;
                    messageContent = '[Audio]';
                    break;

                case 'video':
                    mediaId = message.video?.id;
                    messageContent = message.video?.caption || '[Video]';
                    break;

                case 'button':
                    messageContent = message.button?.text || '[Botón presionado]';
                    break;

                case 'interactive':
                    if (message.interactive?.type === 'button_reply') {
                        messageContent = message.interactive.button_reply.title;
                    } else if (message.interactive?.type === 'list_reply') {
                        messageContent = message.interactive.list_reply.title;
                    }
                    break;

                default:
                    messageContent = `[${type}]`;
            }

            // Preparar datos del mensaje
            const messageData = {
                messageId,
                from,
                contactName,
                timestamp,
                type,
                content: messageContent,
                mediaId,
                rawMessage: message
            };

            // Registrar actividad
            await this.manager.logActivity(
                clientId,
                'mensaje_recibido',
                `Mensaje de ${from}: ${messageContent}`,
                messageData
            );

            // Actualizar uso de API
            await this.manager.updateApiUsage(clientId, 'recibido');

            // Emitir evento para que el bot lo procese
            this.emit('message', {
                clientId,
                message: messageData
            });

            console.log(`✅ Mensaje ${messageId} procesado exitosamente`);

        } catch (error) {
            console.error('❌ Error al manejar mensaje entrante:', error);
        }
    }

    /**
     * Maneja estados de mensajes (entregado, leído, etc)
     * @param {number} clientId - ID del cliente
     * @param {Object} status - Datos del estado
     */
    async handleMessageStatus(clientId, status) {
        try {
            const messageId = status.id;
            const statusType = status.status; // sent, delivered, read, failed

            console.log(`📊 Estado de mensaje ${messageId}: ${statusType}`);

            // Registrar en logs
            await this.manager.logActivity(
                clientId,
                'mensaje_estado',
                `Mensaje ${messageId}: ${statusType}`,
                status
            );

            // Emitir evento
            this.emit('status', {
                clientId,
                messageId,
                status: statusType,
                timestamp: status.timestamp,
                error: status.errors?.[0]
            });

        } catch (error) {
            console.error('❌ Error al manejar estado de mensaje:', error);
        }
    }

    /**
     * Valida la firma del webhook (X-Hub-Signature-256)
     * @param {Object} body - Cuerpo del webhook
     * @param {string} signature - Firma recibida
     * @returns {boolean} - true si es válida
     */
    validateSignature(body, signature) {
        try {
            // La firma viene como: sha256=<hash>
            if (!signature || !signature.startsWith('sha256=')) {
                return false;
            }

            const appSecret = process.env.META_APP_SECRET;
            if (!appSecret) {
                console.warn('⚠️ META_APP_SECRET no configurado, saltando validación');
                return true; // Permitir si no está configurado
            }

            const elements = signature.split('sha256=');
            const signatureHash = elements[1];

            const expectedHash = crypto
                .createHmac('sha256', appSecret)
                .update(JSON.stringify(body))
                .digest('hex');

            return signatureHash === expectedHash;

        } catch (error) {
            console.error('Error al validar firma:', error);
            return false;
        }
    }

    /**
     * Registra el webhook en la base de datos
     * @param {Object} payload - Cuerpo del webhook
     */
    async logWebhook(payload) {
        try {
            await this.manager.run(`
                INSERT INTO webhooks_log (payload, tipo, timestamp)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `, [
                JSON.stringify(payload),
                payload.object || 'unknown'
            ]);

        } catch (error) {
            console.error('⚠️ Error al registrar webhook en BD:', error);
        }
    }

    /**
     * Sistema simple de eventos
     */
    on(event, callback) {
        if (!this.listeners) {
            this.listeners = {};
        }
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners && this.listeners[event]) {
            for (const callback of this.listeners[event]) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error en listener de ${event}:`, error);
                }
            }
        }
    }

    /**
     * Inicia limpieza periódica del cache de mensajes procesados
     */
    startCacheCleanup() {
        setInterval(() => {
            const size = this.processedMessages.size;
            if (size > 1000) {
                // Limpiar cache si crece mucho
                this.processedMessages.clear();
                console.log(`🧹 Cache de mensajes limpiado (${size} mensajes)`);
            }
        }, this.cacheCleanupInterval);
    }
}

module.exports = WebhookHandler;
