"""Public aggregate extraction shared by roster/role audits; never stores player histories."""
import datetime, hashlib, json, re, urllib.request
BASE="https://www.onetricks.gg/champions/builds/"
def read_page(champion,role=None):
    url = BASE + champion + ("?role="+role if role else "")
    req = urllib.request.Request(url, headers={'User-Agent':'KOI-reference-audit/1.0'})
    with urllib.request.urlopen(req,timeout=35) as response:
        html = response.read().decode()
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',html)
    if not match: raise ValueError('public page has no readable build data')
    return json.loads(match[1])['props']['pageProps'], hashlib.sha256(html.encode()).hexdigest()

def summarize(champion,p,digest,patch, url=None):
    PATCH=patch
    # Copy aggregates only. Never retain matchHistory or player identifiers.
    tree=p.get('firstItemStats',{})
    forms={k:v for k,v in tree.items() if isinstance(v,dict) and PATCH in v} if PATCH not in tree else {}
    if forms:
        parts=[(k,summarize(champion,{**p,'firstItemStats':v},digest,patch,url)) for k,v in forms.items()]
        result=parts[0][1].copy()
        result['forms']=list(forms)
        result['routes']=[{**r,'form':k} for k,part in parts for r in part['routes']]
        result['status']='ok' if result['routes'] else 'no_same_patch_routes'
        return result
    scopes = tree.get(PATCH,{})
    ids=p.get('itemData',{})
    names=lambda xs:[ids.get(str(x),{}).get('name',str(x)) for x in xs]
    routes=[]
    for first,v in scopes.items():
        if not isinstance(v,dict): continue
        if not first.isdigit() and not (first=='all' and not any(k.isdigit() for k in scopes)): continue
        cores=[]
        for i,c in enumerate(v.get('popCore',[])):
            path=v.get('popPath',[])
            later=path[i] if i<len(path) else []
            classics=v.get('popClassicPath',[])
            cores.append({'items':c[0],'names':names(c[0]),'reportedWeight':c[1],
                'laterSlotOptions':[[{'item':z[0],'name':names([z[0]])[0],'reportedWeight':z[1]} for z in slot] for slot in later],
                'classicPaths': [{'items':z[0],'names':names(z[0]),'reportedWeight':z[1]} for z in (classics[i] if i<len(classics) else [])]})
        routes.append({'first':int(first) if first.isdigit() else None,'firstName':names([first])[0] if first.isdigit() else None,'reportedWeight':v.get('playrate'),
            'cores':cores,'componentPaths':[{'items':z[0],'names':names(z[0]),'reportedWeight':z[1]} for z in v.get('componentBuildPaths',[])],
            'boots':v.get('boots',[]),'bootsTimingSequences':v.get('bootsTimingSequences',{}),
            'keystones':v.get('popKeystone',[]),'runePages':v.get('popRunes',{}),'spells':v.get('sSpells',[])})
    routes.sort(key=lambda r:r['reportedWeight'] or 0,reverse=True)
    return {'champion':champion,'url':url or BASE+champion,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'htmlSHA256':digest,'patch':PATCH,'availablePatches':p.get('patchList'),
        'scope':p.get('filters'),'defaultRole':p.get('popRole'),'reportedPatchEntries':p.get('patchStats',{}).get(PATCH),
        'routes':routes,'status':('ok' if any(r.get('first') or r.get('cores') for r in routes) else 'setup_only' if routes else 'no_same_patch_routes'),
        'warning':'Reported weights are not win rates or verified independent sample counts. Separate slot options are not complete observed sequences.'}

