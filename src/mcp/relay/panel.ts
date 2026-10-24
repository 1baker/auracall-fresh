/** Static, dependency-free ChatGPT compatibility UI. No external network or credentials. */
export const relayPanelHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AuraCall relay</title><style>
body{font:15px system-ui,sans-serif;color:var(--color-text-primary,#202124);background:var(--color-background-primary,#fff);padding:20px;max-width:680px;margin:auto}
label{display:block;margin:16px 0 6px}input,button{font:inherit;padding:10px;border:1px solid #aaa;border-radius:8px}input{box-sizing:border-box;width:100%}button{cursor:pointer;margin:12px 8px 8px 0}button:disabled{cursor:default;opacity:.55}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto}#status{min-height:2em}small{color:var(--color-text-secondary,#5f6368)}
</style></head><body><h1>AuraCall</h1><p>Bring an approved Codex request into this conversation and return the complete answer.</p>
<label for="request">Request ID</label><input id="request" autocomplete="off" spellcheck="false">
<button id="load" type="button">Load request</button><button id="ask" type="button" disabled>Ask ChatGPT</button>
<p id="status" role="status" aria-live="polite">Loading the ChatGPT connection…</p><pre id="preview"></pre>
<small>Select your model and intelligence setting in ChatGPT. AuraCall does not change them here.</small>
<script>
(() => {
 const request=document.getElementById('request'),load=document.getElementById('load'),ask=document.getElementById('ask'),status=document.getElementById('status'),preview=document.getElementById('preview');
 const host=window.openai; let job=null,started=false,loading=false;
 const usable=host&&typeof host.callTool==='function'&&typeof host.sendFollowUpMessage==='function';
 if(!usable){status.textContent='This ChatGPT view does not expose the required relay tools and message bridge.';load.disabled=true;return;}
 const initial=host.toolOutput?.requestId||host.toolInput?.requestId;
 if(typeof initial==='string')request.value=initial;
 status.textContent='Load the request, then choose Ask ChatGPT once.';
 async function call(name,args){const result=await host.callTool(name,args);const data=result?.structuredContent??result;if(result?.isError||data?.ok===false)throw Error('Relay refused');return data;}
 request.addEventListener('input',()=>{if(!loading&&!started){job=null;ask.disabled=true;preview.textContent='';status.textContent='Load this request before asking ChatGPT.';}});
 load.addEventListener('click',async()=>{
  if(loading||started)return;loading=true;load.disabled=true;request.disabled=true;
  ask.disabled=true;job=null;preview.textContent='';
  try{const id=request.value.trim();const saved=await call('relay_status',{requestId:id});
   if(saved.state!=='ready'){status.textContent=saved.state==='replied'?'The reply is saved. Codex can read it now.':'This request already has a dispatch claim. Read back the existing request; do not send it again.';return;}
   job=await call('relay_request',{requestId:id});if(job.requestId!==id)throw Error('Request identity differs');request.value=job.requestId;preview.textContent=job.prompt;status.textContent='Request loaded. Check the selected ChatGPT model before continuing.';ask.disabled=started;
  }catch{status.textContent='Could not load this request. Check the request ID and connection.';}
  finally{loading=false;if(!started){load.disabled=false;request.disabled=false;}}
 });
 ask.addEventListener('click',async()=>{
  if(loading||started||!job||request.value.trim()!==job.requestId)return;const selected=job;started=true;ask.disabled=true;load.disabled=true;request.disabled=true;let claim=null;
  try{claim=await call('relay_claim',{requestId:selected.requestId,fingerprint:selected.fingerprint});
   if(claim.fresh!==true){status.textContent='This request was already claimed. Read back the existing request; do not send again.';return;}
   await host.sendFollowUpMessage({prompt:'Process the approved AuraCall request '+selected.requestId+'. Call relay_request with that exact requestId and read its full prompt and previousReply context. Write the complete requested answer, then call relay_reply with requestId '+selected.requestId+', claimId '+claim.claimId+' and text containing the ENTIRE answer unchanged. Do not create or claim another request. Do not report Pro, attachments, native conversation identity or browser acceptance without actual evidence.'});
   status.textContent='Waiting for ChatGPT to return the complete reply. Use Load request after reopening this panel to check its saved state.';
  }catch{if(claim?.claimId){try{await call('relay_hold',{requestId:selected.requestId,claimId:claim.claimId});}catch{}}
   status.textContent='Message delivery could not be confirmed. Keep this request and read back its existing state; do not send it again.';}
 });
})();
</script></body></html>`;
