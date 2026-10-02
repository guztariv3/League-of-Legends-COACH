"""Read all five role scopes with bounded concurrency; absent evidence stays absent.
Usage: python scripts/audit-onetricks-roles.py DEFAULT_ROLE_CACHE OUTPUT_DIRECTORY PATCH
"""
import concurrent.futures, json, pathlib, sys, time
from onetricks_data import read_page, summarize, BASE
root=pathlib.Path(__file__).resolve().parents[1]
roster=sorted(json.loads((root/'packages/knowledge/fixtures/game-data/ddragon-champion-full.json').read_text())['data'])
cache,out,patch=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]),sys.argv[3]
out.mkdir(parents=True,exist_ok=True)
roles=['top','jungle','mid','bot','supp']
def fetch(task):
    champion,role=task; path=out/f'{champion}.{role}.json'; url=BASE+champion+'?role='+role
    if path.exists():
        cached=json.loads(path.read_text())
        if cached.get('status')!='unavailable' or '--retry-unavailable' not in sys.argv: return cached
    previous=cache/(champion+'.json')
    if previous.exists():
        data=json.loads(previous.read_text())
        if data.get('status')=='ok' and data.get('patch')==patch and data.get('scope',{}).get('role')==role:
            path.write_text(json.dumps(data,indent=2));return data
    try:
        p,digest=read_page(champion,role)
        data=summarize(champion,p,digest,patch,url)
        if data.get('scope',{}).get('role')!=role:
            data.update(status='scope_mismatch',routes=[])
    except Exception as error:
        data=dict(champion=champion,patch=patch,url=url,scope={'role':role},status='unavailable',error=type(error).__name__,errorDetail=str(error))
    path.write_text(json.dumps(data,indent=2));time.sleep(1);return data
counts={}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for n,result in enumerate(pool.map(fetch,[(c,r) for c in roster for r in roles]),1):
        status=result['status'];counts[status]=counts.get(status,0)+1
        print(n,result['champion'],result.get('scope',{}).get('role'),status,flush=True)
print(json.dumps(counts),flush=True)
