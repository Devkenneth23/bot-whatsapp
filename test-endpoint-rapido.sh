#!/bin/bash
# 🔔 Test rápido del endpoint de notificaciones

echo "======================================================================"
echo "📡 TEST RÁPIDO - Endpoint /api/citas/nuevas"
echo "======================================================================"
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Verificar que el backend esté corriendo
echo -e "${BLUE}🔍 Verificando backend...${NC}"
if ! pgrep -f "node.*server.js" > /dev/null; then
    echo -e "${RED}❌ Backend no está corriendo${NC}"
    echo -e "${YELLOW}Ejecuta: node server.js${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Backend corriendo (PID: $(pgrep -f "node.*server.js"))${NC}"

# Obtener token
echo -e "\n${BLUE}🔑 Obteniendo token de autenticación...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ No se pudo obtener token${NC}"
    echo -e "${YELLOW}Respuesta del servidor:${NC}"
    echo $LOGIN_RESPONSE
    exit 1
fi
echo -e "${GREEN}✅ Token obtenido${NC}"

# Crear cita de prueba
echo -e "\n${BLUE}📝 Creando cita de prueba en DB...${NC}"
FECHA=$(date +%Y-%m-%d)
sqlite3 database/bot.db << EOF
INSERT INTO citas (cliente_id, servicio_id, fecha, hora, estado, created_at) 
VALUES (1, 1, '$FECHA', '10:00', 'pendiente', datetime('now'));
EOF

if [ $? -eq 0 ]; then
    CITA_ID=$(sqlite3 database/bot.db "SELECT id FROM citas ORDER BY id DESC LIMIT 1;")
    echo -e "${GREEN}✅ Cita creada (ID: $CITA_ID)${NC}"
else
    echo -e "${RED}❌ Error creando cita${NC}"
    exit 1
fi

# Esperar 1 segundo para asegurar que esté en DB
sleep 1

# Test endpoint
echo -e "\n${BLUE}🔔 Testeando endpoint /api/citas/nuevas...${NC}"
echo -e "${YELLOW}curl -H 'Authorization: Bearer TOKEN' http://localhost:3000/api/citas/nuevas${NC}"

RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/citas/nuevas)

echo -e "\n${BLUE}📦 Respuesta:${NC}"
echo $RESPONSE | python3 -m json.tool 2>/dev/null || echo $RESPONSE

# Verificar si encontró citas
CITAS_COUNT=$(echo $RESPONSE | grep -o '"nuevasCitas":\[.*\]' | grep -o '\[.*\]' | grep -c 'id')

echo -e "\n${BLUE}📊 Resultado:${NC}"
if [ "$CITAS_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ ¡ÉXITO! Endpoint encontró $CITAS_COUNT cita(s) nueva(s)${NC}"
    echo -e "${GREEN}🎉 El sistema de notificaciones funcionará correctamente${NC}"
else
    echo -e "${RED}❌ FALLO: No se encontraron citas nuevas${NC}"
    echo -e "${YELLOW}💡 Posibles causas:${NC}"
    echo "  1. La cita se creó con estado != 'pendiente'"
    echo "  2. La cita tiene más de 60 segundos"
    echo "  3. Problema con la query del endpoint"
    
    echo -e "\n${YELLOW}🔍 Verificando última cita en DB:${NC}"
    sqlite3 database/bot.db << EOF
.mode column
.headers on
SELECT 
    id, 
    estado, 
    created_at,
    strftime('%s', 'now') - strftime('%s', created_at) as segundos_edad
FROM citas 
ORDER BY id DESC 
LIMIT 1;
EOF
fi

echo ""
echo "======================================================================"
