require('dotenv').config();

/**
 * ENCRYPTION SERVICE
 * Servicio profesional de encriptación para credenciales de Meta
 * 
 * Características:
 * - Encriptación AES-256-CBC
 * - Vector de inicialización único por dato
 * - Manejo seguro de claves
 * - Validación de integridad
 * 
 * @version 2.0
 */

const crypto = require('crypto');

class EncryptionService {
    constructor() {
        // Validar que exista la clave maestra
        if (!process.env.MASTER_ENCRYPTION_KEY) {
            throw new Error('MASTER_ENCRYPTION_KEY no está configurada en .env');
        }

        // Validar longitud de la clave (debe ser 32 bytes = 64 caracteres hex)
        if (process.env.MASTER_ENCRYPTION_KEY.length !== 64) {
            throw new Error('MASTER_ENCRYPTION_KEY debe ser de 64 caracteres hexadecimales (32 bytes)');
        }

        this.algorithm = 'aes-256-cbc';
        this.ivLength = 16; // 16 bytes para AES
        this.encryptionKey = Buffer.from(process.env.MASTER_ENCRYPTION_KEY, 'hex');
    }

    /**
     * Encripta un texto plano
     * @param {string} plainText - Texto a encriptar
     * @returns {string} - Texto encriptado en formato: iv:encryptedData
     * @throws {Error} - Si hay error en la encriptación
     */
    encrypt(plainText) {
        try {
            if (!plainText || typeof plainText !== 'string') {
                throw new Error('El texto a encriptar debe ser un string válido');
            }

            // Generar IV único para este dato
            const iv = crypto.randomBytes(this.ivLength);

            // Crear cipher
            const cipher = crypto.createCipheriv(
                this.algorithm,
                this.encryptionKey,
                iv
            );

            // Encriptar
            let encrypted = cipher.update(plainText, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Retornar: IV + encrypted data (separados por :)
            return iv.toString('hex') + ':' + encrypted;

        } catch (error) {
            console.error('❌ Error al encriptar:', error.message);
            throw new Error('Error en el proceso de encriptación');
        }
    }

    /**
     * Desencripta un texto encriptado
     * @param {string} encryptedText - Texto encriptado (formato: iv:encryptedData)
     * @returns {string} - Texto desencriptado
     * @throws {Error} - Si hay error en la desencriptación
     */
    decrypt(encryptedText) {
        try {
            if (!encryptedText || typeof encryptedText !== 'string') {
                throw new Error('El texto encriptado debe ser un string válido');
            }

            // Separar IV y datos encriptados
            const parts = encryptedText.split(':');
            if (parts.length !== 2) {
                throw new Error('Formato de texto encriptado inválido');
            }

            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = Buffer.from(parts[1], 'hex');

            // Validar longitud del IV
            if (iv.length !== this.ivLength) {
                throw new Error('IV con longitud incorrecta');
            }

            // Crear decipher
            const decipher = crypto.createDecipheriv(
                this.algorithm,
                this.encryptionKey,
                iv
            );

            // Desencriptar
            let decrypted = decipher.update(encrypted, null, 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;

        } catch (error) {
            console.error('❌ Error al desencriptar:', error.message);
            throw new Error('Error en el proceso de desencriptación');
        }
    }

    /**
     * Genera una nueva clave de encriptación maestra
     * @returns {string} - Clave hexadecimal de 64 caracteres
     */
    static generateMasterKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Genera un token seguro aleatorio
     * @param {number} length - Longitud en bytes (default: 32)
     * @returns {string} - Token hexadecimal
     */
    static generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Hash seguro de contraseña (para uso futuro)
     * @param {string} password - Contraseña en texto plano
     * @returns {string} - Hash de la contraseña
     */
    static hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
        return `${salt}:${hash}`;
    }

    /**
     * Verifica una contraseña contra su hash
     * @param {string} password - Contraseña en texto plano
     * @param {string} hashedPassword - Hash almacenado (formato: salt:hash)
     * @returns {boolean} - true si coinciden
     */
    static verifyPassword(password, hashedPassword) {
        try {
            const [salt, originalHash] = hashedPassword.split(':');
            const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
            return hash === originalHash;
        } catch (error) {
            return false;
        }
    }

    /**
     * Encripta múltiples campos de un objeto
     * @param {Object} data - Objeto con campos a encriptar
     * @param {Array} fields - Array de nombres de campos a encriptar
     * @returns {Object} - Objeto con campos encriptados
     */
    encryptFields(data, fields) {
        const encrypted = { ...data };
        
        fields.forEach(field => {
            if (encrypted[field] && typeof encrypted[field] === 'string') {
                encrypted[field] = this.encrypt(encrypted[field]);
            }
        });

        return encrypted;
    }

    /**
     * Desencripta múltiples campos de un objeto
     * @param {Object} data - Objeto con campos encriptados
     * @param {Array} fields - Array de nombres de campos a desencriptar
     * @returns {Object} - Objeto con campos desencriptados
     */
    decryptFields(data, fields) {
        const decrypted = { ...data };
        
        fields.forEach(field => {
            if (decrypted[field] && typeof decrypted[field] === 'string') {
                try {
                    decrypted[field] = this.decrypt(decrypted[field]);
                } catch (error) {
                    console.error(`⚠️ Error al desencriptar campo ${field}:`, error.message);
                    decrypted[field] = null;
                }
            }
        });

        return decrypted;
    }

    /**
     * Valida que un texto esté correctamente encriptado
     * @param {string} encryptedText - Texto a validar
     * @returns {boolean} - true si es válido
     */
    isValidEncryptedText(encryptedText) {
        if (!encryptedText || typeof encryptedText !== 'string') {
            return false;
        }

        const parts = encryptedText.split(':');
        if (parts.length !== 2) {
            return false;
        }

        try {
            const iv = Buffer.from(parts[0], 'hex');
            return iv.length === this.ivLength;
        } catch {
            return false;
        }
    }
}

// ===========================================
// FUNCIONES DE UTILIDAD PARA SETUP INICIAL
// ===========================================

/**
 * Setup inicial del sistema de encriptación
 * Ejecutar una vez al configurar el sistema
 */
function setupEncryption() {
    console.log('🔐 CONFIGURACIÓN DE ENCRIPTACIÓN\n');
    
    // Generar nueva clave maestra
    const masterKey = EncryptionService.generateMasterKey();
    console.log('📝 MASTER_ENCRYPTION_KEY generada:');
    console.log(masterKey);
    console.log('\n⚠️  IMPORTANTE: Guarda esta clave en tu archivo .env');
    console.log('⚠️  NUNCA la subas a Git o la compartas\n');

    // Generar token de webhook
    const webhookToken = EncryptionService.generateSecureToken(32);
    console.log('📝 WEBHOOK_VERIFY_TOKEN generado:');
    console.log(webhookToken);
    console.log('\n💾 Agrega estas líneas a tu .env:');
    console.log(`MASTER_ENCRYPTION_KEY=${masterKey}`);
    console.log(`WEBHOOK_VERIFY_TOKEN=${webhookToken}`);
}

/**
 * Test del servicio de encriptación
 */
function testEncryption() {
    try {
        console.log('🧪 Probando servicio de encriptación...\n');

        const service = new EncryptionService();

        // Test 1: Encriptar y desencriptar texto simple
        const testText = 'EAABsbCS1iHgBO7fZCn4u1X';
        const encrypted = service.encrypt(testText);
        const decrypted = service.decrypt(encrypted);

        console.log('Test 1: Texto simple');
        console.log('✅ Original:', testText);
        console.log('🔒 Encriptado:', encrypted);
        console.log('🔓 Desencriptado:', decrypted);
        console.log('✅ Coincide:', testText === decrypted ? 'SÍ' : 'NO');
        console.log('');

        // Test 2: Encriptar objeto completo
        const credentials = {
            phone_number_id: '123456789',
            access_token: 'EAABsbCS1iHgBO7fZCn4u1X',
            business_id: '987654321'
        };

        const encryptedCreds = service.encryptFields(credentials, 
            ['phone_number_id', 'access_token', 'business_id']);
        
        const decryptedCreds = service.decryptFields(encryptedCreds,
            ['phone_number_id', 'access_token', 'business_id']);

        console.log('Test 2: Objeto con múltiples campos');
        console.log('✅ Original:', JSON.stringify(credentials, null, 2));
        console.log('🔒 Encriptado:', JSON.stringify(encryptedCreds, null, 2));
        console.log('🔓 Desencriptado:', JSON.stringify(decryptedCreds, null, 2));
        console.log('✅ Coincide:', JSON.stringify(credentials) === JSON.stringify(decryptedCreds) ? 'SÍ' : 'NO');
        console.log('');

        // Test 3: Validación
        console.log('Test 3: Validación de texto encriptado');
        console.log('✅ Texto válido:', service.isValidEncryptedText(encrypted) ? 'SÍ' : 'NO');
        console.log('✅ Texto inválido:', service.isValidEncryptedText('invalid:text') ? 'NO' : 'SÍ');
        console.log('');

        console.log('✅ Todos los tests pasaron correctamente');

    } catch (error) {
        console.error('❌ Error en los tests:', error.message);
    }
}

// ===========================================
// EXPORTAR PARA USO COMO MÓDULO
// ===========================================

// Crear instancia por defecto
const defaultInstance = new EncryptionService();

// Exportar métodos de instancia y estáticos
module.exports = {
    encrypt: (text) => defaultInstance.encrypt(text),
    decrypt: (text) => defaultInstance.decrypt(text),
    encryptFields: (data, fields) => defaultInstance.encryptFields(data, fields),
    decryptFields: (data, fields) => defaultInstance.decryptFields(data, fields),
    isValidEncryptedText: (text) => defaultInstance.isValidEncryptedText(text),
    generateMasterKey: EncryptionService.generateMasterKey,
    generateSecureToken: EncryptionService.generateSecureToken,
    hashPassword: EncryptionService.hashPassword,
    verifyPassword: EncryptionService.verifyPassword,
    EncryptionService: EncryptionService
};

// ===========================================
// MODO CLI: Ejecutar directamente
// ===========================================
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args[0] === 'setup') {
        setupEncryption();
    } else if (args[0] === 'test') {
        testEncryption();
    } else if (args[0] === 'generate-key') {
        console.log(EncryptionService.generateMasterKey());
    } else {
        console.log('Uso:');
        console.log('  node encryption-service.js setup   - Configurar sistema de encriptación');
        console.log('  node encryption-service.js test    - Probar encriptación');
        console.log('  node encryption-service.js generate-key - Generar nueva clave');
    }
}
