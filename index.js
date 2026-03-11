const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      sku TEXT PRIMARY KEY,
      name TEXT,
      config JSONB,
      margin NUMERIC DEFAULT 2.5,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('DB prete');
}
init();

// Servir le configurateur HTML (inline)
const CONFIGURATEUR_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GOODS — Configurateur</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#f1f0ee;color:#111827;font-size:14px}
:root{--p:#5b3de8;--pl:#ede9ff;--bg:#f1f0ee;--text:#111827;--muted:#6b7280;--border:#e5e7eb}

/* LAYOUT */
.wrap{display:flex;height:100vh;overflow:hidden}
.viewer{flex:1;background:#e8e3da;display:flex;flex-direction:column;position:relative;overflow:hidden}
.panel{width:340px;flex-shrink:0;background:#fff;border-left:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto}

/* VIEWER */
.view-tabs{display:flex;gap:0;border-bottom:1px solid rgba(0,0,0,.1);background:rgba(255,255,255,.6);backdrop-filter:blur(8px);padding:0 16px}
.vtab{padding:10px 14px;font-size:12px;font-weight:600;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;transition:all .15s}
.vtab.active{color:var(--p);border-bottom-color:var(--p)}
.canvas-wrap{flex:1;display:flex;align-items:center;justify-content:center;position:relative;padding:20px}
.canvas-wrap canvas{display:block;border-radius:4px;box-shadow:0 8px 40px rgba(0,0,0,.15)}
.loading-state{display:flex;flex-direction:column;align-items:center;gap:12px;color:var(--muted)}
.loading-state .sp{width:32px;height:32px;border:3px solid var(--pl);border-top-color:var(--p);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ZONE SELECTOR sur le canvas */
.zone-hint{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);color:#fff;font-size:11px;font-weight:500;padding:6px 14px;border-radius:20px;pointer-events:none;opacity:0;transition:opacity .3s}
.zone-hint.show{opacity:1}

/* PANEL */
.panel-hdr{padding:20px 20px 0}
.prod-name{font-size:18px;font-weight:700;color:var(--text);margin-bottom:2px}
.prod-sub{font-size:12px;color:var(--muted)}
.divider{height:1px;background:var(--border);margin:16px 0}

.section{padding:0 20px;margin-bottom:20px}
.sec-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:10px}

/* ZONES */
.zones-grid{display:flex;flex-direction:column;gap:6px}
.zone-btn{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border);cursor:pointer;transition:all .15s;background:#fff}
.zone-btn:hover{border-color:#c4b5fd}
.zone-btn.active{border-color:var(--p);background:var(--pl)}
.zone-btn.has-logo{border-color:#10b981;background:#f0fdf4}
.zb-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.zb-info{flex:1}
.zb-name{font-size:13px;font-weight:600}
.zb-sub{font-size:11px;color:var(--muted);margin-top:1px}
.zb-check{font-size:16px}

/* UPLOAD */
.upload-zone{border:2px dashed #c4b5fd;border-radius:12px;padding:20px;text-align:center;cursor:pointer;transition:all .15s;background:#fff;position:relative;overflow:hidden}
.upload-zone:hover{border-color:var(--p);background:var(--pl)}
.upload-zone.has-file{border-color:#10b981;border-style:solid;background:#f0fdf4}
.up-ico{font-size:28px;margin-bottom:6px}
.up-txt{font-size:13px;font-weight:600;color:var(--text)}
.up-sub{font-size:11px;color:var(--muted);margin-top:2px}
.logo-preview{display:flex;align-items:center;gap:10px;margin-top:10px}
.logo-prev-img{width:48px;height:48px;object-fit:contain;border-radius:6px;border:1px solid var(--border)}
.logo-prev-name{flex:1;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.logo-del{border:none;background:transparent;cursor:pointer;color:#e03e3e;font-size:18px;padding:0}

/* TECHNIQUES */
.tech-select{display:flex;flex-direction:column;gap:4px}
.tech-opt{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;border:1.5px solid var(--border);cursor:pointer;transition:all .12s}
.tech-opt:hover{border-color:#c4b5fd}
.tech-opt.active{border-color:var(--p);background:var(--pl)}
.tech-opt input[type=radio]{display:none}
.tech-name{font-size:12px;font-weight:600;flex:1}
.tech-colors{font-size:11px;color:var(--muted)}

/* QTÉ */
.qty-wrap{display:flex;align-items:center;gap:0;border:1.5px solid var(--border);border-radius:10px;overflow:hidden}
.qty-btn{width:40px;height:40px;border:none;background:#f9f9f9;cursor:pointer;font-size:18px;font-weight:600;color:var(--text);transition:background .1s}
.qty-btn:hover{background:#f0efec}
.qty-inp{flex:1;border:none;text-align:center;font-size:16px;font-weight:700;font-family:'Inter',sans-serif;outline:none;height:40px}
.qty-paliers{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}
.qp{padding:3px 9px;border-radius:20px;border:1.5px solid var(--border);font-size:11px;font-weight:600;cursor:pointer;color:var(--muted);transition:all .1s}
.qp:hover,.qp.active{border-color:var(--p);color:var(--p);background:var(--pl)}

/* PRIX */
.prix-wrap{background:var(--pl);border-radius:12px;padding:14px 16px;margin:0 20px 16px}
.prix-line{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:4px}
.prix-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;padding-top:8px;border-top:1px solid #d4c5fb}
.prix-label{font-size:13px;font-weight:600}
.prix-val{font-size:22px;font-weight:700;color:var(--p)}
.prix-sub{font-size:11px;color:var(--muted);margin-top:2px}

/* CTA */
.cta-wrap{padding:0 20px 20px}
.btn-cart{width:100%;padding:14px;border-radius:12px;border:none;background:var(--p);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s}
.btn-cart:hover{background:#4a2fd4;transform:translateY(-1px)}
.btn-cart:disabled{background:#c4b5fd;cursor:not-allowed;transform:none}

.err-state{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 20px;text-align:center;color:var(--muted)}
</style>
</head>
<body>

<div class="wrap">
  <!-- VIEWER -->
  <div class="viewer">
    <div class="view-tabs" id="viewTabs"></div>
    <div class="canvas-wrap" id="canvasWrap">
      <div class="loading-state" id="loadingState">
        <div class="sp"></div>
        <div>Chargement du produit…</div>
      </div>
      <canvas id="cv" style="display:none"></canvas>
    </div>
    <div class="zone-hint" id="zoneHint">Clique sur une zone pour placer ton logo</div>
  </div>

  <!-- PANEL -->
  <div class="panel">
    <div class="panel-hdr">
      <div class="prod-name" id="prodName">—</div>
      <div class="prod-sub" id="prodSub">—</div>
    </div>
    <div class="divider"></div>

    <!-- ZONES -->
    <div class="section">
      <div class="sec-title">Zones de marquage</div>
      <div class="zones-grid" id="zonesGrid"></div>
    </div>

    <!-- UPLOAD (apparaît quand zone sélectionnée) -->
    <div class="section" id="uploadSection" style="display:none">
      <div class="sec-title" id="uploadTitle">Ton logo</div>
      <div class="upload-zone" id="uploadZone">
        <input type="file" accept=".pdf,.ai,application/pdf" id="logoInput" onchange="onLogoUpload(this)" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;z-index:10">
        <div class="up-ico">📁</div>
        <div class="up-txt">Clique pour uploader ton logo</div>
        <div class="up-sub" id="fmtHint">PDF ou AI vectorisé uniquement</div>
      </div>
      <div class="logo-preview" id="logoPreview" style="display:none">
        <span class="logo-prev-name" id="logoPrevName" style="flex:1;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
        <button class="logo-del" onclick="removeLogo()" style="border:none;background:transparent;cursor:pointer;color:#e03e3e;font-size:16px;padding:0">✕</button>
      </div>
    </div>

    <!-- TECHNIQUE (si zone a plusieurs techniques) -->
    <div class="section" id="techSection" style="display:none">
      <div class="sec-title">Technique de marquage</div>
      <div class="tech-select" id="techList"></div>
    </div>

    <div class="divider" style="margin:0 0 16px"></div>

    <!-- QUANTITÉ -->
    <div class="section">
      <div class="sec-title">Quantité</div>
      <div class="qty-wrap">
        <button class="qty-btn" onclick="changeQty(-10)">−</button>
        <input class="qty-inp" type="number" id="qtyInp" value="100" min="1" onchange="onQtyChange()">
        <button class="qty-btn" onclick="changeQty(10)">＋</button>
      </div>
      <div class="qty-paliers" id="qtyPaliers">
        <div class="qp" onclick="setQty(50)">50</div>
        <div class="qp active" onclick="setQty(100)">100</div>
        <div class="qp" onclick="setQty(250)">250</div>
        <div class="qp" onclick="setQty(500)">500</div>
        <div class="qp" onclick="setQty(1000)">1000</div>
      </div>
    </div>

    <!-- PRIX -->
    <div class="prix-wrap" id="prixWrap">
      <div class="prix-line"><span>Produit (×<span id="pQty">100</span>)</span><span id="pProduit">—</span></div>
      <div class="prix-line"><span>Marquage</span><span id="pMarquage">—</span></div>
      <div class="prix-line"><span>Cliché</span><span id="pCliche">—</span></div>
      <div class="prix-total">
        <div><div class="prix-label">Prix unitaire</div><div class="prix-sub">TTC, hors livraison</div></div>
        <div class="prix-val" id="pTotal">—</div>
      </div>
    </div>

    <!-- CTA -->
    <div class="cta-wrap">
      <button class="btn-cart" id="btnCart" disabled onclick="addToCart()">Uploader un logo pour continuer</button>
    </div>
  </div>
</div>

<script>
var API_URL='https://goodsapi-production.up.railway.app';
var MARGIN=2.5;
var config=null;
var activeView=null;
var activeZoneIdx=null;
var logos={}; // {zoneIdx: {file, b64, imgEl, x, y, w, h}}
var activeTech={}; // {zoneIdx: techId}
var qty=100;
var cv=document.getElementById('cv');
var ctx=cv.getContext('2d');
var imgCache={}; // {viewName: imgEl}
var dragging=null,resizing=null;
var dragOff={x:0,y:0};
var scale=1;

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init(){
  var sku=getParam('sku');
  if(!sku){
    // Fallback localStorage pour les tests
    var local=localStorage.getItem('goods_config');
    if(local){config=JSON.parse(local);setup();}
    else showErr('Aucun produit chargé');
    return;
  }
  try{
    var res=await fetch(API_URL+'/products/'+sku);
    if(!res.ok)throw new Error('Produit non trouvé');
    var data=await res.json();
    config=data.config;
    MARGIN=data.margin||2.5;
    setup();
  }catch(e){
    // Fallback localStorage
    var local=localStorage.getItem('goods_config');
    if(local){config=JSON.parse(local);setup();}
    else showErr('Produit introuvable : '+e.message);
  }
}

function getParam(k){
  return new URLSearchParams(window.location.search).get(k);
}

function showErr(msg){
  document.getElementById('loadingState').innerHTML='<div class="err-state"><div style="font-size:32px">⚠️</div><div>'+msg+'</div></div>';
}

function setup(){
  if(!config||!config.zones||!config.zones.length){showErr('Aucune zone configurée');return;}
  document.getElementById('prodName').textContent=config.product&&config.product.name||'Produit';
  document.getElementById('prodSub').textContent='Réf. '+(config.product&&config.product.sku||'—');

  // Précharger toutes les images
  var views=[...new Set(config.zones.map(function(z){return z.view;}))];
  var promises=views.map(function(v){
    var b64=config.viewImgs&&config.viewImgs[v];
    if(!b64)return Promise.resolve();
    return new Promise(function(res){
      var im=new Image();im.onload=function(){imgCache[v]=im;res();};im.src=b64;
    });
  });
  Promise.all(promises).then(function(){
    buildViewTabs(views);
    switchView(views[0]);
    buildZones();
    updatePrix();
    showHint();
  });
}

function buildViewTabs(views){
  var tabs=document.getElementById('viewTabs');tabs.innerHTML='';
  if(views.length<2)return;
  views.forEach(function(v){
    var d=document.createElement('div');
    d.className='vtab';d.textContent=v;
    d.onclick=function(){switchView(v);};
    tabs.appendChild(d);
  });
}

function switchView(v){
  activeView=v;
  document.querySelectorAll('.vtab').forEach(function(t){t.classList.toggle('active',t.textContent===v);});
  renderCanvas();
}

// ── CANVAS ──────────────────────────────────────────────────────────────────
function renderCanvas(){
  var im=imgCache[activeView];
  if(!im){document.getElementById('cv').style.display='none';return;}
  document.getElementById('loadingState').style.display='none';
  cv.style.display='block';
  var wrap=document.getElementById('canvasWrap');
  var maxW=wrap.clientWidth-40,maxH=wrap.clientHeight-40;
  scale=Math.min(maxW/im.naturalWidth,maxH/im.naturalHeight);
  var w=Math.round(im.naturalWidth*scale),h=Math.round(im.naturalHeight*scale);
  var dpr=window.devicePixelRatio||1;
  cv.width=w*dpr;cv.height=h*dpr;
  cv.style.width=w+'px';cv.style.height=h+'px';
  ctx=cv.getContext('2d');ctx.scale(dpr,dpr);
  ctx.drawImage(im,0,0,w,h);

  // Dessiner les zones SEULEMENT si active
  var zones=config.zones.filter(function(z){return z.view===activeView;});
  zones.forEach(function(zone,i){
    var globalIdx=config.zones.indexOf(zone);
    var isActive=globalIdx===activeZoneIdx;
    var hasLogo=!!logos[globalIdx];
    if(!zone.pts||zone.pts.length<4)return;

    if(isActive||hasLogo){
      var pts=zone.pts.map(function(p){return{x:p.x*scale,y:p.y*scale};});
      ctx.save();
      // Zone highlight
      if(isActive&&!hasLogo){
        ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
        pts.forEach(function(p){ctx.lineTo(p.x,p.y);});ctx.closePath();
        ctx.fillStyle='rgba(91,61,232,.12)';ctx.fill();
        ctx.strokeStyle='rgba(91,61,232,.6)';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // Logo dans la zone
    if(hasLogo&&logos[globalIdx].imgEl){
      var lg=logos[globalIdx];
      var pts2=zone.pts.map(function(p){return{x:p.x*scale,y:p.y*scale};});
      var zx=pts2[0].x,zy=pts2[0].y,zw=pts2[1].x-pts2[0].x,zh=pts2[3].y-pts2[0].y;
      // Position et taille du logo dans la zone
      if(lg.x===undefined){
        var lAspect=lg.imgEl.naturalWidth/lg.imgEl.naturalHeight;
        var maxW2=zw*.7,maxH2=zh*.7;
        lg.w=Math.min(maxW2,maxH2*lAspect);
        lg.h=lg.w/lAspect;
        lg.x=zx+zw/2-lg.w/2;
        lg.y=zy+zh/2-lg.h/2;
      }
      // Clip à la zone
      ctx.save();
      ctx.beginPath();ctx.rect(zx,zy,zw,zh);ctx.clip();
      ctx.drawImage(lg.imgEl,lg.x,lg.y,lg.w,lg.h);
      // Poignées si actif
      if(globalIdx===activeZoneIdx){
        ctx.strokeStyle='#5b3de8';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
        ctx.strokeRect(lg.x,lg.y,lg.w,lg.h);ctx.setLineDash([]);
        // Poignée resize
        ctx.fillStyle='#5b3de8';ctx.fillRect(lg.x+lg.w-6,lg.y+lg.h-6,10,10);
        // Poignée move
        ctx.fillStyle='rgba(91,61,232,.15)';ctx.fillRect(lg.x,lg.y,lg.w,lg.h);
      }
      ctx.restore();
    }
  });

  bindCanvas();
}

function bindCanvas(){
  cv.onmousedown=function(e){
    var p=cxy(e);
    // Check si on est sur un logo actif (move ou resize)
    if(activeZoneIdx!==null&&logos[activeZoneIdx]){
      var lg=logos[activeZoneIdx];
      // Resize handle
      if(Math.abs(p.x-(lg.x+lg.w))<12&&Math.abs(p.y-(lg.y+lg.h))<12){
        resizing={idx:activeZoneIdx,startX:p.x,startY:p.y,startW:lg.w,startH:lg.h,aspect:lg.w/lg.h};
        return;
      }
      // Move
      if(p.x>lg.x&&p.x<lg.x+lg.w&&p.y>lg.y&&p.y<lg.y+lg.h){
        dragging={idx:activeZoneIdx,offX:p.x-lg.x,offY:p.y-lg.y};
        return;
      }
    }
    // Check clic sur une zone
    var zones=config.zones.filter(function(z){return z.view===activeView;});
    for(var i=0;i<zones.length;i++){
      var zone=zones[i];if(!zone.pts||zone.pts.length<4)continue;
      var globalIdx=config.zones.indexOf(zone);
      var pts=zone.pts.map(function(pt){return{x:pt.x*scale,y:pt.y*scale};});
      var zx=pts[0].x,zy=pts[0].y,zw=pts[1].x-pts[0].x,zh=pts[3].y-pts[0].y;
      if(p.x>=zx&&p.x<=zx+zw&&p.y>=zy&&p.y<=zy+zh){
        selectZone(globalIdx);return;
      }
    }
  };
  cv.onmousemove=function(e){
    var p=cxy(e);
    if(dragging){
      var lg=logos[dragging.idx];
      var zone=config.zones[dragging.idx];
      var pts=zone.pts.map(function(pt){return{x:pt.x*scale,y:pt.y*scale};});
      var zx=pts[0].x,zy=pts[0].y,zw=pts[1].x-pts[0].x,zh=pts[3].y-pts[0].y;
      lg.x=Math.max(zx,Math.min(zx+zw-lg.w,p.x-dragging.offX));
      lg.y=Math.max(zy,Math.min(zy+zh-lg.h,p.y-dragging.offY));
      renderCanvas();return;
    }
    if(resizing){
      var lg=logos[resizing.idx];
      var dx=p.x-resizing.startX;
      lg.w=Math.max(20,resizing.startW+dx);
      lg.h=lg.w/resizing.aspect;
      renderCanvas();return;
    }
    // Curseur
    if(activeZoneIdx!==null&&logos[activeZoneIdx]){
      var lg=logos[activeZoneIdx];
      if(Math.abs(p.x-(lg.x+lg.w))<12&&Math.abs(p.y-(lg.y+lg.h))<12){cv.style.cursor='se-resize';return;}
      if(p.x>lg.x&&p.x<lg.x+lg.w&&p.y>lg.y&&p.y<lg.y+lg.h){cv.style.cursor='move';return;}
    }
    cv.style.cursor='default';
  };
  cv.onmouseup=function(){dragging=null;resizing=null;};
}

function cxy(e){
  var r=cv.getBoundingClientRect();
  return{x:e.clientX-r.left,y:e.clientY-r.top};
}

// ── ZONES ──────────────────────────────────────────────────────────────────
function buildZones(){
  var grid=document.getElementById('zonesGrid');grid.innerHTML='';
  config.zones.forEach(function(zone,i){
    var div=document.createElement('div');
    div.className='zone-btn';div.id='zb-'+i;
    div.innerHTML=
      '<div class="zb-dot" style="background:'+zoneColor(i)+'"></div>'
      +'<div class="zb-info"><div class="zb-name">'+esc(zone.name||'Zone '+(i+1))+'</div>'
      +'<div class="zb-sub">'+esc(zone.view||'')+(zone.maxMm?' · max '+zone.maxMm+'mm':'')+'</div></div>'
      +'<div class="zb-check" id="zcheck-'+i+'"></div>';
    div.onclick=function(){selectZone(i);};
    grid.appendChild(div);
  });
}

function selectZone(idx){
  activeZoneIdx=idx;
  var zone=config.zones[idx];
  // Switch view si besoin
  if(zone.view!==activeView) switchView(zone.view);
  // Update UI zones
  document.querySelectorAll('.zone-btn').forEach(function(b,i){
    b.classList.toggle('active',i===idx);
    b.classList.toggle('has-logo',!!logos[i]);
  });
  // Upload section
  document.getElementById('uploadSection').style.display='block';
  document.getElementById('uploadTitle').textContent='Logo — '+esc(zone.name||'Zone '+(idx+1));
  var fmts=zone.accepted_formats&&zone.accepted_formats.length?zone.accepted_formats.join(', '):'Tous formats';
  document.getElementById('fmtHint').textContent=fmts;
  // Techniques
  if(zone.techniques&&zone.techniques.length>1){
    document.getElementById('techSection').style.display='block';
    buildTechs(idx,zone);
  } else {
    document.getElementById('techSection').style.display='none';
    if(zone.techniques&&zone.techniques.length===1) activeTech[idx]=zone.techniques[0];
  }
  // Logo preview
  updateLogoPreview(idx);
  renderCanvas();
  updateCTA();
  hideHint();
}

function buildTechs(idx,zone){
  var list=document.getElementById('techList');list.innerHTML='';
  var TECHNAMES={seri_auto:'Sérigraphie auto',seri_manuelle:'Sérigraphie manuelle',transfert_seri:'Transfert sérigraphique',transfert_num:'Transfert numérique',broderie:'Broderie',gravure_laser:'Gravure laser',tampon:'Tampographie',sublimation:'Sublimation'};
  zone.techniques.forEach(function(tid){
    var nc=zone.techColors&&zone.techColors[tid];
    var div=document.createElement('div');
    div.className='tech-opt'+(activeTech[idx]===tid?' active':'');
    div.innerHTML='<input type="radio" name="tech'+idx+'">'
      +'<div class="tech-name">'+(TECHNAMES[tid]||tid)+'</div>'
      +'<div class="tech-colors">'+(nc?nc+' coul. max':'Fullcolor')+'</div>';
    div.onclick=function(){activeTech[idx]=tid;buildTechs(idx,zone);updatePrix();};
    list.appendChild(div);
  });
}

// ── LOGO ──────────────────────────────────────────────────────────────────────
function onLogoUpload(input){
  if(!input.files[0]||activeZoneIdx===null)return;
  var file=input.files[0];
  var r=new FileReader();
  r.onload=function(e){
    var b64=e.target.result;
    var im=new Image();
    im.onload=function(){
      logos[activeZoneIdx]={file:file,b64:b64,imgEl:im,x:undefined};
      updateLogoPreview(activeZoneIdx);
      document.querySelectorAll('.zone-btn')[activeZoneIdx].classList.add('has-logo');
      document.getElementById('zcheck-'+activeZoneIdx).textContent='✓';
      renderCanvas();updateCTA();updatePrix();
    };
    im.src=b64;
  };
  r.readAsDataURL(file);
}

function updateLogoPreview(idx){
  var lg=logos[idx];
  var zone=document.getElementById('uploadZone');
  var prev=document.getElementById('logoPreview');
  if(lg){
    zone.classList.add('has-file');
    zone.querySelector('.up-ico').textContent='✅';
    zone.querySelector('.up-txt').textContent='Logo chargé';
    document.getElementById('logoPrevName').textContent=lg.file.name;
    prev.style.display='flex';
  } else {
    zone.classList.remove('has-file');
    zone.querySelector('.up-ico').textContent='📁';
    zone.querySelector('.up-txt').textContent='Clique pour uploader ton logo';
    prev.style.display='none';
  }
}

function removeLogo(){
  if(activeZoneIdx===null)return;
  delete logos[activeZoneIdx];
  updateLogoPreview(activeZoneIdx);
  document.querySelectorAll('.zone-btn')[activeZoneIdx].classList.remove('has-logo');
  document.getElementById('zcheck-'+activeZoneIdx).textContent='';
  renderCanvas();updateCTA();updatePrix();
}

// ── QUANTITÉ ──────────────────────────────────────────────────────────────────
function changeQty(d){setQty(Math.max(1,qty+d));}
function onQtyChange(){setQty(parseInt(document.getElementById('qtyInp').value)||1);}
function setQty(n){
  qty=Math.max(1,n);
  document.getElementById('qtyInp').value=qty;
  document.getElementById('pQty').textContent=qty;
  document.querySelectorAll('.qp').forEach(function(el){
    el.classList.toggle('active',parseInt(el.textContent)===qty);
  });
  updatePrix();
}

// ── PRIX ──────────────────────────────────────────────────────────────────────
function updatePrix(){
  // Prix produit Makito (base fictive, sera remplacé par scraping)
  var pBase=config.product&&config.product.pricing&&config.product.pricing.base||0;
  // Pour l'instant on affiche juste les lignes sans montant si pas de prix
  var nZones=Object.keys(logos).length||1;
  var cliche=30*nZones;
  var marquage=getPrixMarquage();
  var total=pBase>0?(pBase+marquage+cliche/qty)*MARGIN:null;

  document.getElementById('pProduit').textContent=pBase>0?fmt(pBase*qty)+'€':'—';
  document.getElementById('pMarquage').textContent=marquage>0?fmt(marquage*qty)+'€':'—';
  document.getElementById('pCliche').textContent=fmt(cliche)+'€';
  document.getElementById('pTotal').textContent=total?fmt(total)+'€/u':'—';
}

function getPrixMarquage(){
  // Grille dégrade par palier (sera remplacée par les vrais prix Makito)
  var paliers=[[50,0.65],[100,0.56],[250,0.48],[500,0.415],[1000,0.35]];
  var prix=paliers[0][1];
  for(var i=0;i<paliers.length;i++){if(qty>=paliers[i][0])prix=paliers[i][1];}
  return prix;
}

function fmt(n){return n.toFixed(2).replace('.',',');}

// ── CTA ──────────────────────────────────────────────────────────────────────
function updateCTA(){
  var btn=document.getElementById('btnCart');
  var hasLogos=Object.keys(logos).length>0;
  btn.disabled=!hasLogos;
  btn.textContent=hasLogos?'Ajouter au panier':'Uploader un logo pour continuer';
}

function addToCart(){
  // TODO : intégration Shopify
  alert('Intégration Shopify à brancher !');
}

// ── HINT ─────────────────────────────────────────────────────────────────────
function showHint(){
  var h=document.getElementById('zoneHint');h.classList.add('show');
  setTimeout(function(){h.classList.remove('show');},3000);
}
function hideHint(){document.getElementById('zoneHint').classList.remove('show');}

// ── UTILS ─────────────────────────────────────────────────────────────────────
var COLORS=['#5b3de8','#e03e3e','#f97316','#1d9e5c','#0ea5e9','#a855f7'];
function zoneColor(i){return COLORS[i%COLORS.length];}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

init();
</script>
</body>
</html>
`;
app.get('/configurateur', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(CONFIGURATEUR_HTML);
});

app.get('/', (req, res) => res.json({ status: 'GOODS API OK' }));

app.post('/products', async (req, res) => {
  try {
    const { sku, name, config, margin } = req.body;
    if (!sku) return res.status(400).json({ error: 'SKU manquant' });
    await pool.query(`
      INSERT INTO products (sku, name, config, margin, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        config = EXCLUDED.config,
        margin = EXCLUDED.margin,
        updated_at = NOW()
    `, [sku, name || '', config || {}, margin || 2.5]);
    res.json({ ok: true, sku });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/products/:sku', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE sku = $1', [req.params.sku]);
    if (!rows.length) return res.status(404).json({ error: 'Produit non trouve' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT sku, name, margin, updated_at FROM products ORDER BY updated_at DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/products/:sku', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE sku = $1', [req.params.sku]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('GOODS API sur port ' + PORT));
