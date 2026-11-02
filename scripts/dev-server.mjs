/** Zero-dependency local server for ES modules and JSON catalogs (no Pages deployment). */
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const portArgument=process.argv.indexOf('--port');
const port=Number(portArgument===-1?process.env.PORT||4173:process.argv[portArgument+1]);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const filename=path.resolve(root,`.${pathname.endsWith('/')?pathname+'index.html':pathname}`);
    if(!filename.startsWith(root+path.sep)&&filename!==path.join(root,'index.html')){res.writeHead(403).end();return;}
    if(!(await stat(filename)).isFile())throw new Error('Not a file');
    const content=await readFile(filename);
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(content);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Idle Factory dev preview: http://127.0.0.1:${port}/`));
