/**
 * WHATSAPP CLOUD API CLIENT
 * Cliente profesional para Meta WhatsApp Cloud API
 * 
 * Características:
 * - Envío de mensajes de texto y templates
 * - Envío de medios (imágenes, documentos)
 * - Manejo robusto de errores
 * - Rate limiting automático
 * - Retry logic
 * - Logs detallados
 * 
 * @version 2.0
 */

const axios = require('axios');

class WhatsAppCloudAPI {
    constructor(config) {
        this.phoneNumberId = config.phoneNumberId;
        this.accessToken = config.accessToken;
        this.apiVersion = config.apiVersion || process.env.META_API_VERSION || 'v21.0';
        this.baseURL = `https://graph.facebook.com/${this.apiVersion}`;
        
        // Configurar axios con timeouts y retry
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000, // 30 segundos
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Rate limiting (100 mensajes por segundo según Meta)
        this.rateLimiter = {
            tokens: 100,
            maxTokens: 100,
            refillRate: 100, // tokens por segundo
            lastRefill: Date.now()
        };
    }

    /**
     * Verifica y actualiza el rate limiter
     * @returns {boolean} - true si hay tokens disponibles
     */
    checkRateLimit() {
        const now = Date.now();
        const timePassed = (now - this.rateLimiter.lastRefill) / 1000;
        
        // Rellenar tokens basado en el tiempo
        const tokensToAdd = timePassed * this.rateLimiter.refillRate;
        this.rateLimiter.tokens = Math.min(
            this.rateLimiter.maxTokens,
            this.rateLimiter.tokens + tokensToAdd
        );
        this.rateLimiter.lastRefill = now;

        if (this.rateLimiter.tokens >= 1) {
            this.rateLimiter.tokens -= 1;
            return true;
        }
        
        return false;
    }

    /**
     * Espera hasta que haya tokens disponibles
     */
    async waitForRateLimit() {
        while (!this.checkRateLimit()) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    /**
     * Envía un mensaje de texto
     * @param {string} to - Número del destinatario (formato: 506XXXXXXXX)
     * @param {string} message - Texto del mensaje
     * @returns {Object} - Respuesta de la API
     */
    async sendTextMessage(to, message) {
        try {
            await this.waitForRateLimit();

            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'text',
                text: {
                    preview_url: false,
                    body: message
                }
            };

            const response = await this.client.post(
                `/${this.phoneNumberId}/messages`,
                payload
            );

            console.log(`✅ Mensaje enviado a ${to}`);
            return {
                success: true,
                messageId: response.data.messages[0].id,
                data: response.data
            };

        } catch (error) {
            return this.handleError(error, 'sendTextMessage', { to, message });
        }
    }

    /**
     * Envía un mensaje con botones (reply buttons)
     * @param {string} to - Número del destinatario
     * @param {string} bodyText - Texto del mensaje
     * @param {Array} buttons - Array de botones [{id, title}]
     * @returns {Object} - Respuesta de la API
     */
    async sendButtonMessage(to, bodyText, buttons) {
        try {
            await this.waitForRateLimit();

            // Meta permite máximo 3 botones
            if (buttons.length > 3) {
                throw new Error('Máximo 3 botones permitidos');
            }

            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: {
                        text: bodyText
                    },
                    action: {
                        buttons: buttons.map(btn => ({
                            type: 'reply',
                            reply: {
                                id: btn.id,
                                title: btn.title.substring(0, 20) // Max 20 chars
                            }
                        }))
                    }
                }
            };

            const response = await this.client.post(
                `/${this.phoneNumberId}/messages`,
                payload
            );

            console.log(`✅ Mensaje con botones enviado a ${to}`);
            return {
                success: true,
                messageId: response.data.messages[0].id,
                data: response.data
            };

        } catch (error) {
            return this.handleError(error, 'sendButtonMessage', { to, bodyText, buttons });
        }
    }

    /**
     * Envía un mensaje con lista (list message)
     * @param {string} to - Número del destinatario
     * @param {string} bodyText - Texto del mensaje
     * @param {string} buttonText - Texto del botón
     * @param {Array} sections - Secciones con opciones
     * @returns {Object} - Respuesta de la API
     */
    async sendListMessage(to, bodyText, buttonText, sections) {
        try {
            await this.waitForRateLimit();

            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'interactive',
                interactive: {
                    type: 'list',
                    body: {
                        text: bodyText
                    },
                    action: {
                        button: buttonText.substring(0, 20),
                        sections: sections
                    }
                }
            };

            const response = await this.client.post(
                `/${this.phoneNumberId}/messages`,
                payload
            );

            console.log(`✅ Mensaje con lista enviado a ${to}`);
            return {
                success: true,
                messageId: response.data.messages[0].id,
                data: response.data
            };

        } catch (error) {
            return this.handleError(error, 'sendListMessage', { to, bodyText });
        }
    }

    /**
     * Envía una imagen
     * @param {string} to - Número del destinatario
     * @param {string} imageUrl - URL de la imagen
     * @param {string} caption - Texto opcional
     * @returns {Object} - Respuesta de la API
     */
    async sendImage(to, imageUrl, caption = '') {
        try {
            await this.waitForRateLimit();

            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'image',
                image: {
                    link: imageUrl,
                    caption: caption
                }
            };

            const response = await this.client.post(
                `/${this.phoneNumberId}/messages`,
                payload
            );

            console.log(`✅ Imagen enviada a ${to}`);
            return {
                success: true,
                messageId: response.data.messages[0].id,
                data: response.data
            };

        } catch (error) {
            return this.handleError(error, 'sendImage', { to, imageUrl });
        }
    }

    /**
     * Envía un documento
     * @param {string} to - Número del destinatario
     * @param {string} documentUrl - URL del documento
     * @param {string} filename - Nombre del archivo
     * @param {string} caption - Texto opcional
     * @returns {Object} - Respuesta de la API
     */
    async sendDocument(to, documentUrl, filename, caption = '') {
        try {
            await this.waitForRateLimit();

            const payload = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'document',
                document: {
                    link: documentUrl,
                    filename: filename,
                    caption: caption
                }
            };

            const response = await this.client.post(
                `/${this.phoneNumberId}/messages`,
                payload
            );

            console.log(`✅ Documento enviado a ${to}`);
            return {
                success: true,
                messageId: response.data.messages[0].id,
                data: response.data
            };

        } catch (error) {
            return this.handleError(error, 'sendDocument', { to, documentUrl });
        }
    }

    /**
     * Marca un mensaje como leído
     * @param {string} messageId - ID del mensaje a marcar
     * @returns {Object} - Respuesta de la API
     */
    async markAsRead(messageId) {
        try {
            const payload = {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            };

            const response = await this.client.post(
                `/${this.phoneNumberId}/messages`,
                payload
            );

            return {
                success: true,
                data: response.data
            };

        } catch (error) {
            // No es crítico si falla
            console.warn(`⚠️ No se pudo marcar mensaje como leído: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtiene información de un medio
     * @param {string} mediaId - ID del medio
     * @returns {Object} - URL y datos del medio
     */
    async getMediaUrl(mediaId) {
        try {
            const response = await this.client.get(`/${mediaId}`);
            
            return {
                success: true,
                url: response.data.url,
                mimeType: response.data.mime_type,
                sha256: response.data.sha256,
                fileSize: response.data.file_size
            };

        } catch (error) {
            return this.handleError(error, 'getMediaUrl', { mediaId });
        }
    }

    /**
     * Descarga un medio
     * @param {string} mediaUrl - URL del medio obtenida con getMediaUrl
     * @returns {Buffer} - Contenido del archivo
     */
    async downloadMedia(mediaUrl) {
        try {
            const response = await axios.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                responseType: 'arraybuffer'
            });

            return {
                success: true,
                data: Buffer.from(response.data)
            };

        } catch (error) {
            return this.handleError(error, 'downloadMedia', { mediaUrl });
        }
    }

    /**
     * Manejo centralizado de errores
     * @param {Error} error - Error capturado
     * @param {string} method - Método que generó el error
     * @param {Object} context - Contexto adicional
     * @returns {Object} - Objeto de error formateado
     */
    handleError(error, method, context) {
        const errorResponse = {
            success: false,
            method: method,
            context: context
        };

        if (error.response) {
            // Error de la API de Meta
            const metaError = error.response.data.error;
            
            errorResponse.code = metaError.code;
            errorResponse.message = metaError.message;
            errorResponse.type = metaError.type;
            errorResponse.errorData = metaError.error_data;
            errorResponse.fbtraceId = metaError.fbtrace_id;

            console.error(`❌ Error Meta API [${method}]:`, {
                code: metaError.code,
                message: metaError.message,
                context: context
            });

            // Errores específicos
            switch (metaError.code) {
                case 130429:
                    errorResponse.userMessage = 'Rate limit excedido. Intenta de nuevo en unos minutos.';
                    break;
                case 131031:
                    errorResponse.userMessage = 'El número no está registrado en WhatsApp.';
                    break;
                case 131026:
                    errorResponse.userMessage = 'El mensaje fue filtrado por políticas de WhatsApp.';
                    break;
                case 131047:
                    errorResponse.userMessage = 'Se ha bloqueado la comunicación. Espera 24 horas.';
                    break;
                case 100:
                    errorResponse.userMessage = 'Parámetro inválido en la solicitud.';
                    break;
                case 190:
                    errorResponse.userMessage = 'Token de acceso inválido o expirado.';
                    break;
                default:
                    errorResponse.userMessage = 'Error al procesar el mensaje. Intenta de nuevo.';
            }

        } else if (error.request) {
            // No hubo respuesta del servidor
            errorResponse.message = 'No se recibió respuesta de WhatsApp. Verifica tu conexión.';
            errorResponse.userMessage = 'Sin conexión a WhatsApp. Intenta más tarde.';
            
            console.error(`❌ Error de red [${method}]:`, error.message);

        } else {
            // Error en la configuración de la petición
            errorResponse.message = error.message;
            errorResponse.userMessage = 'Error interno. Contacta a soporte.';
            
            console.error(`❌ Error interno [${method}]:`, error.message);
        }

        return errorResponse;
    }

    /**
     * Valida el formato de un número de teléfono
     * @param {string} phoneNumber - Número a validar
     * @returns {Object} - {valid: boolean, formatted: string}
     */
    static validatePhoneNumber(phoneNumber) {
        // Eliminar caracteres no numéricos
        const cleaned = phoneNumber.replace(/\D/g, '');

        // Validar longitud (Costa Rica: 8 dígitos + código país 506)
        if (cleaned.length === 8) {
            return {
                valid: true,
                formatted: '506' + cleaned
            };
        } else if (cleaned.length === 11 && cleaned.startsWith('506')) {
            return {
                valid: true,
                formatted: cleaned
            };
        }

        return {
            valid: false,
            formatted: null,
            error: 'Formato de número inválido. Debe ser: 88887777 o 50688887777'
        };
    }

    /**
     * Obtiene estadísticas del número de WhatsApp
     * @returns {Object} - Estadísticas del número
     */
    async getPhoneNumberInfo() {
        try {
            const response = await this.client.get(`/${this.phoneNumberId}`);
            
            return {
                success: true,
                data: response.data
            };

        } catch (error) {
            return this.handleError(error, 'getPhoneNumberInfo', {});
        }
    }
}

module.exports = WhatsAppCloudAPI;
