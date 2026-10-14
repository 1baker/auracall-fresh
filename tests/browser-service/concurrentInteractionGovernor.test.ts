import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

test("separate runtime processes share admission limits and interrupt pacing on another caller's warning", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "auracall-shared-governor-"));
	const children: ChildProcess[] = [];
	const start = (id: string, limit: number) => {
		const child = spawn(
			process.execPath,
			[
				"--import",
				"tsx",
				"--input-type=module",
				"-e",
				`
import {createFileBackedProviderInteractionLedger} from ${JSON.stringify(path.resolve("packages/browser-service/src/service/interactionLedger.ts"))};
import {createLedgerBackedBrowserInteractionGovernor} from ${JSON.stringify(path.resolve("packages/browser-service/src/service/ledgerInteractionGovernor.ts"))};
const ledger=createFileBackedProviderInteractionLedger({ledgerRoot:${JSON.stringify(root)}});
const scope={provider:'chatgpt',tenantKey:'operator@example.test',runtimeProfileId:${JSON.stringify(id)},managedBrowserProfile:${JSON.stringify(id)}};
let paced=false;
const controller=new AbortController();
const governor=createLedgerBackedBrowserInteractionGovernor({ledger,scope,workloadId:${JSON.stringify(id)},operationId:${JSON.stringify(id)},tabLeaseId:${JSON.stringify(id)},policy:{maxConcurrentChats:null,maxConversationStartsPerHour:null,maxConversationStartsPerDay:null,maxInteractionsPerMinute:${limit}},baseGovernor:{beforeInteraction:async(_kind,signal)=>{if(paced){process.send('pacing');await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}}}});
process.on('message',async command=>{
 try{
 if(command==='warning'){await ledger.recordProviderWarning({scope,classification:'rate-limit',reason:'fixture HTTP429',observedAt:new Date().toISOString()});process.send('warning-recorded');}
 if(command==='admit'||command==='pace'){paced=command==='pace';try{await governor.beforeInteraction('conversation-read',controller.signal);process.send('admitted');}catch(e){process.send(e.reason??e.message);}}
 }catch(e){process.send('fixture-error:'+e.message);}
});process.send('ready');
`,
			],
			{ stdio: ["ignore", "ignore", "inherit", "ipc"] },
		);
		children.push(child);
		const messages: unknown[] = [];
		const waiters: Array<(value: unknown) => void> = [];
		child.on("message", (value) => {
			const waiter = waiters.shift();
			if (waiter) waiter(value);
			else messages.push(value);
		});
		return {
			child,
			next: () =>
				messages.length
					? Promise.resolve(messages.shift())
					: new Promise<unknown>((resolve) => waiters.push(resolve)),
		};
	};
	try {
		const a = start("runtime-a", 1);
		const b = start("runtime-b", 3);
		expect(await a.next()).toBe("ready");
		expect(await b.next()).toBe("ready");
		a.child.send("admit");
		expect(await a.next()).toBe("admitted");
		b.child.send("admit");
		expect(await b.next()).toBe("minute-interaction-limit");
		b.child.send("pace");
		expect(await b.next()).toBe("pacing");
		a.child.send("warning");
		expect(await a.next()).toBe("warning-recorded");
		const outcome = await Promise.race([
			b.next(),
			new Promise((resolve) => setTimeout(() => resolve("warning did not interrupt pacing"), 2000)),
		]);
		expect(outcome).toBe("provider-warning");
	} finally {
		await Promise.all(
			children.map(async (child) => {
				if (child.exitCode !== null || child.signalCode !== null) return;
				const exit = once(child, "exit");
				child.kill();
				await exit;
			}),
		);
		await rm(root, { recursive: true, force: true });
	}
}, 10000);
