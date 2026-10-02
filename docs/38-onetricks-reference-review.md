# Revisión adicional con OneTricks.gg

Fecha: 2026-10-01. Referencia del motor: `1421c9b493b051eaae27095933ce111c1e9e42c0` (mismo árbol de archivos que `7850424`). Esta revisión no cambia recomendaciones en producción.

## Hallazgo reproducido: Aurelion Sol mid

Con el catálogo 16.19.1 y la exportación completa autorizada de estadísticas 16.19, el motor vuelve a producir **Rylai's Crystal Scepter → Malignance → Lich Bane**. También lo hace en el escenario neutral, sin rivales que justifiquen una adaptación. El primer objeto tiene evidencia elegible; los dos siguientes son estimaciones mecánicas.

La página pública https://www.onetricks.gg/champions/builds/AurelionSol, consultada el 1 de octubre, contiene una sección explícita para el parche **16.19**, rol **mid**, sin filtro de rival ni región. La ruta principal es **Rylai's Crystal Scepter → Liandry's Torment**. Entre las opciones del tercer hueco de esa ruta aparecen **Zhonya's Hourglass, Bloodletter's Curse y Void Staff**. Son alternativas por hueco: no deben concatenarse como si constituyeran una única secuencia observada. La página también ofrece rutas completas separadas y alternativas que empiezan por Blackfire Torch.

La comparación confirma una discrepancia importante después del primer objeto. No demuestra que una única secuencia de seis objetos sea óptima para todos los rivales o estados de partida.

### Por qué falla nuestro motor

1. En la exportación recibida, 173 de las 191 observaciones de primer objeto de Aurelion Sol mid son Rylai. Ese primer objeto sí pasa el umbral de evidencia.
2. Hay **89** secuencias de core que empiezan por Rylai; **76** continúan por Liandry. El total de todas las secuencias de core del rol, incluso las que empiezan por otros objetos, es **99**.
3. `packages/build/src/evidence.ts` exige al menos 100 observaciones en el prefijo comparable y 30 en la opción. Las 89 secuencias se descartan por completo para ponderar la siguiente compra.
4. `packages/build/src/recommend.ts` vuelve al ranking mecánico cuando ninguna opción pasa el umbral. Premia estadísticas, maná, ultimate haste y daño activado por la definitiva; también da valor genérico a Spellblade con escalado AP y uso de habilidades. Eso explica las selecciones de Malignance y Lich Bane.
5. No hay en esa puntuación una valoración equivalente y explícita del patrón de daño sostenido/canalización para esos objetos. La explicación de Lich Bane supone que intercalar ataques es apropiado; la mera posibilidad de hacerlo no demuestra que sea una buena compra para ese patrón de combate.

Además, `apps/api/src/stats/aggregate.ts` solo registra `core` cuando se completaron tres objetos. Por tanto, inferir la segunda compra a partir de esas filas excluye partidas que terminaron con dos objetos: pierde evidencia y selecciona una cohorte distinta. La siguiente versión debe registrar transiciones de compra por etapa, con denominadores separados y sin duplicar partidas.

Los recuentos anteriores son de nuestra exportación, no recuentos de OneTricks. No se han sumado ambas fuentes ni convertido popularidades de OneTricks en victorias.

## Método de revisión del resto del catálogo

`scripts/audit-onetricks.py` obtiene las páginas públicas de los campeones enumerados por el propio sitio. Conserva únicamente agregados de builds: rutas de primeros objetos, núcleos, opciones posteriores, secuencias completas disponibles, componentes, botas y runas/hechizos presentes. No conserva jugadores ni historiales individuales. Emplea tres conexiones concurrentes, caché local y espera entre solicitudes; no accede a filtros PRO ni a contenido autenticado.

Para cada campeón se revisa el **rol predeterminado de la página**, exclusivamente el parche 16.19. Se comparan sus rutas con una nueva ejecución neutral del motor para ese mismo campeón/rol. La entrada de estadísticas del motor sigue siendo la exportación recibida el 29 de septiembre: no es una consulta nueva a la base de datos de producción.

El alcance no equivale a revisar todos los filtros posibles de rival, rol, región o rango. Tampoco convierte las 865 combinaciones del audit interno en 865 consultas externas. Los roles alternativos y matchups necesitan referencias específicas antes de trasladar una ruta entre contextos.

Una diferencia se registra como **caso para revisar**, no como error estratégico demostrado. Si falta el parche solicitado, no se sustituye silenciosamente por datos de otros parches. Los pesos publicados se conservan como pesos; no se interpretan como WR ni como tamaños de muestra independientes.

## Cambios que debe resolver la siguiente implementación

- Registrar la segunda compra aunque la partida no llegue a un tercer objeto, y etapas posteriores con su propio prefijo y denominador. No mezclar esos nuevos contadores con triples históricos como si fueran observaciones independientes.
- Evitar el salto abrupto de evidencia limitada a una ruta genérica sin apoyo. Separar evidencia suficiente, evidencia limitada y ausencia de evidencia; calibrar ese tratamiento con una evaluación del conjunto de campeones, no bajando un umbral para que pase un caso concreto.
- Introducir una referencia externa con fuente, parche, rol, fecha y alcance explícitos. Usar las rutas como referencias atribuibles, sin inventar sus victorias ni sumarlas a nuestros contadores: podrían contener las mismas partidas.
- Evaluar el patrón real de combate y las pasivas de objetos, incluido daño sostenido, canalizaciones y necesidad de intercalar ataques. No resolverlo mediante una excepción fija con el nombre de un campeón.
- Preservar el prefijo de compra, distinguir opciones por hueco de secuencias completas, y convertir cada objetivo en componentes legales según inventario, oro y espacio. Una ruta de componentes popular no decide por sí sola cuál comprar en cualquier regreso a base.
- Validar por campeón/rol los cambios de primero, segundo y tercer objeto; comprobar compras defensivas justificadas, transición de parche, muestras escasas y objetivos ya parcialmente comprados.

No se ha integrado OneTricks como proveedor automático de producción ni modificado el motor durante esta revisión. El recolector de producción continúa pausado según el último estado confirmado; esta auditoría no lo reactiva.

## Reproducibilidad

Desde `apps/api`, ejecutar el audit existente con la exportación autorizada fuera de Git:

```sh
node --import tsx ../../scripts/audit-export-recommendations.ts /ruta/export.json.gz /tmp/engine-replay.json
```

Desde la raíz del repositorio:

```sh
python scripts/audit-onetricks.py /ruta/salida 16.19 /tmp/engine-replay.json
```

La salida contiene una ficha agregada por campeón, `comparison.json`, `comparison.csv`, `routes.csv` y `summary.json`. Las consultas quedan fechadas y con SHA-256 del HTML de origen. Una nueva ejecución puede obtener resultados distintos porque la fuente cambia.

Referencias: https://www.onetricks.gg/faq (cohorte de especialistas), páginas enlazadas en los informes, `docs/29-current-roster-review.md`, `packages/build/src/evidence.ts` y `packages/build/src/recommend.ts`.

## Resultado del barrido

Se consultaron **173 campeones**. Se recuperaron rutas explícitas del parche 16.19 para **172** páginas de rol predeterminado. Kayn queda pendiente: su página separa las formas (`red`, `blue`, `kayn`), y los dos intentos finales de recuperar esos datos agotaron el tiempo de conexión. Esto no significa que la página carezca de builds.

Entre 170 primeros objetos comparables hay **53 discrepancias**; entre 143 núcleos de dos compras comparables hay **82 discrepancias**. Son banderas de revisión, no un porcentaje de builds incorrectos. Locke y Zaahen no tienen salida del motor por mecánicas incompletas. Las mejoras gratuitas de misión de support se conservan en las rutas externas, pero se excluyen al comparar compras.

O = evidencia interna elegible; H = estimación mecánica. Se muestra el núcleo principal externo; el CSV de rutas recoge también las alternativas y componentes. El rival se omitió en todos los escenarios del motor para esta comparación general.

| Campeón | Rol | Motor: 1 → 2 → 3 | Respaldo | Núcleo principal OneTricks | Revisión |
|---|---|---|---|---|---|
| [Aatrox](https://www.onetricks.gg/champions/builds/Aatrox) | TOP | Black Cleaver → Warmog's Armor → Experimental Hexplate | O/H/H | Eclipse → Black Cleaver | Primer objeto distinto |
| [Ahri](https://www.onetricks.gg/champions/builds/Ahri) | MIDDLE | Malignance → Lich Bane → Rabadon's Deathcap | O/O/O | Malignance → Lich Bane | Coincide núcleo; resto pendiente |
| [Akali](https://www.onetricks.gg/champions/builds/Akali) | MIDDLE | Hextech Gunblade → Shadowflame → Rabadon's Deathcap | O/O/O | Hextech Gunblade → Shadowflame | Coincide núcleo; resto pendiente |
| [Akshan](https://www.onetricks.gg/champions/builds/Akshan) | MIDDLE | The Collector → Infinity Edge → Essence Reaver | O/O/H | The Collector → Infinity Edge | Coincide núcleo; resto pendiente |
| [Alistar](https://www.onetricks.gg/champions/builds/Alistar) | UTILITY | Protoplasm Harness → Winter's Approach → Warmog's Armor | O/H/H | Celestial Opposition → Zeke's Convergence | Primer objeto distinto |
| [Ambessa](https://www.onetricks.gg/champions/builds/Ambessa) | TOP | Eclipse → Black Cleaver → Axiom Arc | O/O/H | Eclipse → Black Cleaver | Coincide núcleo; resto pendiente |
| [Amumu](https://www.onetricks.gg/champions/builds/Amumu) | UTILITY | Winter's Approach → Protoplasm Harness → Cryptbloom | H/H/H | Celestial Opposition → Zeke's Convergence | Primer objeto distinto |
| [Anivia](https://www.onetricks.gg/champions/builds/Anivia) | MIDDLE | Rod of Ages → Malignance → Lich Bane | O/O/H | Rod of Ages → Malignance | Coincide núcleo; resto pendiente |
| [Annie](https://www.onetricks.gg/champions/builds/Annie) | MIDDLE | Malignance → Lich Bane → Cryptbloom | O/H/H | Malignance → Shadowflame | Segundo objeto distinto |
| [Aphelios](https://www.onetricks.gg/champions/builds/Aphelios) | BOTTOM | Stormrazor → Infinity Edge → Lord Dominik's Regards | O/O/O | The Collector → Infinity Edge | Primer objeto distinto |
| [Ashe](https://www.onetricks.gg/champions/builds/Ashe) | BOTTOM | Hexoptics C44 → Phantom Dancer → Infinity Edge | O/O/O | Hexoptics C44 → Phantom Dancer | Coincide núcleo; resto pendiente |
| [AurelionSol](https://www.onetricks.gg/champions/builds/AurelionSol) | MIDDLE | Rylai's Crystal Scepter → Malignance → Lich Bane | O/H/H | Rylai's Crystal Scepter → Liandry's Torment | Segundo objeto distinto |
| [Aurora](https://www.onetricks.gg/champions/builds/Aurora) | MIDDLE | Luden's Echo → Malignance → Lich Bane | O/H/H | Stormsurge → Shadowflame | Primer objeto distinto |
| [Azir](https://www.onetricks.gg/champions/builds/Azir) | MIDDLE | Nashor's Tooth → Essence Reaver → Malignance | O/H/H | Nashor's Tooth → Shadowflame | Segundo objeto distinto |
| [Bard](https://www.onetricks.gg/champions/builds/Bard) | UTILITY | Locket of the Iron Solari → Echoes of Helia → Moonstone Renewer | O/H/H | Bloodsong → Dead Man's Plate | Primer objeto distinto |
| [Belveth](https://www.onetricks.gg/champions/builds/Belveth) | JUNGLE | Kraken Slayer → Blade of The Ruined King → Phantom Dancer | O/O/H | Kraken Slayer → Blade of The Ruined King | Coincide núcleo; resto pendiente |
| [Blitzcrank](https://www.onetricks.gg/champions/builds/Blitzcrank) | UTILITY | Locket of the Iron Solari → Winter's Approach → Protoplasm Harness | O/H/H | Mikael's Blessing → Solstice Sleigh | Primer objeto distinto |
| [Brand](https://www.onetricks.gg/champions/builds/Brand) | BOTTOM | Malignance → Lich Bane → Cryptbloom | H/H/H | Blackfire Torch → Liandry's Torment | Primer objeto distinto |
| [Braum](https://www.onetricks.gg/champions/builds/Braum) | UTILITY | Locket of the Iron Solari → Winter's Approach → Protoplasm Harness | O/H/H | Solstice Sleigh → Locket of the Iron Solari | Núcleo parcial/no comparable |
| [Briar](https://www.onetricks.gg/champions/builds/Briar) | JUNGLE | Titanic Hydra → Warmog's Armor → Heartsteel | O/H/H | Titanic Hydra → Black Cleaver | Segundo objeto distinto |
| [Caitlyn](https://www.onetricks.gg/champions/builds/Caitlyn) | BOTTOM | Hexoptics C44 → Infinity Edge → Lord Dominik's Regards | O/O/O | Hexoptics C44 → Infinity Edge | Coincide núcleo; resto pendiente |
| [Camille](https://www.onetricks.gg/champions/builds/Camille) | TOP | Trinity Force → Ravenous Hydra → Death's Dance | O/O/O | Trinity Force → Ravenous Hydra | Coincide núcleo; resto pendiente |
| [Cassiopeia](https://www.onetricks.gg/champions/builds/Cassiopeia) | MIDDLE | Rod of Ages → Archangel's Staff → Malignance | O/O/H | Rod of Ages → Seraph's Embrace | Segundo objeto distinto |
| [Chogath](https://www.onetricks.gg/champions/builds/Chogath) | TOP | Heartsteel → Warmog's Armor → Winter's Approach | O/H/H | Hextech Rocketbelt → Riftmaker | Primer objeto distinto |
| [Corki](https://www.onetricks.gg/champions/builds/Corki) | BOTTOM | Essence Reaver → Hexoptics C44 → Infinity Edge | O/O/H | Essence Reaver → The Collector | Segundo objeto distinto |
| [Darius](https://www.onetricks.gg/champions/builds/Darius) | TOP | Youmuu's Ghostblade → Dead Man's Plate → Death's Dance | O/O/O | Youmuu's Ghostblade → Dead Man's Plate | Coincide núcleo; resto pendiente |
| [Diana](https://www.onetricks.gg/champions/builds/Diana) | MIDDLE | Lich Bane → Malignance → Cosmic Drive | O/H/H | Stormsurge → Shadowflame | Primer objeto distinto |
| [DrMundo](https://www.onetricks.gg/champions/builds/DrMundo) | TOP | Warmog's Armor → Heartsteel → Titanic Hydra | O/O/O | Heartsteel → Spirit Visage | Primer objeto distinto |
| [Draven](https://www.onetricks.gg/champions/builds/Draven) | BOTTOM | Bloodthirster → Hexoptics C44 → Essence Reaver | O/O/H | Hubris → Hexoptics C44 | Primer objeto distinto |
| [Ekko](https://www.onetricks.gg/champions/builds/Ekko) | MIDDLE | Dusk and Dawn → Shadowflame → Rabadon's Deathcap | O/O/O | Dusk and Dawn → Shadowflame | Coincide núcleo; resto pendiente |
| [Elise](https://www.onetricks.gg/champions/builds/Elise) | JUNGLE | Lich Bane → Shadowflame → Void Staff | O/O/O | Lich Bane → Shadowflame | Coincide núcleo; resto pendiente |
| [Evelynn](https://www.onetricks.gg/champions/builds/Evelynn) | JUNGLE | Lich Bane → Rabadon's Deathcap → Malignance | O/O/H | Lich Bane → Rabadon's Deathcap | Coincide núcleo; resto pendiente |
| [Ezreal](https://www.onetricks.gg/champions/builds/Ezreal) | BOTTOM | Essence Reaver → Hextech Gunblade → Malignance | O/H/H | Trinity Force → Muramana | Primer objeto distinto |
| [Fiddlesticks](https://www.onetricks.gg/champions/builds/Fiddlesticks) | JUNGLE | Malignance → Lich Bane → Cryptbloom | O/H/H | Hextech Rocketbelt → Shadowflame | Primer objeto distinto |
| [Fiora](https://www.onetricks.gg/champions/builds/Fiora) | TOP | Ravenous Hydra → Trinity Force → Death's Dance | O/O/O | Ravenous Hydra → Trinity Force | Coincide núcleo; resto pendiente |
| [Fizz](https://www.onetricks.gg/champions/builds/Fizz) | MIDDLE | Lich Bane → Malignance → Cryptbloom | O/H/H | Lich Bane → Zhonya's Hourglass | Segundo objeto distinto |
| [Galio](https://www.onetricks.gg/champions/builds/Galio) | MIDDLE | Hextech Rocketbelt → Imperial Mandate → Winter's Approach | O/O/H | Hextech Rocketbelt → Imperial Mandate | Coincide núcleo; resto pendiente |
| [Gangplank](https://www.onetricks.gg/champions/builds/Gangplank) | TOP | Essence Reaver → The Collector → Malignance | O/O/H | Essence Reaver → The Collector | Coincide núcleo; resto pendiente |
| [Garen](https://www.onetricks.gg/champions/builds/Garen) | TOP | Stridebreaker → Youmuu's Ghostblade → Warmog's Armor | O/O/H | Stridebreaker → Youmuu's Ghostblade | Coincide núcleo; resto pendiente |
| [Gnar](https://www.onetricks.gg/champions/builds/Gnar) | TOP | Trinity Force → Black Cleaver → Sterak's Gage | O/O/O | Trinity Force → Black Cleaver | Coincide núcleo; resto pendiente |
| [Gragas](https://www.onetricks.gg/champions/builds/Gragas) | TOP | Hextech Rocketbelt → Winter's Approach → Cosmic Drive | O/H/H | Lich Bane → Shadowflame | Primer objeto distinto |
| [Graves](https://www.onetricks.gg/champions/builds/Graves) | JUNGLE | Hubris → The Collector → Immortal Shieldbow | O/O/O | Hubris → The Collector | Coincide núcleo; resto pendiente |
| [Gwen](https://www.onetricks.gg/champions/builds/Gwen) | TOP | Dusk and Dawn → Malignance → Hextech Gunblade | O/H/H | Dusk and Dawn → Shadowflame | Segundo objeto distinto |
| [Hecarim](https://www.onetricks.gg/champions/builds/Hecarim) | JUNGLE | Black Cleaver → Death's Dance → Essence Reaver | O/O/H | Spear of Shojin → Death's Dance | Primer objeto distinto |
| [Heimerdinger](https://www.onetricks.gg/champions/builds/Heimerdinger) | TOP | Malignance → Lich Bane → Cryptbloom | H/H/H | Blackfire Torch → Rabadon's Deathcap | Primer objeto distinto |
| [Hwei](https://www.onetricks.gg/champions/builds/Hwei) | BOTTOM | Blackfire Torch → Horizon Focus → Malignance | O/O/H | Blackfire Torch → Horizon Focus | Coincide núcleo; resto pendiente |
| [Illaoi](https://www.onetricks.gg/champions/builds/Illaoi) | TOP | Black Cleaver → Essence Reaver → Axiom Arc | O/H/H | Black Cleaver → Sterak's Gage | Segundo objeto distinto |
| [Irelia](https://www.onetricks.gg/champions/builds/Irelia) | TOP | Blade of The Ruined King → Hullbreaker → Death's Dance | O/O/O | Blade of The Ruined King → Hullbreaker | Coincide núcleo; resto pendiente |
| [Ivern](https://www.onetricks.gg/champions/builds/Ivern) | JUNGLE | Redemption → Essence Reaver → Dawncore | O/H/H | Redemption → Moonstone Renewer | Segundo objeto distinto |
| [Janna](https://www.onetricks.gg/champions/builds/Janna) | UTILITY | Moonstone Renewer → Redemption → Dawncore | O/O/O | Dream Maker → Moonstone Renewer | Núcleo parcial/no comparable |
| [JarvanIV](https://www.onetricks.gg/champions/builds/JarvanIV) | JUNGLE | Profane Hydra → Voltaic Cyclosword → Bastionbreaker | O/O/O | Profane Hydra → Voltaic Cyclosword | Coincide núcleo; resto pendiente |
| [Jax](https://www.onetricks.gg/champions/builds/Jax) | TOP | Trinity Force → Hextech Gunblade → Infinity Edge | O/O/H | Trinity Force → Hextech Gunblade | Coincide núcleo; resto pendiente |
| [Jayce](https://www.onetricks.gg/champions/builds/Jayce) | TOP | Youmuu's Ghostblade → Manamune → Voltaic Cyclosword | O/O/O | Youmuu's Ghostblade → Muramana | Segundo objeto distinto |
| [Jhin](https://www.onetricks.gg/champions/builds/Jhin) | BOTTOM | Hubris → Phantom Dancer → Infinity Edge | O/O/O | Hubris → Phantom Dancer | Coincide núcleo; resto pendiente |
| [Jinx](https://www.onetricks.gg/champions/builds/Jinx) | BOTTOM | Hexoptics C44 → Infinity Edge → Essence Reaver | O/O/H | Hexoptics C44 → Runaan's Hurricane | Segundo objeto distinto |
| [KSante](https://www.onetricks.gg/champions/builds/KSante) | TOP | Iceborn Gauntlet → Unending Despair → Warmog's Armor | O/O/H | Iceborn Gauntlet → Jak'Sho, The Protean | Segundo objeto distinto |
| [Kaisa](https://www.onetricks.gg/champions/builds/Kaisa) | BOTTOM | Kraken Slayer → Guinsoo's Rageblade → Phantom Dancer | O/O/O | Kraken Slayer → Guinsoo's Rageblade | Coincide núcleo; resto pendiente |
| [Kalista](https://www.onetricks.gg/champions/builds/Kalista) | BOTTOM | Statikk Shiv → Guinsoo's Rageblade → Terminus | O/O/O | Statikk Shiv → Guinsoo's Rageblade | Coincide núcleo; resto pendiente |
| [Karma](https://www.onetricks.gg/champions/builds/Karma) | UTILITY | Echoes of Helia → Moonstone Renewer → Cryptbloom | O/O/H | Dream Maker → Echoes of Helia | Núcleo parcial/no comparable |
| [Karthus](https://www.onetricks.gg/champions/builds/Karthus) | BOTTOM | Blackfire Torch → Shadowflame → Malignance | O/O/H | Blackfire Torch → Shadowflame | Coincide núcleo; resto pendiente |
| [Kassadin](https://www.onetricks.gg/champions/builds/Kassadin) | MIDDLE | Malignance → Lich Bane → Cosmic Drive | O/H/H | Rod of Ages → Seraph's Embrace | Primer objeto distinto |
| [Katarina](https://www.onetricks.gg/champions/builds/Katarina) | MIDDLE | Lich Bane → Shadowflame → Rabadon's Deathcap | O/O/O | Lich Bane → Shadowflame | Coincide núcleo; resto pendiente |
| [Kayle](https://www.onetricks.gg/champions/builds/Kayle) | TOP | Nashor's Tooth → Essence Reaver → Infinity Edge | O/H/H | Nashor's Tooth → Dusk and Dawn | Segundo objeto distinto |
| [Kayn](https://www.onetricks.gg/champions/builds/Kayn) | JUNGLE | Voltaic Cyclosword → Bastionbreaker → Essence Reaver | O/O/H | Sin ruta recuperada | Referencia pendiente |
| [Kennen](https://www.onetricks.gg/champions/builds/Kennen) | TOP | Hextech Gunblade → Malignance → Lich Bane | O/H/H | Hextech Rocketbelt → Shadowflame | Primer objeto distinto |
| [Khazix](https://www.onetricks.gg/champions/builds/Khazix) | JUNGLE | Umbral Glaive → Bastionbreaker → Voltaic Cyclosword | O/O/O | Umbral Glaive → Voltaic Cyclosword | Segundo objeto distinto |
| [Kindred](https://www.onetricks.gg/champions/builds/Kindred) | JUNGLE | Kraken Slayer → Essence Reaver → Infinity Edge | O/H/H | Trinity Force → The Collector | Primer objeto distinto |
| [Kled](https://www.onetricks.gg/champions/builds/Kled) | TOP | Titanic Hydra → Black Cleaver → Essence Reaver | O/O/H | Titanic Hydra → Hullbreaker | Segundo objeto distinto |
| [KogMaw](https://www.onetricks.gg/champions/builds/KogMaw) | BOTTOM | Guinsoo's Rageblade → Navori Flickerblade → Infinity Edge | O/O/H | Guinsoo's Rageblade → Runaan's Hurricane | Segundo objeto distinto |
| [Leblanc](https://www.onetricks.gg/champions/builds/Leblanc) | MIDDLE | Luden's Echo → Shadowflame → Rabadon's Deathcap | O/O/O | Luden's Echo → Shadowflame | Coincide núcleo; resto pendiente |
| [LeeSin](https://www.onetricks.gg/champions/builds/LeeSin) | JUNGLE | Eclipse → Black Cleaver → Death's Dance | O/O/O | Eclipse → Black Cleaver | Coincide núcleo; resto pendiente |
| [Leona](https://www.onetricks.gg/champions/builds/Leona) | UTILITY | Locket of the Iron Solari → Knight's Vow → Winter's Approach | O/O/H | Bloodsong → Locket of the Iron Solari | Núcleo parcial/no comparable |
| [Lillia](https://www.onetricks.gg/champions/builds/Lillia) | JUNGLE | Blackfire Torch → Malignance → Lich Bane | O/H/H | Liandry's Torment → Riftmaker | Primer objeto distinto |
| [Lissandra](https://www.onetricks.gg/champions/builds/Lissandra) | MIDDLE | Malignance → Shadowflame → Lich Bane | O/O/H | Blackfire Torch → Hextech Rocketbelt | Primer objeto distinto |
| [Locke](https://www.onetricks.gg/champions/builds/Locke) | MIDDLE | Sin recomendación | — | Lich Bane → Shadowflame | Motor sin recomendación |
| [Lucian](https://www.onetricks.gg/champions/builds/Lucian) | BOTTOM | Essence Reaver → Infinity Edge → Hexoptics C44 | O/O/H | Essence Reaver → Navori Flickerblade | Segundo objeto distinto |
| [Lulu](https://www.onetricks.gg/champions/builds/Lulu) | UTILITY | Ardent Censer → Moonstone Renewer → Echoes of Helia | O/O/H | Dream Maker → Ardent Censer | Núcleo parcial/no comparable |
| [Lux](https://www.onetricks.gg/champions/builds/Lux) | MIDDLE | Malignance → Lich Bane → Cryptbloom | O/H/H | Luden's Echo → Stormsurge | Primer objeto distinto |
| [Malphite](https://www.onetricks.gg/champions/builds/Malphite) | TOP | Malignance → Warmog's Armor → Protoplasm Harness | O/H/H | Sunfire Aegis → Thornmail | Primer objeto distinto |
| [Malzahar](https://www.onetricks.gg/champions/builds/Malzahar) | MIDDLE | Blackfire Torch → Malignance → Lich Bane | O/H/H | Blackfire Torch → Rylai's Crystal Scepter | Segundo objeto distinto |
| [Maokai](https://www.onetricks.gg/champions/builds/Maokai) | UTILITY | Bandlepipes → Winter's Approach → Warmog's Armor | O/H/H | Solstice Sleigh → Locket of the Iron Solari | Primer objeto distinto |
| [MasterYi](https://www.onetricks.gg/champions/builds/MasterYi) | JUNGLE | Kraken Slayer → The Collector → Infinity Edge | O/O/O | Kraken Slayer → The Collector | Coincide núcleo; resto pendiente |
| [Mel](https://www.onetricks.gg/champions/builds/Mel) | MIDDLE | Luden's Echo → Malignance → Lich Bane | O/H/H | Luden's Echo → Shadowflame | Segundo objeto distinto |
| [Milio](https://www.onetricks.gg/champions/builds/Milio) | UTILITY | Echoes of Helia → Redemption → Staff of Flowing Water | O/H/H | Dream Maker → Echoes of Helia | Núcleo parcial/no comparable |
| [MissFortune](https://www.onetricks.gg/champions/builds/MissFortune) | BOTTOM | Bloodthirster → Essence Reaver → Malignance | O/H/H | Hubris → The Collector | Primer objeto distinto |
| [MonkeyKing](https://www.onetricks.gg/champions/builds/MonkeyKing) | JUNGLE | Trinity Force → Black Cleaver → Death's Dance | O/O/O | Trinity Force → Black Cleaver | Coincide núcleo; resto pendiente |
| [Mordekaiser](https://www.onetricks.gg/champions/builds/Mordekaiser) | TOP | Riftmaker → Cosmic Drive → Dusk and Dawn | O/H/H | Riftmaker → Dusk and Dawn | Segundo objeto distinto |
| [Morgana](https://www.onetricks.gg/champions/builds/Morgana) | UTILITY | Rylai's Crystal Scepter → Malignance → Lich Bane | O/H/H | Solstice Sleigh → Rylai's Crystal Scepter | Núcleo parcial/no comparable |
| [Naafiri](https://www.onetricks.gg/champions/builds/Naafiri) | JUNGLE | Voltaic Cyclosword → Black Cleaver → Death's Dance | O/O/O | Voltaic Cyclosword → Black Cleaver | Coincide núcleo; resto pendiente |
| [Nami](https://www.onetricks.gg/champions/builds/Nami) | UTILITY | Echoes of Helia → Moonstone Renewer → Malignance | O/O/H | Solstice Sleigh → Echoes of Helia | Núcleo parcial/no comparable |
| [Nasus](https://www.onetricks.gg/champions/builds/Nasus) | TOP | Trinity Force → Warmog's Armor → Winter's Approach | O/H/H | Trinity Force → Frozen Heart | Segundo objeto distinto |
| [Nautilus](https://www.onetricks.gg/champions/builds/Nautilus) | UTILITY | Protoplasm Harness → Winter's Approach → Warmog's Armor | O/H/H | Celestial Opposition → Locket of the Iron Solari | Primer objeto distinto |
| [Neeko](https://www.onetricks.gg/champions/builds/Neeko) | UTILITY | Hextech Rocketbelt → Malignance → Lich Bane | O/H/H | Celestial Opposition → Hextech Rocketbelt | Núcleo parcial/no comparable |
| [Nidalee](https://www.onetricks.gg/champions/builds/Nidalee) | JUNGLE | Lich Bane → Hextech Rocketbelt → Mejai's Soulstealer | O/O/O | Lich Bane → Hextech Rocketbelt | Coincide núcleo; resto pendiente |
| [Nilah](https://www.onetricks.gg/champions/builds/Nilah) | BOTTOM | Essence Reaver → Infinity Edge → Hexoptics C44 | H/H/H | The Collector → Infinity Edge | Primer objeto distinto |
| [Nocturne](https://www.onetricks.gg/champions/builds/Nocturne) | JUNGLE | Experimental Hexplate → Essence Reaver → Guardian Angel | O/H/H | Profane Hydra → Axiom Arc | Primer objeto distinto |
| [Nunu](https://www.onetricks.gg/champions/builds/Nunu) | JUNGLE | Hextech Rocketbelt → Warmog's Armor → Winter's Approach | O/H/H | Liandry's Torment → Dead Man's Plate | Primer objeto distinto |
| [Olaf](https://www.onetricks.gg/champions/builds/Olaf) | TOP | Stridebreaker → Experimental Hexplate → Essence Reaver | O/O/H | Ravenous Hydra → Death's Dance | Primer objeto distinto |
| [Orianna](https://www.onetricks.gg/champions/builds/Orianna) | MIDDLE | Blackfire Torch → Hextech Rocketbelt → Malignance | O/O/H | Blackfire Torch → Hextech Rocketbelt | Coincide núcleo; resto pendiente |
| [Ornn](https://www.onetricks.gg/champions/builds/Ornn) | TOP | Unending Despair → Warmog's Armor → Winter's Approach | O/H/H | Unending Despair → Kaenic Rookern | Segundo objeto distinto |
| [Pantheon](https://www.onetricks.gg/champions/builds/Pantheon) | TOP | Black Cleaver → Malignance → Hextech Gunblade | O/H/H | Bastionbreaker → Voltaic Cyclosword | Primer objeto distinto |
| [Poppy](https://www.onetricks.gg/champions/builds/Poppy) | TOP | Sunfire Aegis → Essence Reaver → Winter's Approach | O/H/H | Sundered Sky → Fimbulwinter | Primer objeto distinto |
| [Pyke](https://www.onetricks.gg/champions/builds/Pyke) | UTILITY | Umbral Glaive → Essence Reaver → Axiom Arc | O/H/H | Celestial Opposition → Umbral Glaive | Núcleo parcial/no comparable |
| [Qiyana](https://www.onetricks.gg/champions/builds/Qiyana) | JUNGLE | Umbral Glaive → Bastionbreaker → Essence Reaver | O/O/H | Voltaic Cyclosword → Bastionbreaker | Primer objeto distinto |
| [Quinn](https://www.onetricks.gg/champions/builds/Quinn) | TOP | Profane Hydra → Essence Reaver → Infinity Edge | O/H/H | Profane Hydra → Edge of Night | Segundo objeto distinto |
| [Rakan](https://www.onetricks.gg/champions/builds/Rakan) | UTILITY | Zeke's Convergence → Locket of the Iron Solari → Echoes of Helia | O/O/H | Celestial Opposition → Zeke's Convergence | Núcleo parcial/no comparable |
| [Rammus](https://www.onetricks.gg/champions/builds/Rammus) | JUNGLE | Winter's Approach → Warmog's Armor → Cosmic Drive | H/H/H | Thornmail → Sunfire Aegis | Primer objeto distinto |
| [RekSai](https://www.onetricks.gg/champions/builds/RekSai) | JUNGLE | Titanic Hydra → Spear of Shojin → Black Cleaver | O/O/H | Titanic Hydra → Spear of Shojin | Coincide núcleo; resto pendiente |
| [Rell](https://www.onetricks.gg/champions/builds/Rell) | UTILITY | Protoplasm Harness → Winter's Approach → Warmog's Armor | O/H/H | Celestial Opposition → Locket of the Iron Solari | Primer objeto distinto |
| [Renata](https://www.onetricks.gg/champions/builds/Renata) | UTILITY | Shurelya's Battlesong → Echoes of Helia → Malignance | O/H/H | Solstice Sleigh → Locket of the Iron Solari | Primer objeto distinto |
| [Renekton](https://www.onetricks.gg/champions/builds/Renekton) | TOP | Black Cleaver → Essence Reaver → Axiom Arc | O/H/H | Eclipse → Black Cleaver | Primer objeto distinto |
| [Rengar](https://www.onetricks.gg/champions/builds/Rengar) | JUNGLE | Umbral Glaive → Profane Hydra → Lord Dominik's Regards | O/O/O | Umbral Glaive → Profane Hydra | Coincide núcleo; resto pendiente |
| [Riven](https://www.onetricks.gg/champions/builds/Riven) | TOP | Axiom Arc → Umbral Glaive → Bastionbreaker | O/H/H | Axiom Arc → Endless Hunger | Segundo objeto distinto |
| [Rumble](https://www.onetricks.gg/champions/builds/Rumble) | TOP | Hextech Rocketbelt → Malignance → Cosmic Drive | O/H/H | Liandry's Torment → Bloodletter's Curse | Primer objeto distinto |
| [Ryze](https://www.onetricks.gg/champions/builds/Ryze) | MIDDLE | Rod of Ages → Archangel's Staff → Actualizer | O/O/O | Rod of Ages → Seraph's Embrace | Segundo objeto distinto |
| [Samira](https://www.onetricks.gg/champions/builds/Samira) | BOTTOM | The Collector → Infinity Edge → Essence Reaver | O/H/H | The Collector → Infinity Edge | Coincide núcleo; resto pendiente |
| [Sejuani](https://www.onetricks.gg/champions/builds/Sejuani) | JUNGLE | Heartsteel → Malignance → Cosmic Drive | O/H/H | Heartsteel → Unending Despair | Segundo objeto distinto |
| [Senna](https://www.onetricks.gg/champions/builds/Senna) | UTILITY | Black Cleaver → Statikk Shiv → Essence Reaver | O/O/H | Black Cleaver → Bloodsong | Núcleo parcial/no comparable |
| [Seraphine](https://www.onetricks.gg/champions/builds/Seraphine) | BOTTOM | Blackfire Torch → Malignance → Lich Bane | O/H/H | Blackfire Torch → Lich Bane | Segundo objeto distinto |
| [Sett](https://www.onetricks.gg/champions/builds/Sett) | TOP | Stridebreaker → Black Cleaver → Trinity Force | O/H/H | Stridebreaker → Black Cleaver | Coincide núcleo; resto pendiente |
| [Shaco](https://www.onetricks.gg/champions/builds/Shaco) | JUNGLE | Blackfire Torch → Liandry's Torment → Malignance | O/O/H | Blackfire Torch → Liandry's Torment | Coincide núcleo; resto pendiente |
| [Shen](https://www.onetricks.gg/champions/builds/Shen) | TOP | Titanic Hydra → Dusk and Dawn → Warmog's Armor | O/O/H | Titanic Hydra → Dusk and Dawn | Coincide núcleo; resto pendiente |
| [Shyvana](https://www.onetricks.gg/champions/builds/Shyvana) | JUNGLE | Trinity Force → Spear of Shojin → Death's Dance | O/O/O | Trinity Force → Spear of Shojin | Coincide núcleo; resto pendiente |
| [Singed](https://www.onetricks.gg/champions/builds/Singed) | TOP | Rylai's Crystal Scepter → Winter's Approach → Protoplasm Harness | O/H/H | Liandry's Torment → Rylai's Crystal Scepter | Primer objeto distinto |
| [Sion](https://www.onetricks.gg/champions/builds/Sion) | TOP | Heartsteel → Warmog's Armor → Winter's Approach | O/H/H | Unending Despair → Spirit Visage | Primer objeto distinto |
| [Sivir](https://www.onetricks.gg/champions/builds/Sivir) | BOTTOM | Essence Reaver → Infinity Edge → Hexoptics C44 | O/H/H | Yun Tal Wildarrows → Infinity Edge | Primer objeto distinto |
| [Skarner](https://www.onetricks.gg/champions/builds/Skarner) | JUNGLE | Heartsteel → Unending Despair → Warmog's Armor | O/O/H | Heartsteel → Unending Despair | Coincide núcleo; resto pendiente |
| [Smolder](https://www.onetricks.gg/champions/builds/Smolder) | BOTTOM | Essence Reaver → Infinity Edge → Axiom Arc | H/H/H | Essence Reaver → Black Cleaver | Segundo objeto distinto |
| [Sona](https://www.onetricks.gg/champions/builds/Sona) | UTILITY | Echoes of Helia → Malignance → Cryptbloom | O/H/H | Bloodsong → Echoes of Helia | Núcleo parcial/no comparable |
| [Soraka](https://www.onetricks.gg/champions/builds/Soraka) | UTILITY | Moonstone Renewer → Echoes of Helia → Redemption | O/H/H | Celestial Opposition → Moonstone Renewer | Núcleo parcial/no comparable |
| [Swain](https://www.onetricks.gg/champions/builds/Swain) | BOTTOM | Rylai's Crystal Scepter → Malignance → Cosmic Drive | O/H/H | Rylai's Crystal Scepter → Liandry's Torment | Segundo objeto distinto |
| [Sylas](https://www.onetricks.gg/champions/builds/Sylas) | MIDDLE | Hextech Rocketbelt → Riftmaker → Winter's Approach | O/O/H | Hextech Rocketbelt → Riftmaker | Coincide núcleo; resto pendiente |
| [Syndra](https://www.onetricks.gg/champions/builds/Syndra) | MIDDLE | Blackfire Torch → Cosmic Drive → Rabadon's Deathcap | O/O/O | Blackfire Torch → Cosmic Drive | Coincide núcleo; resto pendiente |
| [TahmKench](https://www.onetricks.gg/champions/builds/TahmKench) | UTILITY | Echoes of Helia → Moonstone Renewer → Warmog's Armor | H/H/H | Solstice Sleigh → Heartsteel | Primer objeto distinto |
| [Taliyah](https://www.onetricks.gg/champions/builds/Taliyah) | MIDDLE | Blackfire Torch → Lich Bane → Cryptbloom | O/H/H | Blackfire Torch → Cosmic Drive | Segundo objeto distinto |
| [Talon](https://www.onetricks.gg/champions/builds/Talon) | JUNGLE | Umbral Glaive → Bastionbreaker → Voltaic Cyclosword | O/O/O | Umbral Glaive → Bastionbreaker | Coincide núcleo; resto pendiente |
| [Taric](https://www.onetricks.gg/champions/builds/Taric) | UTILITY | Locket of the Iron Solari → Echoes of Helia → Moonstone Renewer | O/H/H | Dream Maker → Locket of the Iron Solari | Núcleo parcial/no comparable |
| [Teemo](https://www.onetricks.gg/champions/builds/Teemo) | TOP | Statikk Shiv → Essence Reaver → Infinity Edge | O/H/H | Statikk Shiv → Liandry's Torment | Segundo objeto distinto |
| [Thresh](https://www.onetricks.gg/champions/builds/Thresh) | UTILITY | Locket of the Iron Solari → Knight's Vow → Bandlepipes | O/O/O | Locket of the Iron Solari → Solstice Sleigh | Núcleo parcial/no comparable |
| [Tristana](https://www.onetricks.gg/champions/builds/Tristana) | BOTTOM | Yun Tal Wildarrows → Infinity Edge → Navori Flickerblade | O/O/O | Yun Tal Wildarrows → Infinity Edge | Coincide núcleo; resto pendiente |
| [Trundle](https://www.onetricks.gg/champions/builds/Trundle) | TOP | Ravenous Hydra → Warmog's Armor → Winter's Approach | O/H/H | Ravenous Hydra → Blade of The Ruined King | Segundo objeto distinto |
| [Tryndamere](https://www.onetricks.gg/champions/builds/Tryndamere) | TOP | Ravenous Hydra → Yun Tal Wildarrows → Infinity Edge | O/O/H | Ravenous Hydra → Yun Tal Wildarrows | Coincide núcleo; resto pendiente |
| [TwistedFate](https://www.onetricks.gg/champions/builds/TwistedFate) | MIDDLE | Hextech Rocketbelt → Lich Bane → Rapid Firecannon | O/O/O | Rod of Ages → Lich Bane | Primer objeto distinto |
| [Twitch](https://www.onetricks.gg/champions/builds/Twitch) | BOTTOM | Yun Tal Wildarrows → Essence Reaver → Infinity Edge | O/H/H | The Collector → Fiendhunter Bolts | Primer objeto distinto |
| [Udyr](https://www.onetricks.gg/champions/builds/Udyr) | JUNGLE | Spear of Shojin → Warmog's Armor → Heartsteel | O/H/H | Spear of Shojin → Death's Dance | Segundo objeto distinto |
| [Urgot](https://www.onetricks.gg/champions/builds/Urgot) | TOP | Black Cleaver → Sterak's Gage → Dead Man's Plate | O/O/O | Black Cleaver → Sterak's Gage | Coincide núcleo; resto pendiente |
| [Varus](https://www.onetricks.gg/champions/builds/Varus) | BOTTOM | Statikk Shiv → Guinsoo's Rageblade → Terminus | O/O/O | Statikk Shiv → Guinsoo's Rageblade | Coincide núcleo; resto pendiente |
| [Vayne](https://www.onetricks.gg/champions/builds/Vayne) | BOTTOM | Essence Reaver → Infinity Edge → Hexoptics C44 | H/H/H | Kraken Slayer → Guinsoo's Rageblade | Primer objeto distinto |
| [Veigar](https://www.onetricks.gg/champions/builds/Veigar) | MIDDLE | Luden's Echo → Malignance → Lich Bane | O/H/H | Rod of Ages → Rabadon's Deathcap | Primer objeto distinto |
| [Velkoz](https://www.onetricks.gg/champions/builds/Velkoz) | BOTTOM | Blackfire Torch → Malignance → Lich Bane | O/H/H | Blackfire Torch → Horizon Focus | Segundo objeto distinto |
| [Vex](https://www.onetricks.gg/champions/builds/Vex) | MIDDLE | Luden's Echo → Malignance → Lich Bane | O/H/H | Luden's Echo → Shadowflame | Segundo objeto distinto |
| [Vi](https://www.onetricks.gg/champions/builds/Vi) | JUNGLE | Trinity Force → Black Cleaver → Guardian Angel | O/O/O | Trinity Force → Black Cleaver | Coincide núcleo; resto pendiente |
| [Viego](https://www.onetricks.gg/champions/builds/Viego) | JUNGLE | Kraken Slayer → The Collector → Immortal Shieldbow | O/O/O | Kraken Slayer → The Collector | Coincide núcleo; resto pendiente |
| [Viktor](https://www.onetricks.gg/champions/builds/Viktor) | MIDDLE | Blackfire Torch → Lich Bane → Rabadon's Deathcap | O/O/O | Blackfire Torch → Liandry's Torment | Segundo objeto distinto |
| [Vladimir](https://www.onetricks.gg/champions/builds/Vladimir) | MIDDLE | Cosmic Drive → Hextech Rocketbelt → Dusk and Dawn | O/H/H | Stormsurge → Liandry's Torment | Primer objeto distinto |
| [Volibear](https://www.onetricks.gg/champions/builds/Volibear) | TOP | Dusk and Dawn → Warmog's Armor → Heartsteel | O/H/H | Dusk and Dawn → Navori Flickerblade | Segundo objeto distinto |
| [Warwick](https://www.onetricks.gg/champions/builds/Warwick) | TOP | Stridebreaker → Essence Reaver → Rod of Ages | O/H/H | Blade of The Ruined King → Death's Dance | Primer objeto distinto |
| [Xayah](https://www.onetricks.gg/champions/builds/Xayah) | BOTTOM | Essence Reaver → Infinity Edge → Hexoptics C44 | O/H/H | Yun Tal Wildarrows → Infinity Edge | Primer objeto distinto |
| [Xerath](https://www.onetricks.gg/champions/builds/Xerath) | MIDDLE | Luden's Echo → Shadowflame → Malignance | O/O/H | Luden's Echo → Shadowflame | Coincide núcleo; resto pendiente |
| [XinZhao](https://www.onetricks.gg/champions/builds/XinZhao) | JUNGLE | Titanic Hydra → Black Cleaver → Essence Reaver | O/O/H | Titanic Hydra → Black Cleaver | Coincide núcleo; resto pendiente |
| [Yasuo](https://www.onetricks.gg/champions/builds/Yasuo) | MIDDLE | Phantom Dancer → Infinity Edge → Yun Tal Wildarrows | O/H/H | Immortal Shieldbow → Infinity Edge | Primer objeto distinto |
| [Yone](https://www.onetricks.gg/champions/builds/Yone) | MIDDLE | Stormrazor → Phantom Dancer → Yun Tal Wildarrows | O/H/H | Immortal Shieldbow → Infinity Edge | Primer objeto distinto |
| [Yorick](https://www.onetricks.gg/champions/builds/Yorick) | TOP | Trinity Force → Winter's Approach → Protoplasm Harness | O/H/H | Trinity Force → Spear of Shojin | Segundo objeto distinto |
| [Yunara](https://www.onetricks.gg/champions/builds/Yunara) | BOTTOM | Kraken Slayer → Runaan's Hurricane → Infinity Edge | O/O/O | Kraken Slayer → Runaan's Hurricane | Coincide núcleo; resto pendiente |
| [Yuumi](https://www.onetricks.gg/champions/builds/Yuumi) | UTILITY | Echoes of Helia → Redemption → Moonstone Renewer | O/H/H | Dream Maker → Ardent Censer | Primer objeto distinto |
| [Zaahen](https://www.onetricks.gg/champions/builds/Zaahen) | TOP | Sin recomendación | — | Trinity Force → Stridebreaker | Motor sin recomendación |
| [Zac](https://www.onetricks.gg/champions/builds/Zac) | JUNGLE | Hextech Rocketbelt → Sunfire Aegis → Spirit Visage | O/O/O | Hextech Rocketbelt → Sunfire Aegis | Coincide núcleo; resto pendiente |
| [Zed](https://www.onetricks.gg/champions/builds/Zed) | MIDDLE | Voltaic Cyclosword → Bastionbreaker → Serylda's Grudge | O/O/O | Voltaic Cyclosword → Bastionbreaker | Coincide núcleo; resto pendiente |
| [Zeri](https://www.onetricks.gg/champions/builds/Zeri) | BOTTOM | Yun Tal Wildarrows → Runaan's Hurricane → Infinity Edge | O/O/O | Yun Tal Wildarrows → Runaan's Hurricane | Coincide núcleo; resto pendiente |
| [Ziggs](https://www.onetricks.gg/champions/builds/Ziggs) | BOTTOM | Luden's Echo → Shadowflame → Rabadon's Deathcap | O/O/O | Luden's Echo → Shadowflame | Coincide núcleo; resto pendiente |
| [Zilean](https://www.onetricks.gg/champions/builds/Zilean) | UTILITY | Shurelya's Battlesong → Echoes of Helia → Cryptbloom | O/H/H | Solstice Sleigh → Shurelya's Battlesong | Núcleo parcial/no comparable |
| [Zoe](https://www.onetricks.gg/champions/builds/Zoe) | MIDDLE | Luden's Echo → Lich Bane → Shadowflame | O/O/O | Luden's Echo → Lich Bane | Coincide núcleo; resto pendiente |
| [Zyra](https://www.onetricks.gg/champions/builds/Zyra) | JUNGLE | Liandry's Torment → Shadowflame → Malignance | O/O/H | Liandry's Torment → Shadowflame | Coincide núcleo; resto pendiente |

Validación del informe: 173 filas únicas, los 173 roles enlazados con la nueva ejecución del motor, comprobación de la discrepancia de Aurelion Sol y exclusión de la mejora gratuita de support en la comparación de primeras compras. El CSV de rutas contiene 1.519 filas de núcleos/ramas; no son 1.519 builds independientes ni todas las combinaciones posibles.
