# Guía única de Windows — KOI Master 2b8d195

**Prueba integral pendiente en Windows.** Esta guía fija el código de ejecución revisado. El nuevo test de integración y el informe `32-integrated-validation.md` no cambian el programa ni requieren otro instalador.

Versión congelada: `2b8d195bff54e292e2c4c5f44d8ba37d43748306`.
CI e instalador de esta versión: aprobados y comprobados el 29 de septiembre de 2026.
Esta guía no actualiza Render, no fusiona PRs ni ejecuta recuperación histórica.

- CI: https://github.com/guztariv3/League-of-Legends-COACH/actions/runs/36571538685
- Instalador: https://github.com/guztariv3/League-of-Legends-COACH/actions/runs/36571538724/artifacts/11034074408
- Artefacto: KOI-Master-Windows, ZIP de 7,455,637 bytes, sin firma, sin release pública.
- Caduca: 13 de octubre de 2026, 13:01 UTC (9:01 a. m. Puerto Rico).

## 1. Comprobar herramientas

Abre PowerShell normal; no necesitas ejecutarlo como administrador. Ejecuta cada línea:

```powershell
git --version
node --version
pnpm.cmd --version
```

Referencia de CI: Node 22 y pnpm 10.33.0. El proyecto acepta Node >=22; antes usaste
Node 24. Si un comando falla, detente y copia el error. Usamos `pnpm.cmd` para evitar el
problema anterior con el script de PowerShell. No cambies la política de ejecución.

## 2. Obtener una copia separada, fijada al instalador

Usa esta carpeta nueva para conservar las pruebas anteriores. Si ya existe, detente;
no la borres ni sobreescribas. Ejecuta las líneas una a una y detente si alguna falla:

```powershell
git clone --branch codex/live-companion-purchase-paths https://github.com/guztariv3/League-of-Legends-COACH.git "$env:USERPROFILE\KOI-Master-2b8d195"
Set-Location "$env:USERPROFILE\KOI-Master-2b8d195"
git switch --detach 2b8d195bff54e292e2c4c5f44d8ba37d43748306
git rev-parse HEAD
pnpm.cmd install --frozen-lockfile
pnpm.cmd --filter @coach/web build
```

`git rev-parse HEAD` debe devolver el SHA completo indicado arriba. Detached HEAD es
intencional: conserva servidor y app en la misma versión aunque la rama avance.

## 3. Configurar exclusivamente el servidor local

En la misma ventana:

```powershell
$env:NODE_ENV="development"
$env:WEB_DIST="$PWD\apps\web\dist"
$env:WEB_ORIGIN="http://localhost:8787"
$env:PORT="8787"
$env:DEV_LOGIN="0"
$env:STATS_CRAWL="0"
$env:PGLITE_DIR="$PWD\.data\windows-2b8d195"
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:PROTOTYPE_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:RIOT_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
```

Esto no elimina variables de Render. Solo cambia esta ventana de PowerShell. Se usa una
base local nueva; sus migraciones, incluida 0010, se aplican al arrancar. No ejecuta el
backfill. No copies DATABASE_URL de producción a esta prueba.

## 4. Elegir conexión básica o datos Riot

**Prueba básica:** omite este bloque y continúa al paso 5. El servidor mostrará
`data=synthetic` y `stats=off`. Sirve para cuenta, enlace y conexión; no para validar la
calidad de las recomendaciones ni la disponibilidad completa del coach real.

**Prueba de recomendaciones reales:** configura privadamente la clave Riot que ya tienes.
No es la contraseña de tu cuenta ni la de acceso a la página. No la envíes por chat.
Este bloque solicita la clave sin mostrarla mientras escribes:

```powershell
$koiSecret = Read-Host "Clave Riot para esta prueba local" -AsSecureString
$koiCredential = New-Object System.Net.NetworkCredential("", $koiSecret)
$env:RIOT_API_KEY = $koiCredential.Password
Remove-Variable koiSecret, koiCredential
```

Se reutiliza la clave existente, sin contratar otro proveedor. Permanece en el entorno
de este proceso y sus hijos; no se guarda en un archivo. Cerrar PowerShell termina esa
configuración. No mostrar la variable en pantalla. `STATS_CRAWL=0` mantiene apagada la
recolección local para no competir con Render; por eso esta base nueva no tendrá las
estadísticas de producción. El servidor puede descargar el catálogo y consultar Riot,
pero sus recomendaciones sin muestra se basarán en heurísticas, no en WR local validado.

## 5. Arrancar y crear una cuenta de prueba

```powershell
pnpm.cmd --filter @coach/api start
```

Deja la ventana abierta. Espera `[api] listening on :8787`. Debe decir `web=served`,
`env=development`, `gate=off`; `data=riot` si configuraste una clave, de lo contrario
`data=synthetic`. Una línea `data=riot` no prueba que la clave sea válida: comprueba también
que la aplicación pueda obtener datos y que no muestre errores de acceso.

Abre http://localhost:8787 y pulsa **Create account**. Usa una cuenta de prueba nueva y
contraseña de al menos diez caracteres. La cuenta de la web pública no existe en esta
base local. Si falla, guarda el mensaje exacto, sin contraseñas ni códigos.

## 6. Instalar y enlazar la app correcta

1. Inicia sesión en GitHub, abre el enlace del instalador y descarga el ZIP.
2. Extrae el ZIP. Cierra cualquier instancia anterior de KOI Master y ejecuta el instalador.
3. El instalador no está firmado. Si Windows lo bloquea, conserva el texto del aviso para
   revisarlo; no desactives antivirus ni políticas de Windows.
4. En la web local: **Settings → Desktop app**, genera un código de conexión.
5. En la app: **Connect**, dirección `http://localhost:8787` y ese código.
6. Activa **Share** en Settings. Abre http://localhost:8787/live con la misma cuenta.

La versión visible 0.1.0 no identifica por sí sola el commit; usa el artefacto del enlace
fijado y el SHA del servidor. La instalación puede sustituir la app anterior por compartir
identificador; conserva su instalador si necesitas volver a ella. No uses Render como
servidor de esta app para validar los cambios nuevos: todavía tiene otra versión.

## 7. Prueba corta, en este orden

1. **Conexión:** la app muestra conexión activa. La web puede esperar datos mientras no
   haya selección/partida; esto no es un fallo por sí solo.
2. **Draft:** cambia de campeón antes de confirmar. Comprueba que no queda un consejo del
   campeón anterior; confirma y verifica el paso al plan completo. Anota campeón y rol.
3. **Compras:** anota oro e inventario antes de comprar. Las piezas deben caber, respetar
   el presupuesto y pertenecer a sus recetas. Un componente consumido no debe figurar
   como conservado; si completa otro objeto primero, debe explicar qué mantiene pendiente.
4. **Runas:** revisa la página completa y rol. Recomendado y equipado no deben confundirse.
   No se pueden cambiar las runas equipadas durante la partida.
5. **Privacidad, con servidor funcionando:** desactiva Share y comprueba que /live deje
   de mostrar lo compartido. Reactívalo para continuar.
6. **Desconexión:** cierra el servidor con Ctrl+C. Comprueba el aviso de conexión y que
   los consejos caduquen; no exijas desaparición instantánea. Arranca de nuevo con el
   comando del paso 5 y verifica la reconexión.
7. **Fin/nueva partida:** comprueba limpieza del estado, ausencia de consejos anteriores
   y transición a datos nuevos. Un resumen definitivo puede esperar datos de Riot.
8. **Rendimiento y diseño:** anota tirones, lentitud y diferencias respecto a tus imágenes
   de referencia. Las pruebas automatizadas no sustituyen esta comprobación.

No cambies el reloj de Windows en esta prueba de un solo PC: servidor y app comparten
reloj, por lo que no demuestra desfase independiente. Ese escenario queda en docs/22.

## 8. Qué enviarme

```text
Versión del servidor: 2b8d195
Instalador: artefacto 11034074408
Modo del servidor: riot / synthetic
Campeón y rol:
Rival:
Paso probado:
Qué esperaba:
Qué ocurrió:
Oro e inventario antes de comprar (si aplica):
Texto de Connection:
```

Adjunta capturas de app y web o las últimas líneas relevantes del servidor. No compartas
claves, contraseñas, códigos de enlace ni DATABASE_URL. Si falla un paso, basta con ese
resultado para empezar a corregir: no necesitas completar todas las pruebas.

Al terminar, cierra la app y detén el servidor con Ctrl+C; cierra PowerShell. La base local
queda disponible para repetir las pruebas. No se necesita crear servicios nuevos en Render.
