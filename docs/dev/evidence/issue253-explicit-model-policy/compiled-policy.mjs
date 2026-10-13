import assert from 'node:assert/strict';
const base=process.env.AURACALL_INSTALLED_DIST;if(!base)throw Error('Installed dist required');
const {runChatgptDeveloperAppOperationForCli}=await import(base+'/src/cli/chatgptDeveloperAppsCommand.js');
const {submitChatgptDeveloperApp}=await import(base+'/src/browser/chatgptDeveloperAppSubmission.js');
const cfg={auracallProfile:'fixture',model:'gpt-5.6-sol',profiles:{fixture:{browserProfile:'fixture',services:{chatgpt:{identity:{email:'fixture@example.invalid'},thinkingTime:'light'}}}},browser:{remoteChrome:{host:'127.0.0.1',port:12345},thinkingTime:'light'},services:{chatgpt:{identity:{email:'fixture@example.invalid'}}}};
const app={name:'Fixture',pluginId:'plugin_fixture',appIds:['fixture'],enabled:true,status:'ENABLED'};
for(const strategy of [undefined,'select']){
 let calls=0;const policies=[];
 const outcome=await runChatgptDeveloperAppOperationForCli(cfg,{action:'test',app:'fixture',submit:true,prompt:'fixture',confirmed:true,expectedAccount:'fixture@example.invalid',modelStrategy:strategy},{
 createBrowser:async()=>({userConfig:cfg,runUtilityBrowserOperation:async({run})=>run({})}),
 createAdapter:(_browser,_factory,options)=>({
 readState:async()=>({account:{email:'fixture@example.invalid'},inventoryComplete:true,developerMode:true,apps:[app],observedAt:new Date().toISOString()}),
 submitTest:async(a,p)=>submitChatgptDeveloperApp(cfg,a,p,{...options,runBrowser:async input=>{calls++;policies.push(input.config);return {answerText:'fixture',conversationId:'fixture',tabUrl:'https://chatgpt.com/c/fixture'};}}),
 close:async()=>{},
 }),});
 assert.equal(outcome.status,'completed');assert.equal(calls,1);
 assert.equal(policies[0].modelStrategy,strategy??'current');
 assert.equal(policies[0].thinkingTime,strategy==='select'?'light':undefined);
 assert.equal(policies[0].desiredModel,'gpt-5.6-sol');
 assert.equal(policies[0].chatgptMode,'chat');
}
console.log(JSON.stringify({compiledPolicyPassed:true,cases:2,providerEffects:0,promoted:false}));
