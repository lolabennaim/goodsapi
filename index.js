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

const CONFIGURATEUR_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GOODS — Configurateur</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.min.js"></script>
<script>
  if(window.pdfjsLib){
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js';
  }
</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#fff;color:#1a1a1a;font-size:14px;-webkit-font-smoothing:antialiased}

.page{display:flex;min-height:100vh}
.col-img{flex:1;background:#f8f7f5;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;position:sticky;top:0;height:100vh}
.col-form{width:480px;flex-shrink:0;padding:40px 40px 60px;overflow-y:auto;border-left:1px solid #ebebeb}

/* IMAGE */
.img-wrap{position:relative;width:100%;max-width:480px;aspect-ratio:1;border-radius:16px;overflow:hidden;background:#ede9e3;display:flex;align-items:center;justify-content:center}
.img-wrap canvas{display:block;border-radius:16px;cursor:default}
.img-placeholder{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#bbb}
.img-placeholder span{font-size:13px}
.loading-overlay{position:absolute;inset:0;background:rgba(255,255,255,.75);display:flex;align-items:center;justify-content:center;z-index:10;border-radius:16px}
.sp{width:28px;height:28px;border:3px solid #eee;border-top-color:#1a1a1a;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.img-thumbs{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center}
.img-thumb{width:58px;height:58px;border-radius:10px;overflow:hidden;cursor:pointer;border:2px solid transparent;background:#ede9e3;flex-shrink:0;transition:border-color .12s}
.img-thumb img{width:100%;height:100%;object-fit:cover}
.img-thumb.active{border-color:#1a1a1a}

/* FORM HEADER */
.prod-name{font-size:22px;font-weight:700;margin-bottom:3px;line-height:1.25}
.prod-ref{font-size:12px;color:#999;margin-bottom:4px}
.prod-price{font-size:14px;font-weight:500;color:#555;margin-bottom:28px}

/* STEPS */
.step{border-bottom:1px solid #f0f0f0}
.step:last-of-type{border-bottom:none}
.step-hdr{display:flex;align-items:center;gap:10px;padding:16px 0;cursor:pointer;user-select:none}
.step-num{width:22px;height:22px;border-radius:50%;background:#1a1a1a;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .2s}
.step-num.done{background:#22c55e}
.step-title{font-size:13px;font-weight:600;flex:1}
.step-summary{font-size:12px;color:#22c55e;font-weight:500;max-width:140px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.step-body{display:none;padding-bottom:18px}
.step-body.open{display:block}

/* UPLOAD */
.upload-drop{border:2px dashed #d8d8d8;border-radius:12px;padding:26px 20px;text-align:center;cursor:pointer;transition:all .15s;background:#fafafa;position:relative;overflow:hidden}
.upload-drop:hover,.upload-drop.drag{border-color:#1a1a1a;background:#f5f5f5}
.upload-drop.has-file{border-color:#22c55e;border-style:solid;background:#f0fdf4}
.upload-drop input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;z-index:5;width:100%;height:100%}
.up-icon{font-size:30px;margin-bottom:6px}
.up-title{font-size:13px;font-weight:600}
.up-sub{font-size:11px;color:#aaa;margin-top:3px}
.file-row{display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;background:#fff;border-radius:10px;border:1px solid #e8e8e8}
.file-thumb{width:36px;height:36px;border-radius:7px;background:#f0ede8;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:16px}
.file-thumb img{width:100%;height:100%;object-fit:contain}
.file-name{flex:1;font-size:12px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-del{border:none;background:none;cursor:pointer;color:#ccc;font-size:17px;padding:0;line-height:1;transition:color .1s}
.file-del:hover{color:#e03e3e}

/* ZONES */
.zones-hint{font-size:12px;color:#999;margin-bottom:10px}
.zones-list{display:flex;flex-direction:column;gap:5px}
.zone-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:1.5px solid #ebebeb;cursor:pointer;transition:all .12s;background:#fff}
.zone-item:hover{border-color:#c4b5fd}
.zone-item.selected{border-color:#5b3de8;background:#faf8ff}
.zone-item.selected.has-logo{border-color:#22c55e;background:#f0fdf4}
.zone-dot{width:9px;height:9px;border-radius:2px;flex-shrink:0}
.zone-label{flex:1}
.zone-name{font-size:13px;font-weight:600}
.zone-sub{font-size:11px;color:#aaa;margin-top:1px}
.zone-ck{font-size:14px;color:#22c55e;font-weight:700}

/* TECHNIQUES */
.tech-list{display:flex;flex-direction:column;gap:5px}
.tech-pill{display:flex;align-items:center;padding:11px 14px;border-radius:10px;border:1.5px solid #ebebeb;cursor:pointer;transition:all .12s;background:#fff;gap:12px}
.tech-pill:hover{border-color:#c4b5fd}
.tech-pill.active{border-color:#5b3de8;background:#faf8ff}
.tech-left{flex:1}
.tech-name{font-size:13px;font-weight:600}
.tech-desc{font-size:11px;color:#aaa;margin-top:2px}
.tech-price{font-size:13px;font-weight:700;color:#22c55e;white-space:nowrap}

/* QTÉ */
.qty-row{display:flex;align-items:center;gap:0;border:1.5px solid #ebebeb;border-radius:10px;overflow:hidden;width:fit-content;margin-bottom:12px}
.qty-btn{width:38px;height:38px;border:none;background:#f9f9f9;cursor:pointer;font-size:17px;font-weight:500;color:#1a1a1a;transition:background .1s}
.qty-btn:hover{background:#f0f0f0}
.qty-val{width:64px;height:38px;border:none;text-align:center;font-size:15px;font-weight:700;font-family:'Inter',sans-serif;outline:none}
.qty-paliers{display:flex;gap:5px;flex-wrap:wrap}
.qp{padding:4px 11px;border-radius:20px;border:1.5px solid #ebebeb;font-size:11px;font-weight:600;cursor:pointer;color:#999;transition:all .1s}
.qp:hover,.qp.active{border-color:#1a1a1a;color:#1a1a1a;background:#f5f5f5}

/* PRIX */
.prix-box{background:#f8f7f5;border-radius:12px;padding:16px;margin:20px 0}
.prix-line{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}
.prix-line .lbl{color:#999}
.prix-line .val{font-weight:500;color:#555}
.prix-sep{height:1px;background:#ebebeb;margin:10px 0}
.prix-total{display:flex;justify-content:space-between;align-items:center}
.prix-total-lbl{font-size:14px;font-weight:600}
.prix-total-val{font-size:26px;font-weight:700;color:#1a1a1a}
.prix-total-sub{font-size:11px;color:#aaa;text-align:right;margin-top:1px}

/* CTA */
.btn-cart{width:100%;padding:15px;border-radius:12px;border:none;background:#1a1a1a;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s;letter-spacing:.01em}
.btn-cart:hover:not(:disabled){background:#333;transform:translateY(-1px)}
.btn-cart:disabled{background:#e0e0e0;color:#aaa;cursor:not-allowed;transform:none}

@media(max-width:860px){
  .page{flex-direction:column}
  .col-img{position:relative;height:auto;padding:20px;min-height:280px}
  .col-form{width:100%;padding:24px 20px 48px;border-left:none;border-top:1px solid #ebebeb}
}
</style>
</head>
<body>
<div class="page">

  <!-- IMAGE -->
  <div class="col-img">
    <div style="width:100%;max-width:480px">
      <div class="img-wrap" id="imgWrap">
        <div class="img-placeholder" id="imgPlaceholder">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
          <span>Chargement…</span>
        </div>
        <canvas id="cv" style="display:none;position:absolute;inset:0;pointer-events:auto;z-index:2"></canvas>
        <div class="loading-overlay" id="loadingOverlay" style="display:none"><div class="sp"></div></div>
      </div>
      <div class="img-thumbs" id="imgThumbs"></div>
    </div>
  </div>

  <!-- FORM -->
  <div class="col-form">
    <div class="prod-name" id="prodName">—</div>
    <div class="prod-ref" id="prodRef">—</div>
    <div class="prod-price" id="prodPrice"></div>

    <!-- ÉTAPE 1 : UPLOAD -->
    <div class="step">
      <div class="step-hdr" onclick="toggleStep(1)">
        <div class="step-num" id="snum1">1</div>
        <div class="step-title">Uploader mon logo</div>
        <div class="step-summary" id="ssum1"></div>
      </div>
      <div class="step-body open" id="sbody1">
        <div class="upload-drop" id="uploadDrop">
          <input type="file" accept=".pdf,.ai,application/pdf" id="logoInput" onchange="onLogoUpload(this)">
          <div class="up-icon" id="upIcon">📁</div>
          <div class="up-title" id="upTitle">Clique pour uploader ton logo</div>
          <div class="up-sub">PDF ou AI vectorisé uniquement</div>
        </div>
        <div id="fileRow" style="display:none">
          <div class="file-row">
            <div class="file-thumb" id="fileThumb">📄</div>
            <div class="file-name" id="fileName"></div>
            <button class="file-del" onclick="removeAllLogos()">✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ÉTAPE 2 : ZONES -->
    <div class="step">
      <div class="step-hdr" onclick="toggleStep(2)">
        <div class="step-num" id="snum2">2</div>
        <div class="step-title">Zone(s) de marquage</div>
        <div class="step-summary" id="ssum2"></div>
      </div>
      <div class="step-body" id="sbody2">
        <div class="zones-hint">Plusieurs zones possibles — le logo s'applique sur chacune.</div>
        <div class="zones-list" id="zonesList"></div>
      </div>
    </div>

    <!-- ÉTAPE 3 : TECHNIQUE -->
    <div class="step">
      <div class="step-hdr" onclick="toggleStep(3)">
        <div class="step-num" id="snum3">3</div>
        <div class="step-title">Technique de marquage</div>
        <div class="step-summary" id="ssum3"></div>
      </div>
      <div class="step-body" id="sbody3">
        <div class="tech-list" id="techList"></div>
      </div>
    </div>

    <!-- ÉTAPE 4 : QUANTITÉ -->
    <div class="step">
      <div class="step-hdr" onclick="toggleStep(4)">
        <div class="step-num" id="snum4">4</div>
        <div class="step-title">Quantité</div>
        <div class="step-summary" id="ssum4"></div>
      </div>
      <div class="step-body" id="sbody4">
        <div class="qty-row">
          <button class="qty-btn" onclick="changeQty(-10)">−</button>
          <input class="qty-val" type="number" id="qtyInp" value="100" min="1" onchange="onQtyChange()">
          <button class="qty-btn" onclick="changeQty(10)">＋</button>
        </div>
        <div class="qty-paliers">
          <div class="qp" onclick="setQty(50)">50</div>
          <div class="qp active" onclick="setQty(100)">100</div>
          <div class="qp" onclick="setQty(250)">250</div>
          <div class="qp" onclick="setQty(500)">500</div>
          <div class="qp" onclick="setQty(1000)">1000</div>
        </div>
      </div>
    </div>

    <!-- PRIX -->
    <div class="prix-box">
      <div class="prix-line"><span class="lbl">Produit × <span id="pQty">100</span></span><span class="val" id="pProduit">—</span></div>
      <div class="prix-line"><span class="lbl">Marquage</span><span class="val" id="pMarquage">—</span></div>
      <div class="prix-line"><span class="lbl">Cliché</span><span class="val" id="pCliche">—</span></div>
      <div class="prix-sep"></div>
      <div class="prix-total">
        <div class="prix-total-lbl">Prix unitaire</div>
        <div style="text-align:right">
          <div class="prix-total-val" id="pTotal">—</div>
          <div class="prix-total-sub">TTC · hors livraison</div>
        </div>
      </div>
    </div>

    <button class="btn-cart" id="btnCart" disabled onclick="addToCart()">
      Uploader un logo pour continuer
    </button>
  </div>
</div>

<script>
var API_URL='https://goodsapi-production.up.railway.app';
var MARGIN=2.5;
var config=null;
var sharedLogo=null;
var logos={};
var selectedZones={};
var activeTech=null;
var activeView=null;
var activeZoneIdx=null;
var qty=100;
var scale=1;
var cv=document.getElementById('cv');
var ctx=null;
var imgCache={};
var dragging=null,resizing=null;
var HANDLE=14;
var COLORS=['#5b3de8','#e03e3e','#f97316','#1d9e5c','#0ea5e9','#a855f7'];
var TECHNAMES={seri_auto:'Sérigraphie auto',seri_manuelle:'Sérigraphie manuelle',transfert_seri:'Transfert sérigraphique',transfert_num:'Transfert numérique',broderie:'Broderie',gravure_laser:'Gravure laser',tampon:'Tampographie',sublimation:'Sublimation'};
var TECHDESCS={seri_auto:'Idéal 1–6 couleurs, grands volumes',seri_manuelle:'Rendu premium, petites séries',transfert_seri:'Qualité photo, tous supports',transfert_num:'Fullcolor sans limite',broderie:'Relief et durabilité',gravure_laser:'Précision métal / cuir',tampon:'Petites surfaces rondes',sublimation:'Fullcolor polyester'};
var PRIX_TECH={seri_auto:1.0,seri_manuelle:1.8,transfert_seri:1.2,transfert_num:1.5,broderie:2.0,gravure_laser:1.4,tampon:0.8,sublimation:1.3};

// ── INIT ─────────────────────────────────────────────────────────────────────
async function init(){
  var sku=new URLSearchParams(window.location.search).get('sku');
  if(!sku){var l=localStorage.getItem('goods_config');if(l){config=JSON.parse(l);setup();}else showErr('Aucun produit');return;}
  try{
    var res=await fetch(API_URL+'/products/'+sku);
    if(!res.ok)throw 0;
    var d=await res.json();config=d.config;MARGIN=d.margin||2.5;setup();
  }catch(e){
    var l=localStorage.getItem('goods_config');if(l){config=JSON.parse(l);setup();}else showErr('Produit introuvable');
  }
}

function showErr(m){document.getElementById('imgPlaceholder').innerHTML='<span style="color:#e03e3e;font-size:13px">⚠️ '+esc(m)+'</span>';}

function setup(){
  if(!config||!config.zones||!config.zones.length){showErr('Aucune zone configurée');return;}
  document.getElementById('prodName').textContent=config.product&&config.product.name||'Produit';
  document.getElementById('prodRef').textContent='Réf. '+(config.product&&config.product.sku||'—');
  var pBase=config.product&&config.product.pricing&&config.product.pricing.base;
  if(pBase)document.getElementById('prodPrice').textContent='À partir de '+fmt(pBase)+' €/unité';

  var views=[...new Set(config.zones.map(function(z){return z.view;}))];
  var proms=views.map(function(v){
    var b64=config.viewImgs&&config.viewImgs[v];
    if(!b64)return Promise.resolve();
    return new Promise(function(r){var im=new Image();im.onload=function(){imgCache[v]=im;r();};im.src=b64;});
  });
  Promise.all(proms).then(function(){
    buildThumbs(views);
    switchView(views[0]);
    buildZones();
    buildTechs();
    updatePrix();
    bindCanvas();
  });
}

// ── VUES ─────────────────────────────────────────────────────────────────────
function buildThumbs(views){
  var w=document.getElementById('imgThumbs');w.innerHTML='';
  if(views.length<2)return;
  views.forEach(function(v){
    var d=document.createElement('div');d.className='img-thumb';d.dataset.view=v;
    var im=imgCache[v];
    if(im){var i=document.createElement('img');i.src=im.src;d.appendChild(i);}
    else d.textContent=v.charAt(0);
    d.onclick=function(){switchView(v);};
    w.appendChild(d);
  });
  updateThumbActive();
}
function switchView(v){activeView=v;updateThumbActive();sizeCanvas();renderCanvas();}
function updateThumbActive(){
  document.querySelectorAll('.img-thumb').forEach(function(t){t.classList.toggle('active',t.dataset.view===activeView);});
}

// ── CANVAS ───────────────────────────────────────────────────────────────────
function sizeCanvas(){
  var im=imgCache[activeView];
  if(!im)return;
  var wrap=document.getElementById('imgWrap');
  var maxW=wrap.clientWidth||400,maxH=wrap.clientHeight||400;
  scale=Math.min(maxW/im.naturalWidth,maxH/im.naturalHeight);
  var w=Math.round(im.naturalWidth*scale),h=Math.round(im.naturalHeight*scale);
  var dpr=window.devicePixelRatio||1;
  if(cv.width!==w*dpr||cv.height!==h*dpr){
    cv.width=w*dpr;cv.height=h*dpr;
    cv.style.width=w+'px';cv.style.height=h+'px';
  }
  ctx=cv.getContext('2d');
}

function renderCanvas(){
  var im=imgCache[activeView];
  if(!im){cv.style.display='none';document.getElementById('imgPlaceholder').style.display='flex';return;}
  document.getElementById('imgPlaceholder').style.display='none';
  cv.style.display='block';
  sizeCanvas();
  var dpr=window.devicePixelRatio||1;
  var w=cv.width/dpr, h=cv.height/dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.drawImage(im,0,0,w,h);

  config.zones.forEach(function(zone,idx){
    if(zone.view!==activeView||!zone.pts||zone.pts.length<4)return;
    var pts=zone.pts.map(function(p){return{x:p.x*scale,y:p.y*scale};});
    var zx=pts[0].x,zy=pts[0].y,zw=pts[1].x-pts[0].x,zh=pts[3].y-pts[0].y;
    var isSel=!!selectedZones[idx];
    var hasLogo=logos[idx]&&logos[idx].imgEl;

    if(isSel&&!hasLogo){
      ctx.save();
      ctx.beginPath();ctx.rect(zx,zy,zw,zh);
      ctx.fillStyle='rgba(91,61,232,.1)';ctx.fill();
      ctx.strokeStyle='rgba(91,61,232,.6)';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
      ctx.restore();
    }

    if(hasLogo){
      var lg=logos[idx];
      if(lg.rw===undefined){
        if(lg.imgEl.complete&&lg.imgEl.naturalWidth>0){
          initLogoPos(idx,zx,zy,zw,zh);
        } else {
          lg.imgEl.onload=function(){initLogoPos(idx,zx,zy,zw,zh);renderCanvas();};
        }
      }
      if(lg.rw===undefined)return; // pas encore prêt
      var lx=zx+lg.rx*zw,ly=zy+lg.ry*zh,lw=lg.rw*zw,lh=lg.rh*zh;
      lg.x=lx;lg.y=ly;lg.w=lw;lg.h=lh;
      lg._zx=zx;lg._zy=zy;lg._zw=zw;lg._zh=zh;
      ctx.save();
      ctx.beginPath();ctx.rect(zx,zy,zw,zh);ctx.clip();
      ctx.drawImage(lg.imgEl,lx,ly,lw,lh);
      if(idx===activeZoneIdx){
        ctx.strokeStyle='#5b3de8';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);
        ctx.strokeRect(lx,ly,lw,lh);ctx.setLineDash([]);
        ctx.fillStyle='rgba(91,61,232,.08)';ctx.fillRect(lx,ly,lw,lh);
        ctx.fillStyle='rgba(91,61,232,.85)';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('✥',lx+lw/2,ly+lh/2);
        ctx.fillStyle='#5b3de8';ctx.beginPath();ctx.roundRect(lx+lw-HANDLE/2,ly+lh-HANDLE/2,HANDLE,HANDLE,3);ctx.fill();
        ctx.fillStyle='#fff';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('⤡',lx+lw,ly+lh);
      }
      ctx.restore();
    }
  });
}

function initLogoPos(idx,zx,zy,zw,zh){
  var lg=logos[idx];if(!lg||!lg.imgEl)return;
  var natW=lg.imgEl.naturalWidth||200;
  var natH=lg.imgEl.naturalHeight||200;
  var aspect=natW/natH; // <1 = portrait, >1 = paysage, =1 = carré
  var pw,ph;
  if(aspect>=1){
    // Paysage/carré : contraindre par largeur
    pw=zw*0.70; ph=pw/aspect;
    if(ph>zh*0.70){ph=zh*0.70; pw=ph*aspect;}
  } else {
    // Portrait : contraindre par hauteur
    ph=zh*0.70; pw=ph*aspect;
    if(pw>zw*0.70){pw=zw*0.70; ph=pw/aspect;}
  }
  pw=Math.min(pw,zw); ph=Math.min(ph,zh);
  lg.rw=pw/zw; lg.rh=ph/zh;
  lg.rx=(1-lg.rw)/2; lg.ry=(1-lg.rh)/2;
}

// ── BIND CANVAS ──────────────────────────────────────────────────────────────
function bindCanvas(){
  if(cv._unbind)cv._unbind();

  // coords écran → coords de dessin CSS (même repère que scale)
  function pt(e){
    var r=cv.getBoundingClientRect();
    var cx=e.touches?e.touches[0].clientX:e.clientX;
    var cy=e.touches?e.touches[0].clientY:e.clientY;
    var cssW=parseFloat(cv.style.width)||r.width;
    var cssH=parseFloat(cv.style.height)||r.height;
    return{x:(cx-r.left)/r.width*cssW, y:(cy-r.top)/r.height*cssH};
  }

  function getZ(zone){
    var pts=zone.pts.map(function(pp){return{x:pp.x*scale,y:pp.y*scale};});
    return{zx:pts[0].x,zy:pts[0].y,zw:pts[1].x-pts[0].x,zh:pts[3].y-pts[0].y};
  }

  function onDown(e){
    e.preventDefault();
    var p=pt(e);
    if(!config)return;
    var zv=config.zones.filter(function(z){return z.view===activeView;});
    for(var i=0;i<zv.length;i++){
      var lidx=config.zones.indexOf(zv[i]);
      var lg=logos[lidx];
      if(!lg||lg.rx===undefined||lg.rw===undefined)continue;
      var z=getZ(zv[i]);
      var lx=z.zx+lg.rx*z.zw, ly=z.zy+lg.ry*z.zh;
      var lw=lg.rw*z.zw, lh=lg.rh*z.zh;
      if(Math.abs(p.x-(lx+lw))<HANDLE&&Math.abs(p.y-(ly+lh))<HANDLE){
        activeZoneIdx=lidx;
        resizing={idx:lidx,startX:p.x,startW:lw,aspect:lw/(lh||1),zw:z.zw,zh:z.zh};
        renderCanvas();return;
      }
      if(p.x>=lx&&p.x<=lx+lw&&p.y>=ly&&p.y<=ly+lh){
        activeZoneIdx=lidx;
        dragging={idx:lidx,offX:p.x-lx,offY:p.y-ly,zx:z.zx,zy:z.zy,zw:z.zw,zh:z.zh,lw:lw,lh:lh};
        renderCanvas();return;
      }
    }
  }

  function onMove(e){
    if(!dragging&&!resizing)return;
    e.preventDefault();
    var p=pt(e);
    if(dragging){
      var lg=logos[dragging.idx];
      var nx=Math.max(dragging.zx,Math.min(dragging.zx+dragging.zw-dragging.lw,p.x-dragging.offX));
      var ny=Math.max(dragging.zy,Math.min(dragging.zy+dragging.zh-dragging.lh,p.y-dragging.offY));
      lg.rx=(nx-dragging.zx)/dragging.zw;
      lg.ry=(ny-dragging.zy)/dragging.zh;
      renderCanvas();return;
    }
    if(resizing){
      var lg=logos[resizing.idx];
      var nw=Math.max(8,Math.min(resizing.zw,resizing.startW+(p.x-resizing.startX)));
      lg.rw=nw/resizing.zw;
      lg.rh=(nw/resizing.aspect)/resizing.zh;
      renderCanvas();return;
    }
  }

  function onUp(){dragging=null;resizing=null;}

  function onHover(e){
    if(dragging||resizing)return;
    var p=pt(e);
    var found=false;
    if(config){
      var zv=config.zones.filter(function(z){return z.view===activeView;});
      for(var i=0;i<zv.length;i++){
        var lidx=config.zones.indexOf(zv[i]);
        var lg=logos[lidx];if(!lg||lg.rx===undefined)continue;
        var z=getZ(zv[i]);
        var lx=z.zx+lg.rx*z.zw,ly=z.zy+lg.ry*z.zh,lw=lg.rw*z.zw,lh=lg.rh*z.zh;
        if(Math.abs(p.x-(lx+lw))<HANDLE&&Math.abs(p.y-(ly+lh))<HANDLE){cv.style.cursor='se-resize';found=true;break;}
        if(p.x>=lx&&p.x<=lx+lw&&p.y>=ly&&p.y<=ly+lh){cv.style.cursor='grab';found=true;break;}
      }
    }
    if(!found)cv.style.cursor='default';
  }

  cv.addEventListener('mousedown',onDown);
  cv.addEventListener('mousemove',onHover);
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
  cv.addEventListener('touchstart',onDown,{passive:false});
  document.addEventListener('touchmove',onMove,{passive:false});
  document.addEventListener('touchend',onUp);

  cv._unbind=function(){
    cv.removeEventListener('mousedown',onDown);
    cv.removeEventListener('mousemove',onHover);
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    cv.removeEventListener('touchstart',onDown);
    document.removeEventListener('touchmove',onMove);
    document.removeEventListener('touchend',onUp);
  };
}


// ── UPLOAD ───────────────────────────────────────────────────────────────────
function onLogoUpload(input){
  if(!input.files[0])return;
  var file=input.files[0];var name=file.name.toLowerCase();
  var isPDF=name.endsWith('.pdf')||file.type==='application/pdf';
  var isAI=name.endsWith('.ai');
  if(!isPDF&&!isAI){alert('PDF ou AI vectorisé uniquement.');input.value='';return;}
  document.getElementById('loadingOverlay').style.display='flex';
  var r=new FileReader();
  r.onload=function(e){
    var b64=e.target.result;input.value='';
    if(isAI){onLogoReady(file,b64,makePlaceholder('AI'));return;}
    if(window.pdfjsLib&&window.pdfjsLib.getDocument){doRenderPDF(file,b64);}
    else onLogoReady(file,b64,makePlaceholder('PDF'));
  };
  r.readAsDataURL(file);
}

function doRenderPDF(file,b64){
  var raw=atob(b64.split(',')[1]);
  var arr=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
  window.pdfjsLib.getDocument({data:arr}).promise
    .then(function(pdf){return pdf.getPage(1);})
    .then(function(page){
      var vp=page.getViewport({scale:2});
      var oc=document.createElement('canvas');oc.width=vp.width;oc.height=vp.height;
      return page.render({canvasContext:oc.getContext('2d'),viewport:vp}).promise.then(function(){return oc.toDataURL('image/png');});
    })
    .then(function(dataURL){var im=new Image();im.onload=function(){onLogoReady(file,b64,im);};im.src=dataURL;})
    .catch(function(){onLogoReady(file,b64,makePlaceholder('PDF'));});
}

function onLogoReady(file,b64,imgEl){
  sharedLogo={file:file,b64:b64,imgEl:imgEl};
  document.getElementById('loadingOverlay').style.display='none';
  // Appliquer à toutes zones déjà sélectionnées
  Object.keys(selectedZones).forEach(function(idx){applyLogoToZone(parseInt(idx));});
  // UI
  var drop=document.getElementById('uploadDrop');
  drop.classList.add('has-file');
  document.getElementById('upIcon').textContent='✅';
  document.getElementById('upTitle').textContent='Logo chargé';
  document.getElementById('fileName').textContent=file.name;
  var thumb=document.getElementById('fileThumb');
  if(imgEl.src){var ti=document.createElement('img');ti.src=imgEl.src;thumb.innerHTML='';thumb.appendChild(ti);}
  document.getElementById('fileRow').style.display='block';
  markStepDone(1,file.name);
  openStep(2);
  renderCanvas();updateCTA();updatePrix();
}

function applyLogoToZone(idx){
  if(!sharedLogo)return;
  logos[idx]={file:sharedLogo.file,b64:sharedLogo.b64,imgEl:sharedLogo.imgEl,rw:undefined,rx:undefined,ry:undefined,rh:undefined};
}

function removeAllLogos(){
  sharedLogo=null;logos={};
  document.getElementById('uploadDrop').classList.remove('has-file');
  document.getElementById('upIcon').textContent='📁';
  document.getElementById('upTitle').textContent='Clique pour uploader ton logo';
  document.getElementById('fileRow').style.display='none';
  document.getElementById('fileThumb').innerHTML='📄';
  unmarkStep(1);buildZones();renderCanvas();updateCTA();updatePrix();
}

function makePlaceholder(label){
  var oc=document.createElement('canvas');oc.width=200;oc.height=200;
  var c=oc.getContext('2d');c.fillStyle='#ede9ff';c.fillRect(0,0,200,200);
  c.fillStyle='#5b3de8';c.font='bold 32px sans-serif';c.textAlign='center';c.fillText(label,100,90);
  c.font='13px sans-serif';c.fillStyle='#8b5cf6';c.fillText('Fichier reçu ✓',100,130);
  var im=new Image();im.src=oc.toDataURL();return im;
}

// ── ZONES ────────────────────────────────────────────────────────────────────
function buildZones(){
  var list=document.getElementById('zonesList');list.innerHTML='';
  if(!config)return;
  config.zones.forEach(function(zone,idx){
    var isSel=!!selectedZones[idx];
    var hasLogo=!!logos[idx];
    var div=document.createElement('div');
    div.className='zone-item'+(isSel?' selected':'')+(hasLogo?' has-logo':'');
    div.innerHTML=
      '<div class="zone-dot" style="background:'+COLORS[idx%COLORS.length]+'"></div>'
      +'<div class="zone-label"><div class="zone-name">'+esc(zone.name||'Zone '+(idx+1))+'</div>'
      +'<div class="zone-sub">'+esc(zone.view||'')+(zone.maxMm?' · max '+zone.maxMm+' mm':'')+'</div></div>'
      +'<div class="zone-ck">'+(hasLogo?'✓':'')+'</div>';
    div.onclick=function(){toggleZone(idx);};
    list.appendChild(div);
  });
}

function toggleZone(idx){
  var zone=config.zones[idx];
  if(selectedZones[idx]){
    delete selectedZones[idx];delete logos[idx];
  } else {
    selectedZones[idx]=true;activeZoneIdx=idx;
    if(zone.view!==activeView)switchView(zone.view);
    if(sharedLogo)applyLogoToZone(idx);
  }
  buildZones();
  var n=Object.keys(selectedZones).length;
  if(n>0){markStepDone(2,n+' zone'+(n>1?'s':''));openStep(3);}
  else unmarkStep(2);
  renderCanvas();updateCTA();updatePrix();
}

// ── TECHNIQUES ───────────────────────────────────────────────────────────────
function buildTechs(){
  var allTechs=[];
  if(config){
    config.zones.forEach(function(z){(z.techniques||[]).forEach(function(t){if(allTechs.indexOf(t)<0)allTechs.push(t);});});
  }
  if(!allTechs.length)allTechs=['seri_auto','transfert_seri','transfert_num','broderie'];
  var list=document.getElementById('techList');list.innerHTML='';
  allTechs.forEach(function(tid){
    var prix=PRIX_TECH[tid]||1.0;
    var div=document.createElement('div');
    div.className='tech-pill'+(activeTech===tid?' active':'');
    div.innerHTML=
      '<div class="tech-left"><div class="tech-name">'+(TECHNAMES[tid]||tid)+'</div>'
      +'<div class="tech-desc">'+(TECHDESCS[tid]||'')+'</div></div>'
      +'<div class="tech-price">+'+fmt(prix)+' €</div>';
    div.onclick=function(){activeTech=tid;buildTechs();markStepDone(3,TECHNAMES[tid]||tid);openStep(4);updatePrix();};
    list.appendChild(div);
  });
}

// ── STEPS ────────────────────────────────────────────────────────────────────
function toggleStep(n){document.getElementById('sbody'+n).classList.toggle('open');}
function openStep(n){document.getElementById('sbody'+n).classList.add('open');}
function markStepDone(n,s){
  var el=document.getElementById('snum'+n);el.className='step-num done';el.textContent='✓';
  document.getElementById('ssum'+n).textContent=s||'';
}
function unmarkStep(n){
  var el=document.getElementById('snum'+n);el.className='step-num';el.textContent=n;
  document.getElementById('ssum'+n).textContent='';
}

// ── QTÉ ──────────────────────────────────────────────────────────────────────
function changeQty(d){setQty(Math.max(1,qty+d));}
function onQtyChange(){setQty(parseInt(document.getElementById('qtyInp').value)||1);}
function setQty(n){
  qty=Math.max(1,n);
  document.getElementById('qtyInp').value=qty;
  document.getElementById('pQty').textContent=qty;
  document.querySelectorAll('.qp').forEach(function(el){el.classList.toggle('active',parseInt(el.textContent)===qty);});
  markStepDone(4,qty+' unités');updatePrix();
}

// ── PRIX ─────────────────────────────────────────────────────────────────────
function updatePrix(){
  var pBase=config&&config.product&&config.product.pricing&&config.product.pricing.base||0;
  var nZ=Math.max(1,Object.keys(selectedZones).length);
  var cliche=30*nZ;
  var marquage=getPrixMarquage();
  var techAdd=activeTech&&PRIX_TECH[activeTech]||0;
  var total=pBase>0?(pBase+marquage+techAdd+cliche/qty)*MARGIN:null;
  document.getElementById('pProduit').textContent=pBase>0?fmt(pBase*qty)+' €':'—';
  document.getElementById('pMarquage').textContent=fmt((marquage+techAdd)*qty)+' €';
  document.getElementById('pCliche').textContent=fmt(cliche)+' €';
  document.getElementById('pTotal').textContent=total?fmt(total)+' €/u':'—';
}

function getPrixMarquage(){
  var p=[[50,0.65],[100,0.56],[250,0.48],[500,0.415],[1000,0.35]];
  var v=p[0][1];for(var i=0;i<p.length;i++){if(qty>=p[i][0])v=p[i][1];}return v;
}
function fmt(n){return Number(n).toFixed(2).replace('.',',');}

// ── CTA ──────────────────────────────────────────────────────────────────────
function updateCTA(){
  var btn=document.getElementById('btnCart');
  if(!sharedLogo){btn.disabled=true;btn.textContent='Uploader un logo pour continuer';return;}
  if(!Object.keys(selectedZones).length){btn.disabled=true;btn.textContent='Choisir une zone de marquage';return;}
  btn.disabled=false;btn.textContent='Ajouter au panier';
}
function addToCart(){alert('Intégration Shopify à brancher !');}

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
