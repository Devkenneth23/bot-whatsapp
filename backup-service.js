// backup-service.js - Servicio de respaldo automático
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const GoogleDriveService = require('./google-drive-service');

class BackupService {
    constructor(dbPath, database = null) {
        this.dbPath = dbPath;
        this.db = database; // Referencia a la base de datos para obtener configuración
        this.backupDir = path.join(__dirname, 'backups');
        this.cronJob = null;
        this.googleDrive = new GoogleDriveService();
        this.config = {
            enabled: true,
            schedule: '0 0 * * 6', // Sábados a las 12:00 AM (medianoche)
            keepLast: 4 // Mantener últimos 4 backups (1 mes)
        };
        
        this.ensureBackupDir();
    }

    ensureBackupDir() {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
            console.log('📁 Directorio de backups creado:', this.backupDir);
        }
    }

    start() {
        if (this.cronJob) {
            console.log('⚠️ Servicio de backup ya está corriendo');
            return;
        }

        if (!this.config.enabled) {
            console.log('⚠️ Backups automáticos deshabilitados');
            return;
        }

        console.log('💾 Iniciando servicio de backup automático...');
        console.log(`📅 Programado: ${this.getCronDescription()}`);

        // Programar backup automático
        this.cronJob = cron.schedule(this.config.schedule, async () => {
            console.log('⏰ Ejecutando backup programado...');
            await this.createBackup();
        });

        console.log('✅ Servicio de backup iniciado');
    }

    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            console.log('⏹️ Servicio de backup detenido');
        }
    }

    async createBackup() {
        try {
            if (!fs.existsSync(this.dbPath)) {
                throw new Error('Base de datos no encontrada');
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
            const fecha = timestamp[0];
            const hora = timestamp[1].substring(0, 8);
            const fileName = `backup-${fecha}_${hora}.db`;
            const backupPath = path.join(this.backupDir, fileName);

            // Copiar base de datos
            await fs.promises.copyFile(this.dbPath, backupPath);

            const stats = fs.statSync(backupPath);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

            console.log(`✅ Backup local creado: ${fileName} (${sizeMB} MB)`);

            // === INTEGRACIÓN GOOGLE DRIVE ===
            let driveUploadResult = null;
            
            if (this.db) {
                try {
                    // Obtener configuración de Google Drive
                    const config = await this.db.get('SELECT * FROM configuracion WHERE id = 1');
                    
                    if (config && config.backup_auto_drive && config.google_drive_token) {
                        console.log('📤 Subiendo backup a Google Drive...');
                        
                        // Parsear tokens
                        const tokens = JSON.parse(config.google_drive_token);
                        
                        // Configurar credenciales
                        this.googleDrive.setCredentials(tokens);
                        
                        // Subir a Drive
                        driveUploadResult = await this.googleDrive.uploadBackup(backupPath, fileName);
                        
                        console.log(`✅ Backup subido a Google Drive: ${driveUploadResult.webViewLink}`);
                        
                        // Limpiar backups antiguos en Drive también
                        await this.googleDrive.cleanOldBackups(this.config.keepLast);
                    }
                } catch (driveError) {
                    console.error('⚠️ Error subiendo a Google Drive (backup local OK):', driveError.message);
                    // No lanzar error, el backup local ya se creó
                }
            }

            // Limpiar backups locales antiguos
            await this.cleanOldBackups();

            return {
                fileName,
                path: backupPath,
                size: stats.size,
                sizeMB,
                timestamp: new Date(),
                driveUpload: driveUploadResult
            };

        } catch (error) {
            console.error('❌ Error creando backup:', error);
            throw error;
        }
    }

    async cleanOldBackups() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(file => file.startsWith('backup-') && file.endsWith('.db'))
                .map(file => ({
                    name: file,
                    path: path.join(this.backupDir, file),
                    time: fs.statSync(path.join(this.backupDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time); // Más recientes primero

            // Mantener solo los últimos N backups
            const toDelete = files.slice(this.config.keepLast);

            for (const file of toDelete) {
                fs.unlinkSync(file.path);
                console.log(`🗑️ Backup antiguo eliminado: ${file.name}`);
            }

            if (toDelete.length > 0) {
                console.log(`✅ Limpieza completada: ${toDelete.length} backup(s) eliminado(s)`);
            }

        } catch (error) {
            console.error('⚠️ Error limpiando backups antiguos:', error);
        }
    }

    getBackupsList() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(file => file.startsWith('backup-') && file.endsWith('.db'))
                .map(file => {
                    const filePath = path.join(this.backupDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file,
                        path: filePath,
                        size: stats.size,
                        sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
                        created: stats.mtime
                    };
                })
                .sort((a, b) => b.created - a.created);

            return files;

        } catch (error) {
            console.error('Error obteniendo lista de backups:', error);
            return [];
        }
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Reiniciar servicio con nueva configuración
        if (this.cronJob) {
            this.stop();
            this.start();
        }

        console.log('✅ Configuración de backup actualizada');
    }

    getCronDescription() {
        const schedules = {
            '0 0 * * 0': 'Domingos a las 12:00 AM',
            '0 0 * * 1': 'Lunes a las 12:00 AM',
            '0 0 * * 2': 'Martes a las 12:00 AM',
            '0 0 * * 3': 'Miércoles a las 12:00 AM',
            '0 0 * * 4': 'Jueves a las 12:00 AM',
            '0 0 * * 5': 'Viernes a las 12:00 AM',
            '0 0 * * 6': 'Sábados a las 12:00 AM',
            '0 0 * * *': 'Diario a las 12:00 AM',
        };

        return schedules[this.config.schedule] || 'Horario personalizado';
    }

    async getStatus() {
        const backups = this.getBackupsList();
        const lastBackup = backups.length > 0 ? backups[0] : null;

        // Obtener estado de Google Drive
        let driveStatus = {
            configured: false,
            email: null,
            connected: false
        };

        if (this.db) {
            try {
                const config = await this.db.get('SELECT * FROM configuracion WHERE id = 1');
                if (config) {
                    driveStatus.configured = !!config.backup_auto_drive;
                    driveStatus.email = config.google_drive_email;
                    driveStatus.connected = !!(config.google_drive_token && config.backup_auto_drive);
                }
            } catch (error) {
                console.error('Error obteniendo estado de Drive:', error);
            }
        }

        return {
            enabled: this.config.enabled,
            running: this.cronJob !== null,
            schedule: this.getCronDescription(),
            keepLast: this.config.keepLast,
            totalBackups: backups.length,
            lastBackup: lastBackup ? {
                name: lastBackup.name,
                created: lastBackup.created,
                sizeMB: lastBackup.sizeMB
            } : null,
            backups: backups,
            googleDrive: driveStatus
        };
    }
}

module.exports = BackupService;
