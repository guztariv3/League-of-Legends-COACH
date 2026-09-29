/** node --import tsx ../../scripts/audit-matchups.ts --out /absolute/report [--input full-export.json] */
import {mkdirSync,readFileSync,openSync,writeSync,closeSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {gameData} from '../packages/knowledge/src/test-data.js';
import {parseChampionKits} from '../packages/knowledge/src/index.js';
import {matchupAudit,validateAuditExport} from '../apps/api/src/stats/matchup-audit.js';
const args=process.argv.slice(2),arg=(name:string)=>{const n=args.indexOf(name);return n<0?undefined:args[n+1];};
const out=arg('--out');if(!out)throw new Error('--out directory is required');
const data=gameData(),patch=data.meta.ddragonVersion.split('.').slice(0,2).join('.');
const roster=parseChampionKits(data.ddragonChampions,data.merakiChampions);
const source=arg('--input'),snapshot=source?validateAuditExport(JSON.parse(readFileSync(resolve(source),'utf8')),patch):undefined;
const audit=matchupAudit(roster,patch,snapshot),dir=resolve(out);mkdirSync(dir,{recursive:true});
const csv=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';
function writeRows(name:string,rows:Iterable<Record<string,unknown>>){
 const fd=openSync(join(dir,name),'w');let keys:string[]|undefined,count=0,buffer='';
 try {for(const row of rows){keys??=Object.keys(row);if(!count)buffer+=keys.map(csv).join(',')+'\n';buffer+=keys.map(k=>csv(row[k])).join(',')+'\n';count++;if(count%1000===0){writeSync(fd,buffer);buffer='';}}if(buffer)writeSync(fd,buffer);}finally{closeSync(fd);}return count;
}
const general=writeRows('campeones-roles.csv',audit.general()),all=writeRows('todos-los-matchups.csv',audit.matchups()),prefixes=writeRows('compras-por-prefijo.csv',audit.prefixes());
const counts:Record<string,number>={};
function* supported(){for(const r of audit.matchups()){
 const statuses=['first_item','rune_page','spells'].map(k=>r[`${k}_sample`]);
 for(const s of statuses)counts[String(s)]=(counts[String(s)]??0)+1;
 if(!r.mirror&&statuses.some(s=>s==='sufficient_sample'))yield r;
}}
const sufficient=writeRows('matchups-con-muestra-suficiente.csv',supported());
const metadata={...audit.metadata,rosterVersion:data.meta.ddragonVersion,generatedAt:new Date().toISOString(),files:{general,all,prefixes,sufficient},categoryCounts:counts,
 incompleteMechanics:roster.filter(c=>c.detail!=='full').map(c=>c.id)};
writeFileSync(join(dir,'resumen.json'),JSON.stringify(metadata,null,2)+'\n');
writeFileSync(join(dir,'LEEME.txt'),`AUDITORIA DE COBERTURA — ${patch}\n\n${general} campeones/roles; ${all} enfrentamientos ordenados, incluidos espejos.\nExportacion completa disponible: ${Boolean(snapshot)}.\n\nSin exportacion, not_verified significa DESCONOCIDO, no cero ni ausencia de partidas.\nLos CSV vacios de muestras suficientes/prefijos no prueban que produccion carezca de datos.\n\nsufficient_sample: cumple 100 observaciones y al menos una opcion de 30.\ninsufficient_sample: hay observaciones pero no se cumple ese umbral.\nno_observations: ninguna fila de esa categoria en una exportacion completa.\nnot_verified: no se ha recibido una exportacion completa verificable.\n\nDisponible general_role NO equivale a evidencia del enfrentamiento.\nRoles no habituales siguen incluidos; roleListed no certifica viabilidad.\nLos espejos estan enumerados pero excluidos de muestras suficientes: el recolector es ranked solo.\nLas runas/hechizos requieren validar legalidad y los objetos requieren validar elegibilidad.\nLas compras posteriores se auditan por prefijo; no existe una suficiencia universal del core.\nNo se ejecutaron los 149.645 enfrentamientos en el motor. No se certifica optimalidad.\nLocke y Zaahen tienen mecanicas incompletas en este catalogo.\n\nActualizar: generar exportacion con stats:coverage ${patch} --raw y ejecutar scripts/audit-matchups.ts --input exportacion.json --out carpeta.\nNo se usan credenciales ni identidades de jugadores en estos archivos.\n`);
console.log(JSON.stringify(metadata));
