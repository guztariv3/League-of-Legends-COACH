# Abrir KOI Master al público

Objetivo: que cualquiera pueda usar la web y descargar la app de escritorio.

## Qué lo impide hoy

| Bloqueo | Por qué | Cómo se resuelve |
|---|---|---|
| Clave de Riot | La Personal API key es para el uso del propio desarrollador. | Pedir una **Production key** en el portal de desarrolladores de Riot. Riot la revisa; plazo y resultado desconocidos. |
| Inicio de sesión | El login de desarrollo reutiliza el usuario por nombre: abierto al público, cualquiera entraría como otro. | **Riot Sign On (RSO)**, que Riot da a apps con Production key (D-01). Después se retiran la contraseña del prototipo y el login de desarrollo. |
| Capacidad | La base de datos gratuita de Render caduca y el plan gratuito se duerme. | Plan de pago de Render (decisión de coste pendiente). |
| Aviso de Windows | El instalador no lleva firma Authenticode. | Certificado de firma de código (de pago). Mientras tanto, la página de descarga explica el aviso de SmartScreen. |

## Hecho (preparación)

- **Páginas públicas sin contraseña:** `/info/` (qué es y descarga), `/info/privacy` y `/info/terms` (en inglés, D-09). Son una entrada aparte de Vite (`apps/web/info`), sin sesión ni API. El gate solo deja pasar además `/assets/*` (los ficheros compilados, que no contienen datos) y `/favicon.svg`.
- **Aviso legal de Riot** en todas las páginas (pie).
- **Retención de datos** (`apps/api/src/retention.ts`), tal como la describe la política de privacidad:
  - Las partidas que no usa ninguna cuenta vinculada se borran a los 30 días.
  - Los análisis se borran al momento al desvincular una cuenta o al borrar todo.
  - Se borran los códigos de conexión sin usar y las sesiones caducadas.
  - El borrado se ejecuta al arrancar y cada 24 h.

Los textos legales son una base honesta de lo que hace el código, **no asesoría legal**. Revísalos antes de abrir la web al público y actualízalos si cambia lo que se guarda.

## Pasos siguientes

1. **Primera versión publicada de la app**, para que funcione el botón de descarga (`/releases/latest`). Sigue la configuración inicial de `10-despliegue.md`: claves de firma en los *secrets* de GitHub y el tag `desktop-vX.Y.Z`. Después revisa el borrador y publícalo.
2. **Production key:** registra el producto en el portal de desarrolladores de Riot con:
   - la descripción de la app;
   - la URL pública `https://kairos-coach.onrender.com/info/`;
   - las páginas de privacidad y términos;
   - cómo se usan los datos.
   
   Riot puede pedir acceso al prototipo: dales la contraseña del prototipo por el canal que indiquen, nunca en público.
3. **Al aprobarse:**
   - RSO como único inicio de sesión;
   - quitar el login de desarrollo y `PROTOTYPE_PASSWORD`;
   - límites de uso por usuario;
   - la página de inicio pública pasa a ser la entrada de la web.
