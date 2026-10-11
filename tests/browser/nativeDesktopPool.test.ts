// biome-ignore-all lint/style/useNamingConvention: native protocol fixture keys.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {expect,test,vi} from 'vitest';
import {setAuracallHomeDirOverrideForTest} from '../../src/auracallHome.js';
import {DEFAULT_BROWSER_CONFIG} from '../../src/browser/config.js';
import {launchNativeDesktopBrowser} from '../../src/browser/service/nativeDesktopRuntime.js';
import {wakeDesktopRuntimeProfile} from '../../src/browser/service/desktopRuntimeProfiles.js';
import {ComposedConfigSchema} from '../../src/config/schema.js';
import {listDesktopViews} from '../../src/browser/service/desktopClient.js';
import {NativeDesktopStore} from '../../src/browser/service/nativeDesktopStore.js';

vi.mock('../../src/browser/cdp.js',()=>({default:async()=>({Target:{getTargets:async()=>({targetInfos:[]})},close:async()=>{}})}));

test.each([2,4])('automatic rail Wake grows and wraps at configured capacity %i',async(maximum)=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'auracall-pool-'));setAuracallHomeDirOverrideForTest(home);
 const children:ChildProcess[]=[];const assignments:Array<{assignmentId:string;desktopId:string;generation:number;viewingGeneration:number}>=[];
 const occupied=new Map<string,number>();let acquisitions=0;
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const {request}=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('Content-Type','application/json');let data:unknown;
 if(request.operation==='acquire'){acquisitions++;const i=assignments.length+1;const a={assignmentId:`a${i}`,desktopId:`d${i}`,generation:1,viewingGeneration:1};assignments.push(a);data={...a,state:'active'};}
 else if(request.operation==='inventory')data={schemaVersion:1,registration:{consumerKey:'auracall',registrationId:'r'},policy:{pools:{main:{minimum_reserved:0,maximum_reserved:maximum,idle_retention_seconds:30,allow_scale_in:true}}},pools:[{poolId:'p',registrationId:'r',name:'main',desktopMembers:assignments.map(a=>a.desktopId)}],assignments:assignments.map(a=>({...a,registrationId:'r',poolId:'p',state:'active'})),desktops:assignments.map(a=>({desktopId:a.desktopId,lifecycle:{generation:1,state:'ready',readinessScope:'live_resource',allocated:true},viewing:{desktopId:`v${a.desktopId}`,lifecycleGeneration:1,generation:1,publicRoute:'/1'}}))};
 else{const a=assignments.find(a=>a.assignmentId===request.assignment_id);if(!a)throw Error('Unknown assignment');if(request.operation==='windows')data={schemaVersion:1,operation:'desktop.windows',desktopId:a.desktopId,generation:1,viewingGeneration:1,windows:occupied.has(a.assignmentId)?[{id:1,pid:occupied.get(a.assignmentId)}]:[]};else data={schemaVersion:1,readinessScope:'live_resource',target:{assignmentId:a.assignmentId,registrationId:'r',desktopId:a.desktopId,lifecycleGeneration:1,viewingDesktopId:`v${a.desktopId}`,viewingGeneration:1},environment:{DISPLAY:`:${70+assignments.indexOf(a)}`,XAUTHORITY:'/private/Xauthority',REMOTE_VIEW_SLOT_GENERATION:'1'}};}
 res.end(JSON.stringify(data));}).listen(0,'127.0.0.1');await once(server,'listening');
 try{const address=server.address();if(!address||typeof address==='string')throw Error('No port');
 const config={...DEFAULT_BROWSER_CONFIG,chromePath:process.execPath,remoteViewDesktop:{automatic:true,desktopName:'auto',poolName:'main',application:'auracall',origin:`http://127.0.0.1:${address.port}`,publicOrigin:'https://viewer.example.test',appOrigin:'https://aura.example.test'}};
 const launch=async(c:typeof config,dir:string)=>{const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)','--',`--user-data-dir=${dir}`],{env:{...process.env,DISPLAY:c.display??''},stdio:'ignore'});children.push(child);await once(child,'spawn');const a=assignments.find((_,i)=>c.display===`:${70+i}`);if(!a||!child.pid)throw Error('No child assignment');occupied.set(a.assignmentId,child.pid);return{pid:child.pid,port:45000+children.length,kill:async()=>{child.kill();}};};
 await launchNativeDesktopBrowser({config,userDataDir:path.join(home,'first'),logger:()=>{},launch:launch as never});
 await launchNativeDesktopBrowser({config,userDataDir:path.join(home,'second'),logger:()=>{},launch:launch as never});
 const bindings=await new NativeDesktopStore().browsers();expect(new Set(bindings.map(b=>b.assignment.desktopId)).size).toBe(2);expect(acquisitions).toBe(2);
 const catalog=await listDesktopViews({remoteView:{pool:{name:'main'},application:{name:'auracall',origin:config.remoteViewDesktop.origin,publicOrigin:config.remoteViewDesktop.publicOrigin,appOrigin:config.remoteViewDesktop.appOrigin}}});
 expect(catalog.desktops.filter(d=>d.state==='ready')).toHaveLength(2);
 const user=ComposedConfigSchema.parse({browserProfiles:{account:{chromePath:process.execPath}},runtimeProfiles:{writer:{engine:'browser',defaultService:'chatgpt',browserProfile:'account'}},remoteView:{pool:{name:'main'},application:{name:'auracall',origin:config.remoteViewDesktop.origin,publicOrigin:config.remoteViewDesktop.publicOrigin,appOrigin:config.remoteViewDesktop.appOrigin}}});
 const wake=await wakeDesktopRuntimeProfile(user,'writer',undefined,{launch:(async(c,dir,logger)=>launchNativeDesktopBrowser({config:c,userDataDir:dir,logger,launch:launch as never})) as never});
 expect(wake).toMatchObject({runtimeProfileId:'writer',desktopName:maximum===2?'desktop-d1':'desktop-d3'});
 expect((await listDesktopViews({remoteView:user.remoteView})).desktops.filter(d=>d.state==='ready')).toHaveLength(maximum===2?2:3);
 expect(acquisitions).toBe(maximum===2?2:3);

 }finally{for(const c of children){const done=once(c,'exit');c.kill();await done;}await new Promise<void>(r=>server.close(()=>r()));setAuracallHomeDirOverrideForTest(null);await fs.rm(home,{recursive:true,force:true});}
});
