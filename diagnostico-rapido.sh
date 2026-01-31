#!/bin/bash
# 🔍 Script de diagnóstico rápido del sistema de notificaciones

echo "======================================================================"
echo "🔍 DIAGNÓSTICO RÁPIDO - Sistema de Notificaciones"
echo "======================================================================"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Verificar que database.js existe
echo -e "${BLUE}📁 Verificando archivos...${NC}"
if [ -f "database/database.js" ]; then
    echo -e "${GREEN}✅ database/database.js encontrado${NC}"
else
    echo -e "${RED}❌ database/database.js NO encontrado${NC}"
    exit 1
fi

# 2. Buscar la función createCita
echo -e "\n${BLUE}🔎 Buscando función createCita()...${NC}"
if grep -q "createCita" database/database.js; then
    echo -e "${GREEN}✅ Función createCita encontrada${NC}"
    
    # Verificar si inserta estado='pendiente'
    echo -e "\n${YELLOW}📝 Contenido de createCita:${NC}"
    sed -n '/createCita/,/^}/p' database/database.js | head -30
    
    if grep -A 20 "createCita" database/database.js | grep -q "estado.*pendiente"; then
        echo -e "\n${GREEN}✅ ¡CORRECTO! createCita inserta estado='pendiente'${NC}"
    elif grep -A 20 "createCita" database/database.js | grep -q "estado.*confirmada"; then
        echo -e "\n${RED}❌ ¡PROBLEMA! createCita inserta estado='confirmada'${NC}"
        echo -e "${YELLOW}💡 Necesitas actualizar database.js${NC}"
    else
        echo -e "\n${YELLOW}⚠️  No se pudo determinar el estado que inserta${NC}"
    fi
else
    echo -e "${RED}❌ Función createCita NO encontrada${NC}"
fi

# 3. Verificar endpoint en server.js
echo -e "\n${BLUE}🌐 Verificando endpoint /api/citas/nuevas...${NC}"
if [ -f "server.js" ]; then
    if grep -q "/api/citas/nuevas" server.js; then
        echo -e "${GREEN}✅ Endpoint /api/citas/nuevas encontrado${NC}"
        
        # Mostrar la query del endpoint
        echo -e "\n${YELLOW}📝 Query del endpoint:${NC}"
        grep -A 10 "estado = 'pendiente'" server.js | head -15
    else
        echo -e "${RED}❌ Endpoint /api/citas/nuevas NO encontrado${NC}"
    fi
else
    echo -e "${RED}❌ server.js NO encontrado${NC}"
fi

# 4. Verificar última cita en DB
echo -e "\n${BLUE}💾 Verificando última cita en base de datos...${NC}"
if [ -f "database/bot.db" ]; then
    sqlite3 database/bot.db << 'EOF'
.mode column
.headers on
SELECT 
    id, 
    estado, 
    created_at,
    strftime('%s', 'now') - strftime('%s', created_at) as segundos_edad
FROM citas 
ORDER BY id DESC 
LIMIT 3;
EOF
    
    CITAS_PENDIENTES=$(sqlite3 database/bot.db "SELECT COUNT(*) FROM citas WHERE estado='pendiente';")
    echo -e "\n${GREEN}📊 Citas pendientes en DB: $CITAS_PENDIENTES${NC}"
else
    echo -e "${RED}❌ Base de datos no encontrada${NC}"
fi

# 5. Verificar proceso del backend
echo -e "\n${BLUE}🔄 Verificando proceso del backend...${NC}"
if pgrep -f "node.*server.js" > /dev/null; then
    echo -e "${GREEN}✅ Backend está corriendo${NC}"
    echo -e "${YELLOW}PID: $(pgrep -f "node.*server.js")${NC}"
else
    echo -e "${YELLOW}⚠️  Backend NO está corriendo${NC}"
    echo -e "${YELLOW}Ejecuta: node server.js${NC}"
fi

# 6. Verificar NotificationSystem en frontend
echo -e "\n${BLUE}🔔 Verificando NotificationSystem.js...${NC}"
if [ -f "panel-admin/components/NotificationSystem.js" ]; then
    echo -e "${GREEN}✅ NotificationSystem.js encontrado${NC}"
    
    # Verificar intervalo
    INTERVAL=$(grep -o "setInterval.*[0-9]\{4,\}" panel-admin/components/NotificationSystem.js | grep -o "[0-9]\{4,\}" | head -1)
    if [ ! -z "$INTERVAL" ]; then
        SECONDS=$((INTERVAL / 1000))
        echo -e "${GREEN}   Intervalo de polling: ${SECONDS}s${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  NotificationSystem.js no encontrado${NC}"
fi

echo -e "\n======================================================================"
echo -e "${GREEN}✅ Diagnóstico completado${NC}"
echo -e "======================================================================"
echo ""
echo -e "${YELLOW}PRÓXIMOS PASOS:${NC}"
echo "1. Si el backend no está corriendo: node server.js"
echo "2. Ejecuta el test completo: node test-notifications.js"
echo "3. Abre el dashboard y revisa la consola (F12)"
echo ""
