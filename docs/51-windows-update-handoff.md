# Actualización preparada para Windows

Rama local: `codex/onetricks-reference-audit`. Base pública conocida: `1421c9b`. Correcciones de compras: `b22a933`, junto con las revisiones anteriores de referencias y calibración incluidas en esta rama. No usar `9181fed` para validar estos cambios: es una revisión antigua.

## Preparación completada

- 879 pruebas de lógica/API correctas, una omitida por PostgreSQL dedicado; comprobación de tipos correcta.
- Auditoría de 10.270 registros documentada en `49-live-purchase-audit.md`.
- Compilaciones Vite de web y escritorio verificadas durante la preparación.
- El workflow del instalador incluye ahora cambios en el motor y sus paquetes compartidos, y agrega `build-info.json` con commit real del checkout y SHA-256 de cada instalador. El manifiesto distingue instaladores aunque la versión comercial siga siendo 0.1.0.

## Próxima operación externa

Subir esta rama y abrir un PR de revisión contra main, sin fusionarlo. El PR ejecutará CI y Desktop test build. Si se ejecuta manualmente, elegir esta rama y mantener Publish desactivado. Esperar los resultados del nuevo commit: los resultados de commits anteriores no validan este instalador.

Descargar KOI-Master-Windows y conservar build-info.json junto al instalador. Confirmar su hash en PowerShell con `Get-FileHash RUTA_DEL_INSTALADOR -Algorithm SHA256`. En PR, el commit del checkout puede ser el merge de prueba de GitHub; el manifiesto registra exactamente el código compilado.

Este entorno no ha generado el .exe de Windows. El workflow modificado todavía requiere ejecución en el runner de Windows. No se ha creado release ni desplegado Render.

## Prueba integrada

API/web y escritorio deben incluir las mismas correcciones. Cambiar solo el instalador no actualiza las recomendaciones del servidor público. Una base local vacía tampoco reproduce las estadísticas existentes de producción; debe distinguirse una prueba funcional de una prueba de recomendaciones con datos reales.

Para prueba funcional aislada, seguir `25-windows-test-guide.md` con el commit nuevo, directorio de datos separado y STATS_CRAWL=0. No copiar DATABASE_URL de producción. Para probar con la web pública, primero hace falta revisar y autorizar su actualización por separado.

Comprobar selección provisional antes del lock, cambio de campeón/rol, actualización al empezar partida, compras con componentes ya adquiridos, compras encadenadas, seis espacios ocupados, Share y fin de partida. Registrar campeón, rol, rivales, inventario, oro y consejo exacto cuando falle. La validación de League real y rendimiento en Windows sigue pendiente.
