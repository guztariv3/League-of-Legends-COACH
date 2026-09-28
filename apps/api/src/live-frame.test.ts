import { describe, expect, it } from 'vitest';
import { LiveFrameSchema } from './live-frame.js';
import { liveDetail } from '../../desktop/src/live-detail.js';

const frame = {version:1,streamId:'0d400d84-a7b4-46c2-a4e6-f019a772186f',sequence:1,capturedAt:Date.now(),phase:'live',champion:'Ahri',position:'MIDDLE',patch:null,time:600,gold:850,allies:[],enemies:[],headline:'Test',sections:[]};
describe('structured private Live payload',()=>{
 it('keeps compatibility with existing frames and accepts the desktop projection',()=>{
  expect(LiveFrameSchema.safeParse(frame).success).toBe(true);
  const detail=liveDetail(null,null,null,'draft','limited');
  expect(LiveFrameSchema.safeParse({...frame,detail}).success).toBe(true);
  expect(detail.players.allies).toEqual([]);
  expect(detail.skillSequence).toEqual([]);
 });
 it('rejects oversized rosters and recursively oversized recipes',()=>{
  const detail=liveDetail(null,null,null,'draft','limited');
  const leaf={id:1,name:'Piece',gold:100,remaining:100,owned:false,children:[]};
  const nested={...leaf,children:[{...leaf,children:[{...leaf,children:[{...leaf,children:[leaf]}]}]}]};
  expect(LiveFrameSchema.safeParse({...frame,detail:{...detail,recipes:[nested]}}).success).toBe(false);
  expect(LiveFrameSchema.safeParse({...frame,detail:{...detail,buyNow:Array(9).fill({id:1,name:'Piece',gold:100})}}).success).toBe(false);
 });
});
