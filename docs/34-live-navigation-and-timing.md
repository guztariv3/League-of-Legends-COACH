# Apertura de Live y tiempos de compra

29 de septiembre de 2026. Seguimiento de la revisión integrada; sin despliegue en Render ni fusión.

## Navegación automática

Antes, la web mostraba un enlace a Live y exigía abrirlo manualmente. Ahora una actualización válida del compañero abre `/live` al detectar selección/pregame/loading y vuelve a abrirlo cuando empieza la partida. Si se abre la web con la partida ya activa, también entra en Live.

La navegación ocurre una vez por etapa. Si el usuario sale voluntariamente a otra sección, el polling no lo devuelve cada dos segundos. Pausa, reconexión y respuestas vacías o caducadas no reinician el seguimiento. Idle/ended preparan el siguiente ciclo; un draft después de live también lo reinicia aunque no se haya observado el estado intermedio. Compartir debe estar activado y la cuenta debe estar enlazada: el navegador no lee League directamente.

La prueba HTTP/base/web verifica escritorio y móvil, transición desde otra página, navegación manual respetada, nueva sesión y revocación. El puente nativo sigue requiriendo prueba en Windows.

## Tiempos: alcance de la corrección

El modelo disponible calcula un ritmo aproximado a partir del oro en cartera y el valor del inventario, descontando el oro inicial. No reconstruye todo el oro ganado, compras consumidas o ventas, ni predice los ingresos futuros. Extender ese único ritmo hasta el último objeto daba una precisión aparente injustificada.

- Se conserva el orden y coste restante de todos los objetivos.
- Solo el próximo objetivo pendiente recibe una hora condicional, cuando puede calcularse. Los posteriores muestran coste sin hora.
- Una compra que el plan puede completar inmediatamente aparece como ahora, incluso al inicio, sin ritmo conocido.
- Tener oro suficiente con seis huecos ocupados no basta para prometer una finalización inmediata: debe existir una compra que el plan pueda completar.
- La app y la web explican el límite. No se recorta una estimación a 30–37 minutos ni se fuerzan tres objetos al minuto 15–20.

Esto limita una extrapolación y corrige la etiqueta de compra inmediata; **no convierte el ritmo aproximado en una predicción validada**. No se reprodujo la partida concreta que mostraba minuto 59: faltan su estado, inventario, oro y versión. Una estimación del próximo objeto todavía puede resultar tardía si el ritmo observado es bajo; se presenta como condicional, no como duración prevista de la partida.

## Validación local

- TypeScript aprobado.
- Suite completa durante la revisión: 844 aprobadas y una omitida por PostgreSQL local, en 64 archivos.
- Web: 20 E2E aprobadas. Interfaz escritorio: 21 E2E aprobadas.
- Tras el último ajuste de compra inmediata/inventario: 45 pruebas de compras y coach aprobadas, incluida la nueva regresión de seis huecos.
- Compilaciones finales web y escritorio aprobadas.
- La repetición final de la integración aprobó sus dos casos (escritorio y móvil), incluida una selección posterior sin haber observado idle/ended. El CI del nuevo commit debe comprobarse por separado.

El CI anterior de `6561a36` está aprobado (runs 36573342694 y 36573342639); no certifica estos cambios nuevos.

## Próximos pasos que necesitan intervención o evidencia externa

1. **Windows y League:** ejecutar la versión nueva con API/web y app compatibles, medir rendimiento y verificar las transiciones en una partida real. Los instaladores de las guías anteriores no contienen estos cambios.
2. **Caso del minuto 59:** registrar campeón, rol, minuto actual, oro, inventario, objeto y captura del consejo para evaluar la precisión económica, sin compartir credenciales.
3. **Datos y mecánicas:** siguen pendientes las muestras ausentes y los dos kits incompletos del informe anterior; no se declaran resueltos por aprobar estas pruebas.

No se necesita que el usuario entregue contraseñas por chat. Cualquier clave necesaria para pruebas reales se introduce privadamente en su equipo. La publicación en producción permanece como un paso separado.
