// google-drive-service.js - Servicio para subir backups a Google Drive
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleDriveService {
    constructor() {
        // Configuración de OAuth2
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google/callback'
        );
        
        this.folderName = 'Backups Bot WhatsApp';
        this.folderId = null;
    }

    /**
     * Generar URL de autorización para que el cliente conecte su Google Drive
     */
    getAuthUrl() {
        const scopes = [
            'https://www.googleapis.com/auth/drive.file', // Crear/editar archivos propios
            'https://www.googleapis.com/auth/drive.appdata' // Datos de la app
        ];

        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline', // Para obtener refresh token
            scope: scopes,
            prompt: 'consent' // Forzar pantalla de consentimiento para obtener refresh token
        });
    }

    /**
     * Intercambiar código de autorización por tokens
     */
    async getTokensFromCode(code) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);
            
            console.log('✅ Tokens obtenidos de Google');
            
            return {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: tokens.expiry_date
            };
        } catch (error) {
            console.error('❌ Error obteniendo tokens:', error.message);
            throw new Error('No se pudo obtener autorización de Google Drive');
        }
    }

    /**
     * Configurar credenciales desde tokens guardados
     */
    setCredentials(tokens) {
        this.oauth2Client.setCredentials({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date
        });
    }

    /**
     * Renovar token de acceso usando refresh token
     */
    async refreshAccessToken() {
        try {
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            this.oauth2Client.setCredentials(credentials);
            
            console.log('🔄 Token de acceso renovado');
            
            return {
                access_token: credentials.access_token,
                expiry_date: credentials.expiry_date
            };
        } catch (error) {
            console.error('❌ Error renovando token:', error.message);
            throw new Error('No se pudo renovar el token de acceso');
        }
    }

    /**
     * Buscar o crear carpeta de backups en Drive
     */
    async getOrCreateBackupFolder() {
        try {
            const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

            // Buscar carpeta existente
            const response = await drive.files.list({
                q: `name='${this.folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            if (response.data.files.length > 0) {
                // Carpeta existe
                this.folderId = response.data.files[0].id;
                console.log(`📁 Carpeta encontrada: ${this.folderName}`);
                return this.folderId;
            }

            // Crear carpeta
            const folderMetadata = {
                name: this.folderName,
                mimeType: 'application/vnd.google-apps.folder'
            };

            const folder = await drive.files.create({
                resource: folderMetadata,
                fields: 'id, name'
            });

            this.folderId = folder.data.id;
            console.log(`✅ Carpeta creada: ${this.folderName} (ID: ${this.folderId})`);
            
            return this.folderId;

        } catch (error) {
            console.error('❌ Error gestionando carpeta:', error.message);
            throw error;
        }
    }

    /**
     * Subir archivo de backup a Google Drive
     */
    async uploadBackup(filePath, fileName) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`Archivo no encontrado: ${filePath}`);
            }

            // Asegurar que tenemos la carpeta
            await this.getOrCreateBackupFolder();

            const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

            // Metadata del archivo
            const fileMetadata = {
                name: fileName,
                parents: [this.folderId]
            };

            // Contenido del archivo
            const media = {
                mimeType: 'application/x-sqlite3',
                body: fs.createReadStream(filePath)
            };

            console.log(`📤 Subiendo ${fileName} a Google Drive...`);

            // Subir archivo
            const response = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, name, webViewLink, size'
            });

            const file = response.data;
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

            console.log(`✅ Backup subido exitosamente:`);
            console.log(`   - Nombre: ${file.name}`);
            console.log(`   - Tamaño: ${sizeMB} MB`);
            console.log(`   - Link: ${file.webViewLink}`);

            return {
                id: file.id,
                name: file.name,
                webViewLink: file.webViewLink,
                size: file.size,
                sizeMB: sizeMB
            };

        } catch (error) {
            console.error('❌ Error subiendo backup a Drive:', error.message);
            
            // Si el token expiró, intentar renovar
            if (error.message.includes('invalid_grant') || error.message.includes('Token has been expired')) {
                console.log('🔄 Intentando renovar token...');
                await this.refreshAccessToken();
                // Reintentar upload
                return await this.uploadBackup(filePath, fileName);
            }
            
            throw error;
        }
    }

    /**
     * Listar backups en Google Drive
     */
    async listBackups() {
        try {
            await this.getOrCreateBackupFolder();
            
            const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

            const response = await drive.files.list({
                q: `'${this.folderId}' in parents and trashed=false`,
                fields: 'files(id, name, createdTime, size, webViewLink)',
                orderBy: 'createdTime desc',
                pageSize: 20
            });

            const files = response.data.files.map(file => ({
                id: file.id,
                name: file.name,
                createdTime: file.createdTime,
                size: file.size,
                sizeMB: (file.size / (1024 * 1024)).toFixed(2),
                webViewLink: file.webViewLink
            }));

            console.log(`📋 Backups en Drive: ${files.length}`);
            
            return files;

        } catch (error) {
            console.error('❌ Error listando backups:', error.message);
            return [];
        }
    }

    /**
     * Eliminar backups antiguos (mantener solo los últimos N)
     */
    async cleanOldBackups(keepLast = 4) {
        try {
            const backups = await this.listBackups();
            
            if (backups.length <= keepLast) {
                console.log(`✅ Solo hay ${backups.length} backup(s), no se elimina nada`);
                return;
            }

            const toDelete = backups.slice(keepLast);
            const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

            for (const backup of toDelete) {
                await drive.files.delete({ fileId: backup.id });
                console.log(`🗑️ Backup eliminado de Drive: ${backup.name}`);
            }

            console.log(`✅ Limpieza completada: ${toDelete.length} backup(s) eliminado(s) de Drive`);

        } catch (error) {
            console.error('⚠️ Error limpiando backups antiguos:', error.message);
        }
    }

    /**
     * Verificar si las credenciales están configuradas
     */
    isConfigured() {
        const credentials = this.oauth2Client.credentials;
        return !!(credentials && credentials.access_token);
    }

    /**
     * Obtener estado de la conexión
     */
    getStatus() {
        const credentials = this.oauth2Client.credentials;
        
        return {
            configured: this.isConfigured(),
            hasAccessToken: !!(credentials && credentials.access_token),
            hasRefreshToken: !!(credentials && credentials.refresh_token),
            tokenExpiry: credentials?.expiry_date ? new Date(credentials.expiry_date) : null
        };
    }
}

module.exports = GoogleDriveService;
