"""Import sanitized public aggregates; no player identities or invented sample counts.
Usage: python scripts/import-onetricks-reference.py AUDIT_DIRECTORY
Audit the pages first with audit-onetricks.py. Never run on a live request path.
"""
import json, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[1]
catalog=json.loads((root/'packages/knowledge/fixtures/game-data/ddragon-item.json').read_text())['data']
meraki=json.loads((root/'packages/knowledge/fixtures/game-data/meraki-items.json').read_text())
roles={'top':'TOP','jungle':'JUNGLE','mid':'MIDDLE','bot':'BOTTOM','supp':'UTILITY','support':'UTILITY'}
def purchase_id(item_id):
    item=catalog.get(str(item_id),{}); detail=meraki.get(str(item_id),{})
    parent=detail.get('specialRecipe')
    if item.get('gold',{}).get('purchasable') is False and detail.get('name')==item.get('name') and parent and str(parent) in catalog:
        return parent
    return item_id
def clean(ids):
    return [purchase_id(i) for i in ids if not ('GoldPer' in catalog.get(str(i),{}).get('tags',[]) and catalog.get(str(i),{}).get('gold',{}).get('base')==0)]

output=[]
for path in sorted(pathlib.Path(sys.argv[1]).glob('*.json')):
    d=json.loads(path.read_text())
    if not isinstance(d,dict) or not d.get('champion') or d.get('status')!='ok' or d.get('forms'): continue
    role=roles.get(d.get('scope',{}).get('role'))
    if not role: continue
    stages={}
    def add(ids,weight):
        ids=clean(ids)
        if not ids or not isinstance(weight,(float,int)) or weight<=0: return
        key=(tuple(ids[:-1]),ids[-1]); stages[key]=max(weight,stages.get(key,0))
    for route in d['routes']:
        if route.get('form'): continue
        if route.get('first'): add([route['first']],route['reportedWeight'])
        for core in route['cores']:
            add(core['items'],core['reportedWeight'])
            # The immediate third slot is conditioned on this exact two-item core.
            # Fourth/fifth independent slot choices do NOT establish joint paths.
            for option in (core.get('laterSlotOptions') or [[]])[0]:
                add(core['items']+[option['item']],option['reportedWeight'])
            for route_path in core.get('classicPaths',[]):
                ids=clean(route_path['items'])
                for length in range(4,len(ids)+1): add(ids[:length],route_path['reportedWeight'])
    if stages:
        output.append(dict(champion=d['champion'],position=role,patch=d['patch'],source='OneTricks.gg',url=d['url'],retrievedAt=d['retrievedAt'],htmlSHA256=d['htmlSHA256'],stages=[dict(prefix=list(k[0]),item=k[1],weight=v) for k,v in stages.items()]))
(root/'apps/api/src/data/onetricks-builds.json').write_text('[\n'+',\n'.join('  '+json.dumps(row,separators=(',',':')) for row in output)+'\n]\n')
print(f'Imported {len(output)} verified champion/role references')
