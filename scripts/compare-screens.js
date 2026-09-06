#!/usr/bin/env node
/* Screen comparison workflow for the clone skill's final visual gate.
   Captures LIVE and LOCAL versions of each route at the same viewport (desktop or
   mobile), opens each route's DROPDOWN MENUS, extracts a structural layout signature
   (sidebar presence, nav labels, content width) and diffs everything against live.
   Writes screenshots + a markdown report. Run once, not by hand each time.
   Usage:
     node compare-screens.js --live <base> --local <base> --routes <file.json>
        [--viewport 1440x900|375x812] [--out <dir>] [--session <session.json>]
        [--local-auth-key sameday-sim-auth]
   routes.json (each route may also carry a "menus" array of dropdown names to open):
     [{ "name":"home","live":"/p/home","local":"home","menus":["More"] }, ...]
     "local" is a path to navigate to, or an SPA view name passed to window.go(). */
const { spawn } = require("child_process");
const fs = require("fs"), path = require("path");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = ms => new Promise(r => setTimeout(r, ms));
function arg(name, def){ const i = process.argv.indexOf("--"+name); return i>-1 ? process.argv[i+1] : def; }
const LIVE = arg("live"), LOCAL = arg("local"), ROUTES_FILE = arg("routes");
const VW = parseInt(arg("viewport","1440x900").split("x")[0],10);
const VH = parseInt(arg("viewport","1440x900").split("x")[1],10);
const OUT = arg("out", path.join("comp","compare"));
const SESSION = arg("session"); const LOCAL_AUTH = arg("local-auth-key");
const PORT = 9333, UD = path.join(process.env.TEMP||"C:/tmp", "chrome-compare-"+Date.now());
async function launch(){ fs.rmSync(UD,{recursive:true,force:true}); const ch=spawn(CHROME,["--headless=new","--disable-gpu","--no-sandbox","--disable-dev-shm-usage",`--remote-debugging-port=${PORT}`,`--user-data-dir=${UD}`,`--window-size=${VW},${VH}`,"about:blank"],{stdio:"ignore",detached:true}); ch.unref(); for(let i=0;i<30;i++){ await sleep(500); try{ if((await fetch(`http://localhost:${PORT}/json`)).ok) return; }catch(e){} } throw new Error("CDP down"); }
async function target(){ for(let i=0;i<30;i++){ try{ const l=await(await fetch(`http://localhost:${PORT}/json/list`)).json(); const t=l.find(x=>x.type==="page"); if(t)return t; }catch(e){} await sleep(500);} throw new Error("no page"); }
function cdp(u){ const ws=new WebSocket(u); let id=0; const p=new Map(); const ready=new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;}); ws.onmessage=e=>{try{const m=JSON.parse(e.data); if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}}catch(_){}}; return { ready, send(method,params={}){ return new Promise((r,j)=>{ const i=++id; p.set(i,m=>m.error?j(new Error(JSON.stringify(m.error))):r(m.result)); ws.send(JSON.stringify({id:i,method,params})); }); }, close(){ws.close();} }; }
async function nav(c,url){ await c.send("Page.navigate",{url}); for(let i=0;i<30;i++){ await sleep(250); const rs=await c.send("Runtime.evaluate",{expression:"document.readyState",returnByValue:true}); if(rs.result&&rs.result.value==="complete") break; } await sleep(1200); }
async function ev(c,expr){ const r=await c.send("Runtime.evaluate",{expression:expr,awaitPromise:true,returnByValue:true}); return r.result?r.result.value:undefined; }
async function shoot(c,file){ const r=await c.send("Page.captureScreenshot",{format:"png"}); fs.writeFileSync(file, Buffer.from(r.data,"base64")); }
async function pressEsc(c){ await c.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27}); await c.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27}); await sleep(300); }

function sigExpr(){
  return `(()=>{ const vw=innerWidth, vh=innerHeight;
    let sidebar=null;
    for(const el of document.querySelectorAll('aside,nav,[class*="sidebar" i],[data-testid*="sidebar" i]')){
      const r=el.getBoundingClientRect();
      if(r.height>vh*0.5 && r.left<5 && r.width>=170){ sidebar={w:Math.round(r.width)}; break; }
    }
    const navLabels=[...document.querySelectorAll('nav button,nav a,[role=nav] a,[class*="nav"] button')].map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,14);
    const main=document.querySelector('main,[class*="content"],[class*="main"]');
    const mr=main?main.getBoundingClientRect():null;
    return { vw, sidebar, navLabels, mainW: mr?Math.round(mr.width):null }; })()`;
}
function openMenuExpr(name){ return `(()=>{const els=[...document.querySelectorAll('button,a,div,span,li')].filter(x=>{const t=(x.innerText||'').trim().replace(/\s+/g,' ');return t&&t.length<40&&t.toLowerCase().startsWith(${JSON.stringify(name.toLowerCase())});});els.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length);if(els[0]){els[0].click();return 'clicked';}return 'nostub';})()`; }
function menuLabelsExpr(){ return `(()=>{const seen=new Set();const out=[];for(const e of document.querySelectorAll('button,a,[role=menuitem],li,[class*="menu" i] button')){const r=e.getBoundingClientRect();const t=(e.innerText||'').trim().replace(/\s+/g,' ');if(r.width>0&&r.height>0&&r.top>=0&&r.top<innerHeight&&t&&t.length<=32){const k=t.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(t);}}}return out.slice(0,30);})()`; }
async function captureMenu(c, name, file){
  const click = await ev(c, openMenuExpr(name));
  if(click==="nostub"){ return {opened:false, labels:[]}; }
  await sleep(650);
  const labels = await ev(c, menuLabelsExpr());
  await shoot(c, file);
  await pressEsc(c);
  return {opened:true, labels};
}

async function injectSession(c,url){
  if(!SESSION) return;
  const sess=JSON.parse(fs.readFileSync(SESSION,"utf8"));
  if(sess.cookies) for(const ck of sess.cookies){ try{ await c.send("Network.setCookie",{name:ck.name,value:ck.value,domain:ck.domain,path:ck.path||"/",secure:!!ck.secure,httpOnly:!!ck.httpOnly}); }catch(e){} }
  await nav(c,url);
  if(sess.localStorage){ for(const [k,v] of Object.entries(sess.localStorage)){ await ev(c,`localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)})`); } await c.send("Page.reload"); await sleep(1600); }
}
function menuMatch(liveM, localM){
  if(!liveM && !localM) return "no-menus";
  if(liveM && !localM) return "live has menu, local none";
  if(!liveM && localM) return "local has menu, live none";
  const a=(liveM.labels||[]).map(x=>x.toLowerCase()), b=(localM.labels||[]).map(x=>x.toLowerCase());
  const same = a.length===b.length && a.every(x=>b.includes(x));
  return same ? "ok ("+a.length+" items)" : "differ: live="+a.join("/")+" | local="+b.join("/");
}
async function main(){
  if(!ROUTES_FILE){ console.error("--routes <file.json> is required"); process.exit(2); }
  const routes=JSON.parse(fs.readFileSync(ROUTES_FILE,"utf8"));
  fs.mkdirSync(OUT+"/screens",{recursive:true});
  await launch(); const t=await target(); const c=cdp(t.webSocketDebuggerUrl); await c.ready;
  await c.send("Page.enable"); await c.send("Runtime.enable"); await c.send("Network.enable");
  await c.send("Emulation.setDeviceMetricsOverride",{width:VW,height:VH,deviceScaleFactor:1,mobile:VW<600});
  if(LOCAL && LOCAL_AUTH){ await nav(c,LOCAL); await ev(c,`localStorage.setItem(${JSON.stringify(LOCAL_AUTH)},"1")`); }
  const results=[];
  for(const r of routes){
    const row={name:r.name};
    // LIVE
    if(LIVE){ let liveUrl=LIVE+r.live; if(SESSION){ await injectSession(c, liveUrl); } else { await nav(c, liveUrl); } row.live=await ev(c, sigExpr()); await shoot(c, path.join(OUT,"screens","live-"+r.name+".png"));
      if(r.menus){ row.liveMenus={}; for(const m of r.menus){ row.liveMenus[m]=await captureMenu(c,m,path.join(OUT,"screens","live-"+r.name+"-menu-"+m.replace(/[^a-z0-9]/gi,'-')+".png")); } } }
    // LOCAL
    if(LOCAL){ await nav(c, LOCAL); if(LOCAL_AUTH){ await ev(c,`localStorage.setItem(${JSON.stringify(LOCAL_AUTH)},"1")`); await c.send("Page.reload"); await sleep(1600); } const lv=String(r.local||""); if(lv && typeof (await ev(c,"typeof window.go"))!=="undefined"){ await ev(c,`window.go(${JSON.stringify(lv)})`); } else if(lv){ await nav(c, LOCAL+lv); } await sleep(900); row.local=await ev(c, sigExpr()); await shoot(c, path.join(OUT,"screens","local-"+r.name+".png"));
      if(r.menus){ row.localMenus={}; for(const m of r.menus){ row.localMenus[m]=await captureMenu(c,m,path.join(OUT,"screens","local-"+r.name+"-menu-"+m.replace(/[^a-z0-9]/gi,'-')+".png")); } } }
    // diff structural
    const a=row.live, b=row.local;
    const sideMatch=(a&&b)?(b.sidebar&&!a.sidebar?"local has sidebar, live does not":(a.sidebar&&!b.sidebar?"live has sidebar, local does not":null)):"n/a";
    const navMatch=(a&&b)?(JSON.stringify(a.navLabels)===JSON.stringify(b.navLabels)?"ok":"differ: live="+a.navLabels.join("/")+" local="+b.navLabels.join("/")):"n/a";
    const widthMatch=(a&&b)?(Math.abs((a.mainW||0)-(b.mainW||0))<160?"ok":"differ: live="+a.mainW+" local="+b.mainW):"n/a";
    row.side="side:"+(sideMatch||"ok"); row.navM="nav:"+navMatch; row.width="width:"+widthMatch;
    // diff menus
    let menuStr="no-menus";
    if(r.menus){
      const parts=[]; let allOk=true;
      for(const m of r.menus){ const mm=menuMatch(row.liveMenus&&row.liveMenus[m], row.localMenus&&row.localMenus[m]); parts.push(m+": "+mm); if(!/^ok /i.test(mm)) allOk=false; }
      menuStr="menus: "+parts.join(" ; "); row.menusOk=allOk;
    }
    row.menuStr=menuStr;
    row.pass = sideMatch===null && navMatch==="ok" && widthMatch==="ok" && (row.menusOk!==false);
    results.push(row);
  }
  c.close();
  const md = ["# Screen comparison report  ("+VW+"x"+VH+")","","| Screen | Sidebar | Nav | Content width | Menus | Result |","|---|---|---|---|---|---|"]
    .concat(results.map(r=>`| ${r.name} | ${String(r.side||"").replace("side:","")} | ${String(r.navM||"").replace("nav:","").slice(0,40)} | ${String(r.width||"").replace("width:","")} | ${String(r.menuStr||"no-menus").slice(0,46)} | ${r.pass?"PASS":"CHECK"} |`))
    .concat(["","Items to review:", ...results.filter(r=>!r.pass).map(r=>`- ${r.name}: ${r.side} ; ${r.navM} ; ${r.width} ; ${r.menuStr}`)]);
  fs.writeFileSync(path.join(OUT,"compare-report.md"), md.join("\n"));
  fs.writeFileSync(path.join(OUT,"compare-report.json"), JSON.stringify(results,null,2));
  console.log("report + screens written to", path.resolve(OUT));
  console.log("passing:", results.filter(r=>r.pass).length, "/", results.length);
  results.forEach(r=>console.log("  ", r.pass?"PASS":"CHECK", r.name, "|", r.side, "|", String(r.navM).slice(0,38), "|", String(r.menuStr).slice(0,40)));
}
main().catch(e=>{ console.error("ERR:", e.message); process.exit(2); });
