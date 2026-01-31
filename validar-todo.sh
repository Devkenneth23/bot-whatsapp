#!/bin/bash
# 🚀 SCRIPT TODO-EN-UNO - Validación Completa del Sistema

clear

cat << "EOF"
====================================================================
🚀 VALIDACIÓN COMPLETA - Sistema de Notificaciones Push
====================================================================

Este script ejecutará automáticamente:
  1. ✅ Verificación de archivos
  2. 🔍 Diagnóstico de configuración
  3. 🧪 Test completo del sistema
  4. 📡 Test del endpoint API

====================================================================
EOF

echo ""
read -p "¿Deseas continuar? (S/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Ss]$ ]] && [[ ! -z $REPLY ]]; then
    echo "Operación cancelada."
    exit 0
fi

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

TOTAL_ERRORS=0

# Función para separadores
separator() {
    echo ""
    echo -e "${CYAN}====================================================================${NC}"
    echo ""
}

# Función para headers
header() {
    echo -e "\n${BOLD}${BLUE}$1${NC}\n"
}

# Verificar que estamos en el directorio correcto
if [ ! -f "database/database.js" ] || [ ! -f "server.js" ]; then
    echo -e "${RED}❌ ERROR: No estás en el directorio del proyecto${NC}"
    echo -e "${YELLOW}Ejecuta: cd ~/bot-whatsapp${NC}"
    exit 1
fi

separator
header "🔍 FASE 1: VERIFICACIÓN DE ARCHIVOS"
echo "Ejecutando verificar-instalacion.sh..."
echo ""

if [ -f "./verificar-instalacion.sh" ]; then
    ./verificar-instalacion.sh
    RESULT=$?
    if [ $RESULT -ne 0 ]; then
        TOTAL_ERRORS=$((TOTAL_ERRORS + RESULT))
        echo ""
        echo -e "${RED}⚠️  Se encontraron problemas en la verificación${NC}"
        read -p "¿Deseas continuar de todos modos? (s/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Ss]$ ]]; then
            echo "Operación cancelada. Corrige los errores y vuelve a ejecutar."
            exit 1
        fi
    fi
else
    echo -e "${YELLOW}⚠️  verificar-instalacion.sh no encontrado, continuando...${NC}"
fi

separator
header "📋 FASE 2: DIAGNÓSTICO DE CONFIGURACIÓN"
echo "Ejecutando diagnostico-rapido.sh..."
echo ""

if [ -f "./diagnostico-rapido.sh" ]; then
    ./diagnostico-rapido.sh
else
    echo -e "${YELLOW}⚠️  diagnostico-rapido.sh no encontrado${NC}"
    
    # Diagnóstico básico manual
    echo -e "${BLUE}Ejecutando diagnóstico básico...${NC}\n"
    
    if grep -A 20 "createCita" database/database.js | grep -q "'pendiente'"; then
        echo -e "${GREEN}✅ database.js usa estado='pendiente'${NC}"
    else
        echo -e "${RED}❌ database.js NO usa estado='pendiente'${NC}"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
    
    if grep -q "/api/citas/nuevas" server.js; then
        echo -e "${GREEN}✅ server.js tiene endpoint /api/citas/nuevas${NC}"
    else
        echo -e "${RED}❌ server.js NO tiene endpoint correcto${NC}"
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
fi

separator
header "🧪 FASE 3: TEST COMPLETO DEL SISTEMA"
echo "Ejecutando test-notifications.js..."
echo ""

if [ -f "./test-notifications.js" ]; then
    node test-notifications.js
    RESULT=$?
    if [ $RESULT -ne 0 ]; then
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
else
    echo -e "${RED}❌ test-notifications.js no encontrado${NC}"
    TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
fi

# Preguntar si quiere test de endpoint (requiere backend corriendo)
separator
header "📡 FASE 4: TEST DEL ENDPOINT API"

if pgrep -f "node.*server.js" > /dev/null; then
    echo -e "${GREEN}✅ Backend detectado corriendo${NC}\n"
    
    if [ -f "./test-endpoint-rapido.sh" ]; then
        echo "Ejecutando test-endpoint-rapido.sh..."
        echo ""
        ./test-endpoint-rapido.sh
    else
        echo -e "${YELLOW}⚠️  test-endpoint-rapido.sh no encontrado${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Backend no está corriendo${NC}"
    echo ""
    read -p "¿Deseas iniciar el backend ahora? (s/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        echo -e "${BLUE}Iniciando backend...${NC}"
        node server.js &
        BACKEND_PID=$!
        echo -e "${GREEN}Backend iniciado (PID: $BACKEND_PID)${NC}"
        
        echo "Esperando 3 segundos para que el backend inicie..."
        sleep 3
        
        if [ -f "./test-endpoint-rapido.sh" ]; then
            ./test-endpoint-rapido.sh
        fi
    else
        echo -e "${YELLOW}Saltando test de endpoint. Ejecuta './test-endpoint-rapido.sh' cuando el backend esté corriendo.${NC}"
    fi
fi

# Resumen Final
separator
cat << EOF
====================================================================
📊 RESUMEN FINAL DE LA VALIDACIÓN
====================================================================
EOF

echo ""

if [ $TOTAL_ERRORS -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 ¡VALIDACIÓN EXITOSA!${NC}"
    echo ""
    echo -e "${GREEN}✅ Todos los componentes están correctamente configurados${NC}"
    echo -e "${GREEN}✅ El sistema de notificaciones debería funcionar perfectamente${NC}"
    echo ""
    echo -e "${CYAN}${BOLD}PRÓXIMOS PASOS:${NC}"
    echo ""
    echo "1. Asegúrate de que el backend esté corriendo:"
    echo -e "   ${YELLOW}node server.js${NC}"
    echo ""
    echo "2. Inicia el frontend en otra terminal:"
    echo -e "   ${YELLOW}cd panel-admin && npm run dev${NC}"
    echo ""
    echo "3. Abre el dashboard en tu navegador:"
    echo -e "   ${YELLOW}http://localhost:3001${NC}"
    echo ""
    echo "4. Abre la consola del navegador (F12)"
    echo ""
    echo "5. Crea una cita desde WhatsApp o manualmente"
    echo ""
    echo "6. Verifica que suene la notificación en <10 segundos"
    echo ""
    echo -e "${GREEN}${BOLD}¡El sistema está listo para vender a clientes!${NC} 💰"
else
    echo -e "${RED}${BOLD}⚠️  SE ENCONTRARON $TOTAL_ERRORS ERROR(ES)${NC}"
    echo ""
    echo -e "${YELLOW}Acción requerida:${NC}"
    echo ""
    echo "1. Revisa los errores marcados arriba"
    echo "2. Corrige los archivos mencionados"
    echo "3. Vuelve a ejecutar este script"
    echo ""
    echo -e "${CYAN}Para más detalles, consulta:${NC}"
    echo "  - GUIA-VALIDACION-NOTIFICACIONES.md"
    echo "  - README-KIT-VALIDACION.md"
fi

echo ""
echo "===================================================================="
echo ""

# Si iniciamos el backend, preguntar si quiere dejarlo corriendo
if [ ! -z "$BACKEND_PID" ]; then
    read -p "¿Deseas mantener el backend corriendo? (S/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Ss]$ ]] && [[ ! -z $REPLY ]]; then
        kill $BACKEND_PID 2>/dev/null
        echo "Backend detenido."
    else
        echo -e "${GREEN}Backend corriendo en segundo plano (PID: $BACKEND_PID)${NC}"
        echo -e "${YELLOW}Para detenerlo: kill $BACKEND_PID${NC}"
    fi
fi

echo ""
echo "¡Validación completa!"
echo ""

exit $TOTAL_ERRORS
