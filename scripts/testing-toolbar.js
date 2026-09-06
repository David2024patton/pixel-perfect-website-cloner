/* Testing toolbar injected into every clone. White top bar with:
   Cache Reset (clear storage + reload) | Screenshot | View as Markdown | Markup (draw on screen)
   Snapshot (save page + markup as PNG). Markup is in-memory only and NEVER saved unless Snapshot is taken.
   Self-contained; loads html2canvas (CDN) on demand for capture. No emojis, text-only buttons. */
(function(){
  if(window.__zTestBar) return; window.__zTestBar=1;
  var CSS =
    "#zbar{position:fixed;left:0;right:0;top:0;height:40px;background:#fff;border-bottom:1px solid #dcdcdc;"+
    "box-shadow:0 1px 4px rgba(0,0,0,.12);z-index:999999;display:flex;align-items:center;gap:6px;padding:0 10px;"+
    "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}"+
    "#zbar .zl{font-size:12px;font-weight:700;color:#666;margin-right:6px;letter-spacing:.5px;}"+
    "#zbar button{background:#f4f4f5;border:1px solid #d9d9de;border-radius:7px;padding:5px 10px;font-size:12px;"+
    "font-weight:600;color:#333;cursor:pointer;}"+
    "#zbar button:hover{background:#e9e9ee;}"+
    "#zbar button.on{background:#111;color:#fff;border-color:#111;}"+
    "#zmark{position:fixed;left:0;top:40px;right:0;bottom:0;z-index:999998;pointer-events:none;cursor:crosshair;}"+
    "#zmark.on{pointer-events:auto;}"+
    "#zbar .zsw{margin-left:6px;display:flex;align-items:center;gap:4px;color:#555;}";
  var st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
  var bar=document.createElement('div'); bar.id='zbar';
  bar.innerHTML = '<span class="zl">TEST</span>'+
    '<button data-a="cache">Cache Reset</button>'+
    '<button data-a="shot">Screenshot</button>'+
    '<button data-a="md">Markdown</button>'+
    '<button data-a="mark">Markup</button>'+
    '<span class="zsw">Color <input type="color" id="zcolor" value="#ff2d55" style="width:28px;height:22px;border:none;background:none;padding:0"/></span>'+
    '<button data-a="snap">Snapshot</button>'+
    '<button data-a="off" style="margin-left:auto;">Hide</button>';
  document.body.appendChild(bar);
  var cv=document.createElement('canvas'); cv.id='zmark'; document.body.appendChild(cv);
  var ctx=cv.getContext('2d'), drawing=false, markMode=false, last=null;
  document.body.style.paddingTop='40px';
  function size(){ cv.width=cv.clientWidth=innerWidth; cv.height=innerHeight-40; }
  addEventListener('resize', function(){ if(!markMode) return; size(); });
  cv.addEventListener('mousedown', function(e){ drawing=true; last=[e.clientX, e.clientY-40]; });
  cv.addEventListener('mousemove', function(e){
    if(!drawing) return; var x=e.clientX, y=e.clientY-40;
    ctx.strokeStyle=document.getElementById('zcolor').value; ctx.lineWidth=3; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(last[0],last[1]); ctx.lineTo(x,y); ctx.stroke(); last=[x,y];
  });
  addEventListener('mouseup', function(){ drawing=false; });
  cv.addEventListener('touchstart', e=>{ var t=e.touches[0]; drawing=true; last=[t.clientX,t.clientY-40]; }, {passive:true});
  cv.addEventListener('touchmove', e=>{ if(!drawing) return; var t=e.touches[0]; doubleTapStop(e); var x=t.clientX,y=t.clientY-40;
    ctx.strokeStyle=document.getElementById('zcolor').value; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(last[0],last[1]); ctx.lineTo(x,y); ctx.stroke(); last=[x,y]; }, {passive:false});
  cv.addEventListener('touchend', ()=>{ drawing=false; });

  function dblTap(e){ try{ e.preventDefault(); }catch(_){} }
  function download(dataUrl, name){
    var a=document.createElement('a'); a.href=dataUrl; a.download=name||'snapshot.png'; a.click();
  }
  function markdown(){
    var out=[];
    function walk(el){ el.childNodes.forEach(function(n){
      if(n.nodeType===3){ var t=n.textContent.trim(); if(t) out.push(t); }
      else if(n.nodeType===1){ var tag=n.tagName.toLowerCase();
        if(tag==='h1') out.push('\n# '+n.innerText.trim());
        else if(tag==='h2') out.push('\n## '+n.innerText.trim());
        else if(tag==='h3') out.push('\n### '+n.innerText.trim());
        else if(tag==='p'||tag==='div'||tag==='li'||tag==='section'){ var t=n.innerText?n.innerText.trim():''; if(t&&t.length<2000) out.push(t+'\n'); }
        else if(tag==='br') out.push('\n');
        else walk(n);
      }
    }); }
    walk(document.body);
    return out.filter(Boolean).join('\n');
  }
  function loadHtml2Canvas(cb){
    if(window.html2canvas) return cb();
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload=cb; s.onerror=function(){ alert('html2canvas could not load (offline?)'); };
    document.head.appendChild(s);
  }
  function capture(body){
    return html2canvas(document.body, {backgroundColor:'#ffffff', scale:1}).then(function(page){
      if(markMode){ var g=ctx.getImageData(0,0,cv.width,cv.height), blank=true;
        for(var i=3;i<g.data.length;i+=4){ if(g.data[i]!==0){ blank=false; break; } }
        if(!blank){ page.getContext('2d').drawImage(cv, 10, 50); } }
      return page.toDataURL('image/png');
    });
  }
  bar.addEventListener('click', function(e){
    var b=e.target.closest('button'); if(!b) return; var a=b.getAttribute('data-a');
    if(a==='cache'){ localStorage.clear(); sessionStorage.clear(); location.reload(); }
    else if(a==='shot'){ loadHtml2Canvas(function(){ capture().then(function(d){ download(d,'screenshot.png'); }); }); }
    else if(a==='md'){ var md='# Page as Markdown\n\n'+markdown(); download('data:text/markdown;charset=utf-8,'+encodeURIComponent(md),'page.md'); }
    else if(a==='mark'){ markMode=!markMode; cv.classList.toggle('on', markMode); b.classList.toggle('on', markMode); if(markMode) size(); }
    else if(a==='snap'){ loadHtml2Canvas(function(){ capture().then(function(d){ download(d,'snapshot.png'); }); }); }
    else if(a==='off'){ bar.style.display='none'; cv.style.display='none'; }
  });
  // keep markup ephemeral: it only exists on the canvas; nothing is persisted unless Snapshot downloads it.
})();
