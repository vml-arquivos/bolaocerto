// Synthetic data for local smoke tests only; never a production API.
const http = require('http');
let renewed = false;
const start = Date.now();
const pool = (id, cutoff, status='aberto') => ({id,concursoId:'c'+id,grupoId:'g',status,numerosApostados:[1,2,3,4,5,6],jogos:[],totalCotas:10,cotasDisponiveis:8,cotasVendidas:2,cotasIlimitadas:false,valorCota:'5.28',taxaAdministracaoPct:'10',modeloOperacional:'mandato',teveGanhador:false,grupo:{nome:id,slug:id,descricao:null},concurso:{modalidade:'megasena',numeroConcurso:123,dataSorteio:new Date(cutoff+60000).toISOString(),cutoffAt:new Date(cutoff).toISOString(),status:status==='aberto'?'aberto':'apurado',valorEstimadoPremio:'100000000',acumulado:true}});
const old=pool('Antigo',start-60000);
old.resultado={numerosSorteados:[10,20,30,40,50,60],numerosSegundoSorteio:[1,2,3,4,5,6],atualizadoEm:new Date().toISOString()};
http.createServer((req,res)=>{res.setHeader('content-type','application/json');const path=req.url.split('?')[0];let body;
if(path==='/renew'){renewed=true;body={ok:true};}
else if(path==='/api/v1/boloes/disponiveis') body=[pool(renewed?'Novo concurso publicado':'Concurso atual',start+3600000),old];
else if(path==='/api/v1/boloes/historico') body=[old];
else if(path==='/api/v1/concursos') body=[{...pool('atual',start+3600000).concurso,id:'c1'}];
else if(path==='/api/v1/boloes/Antigo') body=old;
else if(path.startsWith('/api/v1/boloes/')) body=pool('Prazo curto',Date.now()+5000);
else body=[];
res.end(JSON.stringify(body));}).listen(45101,'127.0.0.1');
