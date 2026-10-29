const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const cwd=require('node:path').resolve(__dirname,'..');
const fixture=spawn(process.execPath,[__dirname+'/storefront-fixture.cjs'],{stdio:'ignore'});
const next=spawn(process.execPath,[cwd+'/node_modules/next/dist/bin/next','start','-p','45100','-H','127.0.0.1'],{cwd,env:{...process.env,API_INTERNAL_URL:'http://127.0.0.1:45101/api/v1',API_PROXY_URL:'http://127.0.0.1:45101',PLATFORM_PAYMENTS_ENABLED:'true'},stdio:'ignore'});
(async()=>{try{
 let html;
 for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:45100/');if(r.ok){html=await r.text();break;}}catch{} await new Promise(r=>setTimeout(r,250));}
 assert.ok(html,'server available');
 const section=html.match(/<section[^>]+id="boloes"[^>]*>([\s\S]*?)<\/section>/)[1];
 assert.ok(section.includes('Concurso atual'));
 assert.ok(!section.includes('>Antigo<'));
 assert.ok(html.includes('Números sorteados'));
 assert.ok(html.includes('Segundo sorteio'));
 const past=await (await fetch('http://127.0.0.1:45100/boloes/Antigo')).text();
 assert.ok(!past.includes('>Reservar e gerar Pix<'));
 const history=await (await fetch('http://127.0.0.1:45100/resultados')).text();
 assert.ok(history.includes('Números sorteados'));
 await fetch('http://127.0.0.1:45101/renew');
 const renewed=await (await fetch('http://127.0.0.1:45100/')).text();
 assert.ok(renewed.includes('Novo concurso publicado'));
 console.log('PASS rendered HTTP with API fixtures: sales/history separation, second draw, expired detail without checkout, new published pool');
 }finally{fixture.kill();next.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
