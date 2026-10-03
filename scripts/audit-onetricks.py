"""Read public champion build pages and compare their same-patch paths with our audit.
No player identities are retained, no production writes, no runtime recommendations changed.
Usage: python scripts/audit-onetricks.py OUTPUT_DIRECTORY [PATCH] [ENGINE_REPLAY_JSON]
The default-role page is one scope, not every role, matchup, region or PRO filter.
"""
import concurrent.futures, datetime, hashlib, json, pathlib, re, sys, time, urllib.request

OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PATCH = sys.argv[2] if len(sys.argv)>2 else '16.19'
CACHE_ONLY='--cache-only' in sys.argv
BASE = 'https://www.onetricks.gg/champions/builds/'
ROLES = {'top':'TOP','jungle':'JUNGLE','mid':'MIDDLE','bot':'BOTTOM','support':'UTILITY','sup':'UTILITY','supp':'UTILITY','adc':'BOTTOM','jg':'JUNGLE'}
ROOT = pathlib.Path(__file__).resolve().parents[1]

from onetricks_data import read_page, summarize as extract
def summarize(champion,p,digest):
    return extract(champion,p,digest,PATCH)

def fetch(champ):
    file=OUT/(champ+'.json')
    cached={}
    if file.exists():
        cached=json.loads(file.read_text())
        if cached.get('status')=='ok' or CACHE_ONLY:return cached
    try:
        p,d=read_page(champ); row=summarize(champ,p,d)
    except Exception as e:
        row={**cached,'champion':champ,'url':BASE+champ,'status':'unavailable','error':type(e).__name__+': '+str(e)}
    file.write_text(json.dumps(row,ensure_ascii=False,indent=2));time.sleep(.35);return row

if CACHE_ONLY:
    roster=sorted(f.stem for f in OUT.glob('*.json') if f.stem not in ['comparison','summary'] and json.loads(f.read_text()).get('champion')==f.stem)
else:
    p,d=read_page('AurelionSol')
    (OUT/'AurelionSol.json').write_text(json.dumps(summarize('AurelionSol',p,d),ensure_ascii=False,indent=2))
    roster=sorted(p['championData'])
rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for row in pool.map(fetch,roster):
        rows.append(row)
        print(len(rows),row['champion'],row['status'],flush=True)

# Compare like-for-like role with the documented frozen engine audit, not an invented live match.
ours={};champ=None
for line in (ROOT/'docs/29-current-roster-review.md').read_text().splitlines():
    m=re.match(r'## .* \(([^)]+)\)',line)
    if m:champ=m[1]
    if line.startswith('| ') and champ:
        cells=[x.strip() for x in line.strip('|').split('|')]
        if cells[0] in ROLES.values():ours[(champ,cells[0])]=cells
replay={}
if len(sys.argv)>3:
    replay={(x['champion'],x['position']):x for x in json.loads(pathlib.Path(sys.argv[3]).read_text())}
catalog=json.loads((ROOT/'packages/knowledge/fixtures/game-data/ddragon-item.json').read_text())['data']
comparison=[]
for row in rows:
    role=ROLES.get((row.get('scope') or {}).get('role',''))
    old=ours.get((row['champion'],role))
    routes=row.get('routes',[]); top=routes[0] if routes and not row.get('forms') else None
    first=top['firstName'] if top else None
    cores=top['cores'] if top else []
    core=cores[0] if cores else None
    purchased=[]
    if core:
        for iid,name in zip(core['items'],core['names']):
            item=catalog.get(str(iid),{})
            # Support quest upgrades are granted progression, not completed-item purchases.
            if 'GoldPer' in item.get('tags',[]) and item.get('gold',{}).get('base')==0: continue
            purchased.append(name)
    if first is None and purchased: first=purchased[0]
    engine=old[3].split(' → ') if old else []
    fresh=replay.get((row['champion'],role))
    if fresh:
        neutral=next(v for v in fresh['variants'] if v['name']=='neutral')
        picks=([neutral['first']] if neutral.get('first') else [])+neutral.get('next',[])
        engine=[x['name'] for x in picks]
        evidence=['H' if any('No sufficiently sampled' in w for w in x['why']) else 'O' for x in picks]
    else: evidence=old[4].split(' / ') if old else []
    comparison.append({'champion':row['champion'],'role':role,'patch':PATCH,'status':row['status'],'forms':row.get('forms',[]),
        'engineAuditItems':engine,'engineEvidence':evidence,'engineScenarioOpponent':None if fresh else old[2] if old else None,'freshNeutralReplay':bool(fresh),
        'referenceFirst':first,'referenceCore':core['names'] if core else [],'comparablePurchasedCore':purchased,
        'sameFirst':engine[0]==first if engine and first else None,
        'sameFirstTwo':engine[:2]==purchased[:2] if len(engine)>=2 and len(purchased)>=2 else None,
        'referenceFirstRoutes':len(routes),'referenceCoreRoutes':sum(len(x['cores']) for x in routes),
        'url':row['url']})
(OUT/'comparison.json').write_text(json.dumps(comparison,ensure_ascii=False,indent=2))
summary={'championsRequested':len(roster),'available':sum(x['status']=='ok' for x in rows),
    'unavailable':[x['champion'] for x in rows if x['status']!='ok'],
    'firstDifferences':sum(x['sameFirst'] is False for x in comparison),
    'coreDifferences':sum(x['sameFirstTwo'] is False for x in comparison),
    'scope':'Public default-role champion pages, exact patch only; not all filter combinations. Comparison detects disagreements, not proof of optimality.'}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)

import csv
with (OUT/'comparison.csv').open('w',newline='') as f:
    fields=['champion','role','patch','status','forms','engineAuditItems','engineEvidence','referenceFirst','referenceCore','comparablePurchasedCore','sameFirst','sameFirstTwo','freshNeutralReplay','url']
    w=csv.DictWriter(f,fieldnames=fields,lineterminator="\n");w.writeheader()
    for r in comparison:
        w.writerow({k:' → '.join(r[k]) if isinstance(r[k],list) else r[k] for k in fields})
with (OUT/'routes.csv').open('w',newline='') as f:
    fields=['champion','role','patch','form','firstScope','core','laterSlot3','laterSlot4','laterSlot5','classicPaths','componentPaths','url']
    w=csv.DictWriter(f,fieldnames=fields,lineterminator="\n");w.writeheader()
    for r in rows:
        for route in r.get('routes',[]):
            for c in route['cores']:
                opts=c['laterSlotOptions']
                w.writerow({'champion':r['champion'],'role':(r.get('scope') or {}).get('role'),'patch':PATCH,
                    'form':route.get('form',''),'firstScope':route['firstName'] or 'all','core':' → '.join(c['names']),
                    **{'laterSlot'+str(i+3):' | '.join(x['name'] for x in opts[i]) if i<len(opts) else '' for i in range(3)},
                    'classicPaths':' ; '.join(' → '.join(x['names']) for x in c['classicPaths']),
                    'componentPaths':' ; '.join(' → '.join(x['names']) for x in route['componentPaths']), 'url':r['url']})
