#!/bin/bash
# 🔍 Verificación post-actualización de archivos

echo "======================================================================"
echo "✅ VERIFICACIÓN POST-ACTUALIZACIÓN"
echo "======================================================================"
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# Función para verificar archivo
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $description${NC}"
        return 0
    else
        echo -e "${RED}❌ $description - NO ENCONTRADO${NC}"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
}

# Función para verificar contenido
check_content() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}   ✓ $description${NC}"
        return 0
    else
        echo -e "${YELLOW}   ⚠ $description - NO ENCONTRADO${NC}"
        WARNINGS=$((WARNINGS + 1))
        return 1
    fi
}

echo -e "${CYAN}📁 VERIFICANDO ARCHIVOS DEL BACKEND...${NC}\n"

# Backend files
check_file "server.js" "server.js"
if [ $? -eq 0 ]; then
    check_content "server.js" "\/api\/citas\/nuevas" "Endpoint /api/citas/nuevas"
    check_content "server.js" "estado = 'pendiente'" "Query busca estado='pendiente'"
fi

check_file "database/database.js" "database/database.js"
if [ $? -eq 0 ]; then
    check_content "database/database.js" "createCita" "Función createCita()"
    
    # Verificar que inserta 'pendiente' y NO 'confirmada'
    if grep -A 20 "createCita" database/database.js | grep -q "'pendiente'"; then
        echo -e "${GREEN}   ✓ Inserta estado='pendiente'${NC}"
    else
        if grep -A 20 "createCita" database/database.js | grep -q "'confirmada'"; then
            echo -e "${RED}   ✗ CRÍTICO: Inserta estado='confirmada' (debe ser 'pendiente')${NC}"
            ERRORS=$((ERRORS + 1))
        else
            echo -e "${YELLOW}   ⚠ No se pudo determinar el estado que inserta${NC}"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
fi

check_file "database/bot.db" "database/bot.db"

echo -e "\n${CYAN}🎨 VERIFICANDO ARCHIVOS DEL FRONTEND...${NC}\n"

# Frontend files
check_file "panel-admin/components/NotificationSystem.js" "NotificationSystem.js"
if [ $? -eq 0 ]; then
    check_content "panel-admin/components/NotificationSystem.js" "setInterval" "Polling automático"
    check_content "panel-admin/components/NotificationSystem.js" "notification-sound.mp3" "Audio de notificación"
    check_content "panel-admin/components/NotificationSystem.js" "notifiedCitas" "Tracking de notificaciones"
fi

check_file "panel-admin/app/dashboard/layout.js" "dashboard/layout.js"
if [ $? -eq 0 ]; then
    check_content "panel-admin/app/dashboard/layout.js" "NotificationSystem" "Monta NotificationSystem"
fi

check_file "panel-admin/app/dashboard/citas/page.js" "citas/page.js"
if [ $? -eq 0 ]; then
    check_content "panel-admin/app/dashboard/citas/page.js" "setInterval" "Auto-refresh cada 10s"
fi

check_file "panel-admin/components/ConfirmModal.js" "ConfirmModal.js"
if [ $? -eq 0 ]; then
    check_content "panel-admin/components/ConfirmModal.js" "onConfirm" "Modal de confirmación"
fi

check_file "panel-admin/app/globals.css" "globals.css"
if [ $? -eq 0 ]; then
    check_content "panel-admin/app/globals.css" "@variant dark" "Dark mode configurado"
fi

check_file "panel-admin/app/layout.tsx" "layout.tsx (root)"
if [ $? -eq 0 ]; then
    check_content "panel-admin/app/layout.tsx" "Toaster" "Toaster global"
fi

# Verificar archivo de audio
echo -e "\n${CYAN}🔊 VERIFICANDO ASSETS...${NC}\n"
if [ -f "panel-admin/public/notification-sound.mp3" ]; then
    SIZE=$(ls -lh panel-admin/public/notification-sound.mp3 | awk '{print $5}')
    echo -e "${GREEN}✅ notification-sound.mp3 (${SIZE})${NC}"
else
    echo -e "${YELLOW}⚠️  notification-sound.mp3 - NO ENCONTRADO${NC}"
    echo -e "${YELLOW}   Descarga un archivo MP3 y guárdalo en: panel-admin/public/${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Verificar scripts de test
echo -e "\n${CYAN}🧪 VERIFICANDO SCRIPTS DE TEST...${NC}\n"
check_file "test-notifications.js" "test-notifications.js"
check_file "diagnostico-rapido.sh" "diagnostico-rapido.sh"
check_file "test-endpoint-rapido.sh" "test-endpoint-rapido.sh"

# Resumen
echo ""
echo "======================================================================"
echo -e "${CYAN}📊 RESUMEN DE VERIFICACIÓN${NC}"
echo "======================================================================"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}🎉 ¡PERFECTO! Todos los archivos están correctamente configurados${NC}"
    echo ""
    echo -e "${CYAN}Próximos pasos:${NC}"
    echo "1. Reiniciar backend: pkill -f 'node.*server.js' && node server.js &"
    echo "2. Ejecutar tests: ./diagnostico-rapido.sh"
    echo "3. Test completo: node test-notifications.js"
    echo "4. Abrir dashboard y validar notificaciones"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Configuración mayormente correcta con $WARNINGS advertencia(s)${NC}"
    echo ""
    echo "Las advertencias no son críticas pero revisa los archivos mencionados."
    echo ""
    echo -e "${CYAN}Puedes continuar con:${NC}"
    echo "./diagnostico-rapido.sh"
else
    echo -e "${RED}❌ Se encontraron $ERRORS error(es) crítico(s)${NC}"
    echo ""
    echo -e "${YELLOW}Acción requerida:${NC}"
    echo "1. Revisar los archivos marcados con ✗"
    echo "2. Actualizar database.js para usar estado='pendiente'"
    echo "3. Verificar que server.js tenga el endpoint correcto"
    echo "4. Volver a ejecutar esta verificación"
fi

echo ""
echo "======================================================================"

exit $ERRORS
