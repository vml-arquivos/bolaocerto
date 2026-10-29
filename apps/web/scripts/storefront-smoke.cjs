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
 const manifestResponse=await fetch('http://127.0.0.1:45100/manifest.webmanifest');
 assert.equal(manifestResponse.status,200);const manifest=await manifestResponse.json();
 assert.equal(manifest.display,'standalone');assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/aplicativo?origem=pwa');
 for(const shortcut of manifest.shortcuts) assert.ok(shortcut.url.startsWith('/'));
 for(const icon of manifest.icons){const r=await fetch('http://127.0.0.1:45100'+icon.src);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').includes('image/png'));}
 const sw=await fetch('http://127.0.0.1:45100/sw.js');assert.ok(sw.headers.get('cache-control').includes('no-store'));assert.equal(sw.headers.get('service-worker-allowed'),'/');
 const appHtml=await (await fetch('http://127.0.0.1:45100/aplicativo')).text();assert.ok(appHtml.includes('Escolha seu próximo bolão'));assert.ok(appHtml.includes('Navegação do aplicativo'));
 const installHtml=await (await fetch('http://127.0.0.1:45100/instalar')).text();assert.ok(installHtml.includes('Adicionar à Tela de Início'));assert.ok(installHtml.includes('Android'));assert.ok(installHtml.includes('mobile-web-app-capable'));assert.ok(installHtml.includes('apple-mobile-web-app-title'));
 const menuHtml=await (await fetch('http://127.0.0.1:45100/aplicativo/mais')).text();assert.ok(menuHtml.includes('/privacidade'));assert.ok(menuHtml.includes('/minha-conta/contratos'));
 const apiResponse=await fetch('http://127.0.0.1:45100/api/v1/auth/me');assert.ok(apiResponse.headers.get('cache-control').includes('no-store'));
 console.log('PASS PWA HTTP: manifest, icons, installation guidance, client navigation, worker update headers and API no-store');
 console.log('PASS rendered HTTP with API fixtures: sales/history separation, second draw, expired detail without checkout, new published pool');
 }finally{fixture.kill();next.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
