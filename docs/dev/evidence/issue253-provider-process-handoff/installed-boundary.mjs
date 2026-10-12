import assert from 'node:assert/strict';
const root=process.env.AURACALL_INSTALLED_DIST;
if (!root) throw new Error('Set AURACALL_INSTALLED_DIST to the installed package dist directory.');
const {createInMemoryBrowserTabLeaseRegistry}=await import(root+'/packages/browser-service/src/service/tabLeaseRegistry.js');
const {createInMemoryProviderInteractionLedger}=await import(root+'/packages/browser-service/src/service/interactionLedger.js');
const {runLegacyChatgptWithConfiguredAffinity}=await import(root+'/src/browser/legacyChatgptAffinityRuntime.js');
const {createProviderSessionAuthorization,assertProviderSessionAuthorization}=await import(root+'/src/browser/providers/providerSessionAuthority.js');
const userConfig={auracallProfile:'fixture',browser:{tabConcurrencyMode:'tab-affinity'},services:{chatgpt:{identity:{email:'fixture@example.com'}}}};
const context={providerId:'chatgpt',auracallRuntimeProfile:'fixture',browserProfile:'fixture',managedBrowserProfile:'/fixture/managed',browserProcessId:null,browserTargetId:null};
const rows=[];
for (const scenario of [{pid:1234,email:'fixture@example.com',pass:true},{pid:null,email:'fixture@example.com',pass:false,reason:'provider_session_provenance_missing'},{pid:1234,email:'other@example.com',pass:false,reason:'provider_session_dimension_conflict'}]) {
 const registry=createInMemoryBrowserTabLeaseRegistry(); const ledger=createInMemoryProviderInteractionLedger();
 const authorization=createProviderSessionAuthorization(userConfig,context);
 let authorized=0,opens=0;
 const invoke=()=>runLegacyChatgptWithConfiguredAffinity({
 userConfig,browserOptions:{prompt:'fixture'},resolvedConfig:{url:'https://chatgpt.com/',modelStrategy:'ignore',tabConcurrencyMode:'tab-affinity',providerSessionAuthorization:authorization},
 runtime:{mode:'tab-affinity',enabled:true,storageRoot:null,registry,ledger,readStatus:async()=>{}},
 resolveServiceTarget:async()=>({host:'127.0.0.1',port:45100,managedBrowserProfile:'/fixture/managed',browserProcessId:scenario.pid}),
 openTarget:async({url})=>{opens++;return{targetId:'fixture-target',url};},closeTarget:async()=>{throw new Error('Unexpected close');},
 runLeased:async target=>{
 assert(target.providerSessionAuthorization,'Native handoff discarded authorization');
 assert.equal(target.providerSessionAuthorization.context.browserProcessId,scenario.pid);
 assert.equal(target.providerSessionAuthorization.context.browserTargetId,'fixture-target');
 assert.equal(target.providerSessionAuthorization.context.managedBrowserProfile,'/fixture/managed');
 assertProviderSessionAuthorization(target.providerSessionAuthorization,{email:scenario.email,source:'auth-session'},{browserProcessId:target.providerSessionAuthorization.context.browserProcessId,browserTargetId:target.targetId});
 authorized++;return{answerText:'fixture',answerMarkdown:'fixture',tookMs:0,answerTokens:1,answerChars:7,chromeHost:target.host,chromePort:target.port,chromeTargetId:target.targetId,tabUrl:'https://chatgpt.com/c/fixture',conversationId:'fixture'};
 }});
 if(scenario.pass){await invoke();assert.equal(authorized,1);}else{await assert.rejects(invoke,new RegExp(scenario.reason));assert.equal(authorized,0);}
 assert.equal(opens,1);rows.push({browserProcessPresent:scenario.pid!==null,accountMatches:scenario.email==='fixture@example.com',authorized:authorized===1,providerEffects:0});
}
console.log(JSON.stringify({installedAffinityAuthorityHandoffPassed:true,cases:rows,providerEffects:0}));
