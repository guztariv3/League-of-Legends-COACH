"""Classify every original first/core discrepancy using stage traces, not guessed intent.
Usage: python scripts/review-reference-differences.py BEFORE AFTER CACHE EXPORT OUTPUT
Rows are diagnostic findings, not judgments that either build is optimal.
"""
import collections, csv, gzip, json, pathlib, sys
before, after = [json.loads(pathlib.Path(p).read_text()) for p in sys.argv[1:3]]
after = {(r['champion'], r['position']): r for r in after}
cache = pathlib.Path(sys.argv[3])
with gzip.open(sys.argv[4], 'rt') as f:
    observations = json.load(f)['rows']
root = pathlib.Path(__file__).resolve().parents[1]
catalog = json.loads((root/'packages/knowledge/fixtures/game-data/ddragon-item.json').read_text())['data']
meraki = json.loads((root/'packages/knowledge/fixtures/game-data/meraki-items.json').read_text())
roles = {'TOP':'top','JUNGLE':'jungle','MIDDLE':'mid','BOTTOM':'bot','UTILITY':'supp'}
def neutral(row):
    return next(v for v in row['variants'] if v['name']=='neutral')
def picks(row):
    n=neutral(row)
    return [p['id'] for p in [n['first'],*n['next']] if p]
def name(i):
    return catalog.get(str(i),{}).get('name',str(i))
def canonical(i):
    d=catalog.get(str(i),{});m=meraki.get(str(i),{});p=m.get('specialRecipe')
    return p if d.get('gold',{}).get('purchasable') is False and m.get('name')==d.get('name') and p and str(p) in catalog else i
def sample(champion,role,item):
    rows=[r for r in observations if r['champion'].lower()==champion.lower() and r['position']==role and r['kind']=='first_item' and r['key']==str(item)]
    n=sum(r['games'] for r in rows);w=sum(r['wins'] for r in rows)
    return f'{n} games; {100*w/n:.1f}% observed wins' if n else 'no observations'
def second_sample(champion,role,prefix,item):
    rs=[r for r in observations if r['champion'].lower()==champion.lower() and r['position']==role]
    stage=[r for r in rs if r['kind']=='purchase_path' and len(r['key'].split('>'))==2 and r['key'].split('>')[0]==str(prefix)]
    if sum(r['games'] for r in stage)<30:
        stage=[r for r in rs if r['kind']=='core' and len(r['key'].split('>'))>=2 and r['key'].split('>')[0]==str(prefix)]
    selected=[r for r in stage if r['key'].split('>')[1]==str(item)]
    n=sum(r['games'] for r in selected);w=sum(r['wins'] for r in selected);total=sum(r['games'] for r in stage)
    return f'{n} purchases; {100*w/n:.1f}% observed wins; prefix cohort {total}' if n else f'no observations; prefix cohort {total}'
rows=[]
for old in before:
    c,r=old['champion'],old['position'];new=after[(c,r)]
    d=json.loads((cache/f'{c}.{roles[r]}.json').read_text())
    if d.get('forms') or not d.get('routes'):continue
    route=d['routes'][0];cores=route.get('cores',[])
    ids=cores[0]['items'] if cores else ([route['first']] if route.get('first') else [])
    ids=[canonical(i) for i in ids if not ('GoldPer' in catalog.get(str(i),{}).get('tags',[]) and catalog.get(str(i),{}).get('gold',{}).get('base')==0)]
    previous,current=picks(old),picks(new)
    if not ids or not previous:continue
    first_flag=ids[0]!=previous[0]
    core_flag=len(ids)>=2 and len(previous)>=2 and ids[:2]!=previous[:2]
    new_first_flag=bool(current) and ids[0]!=current[0]
    new_core_flag=len(ids)>=2 and len(current)>=2 and ids[:2]!=current[:2]
    if not(first_flag or core_flag or new_first_flag or new_core_flag):continue
    def cause(stage):
        if len(current)<=stage:return 'withheld'
        if current[:stage]!=ids[:stage]:return 'different_prefix; second-purchase comparison is not like-for-like'
        if current[stage]==ids[stage]:return 'matches_reference'
        decisions=neutral(new).get('decisions',[])
        trace=next((x for x in decisions if x['prefix']==current[:stage]),None)
        if trace is None:return 'trace_missing'
        ref=next((x for x in trace['candidates'] if x['id']==ids[stage]),None)
        chosen=next((x for x in trace['candidates'] if x['id']==current[stage]),None)
        if ref:
            pool='observed' if chosen['empirical'] else 'external' if chosen['reference'] else 'mechanics'
            calibrated=chosen.get('contextual') is not None and ref.get('contextual') is not None
            if calibrated and abs(chosen['contextual'])<1e-9 and abs(ref['contextual'])<1e-9:
                reason='local_purchase_evidence_differs_from_reference' if pool=='observed' else 'external_weight_or_tie_order'
            else:
                reason=f'ranked_below_in_{pool}_pool'
            return f'{reason}; source_score={ref["score"]:.4f}; selected_score={chosen["score"]:.4f}; source_context={ref.get("contextual")}; selected_context={chosen.get("contextual")}; not_proven_superiority'
        excluded=next((x for x in trace['excluded'] if x['id']==ids[stage]),None)
        return ('excluded:'+excluded['reason']) if excluded else 'not_a_buildable_finished_candidate'
    resolution='matches_first_and_core' if current[:min(2,len(ids))]==ids[:min(2,len(ids))] else 'remaining_difference'
    rows.append(dict(champion=c,role=r,patch=d['patch'],original_first_flag=first_flag,original_core_flag=core_flag,new_first_flag=new_first_flag,new_core_flag=new_core_flag,newly_flagged=not(first_flag or core_flag),source_core=' > '.join(map(name,ids[:2])),before=' > '.join(map(name,previous)),after=' > '.join(map(name,current)),resolution=resolution,first_diagnosis=cause(0),second_diagnosis=cause(1) if len(ids)>=2 else 'no_second_reference',source_first_local_sample=sample(c,r,ids[0]),chosen_first_local_sample=sample(c,r,current[0]) if current else '',source_second_local_sample=second_sample(c,r,ids[0],ids[1]) if len(ids)>1 else '',chosen_second_local_sample=second_sample(c,r,current[0],current[1]) if len(current)>1 else '',source_url=d['url'],source_retrieved=d['retrievedAt']))
with open(sys.argv[5],'w',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(rows)
print(json.dumps({'flagged_contexts':len(rows),'newly_flagged':sum(r['newly_flagged'] for r in rows),'resolution':dict(collections.Counter(r['resolution'] for r in rows)), 'first_diagnosis':dict(collections.Counter(r['first_diagnosis'].split(';')[0] for r in rows)), 'second_diagnosis':dict(collections.Counter(r['second_diagnosis'].split(';')[0] for r in rows))},indent=2))
