-- =============================================
-- SCHEMA MULTI-TENANT SAAS
-- Base de datos principal del sistema
-- =============================================

-- Tabla principal de clientes SaaS
CREATE TABLE IF NOT EXISTS clientes_saas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    nombre_negocio TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    
    -- Credenciales de Meta (encriptadas)
    phone_number_id TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    business_account_id TEXT NOT NULL,
    
    -- Configuración del bot (JSON)
    config_json TEXT,
    
    -- Plan y facturación
    plan TEXT DEFAULT 'profesional',
    precio_mensual REAL DEFAULT 30000,
    estado TEXT DEFAULT 'activo',
    fecha_inicio DATE DEFAULT CURRENT_DATE,
    fecha_proximo_pago DATE,
    
    -- Metadatos
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de administradores del sistema SaaS
CREATE TABLE IF NOT EXISTS admins_saas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nombre TEXT NOT NULL,
    email TEXT,
    rol TEXT DEFAULT 'admin',
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de logs de actividad
CREATE TABLE IF NOT EXISTS logs_actividad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    tipo TEXT NOT NULL,
    accion TEXT NOT NULL,
    detalles TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes_saas(id)
);

-- Tabla de uso de API (para métricas y facturación)
CREATE TABLE IF NOT EXISTS uso_api (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    fecha DATE NOT NULL,
    mensajes_enviados INTEGER DEFAULT 0,
    mensajes_recibidos INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes_saas(id),
    UNIQUE(cliente_id, fecha)
);

-- Tabla de webhooks recibidos (para debugging)
CREATE TABLE IF NOT EXISTS webhooks_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    payload TEXT NOT NULL,
    processed INTEGER DEFAULT 0,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes_saas(id)
);

-- Índices para optimización
CREATE INDEX IF NOT EXISTS idx_clientes_slug ON clientes_saas(slug);
CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes_saas(estado);
CREATE INDEX IF NOT EXISTS idx_logs_cliente ON logs_actividad(cliente_id);
CREATE INDEX IF NOT EXISTS idx_logs_fecha ON logs_actividad(created_at);
CREATE INDEX IF NOT EXISTS idx_uso_cliente_fecha ON uso_api(cliente_id, fecha);
CREATE INDEX IF NOT EXISTS idx_webhooks_processed ON webhooks_log(processed);

-- Triggers para actualizar updated_at
CREATE TRIGGER IF NOT EXISTS update_clientes_timestamp 
AFTER UPDATE ON clientes_saas
BEGIN
    UPDATE clientes_saas SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Vista útil: Clientes activos con uso reciente
CREATE VIEW IF NOT EXISTS v_clientes_activos AS
SELECT 
    c.id,
    c.slug,
    c.nombre_negocio,
    c.plan,
    c.estado,
    c.created_at,
    COALESCE(SUM(u.mensajes_enviados), 0) as total_enviados,
    COALESCE(SUM(u.mensajes_recibidos), 0) as total_recibidos
FROM clientes_saas c
LEFT JOIN uso_api u ON c.id = u.cliente_id
WHERE c.activo = 1
GROUP BY c.id;
