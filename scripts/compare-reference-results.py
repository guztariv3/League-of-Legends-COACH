"""Compare frozen before/after engine replays and public role-scoped references.
Usage: python scripts/compare-reference-results.py BEFORE AFTER ROLE_CACHE OUTPUT_CSV
"""
import collections, csv, json, pathlib, sys
before={(x['champion'],x['position']):x for x in json.loads(pathlib.Path(sys.argv[1]).read_text())}
after=json.loads(pathlib.Path(sys.argv[2]).read_text())
root=pathlib.Path(__file__).resolve().parents[1]
catalog=json.loads((root/'packages/knowledge/fixtures/game-data/ddragon-item.json').read_text())['data']
meraki=json.loads((root/'packages/knowledge/fixtures/game-data/meraki-items.json').read_text())
def purchase_id(i):
    item=catalog.get(str(i),{}); detail=meraki.get(str(i),{});parent=detail.get('specialRecipe')
    return parent if item.get('gold',{}).get('purchasable') is False and detail.get('name')==item.get('name') and parent and str(parent) in catalog else i
roles={'TOP':'top','JUNGLE':'jungle','MIDDLE':'mid','BOTTOM':'bot','UTILITY':'supp'}
def picks(x):
    neutral=next(v for v in x['variants'] if v['name']=='neutral')
    return [p for p in [neutral['first'],*neutral['next']] if p]
def basis(p):
    reason=' '.join(p['why'])
    return 'external_reference' if 'External specialist reference:' in reason else 'limited_observations' if 'Limited sample;' in reason else 'mechanical_estimate' if 'No sufficiently sampled' in reason else 'sampled_observations'
rows=[];counts=collections.Counter();sources=collections.Counter()
for x in after:
    c,r=x['champion'],x['position'];old=picks(before[(c,r)]);new=picks(x)
    source=pathlib.Path(sys.argv[3])/f'{c}.{roles[r]}.json'
    d=json.loads(source.read_text()) if source.exists() else {'status':'unavailable'}
    routes=d.get('routes',[]);primary=routes[0] if routes and not d.get('forms') else None
    cores=primary.get('cores',[]) if primary else []
    core=cores[0] if cores else None
    ids=core['items'] if core else ([primary['first']] if primary and primary.get('first') else [])
    ids=[purchase_id(i) for i in ids if not ('GoldPer' in catalog.get(str(i),{}).get('tags',[]) and catalog.get(str(i),{}).get('gold',{}).get('base')==0)]
    if ids:
        for label,p in [('before',old),('after',new)]:
            if p:
                counts[f'{label}_first_comparable']+=1
                counts[f'{label}_first_different']+=p[0]['id']!=ids[0]
            if len(p)>=2 and len(ids)>=2:
                counts[f'{label}_core_comparable']+=1
                counts[f'{label}_core_different']+=[z['id'] for z in p[:2]]!=ids[:2]
    changed=[p['id'] for p in old]!=[p['id'] for p in new]
    counts['changed_sequences']+=changed
    for p in new:counts[basis(p)]+=1
    counts['withheld_contexts']+=not new
    sources[d['status']]+=1
    rows.append(dict(champion=c,role=r,patch='16.19',source_status=d['status'],forms='|'.join(d.get('forms',[])),source_url=d.get('url',''),source_retrieved=d.get('retrievedAt',''),source_primary_core=' > '.join(catalog.get(str(i),{}).get('name',str(i)) for i in ids),before=' > '.join(p['name'] for p in old),after=' > '.join(p['name'] for p in new),basis=' > '.join(basis(p) for p in new),changed=changed))
with open(sys.argv[4],'w',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(rows)
print(json.dumps({'contexts':len(rows),'sources':dict(sources),'results':dict(counts)},indent=2))
