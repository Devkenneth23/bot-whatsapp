-- ========================================
-- SCHEMA MULTI-TENANT WHATSAPP CLOUD API
-- Sistema SaaS profesional
-- Versión: 2.0
-- ========================================

-- ========================================
-- TABLA PRINCIPAL: CLIENTES SAAS
-- Cada registro = 1 cliente del sistema
-- ========================================
CREATE TABLE IF NOT EXISTS clientes_saas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Información del negocio
    nombre_negocio TEXT NOT NULL,
    email_contacto TEXT NOT NULL UNIQUE,
    telefono_contacto TEXT NOT NULL,
    nombre_contacto TEXT,
    
    -- Credenciales Meta (TODAS ENCRIPTADAS)
    meta_phone_number_id TEXT NOT NULL,      -- ID del número en Meta
    meta_access_token TEXT NOT NULL,          -- Token de acceso (encriptado)
    meta_business_account_id TEXT NOT NULL,   -- ID de cuenta de negocio
    meta_webhook_verify_token TEXT NOT NULL,  -- Token para verificar webhook
    
    -- Estado y configuración
    estado TEXT DEFAULT 'activo' CHECK(estado IN ('activo', 'suspendido', 'cancelado', 'prueba')),
    plan TEXT DEFAULT 'profesional' CHECK(plan IN ('basico', 'profesional', 'enterprise')),
    
    -- Facturación
    precio_mensual REAL DEFAULT 30000.00,
    fecha_inicio DATE NOT NULL,
    fecha_proximo_pago DATE NOT NULL,
    ultimo_pago_fecha DATE,
    ultimo_pago_monto REAL,
    
    -- Seguridad y límites
    ip_permitidas TEXT,  -- JSON array de IPs permitidas
    rate_limit_mensajes_hora INTEGER DEFAULT 100,
    rate_limit_mensajes_dia INTEGER DEFAULT 1000,
    
    -- Rutas de archivos
    database_path TEXT NOT NULL,  -- Ruta a su BD SQLite individual
    uploads_path TEXT,            -- Ruta a sus archivos
    backups_path TEXT,            -- Ruta a sus backups
    
    -- Configuración del bot
    bot_activo INTEGER DEFAULT 1,
    mensaje_bienvenida TEXT DEFAULT 'Hola! Bienvenido a {negocio}',
    numero_asesor TEXT,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- TABLA: LOGS DE ACTIVIDAD
-- Auditoría de todas las acciones
-- ========================================
CREATE TABLE IF NOT EXISTS logs_actividad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_saas_id INTEGER NOT NULL,
    
    tipo TEXT NOT NULL CHECK(tipo IN ('mensaje_enviado', 'mensaje_recibido', 'cita_creada', 
                                       'cita_cancelada', 'cita_reagendada', 'login', 
                                       'config_cambio', 'error', 'webhook')),
    descripcion TEXT NOT NULL,
    metadata TEXT,  -- JSON con detalles adicionales
    
    -- Contexto
    ip_address TEXT,
    user_agent TEXT,
    
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (cliente_saas_id) REFERENCES clientes_saas(id) ON DELETE CASCADE
);

-- ========================================
-- TABLA: USO DE API (Métricas)
-- Para monitorear consumo y facturación
-- ========================================
CREATE TABLE IF NOT EXISTS uso_api (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_saas_id INTEGER NOT NULL,
    
    fecha DATE NOT NULL,
    mensajes_enviados INTEGER DEFAULT 0,
    mensajes_recibidos INTEGER DEFAULT 0,
    conversaciones_iniciadas INTEGER DEFAULT 0,
    
    -- Costos estimados
    costo_meta REAL DEFAULT 0.00,  -- Costo en Meta API
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (cliente_saas_id) REFERENCES clientes_saas(id) ON DELETE CASCADE,
    UNIQUE(cliente_saas_id, fecha)
);

-- ========================================
-- TABLA: WEBHOOKS RECIBIDOS
-- Log de todos los webhooks de Meta
-- ========================================
CREATE TABLE IF NOT EXISTS webhooks_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_saas_id INTEGER,
    
    payload TEXT NOT NULL,  -- JSON completo del webhook
    tipo TEXT,              -- message, status, etc
    procesado INTEGER DEFAULT 0,
    error TEXT,
    
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (cliente_saas_id) REFERENCES clientes_saas(id) ON DELETE SET NULL
);

-- ========================================
-- TABLA: TOKENS DE SESIÓN
-- Para dashboard de cada cliente
-- ========================================
CREATE TABLE IF NOT EXISTS sesiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_saas_id INTEGER NOT NULL,
    
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    
    -- Seguridad
    ip_address TEXT,
    user_agent TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (cliente_saas_id) REFERENCES clientes_saas(id) ON DELETE CASCADE
);

-- ========================================
-- TABLA: NOTIFICACIONES DEL SISTEMA
-- Alertas para administrador
-- ========================================
CREATE TABLE IF NOT EXISTS notificaciones_sistema (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_saas_id INTEGER,
    
    tipo TEXT NOT NULL CHECK(tipo IN ('pago_pendiente', 'limite_excedido', 'error_critico', 
                                       'suspension', 'renovacion', 'bienvenida')),
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    
    leido INTEGER DEFAULT 0,
    fecha_leido DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (cliente_saas_id) REFERENCES clientes_saas(id) ON DELETE CASCADE
);

-- ========================================
-- ÍNDICES PARA PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_clientes_saas_estado ON clientes_saas(estado);
CREATE INDEX IF NOT EXISTS idx_clientes_saas_email ON clientes_saas(email_contacto);
CREATE INDEX IF NOT EXISTS idx_logs_cliente ON logs_actividad(cliente_saas_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs_actividad(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_tipo ON logs_actividad(tipo);
CREATE INDEX IF NOT EXISTS idx_uso_fecha ON uso_api(fecha);
CREATE INDEX IF NOT EXISTS idx_uso_cliente ON uso_api(cliente_saas_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_timestamp ON webhooks_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_webhooks_procesado ON webhooks_log(procesado);
CREATE INDEX IF NOT EXISTS idx_sesiones_token ON sesiones(token);
CREATE INDEX IF NOT EXISTS idx_sesiones_expires ON sesiones(expires_at);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leido ON notificaciones_sistema(leido);

-- ========================================
-- DATOS INICIALES PARA TESTING
-- ========================================

-- Configuración del sistema
CREATE TABLE IF NOT EXISTS configuracion_sistema (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT UNIQUE NOT NULL,
    valor TEXT NOT NULL,
    tipo TEXT DEFAULT 'texto',
    descripcion TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Valores por defecto
INSERT OR IGNORE INTO configuracion_sistema (clave, valor, tipo, descripcion) VALUES
('meta_api_version', 'v21.0', 'texto', 'Versión de la API de Meta'),
('max_clientes_activos', '100', 'numero', 'Máximo de clientes activos permitidos'),
('backup_automatico', '1', 'boolean', 'Activar backups automáticos'),
('notificaciones_admin_email', '', 'texto', 'Email para notificaciones del sistema'),
('maintenance_mode', '0', 'boolean', 'Modo mantenimiento');

-- ========================================
-- TRIGGERS PARA TIMESTAMPS AUTOMÁTICOS
-- ========================================

-- Trigger para actualizar updated_at en clientes_saas
CREATE TRIGGER IF NOT EXISTS update_clientes_saas_timestamp 
AFTER UPDATE ON clientes_saas
BEGIN
    UPDATE clientes_saas SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger para actualizar last_activity en clientes_saas
CREATE TRIGGER IF NOT EXISTS update_clientes_saas_activity
AFTER INSERT ON logs_actividad
BEGIN
    UPDATE clientes_saas SET last_activity = CURRENT_TIMESTAMP 
    WHERE id = NEW.cliente_saas_id;
END;

-- ========================================
-- VISTAS ÚTILES
-- ========================================

-- Vista: Resumen de clientes activos
CREATE VIEW IF NOT EXISTS vista_clientes_activos AS
SELECT 
    cs.id,
    cs.nombre_negocio,
    cs.email_contacto,
    cs.telefono_contacto,
    cs.estado,
    cs.plan,
    cs.precio_mensual,
    cs.fecha_proximo_pago,
    COUNT(DISTINCT la.id) as total_interacciones,
    MAX(la.timestamp) as ultima_actividad,
    cs.created_at as cliente_desde
FROM clientes_saas cs
LEFT JOIN logs_actividad la ON cs.id = la.cliente_saas_id
WHERE cs.estado = 'activo'
GROUP BY cs.id;

-- Vista: Uso diario del sistema
CREATE VIEW IF NOT EXISTS vista_uso_diario AS
SELECT 
    ua.fecha,
    COUNT(DISTINCT ua.cliente_saas_id) as clientes_activos,
    SUM(ua.mensajes_enviados) as total_mensajes_enviados,
    SUM(ua.mensajes_recibidos) as total_mensajes_recibidos,
    SUM(ua.conversaciones_iniciadas) as total_conversaciones,
    SUM(ua.costo_meta) as costo_total_meta
FROM uso_api ua
GROUP BY ua.fecha
ORDER BY ua.fecha DESC;

-- ========================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ========================================

/*
ESTRUCTURA MULTI-TENANT:

1. Base de datos principal (saas.db):
   - Gestiona todos los clientes
   - Credenciales encriptadas
   - Logs centralizados
   - Facturación

2. Base de datos por cliente (/databases/cliente_X.db):
   - Usa el schema original (servicios, citas, clientes, etc.)
   - Completamente aislada
   - Backups independientes

SEGURIDAD:
- Todas las credenciales de Meta están ENCRIPTADAS
- Los tokens de sesión expiran
- IP whitelisting opcional
- Rate limiting por cliente
- Logs de auditoría completos

ESCALABILIDAD:
- Soporta 100+ clientes fácilmente
- SQLite por cliente = sin bloqueos
- Índices optimizados
- Vistas pre-calculadas

USO:
1. Crear cliente nuevo → INSERT en clientes_saas
2. Crear su BD individual → /databases/cliente_X.db
3. Guardar credenciales encriptadas
4. Configurar webhook
5. Cliente listo para usar
*/
