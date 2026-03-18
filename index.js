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
      margin NUMERIC DEFAULT 2.7,
      prix_achat NUMERIC DEFAULT 0,
      taux_marquage NUMERIC DEFAULT 0,
      forfait_min NUMERIC DEFAULT 40,
      cliche NUMERIC DEFAULT 30,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS prix_achat NUMERIC DEFAULT 0`).catch(()=>{});
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS margin NUMERIC DEFAULT 2.7`).catch(()=>{});
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS taux_marquage NUMERIC DEFAULT 0`).catch(()=>{});
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS forfait_min NUMERIC DEFAULT 40`).catch(()=>{});
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cliche NUMERIC DEFAULT 30`).catch(()=>{});
  console.log('DB prete');
}

// Récupérer le prix d'une variante depuis Shopify
async function getShopifyVariantPrice(variantId) {
  try {
    const domain = process.env.SHOPIFY_DOMAIN;
    const token = process.env.SHOPIFY_TOKEN;
    if (!domain || !token) return null;
    const url = `https://${domain}/admin/api/2024-01/variants/${variantId}.json`;
    const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!r.ok) return null;
    const d = await r.json();
    return parseFloat(d.variant?.price) || null;
  } catch(e) { return null; }
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
.sp{width:28px;height:28px;border:3px solid #eee;border-top-color:#3b1f6e;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.img-thumbs{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center}
.img-thumb{width:58px;height:58px;border-radius:10px;overflow:hidden;cursor:pointer;border:2px solid transparent;background:#ede9e3;flex-shrink:0;transition:border-color .12s}
.img-thumb img{width:100%;height:100%;object-fit:cover}
.img-thumb.active{border-color:#3b1f6e}

/* FORM HEADER */
.prod-name{font-size:22px;font-weight:700;margin-bottom:3px;line-height:1.25}
.prod-ref{font-size:12px;color:#999;margin-bottom:4px}
.prod-price{font-size:14px;font-weight:500;color:#555;margin-bottom:28px}

/* STEPS */
.step{border-bottom:1px solid #f0f0f0}
.step:last-of-type{border-bottom:none}
.step-hdr{display:flex;align-items:center;gap:10px;padding:16px 0;cursor:pointer;user-select:none}
.step-num{width:22px;height:22px;border-radius:50%;background:#3b1f6e;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .2s}
.step-num.done{background:#22c55e}
.step-title{font-size:13px;font-weight:600;flex:1}
.step-summary{font-size:12px;color:#22c55e;font-weight:500;max-width:140px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.step-body{display:none;padding-bottom:18px}
.step-body.open{display:block}

/* UPLOAD */
.upload-drop{border:2px dashed #d8d8d8;border-radius:12px;padding:26px 20px;text-align:center;cursor:pointer;transition:all .15s;background:#fafafa;position:relative;overflow:hidden}
.upload-drop:hover,.upload-drop.drag{border-color:#3b1f6e;background:#f5f0ff}
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

/* RETRAIT FOND */
.bg-remove-wrap{margin-top:10px}
.bg-remove-btn{display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border-radius:10px;border:1.5px solid #ebebeb;background:#fff;cursor:pointer;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:#3b1f6e;transition:all .12s}
.bg-remove-btn:hover{border-color:#3b1f6e;background:#f5f0ff}
.bg-remove-btn.active{border-color:#3b1f6e;background:#f5f0ff}
.bg-remove-btn .icon{font-size:16px}
.bg-remove-btn .label{flex:1;text-align:left}
.bg-remove-btn .badge{font-size:10px;background:#3b1f6e;color:#fff;padding:2px 7px;border-radius:20px;font-weight:700}
.bg-remove-status{font-size:11px;color:#888;margin-top:6px;padding-left:2px;min-height:16px}

/* ZONES */
.zones-hint{font-size:12px;color:#999;margin-bottom:10px}
.zones-list{display:flex;flex-direction:column;gap:5px}
.zone-item{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:1.5px solid #ebebeb;cursor:pointer;transition:all .12s;background:#fff}
.zone-item:hover{border-color:#c4b5fd}
.zone-item.selected{border-color:#3b1f6e;background:#f5f0ff}
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
.tech-pill.active{border-color:#3b1f6e;background:#f5f0ff}
.tech-left{flex:1}
.tech-name{font-size:13px;font-weight:600}
.tech-desc{font-size:11px;color:#aaa;margin-top:2px}
.tech-price{font-size:13px;font-weight:700;color:#22c55e;white-space:nowrap}

/* QTÉ */
.qty-row{display:flex;align-items:center;gap:0;border:1.5px solid #ebebeb;border-radius:10px;overflow:hidden;width:fit-content;margin-bottom:12px}
.qty-btn{width:38px;height:38px;border:none;background:#f9f9f9;cursor:pointer;font-size:17px;font-weight:500;color:#3b1f6e;transition:background .1s}
.qty-btn:hover{background:#f0f0f0}
.qty-val{width:64px;height:38px;border:none;text-align:center;font-size:15px;font-weight:700;font-family:'Inter',sans-serif;outline:none}
.qty-paliers{display:flex;gap:5px;flex-wrap:wrap}
.qp{padding:4px 11px;border-radius:20px;border:1.5px solid #ebebeb;font-size:11px;font-weight:600;cursor:pointer;color:#999;transition:all .1s}
.qp:hover,.qp.active{border-color:#3b1f6e;color:#3b1f6e;background:#f5f0ff}

/* PRIX */
.prix-box{background:#f8f7f5;border-radius:12px;padding:16px;margin:20px 0}
.prix-line{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px}
.prix-line .lbl{color:#999}
.prix-line .val{font-weight:500;color:#555}
.prix-sep{height:1px;background:#ebebeb;margin:10px 0}
.prix-total{display:flex;justify-content:space-between;align-items:center}
.prix-total-lbl{font-size:14px;font-weight:600}
.prix-total-val{font-size:26px;font-weight:700;color:#3b1f6e}
.prix-total-sub{font-size:11px;color:#aaa;text-align:right;margin-top:1px}

/* CTA */
.btn-cart{width:100%;padding:15px;border-radius:12px;border:none;background:#3b1f6e;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s;letter-spacing:.01em}
.btn-cart:hover:not(:disabled){background:#4e2a8e;transform:translateY(-1px)}
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
          <div class="bg-remove-wrap" id="bgRemoveWrap" style="display:none">
            <button class="bg-remove-btn" id="bgRemoveBtn" onclick="removeBg()">
              <span class="icon">✨</span>
              <span class="label">Retirer le fond du logo</span>
              <span class="badge">AUTO</span>
            </button>
            <div class="bg-remove-status" id="bgRemoveStatus"></div>
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
        <div class="zones-hint">Plusieurs zones possibles &mdash; le logo s&apos;applique sur chacune.</div>
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
var MARGIN=2.7;
var PRIX_ACHAT=0;
var TAUX_MARQUAGE=0;
var FORFAIT_MIN=40;
var CLICHE=30;
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
    var d=await res.json();config=d.config;MARGIN=parseFloat(d.margin)||2.7;PRIX_ACHAT=parseFloat(d.prix_achat)||0;
    TAUX_MARQUAGE=parseFloat(d.taux_marquage)||0;
    FORFAIT_MIN=parseFloat(d.forfait_min)||40;
    CLICHE=parseFloat(d.cliche)||30;
    setup();
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
    var xs=zone.pts.map(function(p){return p.x*scale;});
    var ys=zone.pts.map(function(p){return p.y*scale;});
    var zx=Math.min.apply(null,xs), zy=Math.min.apply(null,ys);
    var zw=Math.max.apply(null,xs)-zx, zh=Math.max.apply(null,ys)-zy;
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
          return;
        }
      }
      if(lg.rw===undefined)return;
      var lx=zx+lg.rx*zw, ly=zy+lg.ry*zh, lw=lg.rw*zw, lh=lg.rh*zh;
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

// Dessin du logo avec transformation perspective (homographie)
function drawLogoWithPerspective(ctx, lg, pts, idx){
  var p0=pts[0],p1=pts[1],p2=pts[2],p3=pts[3];

  // Largeurs et hauteurs moyennes de la zone
  var wTop=Math.sqrt(Math.pow(p1.x-p0.x,2)+Math.pow(p1.y-p0.y,2));
  var wBot=Math.sqrt(Math.pow(p2.x-p3.x,2)+Math.pow(p2.y-p3.y,2));
  var hLeft=Math.sqrt(Math.pow(p3.x-p0.x,2)+Math.pow(p3.y-p0.y,2));
  var hRight=Math.sqrt(Math.pow(p2.x-p1.x,2)+Math.pow(p2.y-p1.y,2));
  var zw=(wTop+wBot)/2, zh=(hLeft+hRight)/2;

  var lw=lg.rw*zw, lh=lg.rh*zh;
  var cx=(p0.x+p1.x+p2.x+p3.x)/4;
  var cy=(p0.y+p1.y+p2.y+p3.y)/4;
  var ox=(lg.rx-0.5)*zw, oy=(lg.ry-0.5)*zh;

  // 4 coins du logo dans l'espace de la zone (coordonnées relatives 0-1)
  var logoU0=(lg.rx-lg.rw/2), logoU1=(lg.rx+lg.rw/2);
  var logoV0=(lg.ry-lg.rh/2), logoV1=(lg.ry+lg.rh/2);
  logoU0=Math.max(0,Math.min(1,logoU0));
  logoU1=Math.max(0,Math.min(1,logoU1));
  logoV0=Math.max(0,Math.min(1,logoV0));
  logoV1=Math.max(0,Math.min(1,logoV1));

  // Dessiner le logo en subdivision bilinéaire (grille de quads)
  var steps=30;
  var imgW=lg.imgEl.naturalWidth, imgH=lg.imgEl.naturalHeight;

  // Interpolation bilinéaire : u,v (0-1) -> coordonnée écran dans le quadrilatère
  function bilerp(u,v){
    var x=(1-u)*(1-v)*p0.x + u*(1-v)*p1.x + u*v*p2.x + (1-u)*v*p3.x;
    var y=(1-u)*(1-v)*p0.y + u*(1-v)*p1.y + u*v*p2.y + (1-u)*v*p3.y;
    return{x:x,y:y};
  }

  ctx.save();
  // Clip zone
  ctx.beginPath();
  ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.lineTo(p3.x,p3.y);
  ctx.closePath();ctx.clip();

  // Dessiner par petits quads
  for(var j=0;j<steps;j++){
    for(var i=0;i<steps;i++){
      var u0=logoU0+(logoU1-logoU0)*i/steps;
      var u1=logoU0+(logoU1-logoU0)*(i+1)/steps;
      var v0=logoV0+(logoV1-logoV0)*j/steps;
      var v1=logoV0+(logoV1-logoV0)*(j+1)/steps;

      var tl=bilerp(u0,v0), tr=bilerp(u1,v0);
      var bl=bilerp(u0,v1), br=bilerp(u1,v1);

      // Source dans l'image
      var sx=((u0-logoU0)/(logoU1-logoU0||1))*imgW;
      var sy=((v0-logoV0)/(logoV1-logoV0||1))*imgH;
      var sw=imgW/steps, sh=imgH/steps;

      // Destination : transformer le quad en triangle pairs
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tl.x,tl.y);ctx.lineTo(tr.x,tr.y);ctx.lineTo(br.x,br.y);ctx.lineTo(bl.x,bl.y);
      ctx.closePath();ctx.clip();

      // Calcul de la transformation affine pour ce quad (triangle haut-gauche)
      var destW=Math.max(Math.sqrt(Math.pow(tr.x-tl.x,2)+Math.pow(tr.y-tl.y,2)),
                         Math.sqrt(Math.pow(br.x-bl.x,2)+Math.pow(br.y-bl.y,2)));
      var destH=Math.max(Math.sqrt(Math.pow(bl.x-tl.x,2)+Math.pow(bl.y-tl.y,2)),
                         Math.sqrt(Math.pow(br.x-tr.x,2)+Math.pow(br.y-tr.y,2)));

      // Transformation: aligner tl->tr (direction) et tl->bl
      var dx=tr.x-tl.x, dy=tr.y-tl.y;
      var ex=bl.x-tl.x, ey=bl.y-tl.y;
      var scaleX=destW/Math.max(sw,1);
      var scaleY=destH/Math.max(sh,1);

      ctx.transform(dx/Math.max(sw,1), dy/Math.max(sw,1), ex/Math.max(sh,1), ey/Math.max(sh,1), tl.x, tl.y);
      ctx.drawImage(lg.imgEl, sx, sy, sw, sh, 0, 0, sw, sh);
      ctx.restore();
    }
  }
  ctx.restore();

  // Stocker position pour interaction
  var lx=bilerp(logoU0,logoV0).x, ly=bilerp(logoU0,logoV0).y;
  lg.x=lx; lg.y=ly; lg.w=lw; lg.h=lh;
  lg._zx=p0.x; lg._zy=p0.y; lg._zw=zw; lg._zh=zh;

  if(idx===activeZoneIdx){
    var center=bilerp((logoU0+logoU1)/2,(logoV0+logoV1)/2);
    var br2=bilerp(logoU1,logoV1);
    ctx.save();
    ctx.fillStyle='rgba(91,61,232,.85)';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('✥',center.x,center.y);
    ctx.fillStyle='#5b3de8';ctx.beginPath();ctx.arc(br2.x,br2.y,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('⤡',br2.x,br2.y);
    ctx.restore();
  }
}

function initLogoPos(idx,zx,zy,zw,zh){
  var lg=logos[idx];if(!lg||!lg.imgEl)return;
  var natW=lg.imgEl.naturalWidth||200;
  var natH=lg.imgEl.naturalHeight||200;
  var aspect=natW/natH; // <1 = portrait, >1 = paysage, =1 = carré
  var pw,ph;
  if(aspect>=1){
    pw=zw*0.95; ph=pw/aspect;
    if(ph>zh*0.95){ph=zh*0.95; pw=ph*aspect;}
  } else {
    ph=zh*0.95; pw=ph*aspect;
    if(pw>zw*0.95){pw=zw*0.95; ph=pw/aspect;}
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

  document.addEventListener('mousedown',function(e){
    var uploadArea = document.getElementById('uploadDrop');
    var isUploadClick = uploadArea && uploadArea.contains(e.target);
    if(!cv.contains(e.target)&&!isUploadClick&&activeZoneIdx!==null){
      activeZoneIdx=null;renderCanvas();
    }
  });
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
  // Vérifier le format — refuser portrait
  var natW=imgEl.naturalWidth||imgEl.width||1;
  var natH=imgEl.naturalHeight||imgEl.height||1;
  if(natH>natW*1.2){
    document.getElementById('loadingOverlay').style.display='none';
    alert('Logo en format portrait detecte. Utilise un logo en format carre ou paysage. Recadre-le avant de uploader.');
    return;
  }
  sharedLogo={file:file,b64:b64,imgEl:imgEl};
  document.getElementById('loadingOverlay').style.display='none';

  // Auto-sélectionner la première zone si aucune zone sélectionnée
  if(Object.keys(selectedZones).length===0){
    var firstIdx=-1;
    for(var zi=0;zi<config.zones.length;zi++){
      if(!activeView||config.zones[zi].view===activeView){
        firstIdx=zi;break;
      }
    }
    if(firstIdx>=0){
      selectedZones[firstIdx]=true;
      activeZoneIdx=firstIdx;
      applyLogoToZone(firstIdx);
      // Forcer la position immédiatement
      var zone=config.zones[firstIdx];
      if(zone&&zone.pts){
        var xs=zone.pts.map(function(p){return p.x*scale;});
        var ys=zone.pts.map(function(p){return p.y*scale;});
        var zx=Math.min.apply(null,xs),zy=Math.min.apply(null,ys);
        var zw=Math.max.apply(null,xs)-zx,zh=Math.max.apply(null,ys)-zy;
        initLogoPos(firstIdx,zx,zy,zw,zh);
      }
    }
  }

  // UI
  var drop=document.getElementById('uploadDrop');
  drop.classList.add('has-file');
  document.getElementById('upIcon').textContent='✅';
  document.getElementById('upTitle').textContent='Logo chargé';
  document.getElementById('fileName').textContent=file.name;
  var thumb=document.getElementById('fileThumb');
  if(imgEl.src){var ti=document.createElement('img');ti.src=imgEl.src;thumb.innerHTML='';thumb.appendChild(ti);}
  document.getElementById('fileRow').style.display='block';
  document.getElementById('bgRemoveWrap').style.display='block';
  markStepDone(1,file.name);
  openStep(2);
  buildZoneList();
  renderCanvas();updateCTA();updatePrix();
  // Re-render après que les logos soient initialisés
  setTimeout(function(){ renderCanvas(); }, 100);
  // Détourage automatique
  setTimeout(function(){ removeBg(); }, 400);
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
  document.getElementById('bgRemoveWrap').style.display='none';
  document.getElementById('fileThumb').innerHTML='📄';
  unmarkStep(1);buildZones();renderCanvas();updateCTA();updatePrix();
}

function removeBg(){
  var btn=document.getElementById('bgRemoveBtn');
  var status=document.getElementById('bgRemoveStatus');
  if(!sharedLogo||!sharedLogo.imgEl)return;
  btn.disabled=true;
  btn.style.opacity='0.6';
  status.textContent='Traitement en cours...';

  var img=sharedLogo.imgEl;
  var oc=document.createElement('canvas');
  oc.width=img.naturalWidth;oc.height=img.naturalHeight;
  var c=oc.getContext('2d');
  c.drawImage(img,0,0);
  var data=c.getImageData(0,0,oc.width,oc.height);
  var px=data.data;

  // Echantillonner la couleur de fond depuis les 4 coins
  function getCornerColor(x,y){
    var i=(y*oc.width+x)*4;
    return{r:px[i],g:px[i+1],b:px[i+2]};
  }
  var corners=[
    getCornerColor(0,0),
    getCornerColor(oc.width-1,0),
    getCornerColor(0,oc.height-1),
    getCornerColor(oc.width-1,oc.height-1)
  ];
  var bgR=Math.round(corners.reduce(function(s,c){return s+c.r;},0)/4);
  var bgG=Math.round(corners.reduce(function(s,c){return s+c.g;},0)/4);
  var bgB=Math.round(corners.reduce(function(s,c){return s+c.b;},0)/4);

  // Tolérance adaptative
  var tolerance=40;
  var removed=0;
  for(var i=0;i<px.length;i+=4){
    var dr=px[i]-bgR, dg=px[i+1]-bgG, db=px[i+2]-bgB;
    var dist=Math.sqrt(dr*dr+dg*dg+db*db);
    if(dist<tolerance){
      // Fondu progressif sur les bords
      var alpha=Math.max(0,Math.min(255,Math.round((dist/tolerance)*255)));
      px[i+3]=alpha;
      removed++;
    }
  }
  c.putImageData(data,0,0);

  var newDataURL=oc.toDataURL('image/png');
  var newImg=new Image();
  newImg.onload=function(){
    sharedLogo.imgEl=newImg;
    sharedLogo.b64=newDataURL;
    // Mettre à jour tous les logos existants
    Object.keys(logos).forEach(function(idx){
      logos[idx].imgEl=newImg;
      logos[idx].b64=newDataURL;
      logos[idx].rw=undefined; // recalcul position
    });
    // Mettre à jour le thumb
    var thumb=document.getElementById('fileThumb');
    var ti=document.createElement('img');ti.src=newDataURL;thumb.innerHTML='';thumb.appendChild(ti);

    btn.disabled=false;btn.style.opacity='1';
    btn.querySelector('.label').textContent='Fond retire';
    btn.querySelector('.badge').textContent='OK';
    btn.style.borderColor='#22c55e';
    btn.style.background='#f0fdf4';
    btn.querySelector('.icon').textContent='✅';
    status.textContent=removed+' pixels supprimes';
    renderCanvas();
  };
  newImg.src=newDataURL;
}

function makePlaceholder(label){
  var oc=document.createElement('canvas');oc.width=200;oc.height=200;
  var c=oc.getContext('2d');c.fillStyle='#ede9ff';c.fillRect(0,0,200,200);
  c.fillStyle='#5b3de8';c.font='bold 32px sans-serif';c.textAlign='center';c.fillText(label,100,90);
  c.font='13px sans-serif';c.fillStyle='#8b5cf6';c.fillText('Fichier recu',100,130);
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
  var pBase=PRIX_ACHAT||0;
  var nZ=Math.max(1,Object.keys(selectedZones).length);
  var marquageParZone=Math.max(FORFAIT_MIN, TAUX_MARQUAGE*qty);
  var totalMakito=pBase*qty + (marquageParZone+CLICHE)*nZ;
  var prixUnitaireMakito=totalMakito/qty;
  var total=pBase>0&&TAUX_MARQUAGE>0 ? prixUnitaireMakito*MARGIN : null;

  document.getElementById('pProduit').textContent=pBase>0?fmt(pBase*qty)+' €':'—';
  document.getElementById('pMarquage').textContent=TAUX_MARQUAGE>0?fmt(marquageParZone*nZ)+' €':'—';
  document.getElementById('pCliche').textContent=fmt(CLICHE*nZ)+' €';
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

// Route pour récupérer le prix d'une variante Shopify
app.get('/shopify-price/:variantId', async (req, res) => {
  const price = await getShopifyVariantPrice(req.params.variantId);
  if (price === null) return res.status(404).json({ error: 'Prix introuvable' });
  res.json({ price });
});

// Route pour récupérer les variantes d'un produit Shopify par SKU
app.get('/shopify-variants/:sku', async (req, res) => {
  try {
    const domain = process.env.SHOPIFY_DOMAIN;
    const token = process.env.SHOPIFY_TOKEN;
    if (!domain || !token) return res.status(500).json({ error: 'Shopify non configure' });
    const sku = req.params.sku;
    const headers = { 'X-Shopify-Access-Token': token };

    // Chercher par handle contenant le SKU
    const r = await fetch(`https://${domain}/admin/api/2024-01/products.json?handle=${sku}&limit=1`, { headers });
    const d = await r.json();
    let product = (d.products||[])[0];

    // Si pas trouvé par handle exact, chercher dans tous les produits
    if (!product) {
      const r2 = await fetch(`https://${domain}/admin/api/2024-01/products.json?limit=250`, { headers });
      const d2 = await r2.json();
      product = (d2.products||[]).find(p => p.handle && p.handle.includes(sku));
    }

    if (!product) return res.status(404).json({ error: 'Produit non trouve dans Shopify' });

    // Trier variantes par prix décroissant, prendre la plus chère
    const variants = (product.variants||[])
      .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
      .map(v => ({ id: v.id, title: v.title, price: parseFloat(v.price)||0, sku: v.sku }));

    res.json({ product: product.title, variants, maxPrice: variants[0]?.price || 0 });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Route proxy pour tester l'API Makito
app.get('/makito-test/:sku', async (req, res) => {
  const auth = Buffer.from('celine@caesars-diffusion.fr:caeSars75').toString('base64');
  const urls = [
    `https://services.makito.es/api/v1/products/${req.params.sku}`,
    `https://services.makito.es/api/products/${req.params.sku}`,
    `https://data.makito.es/api/v1/products/${req.params.sku}`,
    `https://services.makito.es/api/v1/items/${req.params.sku}`,
  ];
  const results = {};
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'Authorization': 'Basic ' + auth } });
      const text = await r.text();
      results[url] = { status: r.status, body: text.substring(0, 300) };
    } catch(e) {
      results[url] = { error: e.message };
    }
  }
  res.json(results);
});

app.post('/products', async (req, res) => {
  try {
    const { sku, name, config, margin, prix_achat, taux_marquage, forfait_min, cliche } = req.body;
    if (!sku) return res.status(400).json({ error: 'SKU manquant' });
    await pool.query(`
      INSERT INTO products (sku, name, config, margin, prix_achat, taux_marquage, forfait_min, cliche, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        config = EXCLUDED.config,
        margin = EXCLUDED.margin,
        prix_achat = EXCLUDED.prix_achat,
        taux_marquage = EXCLUDED.taux_marquage,
        forfait_min = EXCLUDED.forfait_min,
        cliche = EXCLUDED.cliche,
        updated_at = NOW()
    `, [sku, name || '', config || {}, margin || 2.7, prix_achat || 0, taux_marquage || 0, forfait_min || 40, cliche || 30]);
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
    const { rows } = await pool.query('SELECT sku, name, margin, prix_achat, updated_at FROM products ORDER BY updated_at DESC');
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

// ── ADMIN AUTH MIDDLEWARE ─────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'lola';

function adminAuth(req, res, next) {
  const cookie = req.headers.cookie || '';
  const auth = cookie.split(';').find(c => c.trim().startsWith('goods_admin='));
  if (auth && auth.split('=')[1] === ADMIN_PASSWORD) return next();
  res.redirect('/admin/login');
}

app.get('/admin/login', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GOODS — Admin</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#f8f7f5;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border-radius:20px;padding:48px 40px;width:100%;max-width:400px;box-shadow:0 4px 40px rgba(0,0,0,.08)}
.logo{font-family:'DM Serif Display',serif;font-size:28px;color:#1a1a1a;margin-bottom:4px}
.sub{font-size:13px;color:#aaa;margin-bottom:40px}
label{display:block;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
input{width:100%;padding:13px 16px;border:1.5px solid #e8e8e8;border-radius:10px;font-size:15px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .15s;margin-bottom:20px}
input:focus{border-color:#1a1a1a}
button{width:100%;padding:14px;border-radius:10px;border:none;background:#1a1a1a;color:#fff;font-size:15px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:background .15s}
button:hover{background:#333}
.err{color:#e03e3e;font-size:13px;margin-top:12px;text-align:center;display:none}
</style>
</head>
<body>
<div class="card">
  <div class="logo">goods.</div>
  <div class="sub">Espace administration</div>
  <label>Mot de passe</label>
  <input type="password" id="pw" placeholder="••••••••" onkeydown="if(event.key==='Enter')login()">
  <button onclick="login()">Acceder</button>
  <div class="err" id="err">Mot de passe incorrect</div>
</div>
<script>
async function login(){
  var pw=document.getElementById('pw').value;
  var r=await fetch('/admin/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
  if(r.ok){window.location.href='/admin';}
  else{document.getElementById('err').style.display='block';}
}
</script>
</body>
</html>`);
});

app.post('/admin/auth', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.setHeader('Set-Cookie', `goods_admin=${ADMIN_PASSWORD}; Path=/; HttpOnly; Max-Age=86400`);
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

app.get('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'goods_admin=; Path=/; Max-Age=0');
  res.redirect('/admin/login');
});

app.get('/admin', adminAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT sku, name, prix_achat, taux_marquage, forfait_min, cliche, margin, updated_at FROM products ORDER BY updated_at DESC').catch(()=>({rows:[]}));
  const totalProducts = rows.length;
  const productsConfigured = rows.filter(r => r.taux_marquage > 0).length;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GOODS Admin</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#f8f7f5;color:#1a1a1a;min-height:100vh}

/* NAV */
.nav{background:#fff;border-bottom:1px solid #ebebeb;padding:0 40px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.nav-logo{font-family:'DM Serif Display',serif;font-size:22px;color:#1a1a1a}
.nav-links{display:flex;gap:4px}
.nav-link{padding:7px 14px;border-radius:8px;font-size:13px;font-weight:500;color:#888;cursor:pointer;text-decoration:none;transition:all .12s}
.nav-link:hover{background:#f5f5f5;color:#1a1a1a}
.nav-link.active{background:#1a1a1a;color:#fff}
.nav-right{display:flex;align-items:center;gap:12px}
.nav-badge{font-size:12px;color:#aaa}
.nav-logout{font-size:12px;color:#aaa;text-decoration:none;padding:6px 12px;border-radius:7px;border:1px solid #eee}
.nav-logout:hover{color:#1a1a1a;border-color:#ccc}

/* LAYOUT */
.page{max-width:1100px;margin:0 auto;padding:36px 24px}
.page-title{font-family:'DM Serif Display',serif;font-size:28px;margin-bottom:4px}
.page-sub{font-size:13px;color:#aaa;margin-bottom:32px}

/* DASHBOARD CARDS */
.dash-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:36px}
.dash-card{background:#fff;border-radius:14px;padding:24px;border:1px solid #ebebeb}
.dash-label{font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
.dash-value{font-family:'DM Serif Display',serif;font-size:36px;color:#1a1a1a}
.dash-sub{font-size:12px;color:#aaa;margin-top:4px}
.dash-card.accent{background:#1a1a1a;border-color:#1a1a1a}
.dash-card.accent .dash-label{color:rgba(255,255,255,.5)}
.dash-card.accent .dash-value{color:#fff}
.dash-card.accent .dash-sub{color:rgba(255,255,255,.4)}

/* SECTION */
.section{background:#fff;border-radius:14px;border:1px solid #ebebeb;margin-bottom:24px;overflow:hidden}
.section-header{padding:20px 24px;border-bottom:1px solid #f5f5f5;display:flex;align-items:center;justify-content:space-between}
.section-title{font-size:15px;font-weight:600}
.section-body{padding:24px}

/* FORM */
.form-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}
.form-row-4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px}
.fld label{display:block;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
.fld input,.fld select{width:100%;padding:10px 13px;border:1.5px solid #e8e8e8;border-radius:9px;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .12s;background:#fff}
.fld input:focus,.fld select:focus{border-color:#1a1a1a}
.tarif-block{background:#f8f7f5;border-radius:10px;padding:16px;margin-bottom:16px}
.tarif-title{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px}
.preview-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:9px;padding:12px 16px;font-size:12px;color:#166534;font-weight:500;margin-bottom:16px;display:none}
.btn-primary{padding:11px 24px;border-radius:9px;border:none;background:#1a1a1a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:background .12s}
.btn-primary:hover{background:#333}
.variant-select{display:none;margin-bottom:12px}

/* TABLE */
.table{width:100%;border-collapse:collapse}
.table th{text-align:left;font-size:11px;color:#aaa;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:10px 16px;border-bottom:1px solid #f0f0f0}
.table td{padding:14px 16px;border-bottom:1px solid #f8f8f8;font-size:13px;vertical-align:middle}
.table tr:last-child td{border-bottom:none}
.table tr:hover td{background:#fafafa}
.sku-pill{background:#f0f0f0;color:#555;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;font-family:'DM Mono',monospace}
.price-val{font-weight:600;color:#1a1a1a}
.status-ok{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#16a34a;background:#f0fdf4;padding:3px 9px;border-radius:20px}
.status-no{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#aaa;background:#f5f5f5;padding:3px 9px;border-radius:20px}
.actions{display:flex;gap:6px}
.btn-sm{padding:5px 12px;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;border:1px solid #e8e8e8;background:#fff;color:#555;transition:all .12s}
.btn-sm:hover{border-color:#1a1a1a;color:#1a1a1a}
.btn-sm.violet{border-color:#e8e3f5;background:#faf8ff;color:#6b4bc0}
.btn-sm.violet:hover{background:#6b4bc0;color:#fff;border-color:#6b4bc0}
.btn-sm.red{border-color:#fee;background:#fff5f5;color:#dc2626}
.btn-sm.red:hover{background:#dc2626;color:#fff;border-color:#dc2626}
.empty{text-align:center;padding:40px;color:#aaa;font-size:14px}

.toast{position:fixed;bottom:20px;right:20px;background:#1a1a1a;color:#fff;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:600;display:none;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.15)}
</style>
</head>
<body>

<nav class="nav">
  <div class="nav-logo">goods.</div>
  <div class="nav-links">
    <span class="nav-link active">Produits</span>
    <a class="nav-link" href="https://goodsapi-production.up.railway.app/configurateur?sku=22022" target="_blank">Apercu configurateur</a>
  </div>
  <div class="nav-right">
    <span class="nav-badge">Admin</span>
    <a class="nav-logout" href="/admin/logout">Deconnexion</a>
  </div>
</nav>

<div class="page">
  <div class="page-title">Tableau de bord</div>
  <div class="page-sub">Gestion des produits et tarification</div>

  <!-- DASHBOARD -->
  <div class="dash-grid">
    <div class="dash-card accent">
      <div class="dash-label">Produits</div>
      <div class="dash-value">${totalProducts}</div>
      <div class="dash-sub">references configurees</div>
    </div>
    <div class="dash-card">
      <div class="dash-label">Tarification complete</div>
      <div class="dash-value">${productsConfigured}</div>
      <div class="dash-sub">produits avec prix Makito</div>
    </div>
    <div class="dash-card">
      <div class="dash-label">Marge par defaut</div>
      <div class="dash-value">×2,7</div>
      <div class="dash-sub">appliquee sur tous les produits</div>
    </div>
  </div>

  <!-- FORMULAIRE -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">Ajouter / modifier un produit</div>
    </div>
    <div class="section-body">
      <div class="form-row">
        <div class="fld">
          <label>SKU Makito</label>
          <input id="fSku" placeholder="22022" onblur="fetchVariants()"/>
        </div>
        <div class="fld">
          <label>Nom du produit</label>
          <input id="fName" placeholder="T-shirt Adulte Epika"/>
        </div>
        <div class="fld">
          <label>Marge (multiplicateur)</label>
          <input id="fMargin" type="number" step="0.1" value="2.7" oninput="updatePreview()"/>
        </div>
      </div>

      <div class="variant-select" id="variantBlock">
        <div class="fld">
          <label>Variante Shopify — prix d'achat auto</label>
          <select id="fVariant" onchange="onVariantChange()">
            <option value="">Selectionnez une variante...</option>
          </select>
        </div>
      </div>

      <div class="tarif-block">
        <div class="tarif-title">Tarification Makito</div>
        <div class="form-row-4">
          <div class="fld">
            <label>Prix achat (€/u)</label>
            <input id="fPrix" type="number" step="0.001" placeholder="1.200" oninput="updatePreview()"/>
          </div>
          <div class="fld">
            <label>Taux marquage (€/u)</label>
            <input id="fTaux" type="number" step="0.001" placeholder="0.560" oninput="updatePreview()"/>
          </div>
          <div class="fld">
            <label>Forfait min marquage (€)</label>
            <input id="fForfait" type="number" step="1" placeholder="45" oninput="updatePreview()"/>
          </div>
          <div class="fld">
            <label>Cliche par zone (€)</label>
            <input id="fCliche" type="number" step="1" placeholder="30" value="30" oninput="updatePreview()"/>
          </div>
        </div>
      </div>

      <div class="preview-box" id="previewBox"></div>
      <button class="btn-primary" onclick="saveProduct()">Enregistrer le produit</button>
    </div>
  </div>

  <!-- LISTE PRODUITS -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">Produits (${totalProducts})</div>
    </div>
    ${totalProducts === 0 ? '<div class="empty">Aucun produit — ajoutez votre premier produit ci-dessus</div>' : `
    <table class="table">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Produit</th>
          <th>Prix achat</th>
          <th>Tarification</th>
          <th>Marge</th>
          <th>Prix client ×100 / 1 zone</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const pa = parseFloat(r.prix_achat)||0;
          const tm = parseFloat(r.taux_marquage)||0;
          const fm = parseFloat(r.forfait_min)||40;
          const cl = parseFloat(r.cliche)||30;
          const m = parseFloat(r.margin)||2.7;
          const q = 100;
          const mk = Math.max(fm, tm*q);
          const pv = pa>0&&tm>0 ? (((pa*q + mk + cl)/q)*m).toFixed(2) : null;
          return `<tr>
            <td><span class="sku-pill">${r.sku}</span></td>
            <td style="font-weight:500">${r.name||'—'}</td>
            <td class="price-val">${pa>0?pa.toFixed(3)+' €':'—'}</td>
            <td>${tm>0?`<span class="status-ok">&#10003; Configure</span>`:`<span class="status-no">A remplir</span>`}</td>
            <td>×${m}</td>
            <td class="price-val">${pv?pv+' €/u':'—'}</td>
            <td>
              <div class="actions">
                <a href="/configurateur?sku=${r.sku}" target="_blank"><button class="btn-sm">Apercu</button></a>
                <a href="/admin/zones/${r.sku}"><button class="btn-sm violet">Zones</button></a>
                <button class="btn-sm" onclick="editProduct('${r.sku}','${(r.name||'').replace(/'/g,"\\'")}',${pa},${m},${tm},${fm},${cl})">Modifier</button>
                <button class="btn-sm red" onclick="deleteProduct('${r.sku}')">Supprimer</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`}
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
function toast(msg, ok){
  ok = ok !== false;
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = ok ? '#1a1a1a' : '#dc2626';
  t.style.display = 'block';
  setTimeout(function(){ t.style.display='none'; }, 2500);
}

async function fetchVariants(){
  var sku = document.getElementById('fSku').value.trim();
  if(!sku) return;
  try {
    var r = await fetch('/shopify-variants/' + sku);
    if(!r.ok) return;
    var d = await r.json();
    if(!d.variants || !d.variants.length) return;
    var sel = document.getElementById('fVariant');
    sel.innerHTML = '<option value="">Selectionnez une variante...</option>';
    d.variants.forEach(function(v){
      var opt = document.createElement('option');
      opt.value = v.price;
      opt.textContent = v.title + ' — ' + v.price + ' €';
      sel.appendChild(opt);
    });
    document.getElementById('variantBlock').style.display = 'block';
    if(!document.getElementById('fName').value && d.product)
      document.getElementById('fName').value = d.product;
    // Auto-sélectionner la plus chère
    if(d.maxPrice > 0){
      sel.value = d.maxPrice;
      document.getElementById('fPrix').value = d.maxPrice;
      updatePreview();
    }
  } catch(e) {}
}

function onVariantChange(){
  var p = parseFloat(document.getElementById('fVariant').value) || 0;
  if(p > 0){ document.getElementById('fPrix').value = p; updatePreview(); }
}

function updatePreview(){
  var pa = parseFloat(document.getElementById('fPrix').value)||0;
  var tm = parseFloat(document.getElementById('fTaux').value)||0;
  var fm = parseFloat(document.getElementById('fForfait').value)||40;
  var cl = parseFloat(document.getElementById('fCliche').value)||30;
  var m  = parseFloat(document.getElementById('fMargin').value)||2.7;
  var box = document.getElementById('previewBox');
  if(pa > 0 && tm > 0){
    function calc(q){ return (((pa*q + Math.max(fm,tm*q) + cl)/q)*m).toFixed(2); }
    box.style.display = 'block';
    box.textContent = 'Prix client : ' + calc(50) + ' €/u (×50)  ·  ' + calc(100) + ' €/u (×100)  ·  ' + calc(250) + ' €/u (×250)  ·  ' + calc(500) + ' €/u (×500)';
  } else {
    box.style.display = 'none';
  }
}

async function saveProduct(){
  var sku    = document.getElementById('fSku').value.trim();
  var name   = document.getElementById('fName').value.trim();
  var prix   = parseFloat(document.getElementById('fPrix').value)||0;
  var taux   = parseFloat(document.getElementById('fTaux').value)||0;
  var forfait= parseFloat(document.getElementById('fForfait').value)||40;
  var cliche = parseFloat(document.getElementById('fCliche').value)||30;
  var margin = parseFloat(document.getElementById('fMargin').value)||2.7;
  if(!sku){ toast('SKU manquant', false); return; }
  if(!prix){ toast('Prix achat manquant', false); return; }
  if(!taux){ toast('Taux marquage manquant', false); return; }
  var r = await fetch('/products', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({sku, name, prix_achat:prix, taux_marquage:taux, forfait_min:forfait, cliche, margin, config:{}})
  });
  if(r.ok){ toast('Produit enregistre'); setTimeout(function(){ location.reload(); }, 1000); }
  else toast('Erreur', false);
}

function editProduct(sku, name, prix, margin, taux, forfait, cliche){
  document.getElementById('fSku').value    = sku;
  document.getElementById('fName').value   = name;
  document.getElementById('fPrix').value   = prix;
  document.getElementById('fMargin').value = margin;
  document.getElementById('fTaux').value   = taux || '';
  document.getElementById('fForfait').value= forfait || 40;
  document.getElementById('fCliche').value = cliche || 30;
  updatePreview();
  window.scrollTo({top: 0, behavior:'smooth'});
}

async function deleteProduct(sku){
  if(!confirm('Supprimer ' + sku + ' ?')) return;
  var r = await fetch('/products/' + sku, {method:'DELETE'});
  if(r.ok){ toast('Supprime'); setTimeout(function(){ location.reload(); }, 1000); }
  else toast('Erreur', false);
}
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});


app.get('/admin/zones/:sku', async (req, res) => {
  const sku = req.params.sku;
  const { rows } = await pool.query('SELECT * FROM products WHERE sku=$1',[sku]).catch(()=>({rows:[]}));
  const prod = rows[0];
  const config = prod ? (prod.config||{}) : {};
  const configJson = JSON.stringify(config).replace(/`/g,'\\`').replace(/\$/g,'\\$');
  const prodName = (prod&&prod.name)||sku;
  const margin = (prod&&prod.margin)||2.7;
  const prixAchat = (prod&&prod.prix_achat)||0;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zones — ${sku}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#111;color:#1a1a1a;min-height:100vh;overflow:hidden}
.hdr{background:#3b1f6e;color:#fff;height:48px;display:flex;align-items:center;padding:0 16px;gap:12px;flex-shrink:0}
.hdr a{color:rgba(255,255,255,.6);text-decoration:none;font-size:12px}
.hdr a:hover{color:#fff}
.hdr h1{font-size:14px;font-weight:700;flex:1}
.hbtn{padding:6px 14px;border-radius:6px;border:none;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer}
.hbtn-save{background:#22c55e;color:#fff}
.hbtn-gray{background:rgba(255,255,255,.15);color:#fff}
.app{display:flex;height:calc(100vh - 48px)}
.sidebar{width:248px;background:#fff;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid #eee}
.stabs{display:flex;border-bottom:1px solid #eee;flex-shrink:0}
.stab{flex:1;padding:8px 0;text-align:center;font-size:11px;font-weight:600;color:#aaa;cursor:pointer;border-bottom:2px solid transparent}
.stab.on{color:#3b1f6e;border-bottom-color:#3b1f6e}
.sbody{flex:1;overflow-y:auto;padding:12px}
.sec{font-size:10px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.07em;margin:12px 0 6px}
.sec:first-child{margin-top:0}
.vtabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.vtab{padding:3px 9px;border-radius:12px;border:1.5px solid #eee;font-size:11px;font-weight:600;cursor:pointer;color:#888;background:#fff}
.vtab.on{border-color:#3b1f6e;color:#3b1f6e;background:#f5f0ff}
.vtab-add{border-style:dashed}
.upl{border:2px dashed #ddd;border-radius:7px;padding:10px;text-align:center;cursor:pointer;background:#fafafa;position:relative;font-size:11px;color:#aaa;margin-bottom:8px}
.upl:hover{border-color:#3b1f6e;background:#f5f0ff}
.upl input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.zone-row{display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:7px;border:1.5px solid #eee;cursor:pointer;background:#fff;margin-bottom:4px}
.zone-row:hover{border-color:#c4b5fd}
.zone-row.on{border-color:#3b1f6e;background:#f5f0ff}
.zdot{width:9px;height:9px;border-radius:2px;flex-shrink:0}
.zinfo{flex:1;min-width:0}
.zn{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zs{font-size:10px;color:#aaa}
.zdel{background:none;border:none;cursor:pointer;color:#ddd;font-size:14px;flex-shrink:0}
.zdel:hover{color:#dc2626}
.rowbtns{display:flex;gap:5px;margin-top:6px}
.rbtn{flex:1;padding:6px;border-radius:6px;border:1.5px solid #eee;background:#fff;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;color:#555}
.rbtn:hover{border-color:#3b1f6e;color:#3b1f6e;background:#f5f0ff}
.fld{margin-bottom:8px}
.fld label{display:block;font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
.fld input,.fld select{width:100%;padding:6px 9px;border:1.5px solid #eee;border-radius:6px;font-size:12px;font-family:'Inter',sans-serif;outline:none}
.fld input:focus,.fld select:focus{border-color:#3b1f6e}
.frow{display:flex;gap:6px}
.frow .fld{flex:1}
.tcks{display:flex;flex-wrap:wrap;gap:3px}
.tck{padding:3px 7px;border-radius:10px;border:1.5px solid #eee;font-size:10px;cursor:pointer;color:#888;background:#fff;user-select:none}
.tck.on{border-color:#3b1f6e;color:#3b1f6e;background:#f5f0ff;font-weight:600}
.abtn{width:100%;padding:7px;border-radius:6px;border:none;background:#3b1f6e;color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;margin-top:8px}
.abtn:hover{background:#4e2a8e}
.alrow{display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap}
.albtn{flex:1;min-width:36px;padding:5px;border-radius:5px;border:1.5px solid #eee;background:#fff;cursor:pointer;text-align:center;font-size:13px}
.albtn:hover{border-color:#3b1f6e;background:#f5f0ff}
.snaprow{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:6px;border:1.5px solid #eee;margin-bottom:4px;font-size:11px;cursor:pointer}
.snaprow:hover{border-color:#3b1f6e}
.snaprow input{accent-color:#3b1f6e;width:13px;height:13px;flex-shrink:0}
.tpl-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:7px;border:1.5px solid #eee;margin-bottom:5px;font-size:12px}
.tpl-name{flex:1;font-weight:600}
.tpl-sub{font-size:10px;color:#aaa}
.tpl-btn{padding:4px 10px;border-radius:5px;border:1.5px solid #3b1f6e;background:#f5f0ff;color:#3b1f6e;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif}
.tpl-btn:hover{background:#3b1f6e;color:#fff}
.tpl-del{background:none;border:none;cursor:pointer;color:#ddd;font-size:14px}
.tpl-del:hover{color:#dc2626}
.canvas-wrap{flex:1;display:flex;align-items:center;justify-content:center;background:#1a1025;overflow:hidden;position:relative}
#cv{image-rendering:auto}
.cinfo{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:4px 12px;border-radius:20px;pointer-events:none;opacity:0;transition:opacity .25s;white-space:nowrap}
.cinfo.show{opacity:1}
.zmbtns{position:absolute;bottom:10px;right:12px;display:flex;gap:5px}
.zmbtn{width:28px;height:28px;border-radius:5px;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.zmbtn:hover{background:rgba(255,255,255,.25)}
.modebadge{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#3b1f6e;color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;pointer-events:none}
.toast{position:fixed;bottom:16px;right:16px;background:#22c55e;color:#fff;padding:9px 16px;border-radius:7px;font-size:12px;font-weight:600;display:none;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.2)}
</style>
</head>
<body>
<div class="hdr">
  <a href="/admin">&#8592; Admin</a>
  <h1>Zones &#8212; ${prodName}</h1>
  <button class="hbtn hbtn-gray" onclick="window.open('/configurateur?sku=${sku}','_blank')">Apercu</button>
  <button class="hbtn hbtn-save" onclick="saveAll()">Enregistrer</button>
</div>
<div class="app">
  <div class="sidebar">
    <div class="stabs">
      <div class="stab on" id="stab-zones" onclick="showSTab('zones')">Zones</div>
      <div class="stab" id="stab-props" onclick="showSTab('props')">Props</div>
      <div class="stab" id="stab-align" onclick="showSTab('align')">Aligner</div>
      <div class="stab" id="stab-tpl" onclick="showSTab('tpl')">Templates</div>
    </div>
    <div class="sbody" id="sb-zones">
      <div class="sec">Vue</div>
      <div class="vtabs" id="vtabs"></div>
      <div class="upl"><input type="file" accept="image/*" onchange="uploadImg(this)"><span>&#43; Image de vue (PNG/JPG)</span></div>
      <div class="sec">Zones</div>
      <div id="zlist"></div>
      <button onclick="addZone()" style="width:100%;padding:6px;border-radius:6px;border:1.5px dashed #c4b5fd;background:#f5f0ff;color:#3b1f6e;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;margin-top:2px">+ Nouvelle zone</button>
      <div class="rowbtns" style="margin-top:6px">
        <button class="rbtn" onclick="dupZone()">Dupliquer</button>
        <button class="rbtn" onclick="makeSquare()">Carre parfait</button>
      </div>
    </div>
    <div class="sbody" id="sb-props" style="display:none">
      <div id="props-empty" style="text-align:center;padding:24px 0;color:#aaa;font-size:12px">Selectionnez une zone</div>
      <div id="props-form" style="display:none">
        <div class="fld"><label>Nom de la zone</label><input id="pName" placeholder="Ex: Poitrine gauche" oninput="liveUpd()"/></div>
        <div class="frow">
          <div class="fld"><label>Vue</label><input id="pView" oninput="liveUpd()"/></div>
          <div class="fld"><label>Max mm</label><input id="pMaxMm" type="number" oninput="liveUpd()"/></div>
        </div>
        <div class="sec">Mode zone</div>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <button id="modeRect" onclick="setZoneMode('rect')" style="flex:1;padding:6px;border-radius:6px;border:1.5px solid #3b1f6e;background:#f5f0ff;color:#3b1f6e;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Rectangle</button>
          <button id="modePers" onclick="setZoneMode('perspective')" style="flex:1;padding:6px;border-radius:6px;border:1.5px solid #eee;background:#fff;color:#555;font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Perspective</button>
        </div>
        <div class="sec">Position exacte</div>
        <div class="frow">
          <div class="fld"><label>X</label><input id="pX" type="number" oninput="updFromProps()"/></div>
          <div class="fld"><label>Y</label><input id="pY" type="number" oninput="updFromProps()"/></div>
        </div>
        <div class="frow">
          <div class="fld"><label>Largeur</label><input id="pW" type="number" oninput="updFromProps()"/></div>
          <div class="fld"><label>Hauteur</label><input id="pH" type="number" oninput="updFromProps()"/></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <input type="checkbox" id="pSq" style="accent-color:#3b1f6e;width:13px;height:13px" onchange="applySquare()">
          <label for="pSq" style="font-size:11px;font-weight:600;color:#555;cursor:pointer">Forcer carre</label>
        </div>
        <div class="sec">Techniques</div>
        <div class="tcks" id="techcks"></div>
        <button class="abtn" onclick="applyProps()">Appliquer</button>
      </div>
    </div>
    <div class="sbody" id="sb-align" style="display:none">
      <div class="sec">Aligner</div>
      <div class="alrow">
        <button class="albtn" onclick="aln('left')" title="Gauche">&#9724;&#8592;</button>
        <button class="albtn" onclick="aln('cx')" title="Centrer H">&#8596;</button>
        <button class="albtn" onclick="aln('right')" title="Droite">&#8594;&#9724;</button>
        <button class="albtn" onclick="aln('top')" title="Haut">&#8593;</button>
        <button class="albtn" onclick="aln('cy')" title="Centrer V">&#8597;</button>
        <button class="albtn" onclick="aln('bottom')" title="Bas">&#8595;</button>
      </div>
      <div class="sec">Distribuer</div>
      <div class="alrow">
        <button class="albtn" onclick="dist('h')" title="Espacement H">&#8596;&#8596;</button>
        <button class="albtn" onclick="dist('v')" title="Espacement V">&#8597;&#8597;</button>
        <button class="albtn" onclick="sameSize()" title="Meme taille">&#9635;</button>
      </div>
      <div class="sec">Snap</div>
      <label class="snaprow"><input type="checkbox" id="snapG" checked> Grille (10px)</label>
      <label class="snaprow"><input type="checkbox" id="snapZ" checked> Autres zones</label>
    </div>
    <div class="sbody" id="sb-tpl" style="display:none">
      <div class="sec">Charger un template</div>
      <div id="tplList"></div>
      <div class="sec" style="margin-top:12px">Sauvegarder les zones actuelles</div>
      <div class="fld"><label>Nom du template</label><input id="tplName" placeholder="Ex: T-shirt standard"/></div>
      <button class="abtn" onclick="saveTemplate()">Enregistrer comme template</button>
    </div>
  </div>
  <div class="canvas-wrap" id="cwrap">
    <canvas id="cv"></canvas>
    <div class="cinfo" id="cinfo"></div>
    <div class="modebadge" id="modebadge">Selectionner (V)</div>
    <div class="zmbtns">
      <button class="zmbtn" onclick="zmOut()">-</button>
      <button class="zmbtn" style="font-size:9px;font-weight:700" onclick="zmFit()">FIT</button>
      <button class="zmbtn" onclick="zmIn()">+</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
var SKU='${sku}';
var config=JSON.parse(\`${configJson}\`);
if(!config.zones)config.zones=[];
if(!config.viewImgs)config.viewImgs={};
if(!config.product)config.product={sku:SKU,name:'${prodName}'};

var COLORS=['#5b3de8','#e03e3e','#f97316','#1d9e5c','#0ea5e9','#a855f7','#ec4899','#14b8a6'];
var TECHS=['seri_auto','seri_manuelle','transfert_seri','transfert_num','broderie','gravure_laser','tampon','sublimation'];
var TN={seri_auto:'Seri auto',seri_manuelle:'Seri manuelle',transfert_seri:'Trf seri',transfert_num:'Trf num',broderie:'Broderie',gravure_laser:'Gravure',tampon:'Tampo',sublimation:'Sublim'};
var TDEFS=['seri_auto','transfert_seri','transfert_num','broderie'];
var SNAP=10;
var HANDLE=8;
var cv=document.getElementById('cv');
var ctx=cv.getContext('2d');
var imgCache={};
var activeView=null;
var activeIdx=null;
var zoom=1,panX=0,panY=0;
var imgW=800,imgH=800;
var tool='select';
var isDrawing=false,isDragging=false,isResizing=false,isPerspDrag=false;
var drawStart=null,drawRect=null,dragStart=null,origZone=null;
var persHandle=null; // index du coin en cours de drag perspective (0-3)
var activeGuides=[];
var infoTimer;

// ── TEMPLATES (localStorage) ──────────────────────────────────────────────────
function getTemplates(){ try{return JSON.parse(localStorage.getItem('goods_templates')||'[]');}catch(e){return[];} }
function setTemplates(t){ localStorage.setItem('goods_templates',JSON.stringify(t)); }

function saveTemplate(){
  var name=document.getElementById('tplName').value.trim();
  if(!name){toast('Donnez un nom au template',false);return;}
  var zones=config.zones.filter(function(z){return z.view===activeView;});
  if(!zones.length){toast('Aucune zone sur cette vue',false);return;}
  var tpls=getTemplates();
  tpls.push({name:name, view:activeView, zones:JSON.parse(JSON.stringify(zones)), created:Date.now()});
  setTemplates(tpls);
  document.getElementById('tplName').value='';
  buildTplList();
  toast('Template "'+name+'" sauvegarde');
}

function loadTemplate(idx){
  var tpls=getTemplates();
  var tpl=tpls[idx];
  if(!tpl)return;
  if(!confirm('Appliquer le template "'+tpl.name+'" ? Les zones existantes de cette vue seront remplacees.'))return;
  config.zones=config.zones.filter(function(z){return z.view!==activeView;});
  tpl.zones.forEach(function(z){
    var nz=JSON.parse(JSON.stringify(z));
    nz.view=activeView;
    config.zones.push(nz);
  });
  activeIdx=null;
  buildZoneList(); buildTplList(); render(); showSTab('zones');
  toast('Template applique');
}

function deleteTemplate(idx){
  var tpls=getTemplates();
  if(!confirm('Supprimer ce template ?'))return;
  tpls.splice(idx,1);
  setTemplates(tpls);
  buildTplList();
}

function buildTplList(){
  var el=document.getElementById('tplList');
  el.innerHTML='';
  var tpls=getTemplates();
  if(!tpls.length){el.innerHTML='<p style="font-size:11px;color:#aaa;text-align:center;padding:12px 0">Aucun template sauvegarde</p>';return;}
  tpls.forEach(function(t,i){
    var d=document.createElement('div');
    d.className='tpl-row';
    d.innerHTML='<div class="tpl-name">'+t.name+'<div class="tpl-sub">'+t.zones.length+' zone(s)</div></div>'
      +'<button class="tpl-btn" onclick="loadTemplate('+i+')">Charger</button>'
      +'<button class="tpl-del" onclick="deleteTemplate('+i+')">x</button>';
    el.appendChild(d);
  });
}

// ── TABS ──────────────────────────────────────────────────────────────────────
function showSTab(name){
  ['zones','props','align','tpl'].forEach(function(t){
    document.getElementById('stab-'+t).classList.toggle('on',t===name);
    document.getElementById('sb-'+t).style.display=t===name?'block':'none';
  });
  if(name==='tpl')buildTplList();
}

// ── VUES ──────────────────────────────────────────────────────────────────────
function getViews(){
  var v=Object.keys(config.viewImgs||{});
  config.zones.forEach(function(z){if(z.view&&v.indexOf(z.view)<0)v.push(z.view);});
  return v.length?v:['Recto'];
}

function buildVTabs(){
  var el=document.getElementById('vtabs');
  el.innerHTML='';
  getViews().forEach(function(v){
    var b=document.createElement('button');
    b.className='vtab'+(v===activeView?' on':'');
    b.textContent=v;
    b.onclick=function(){switchView(v);};
    el.appendChild(b);
  });
  var add=document.createElement('button');
  add.className='vtab vtab-add';
  add.textContent='+ Vue';
  add.onclick=function(){
    var n=prompt('Nom de la vue (ex: Verso, Manche G)');
    if(!n||!n.trim())return;
    n=n.trim();
    if(!config.viewImgs[n])config.viewImgs[n]=null;
    buildVTabs();switchView(n);
  };
  el.appendChild(add);
}

function switchView(v){
  activeView=v;activeIdx=null;
  document.querySelectorAll('.vtab').forEach(function(t){t.classList.toggle('on',t.textContent===v);});
  var im=imgCache[v];
  if(im){imgW=im.naturalWidth;imgH=im.naturalHeight;}
  else{imgW=800;imgH=800;}
  zmFit();buildZoneList();updPropsPanel();
}

// ── UPLOAD IMG ────────────────────────────────────────────────────────────────
function uploadImg(input){
  if(!input.files[0])return;
  var r=new FileReader();
  r.onload=function(e){
    config.viewImgs[activeView]=e.target.result;
    var im=new Image();
    im.onload=function(){imgCache[activeView]=im;imgW=im.naturalWidth;imgH=im.naturalHeight;zmFit();};
    im.src=e.target.result;
  };
  r.readAsDataURL(input.files[0]);
  input.value='';
}

// ── ZONES DATA ────────────────────────────────────────────────────────────────
// Une zone a : pts[4] (toujours), mode ('rect'|'perspective'), name, view, maxMm, techniques
// En mode rect, pts forment un rectangle aligné
// En mode perspective, chaque coin est libre

function makeZoneRect(x,y,w,h,view){
  return{name:'Zone '+(config.zones.length+1),view:view,maxMm:80,techniques:TDEFS.slice(),mode:'rect',
    pts:[{x:x,y:y},{x:x+w,y:y},{x:x+w,y:y+h},{x:x,y:y+h}]};
}

function getZoneRect(z){
  // Bounding box des 4 points
  var xs=z.pts.map(function(p){return p.x;}),ys=z.pts.map(function(p){return p.y;});
  var x=Math.min.apply(null,xs),y=Math.min.apply(null,ys);
  return{x:x,y:y,w:Math.max.apply(null,xs)-x,h:Math.max.apply(null,ys)-y};
}

function setZoneRect(z,x,y,w,h){
  z.pts=[{x:x,y:y},{x:x+w,y:y},{x:x+w,y:y+h},{x:x,y:y+h}];
  z.mode='rect';
}

function setZoneMode(mode){
  if(activeIdx===null)return;
  config.zones[activeIdx].mode=mode;
  updModeButtons();render();
}

function updModeButtons(){
  if(activeIdx===null)return;
  var m=(config.zones[activeIdx].mode)||'rect';
  document.getElementById('modeRect').style.background=m==='rect'?'#f5f0ff':'#fff';
  document.getElementById('modeRect').style.borderColor=m==='rect'?'#3b1f6e':'#eee';
  document.getElementById('modeRect').style.color=m==='rect'?'#3b1f6e':'#555';
  document.getElementById('modePers').style.background=m==='perspective'?'#f5f0ff':'#fff';
  document.getElementById('modePers').style.borderColor=m==='perspective'?'#3b1f6e':'#eee';
  document.getElementById('modePers').style.color=m==='perspective'?'#3b1f6e':'#555';
  document.getElementById('modebadge').textContent=m==='perspective'?'Mode Perspective — glisse les coins':'Selectionner (V)';
}

// ── ZONE LIST ─────────────────────────────────────────────────────────────────
function buildZoneList(){
  var el=document.getElementById('zlist');el.innerHTML='';
  config.zones.forEach(function(z,i){
    if(z.view!==activeView)return;
    var d=document.createElement('div');
    d.className='zone-row'+(i===activeIdx?' on':'');
    d.innerHTML='<div class="zdot" style="background:'+COLORS[i%COLORS.length]+'"></div>'
      +'<div class="zinfo"><div class="zn">'+(z.name||'Zone '+(i+1))+'</div>'
      +'<div class="zs">'+(z.mode==='perspective'?'Perspective':'Rectangle')+' · '+(z.maxMm||80)+'mm</div></div>'
      +'<button class="zdel" onclick="delZoneAt('+i+',event)">x</button>';
    d.onclick=function(){activeIdx=i;buildZoneList();updPropsPanel();render();showSTab('props');};
    el.appendChild(d);
  });
}

function addZone(){
  var cx=imgW/2-50,cy=imgH/2-50;
  config.zones.push(makeZoneRect(cx,cy,100,100,activeView));
  activeIdx=config.zones.length-1;
  buildZoneList();updPropsPanel();render();showSTab('props');
}

function dupZone(){
  if(activeIdx===null){toast('Selectionnez une zone',false);return;}
  var z=JSON.parse(JSON.stringify(config.zones[activeIdx]));
  z.name=z.name+' copie';
  z.pts=z.pts.map(function(p){return{x:p.x+20,y:p.y+20};});
  config.zones.push(z);
  activeIdx=config.zones.length-1;
  buildZoneList();updPropsPanel();render();
}

function makeSquare(){
  if(activeIdx===null){toast('Selectionnez une zone',false);return;}
  var z=config.zones[activeIdx];
  var r=getZoneRect(z);
  var s=Math.max(r.w,r.h);
  setZoneRect(z,r.x,r.y,s,s);
  updPropsInputs();render();toast('Carre parfait applique');
}

function delZoneAt(i,e){
  e.stopPropagation();
  if(!confirm('Supprimer cette zone ?'))return;
  config.zones.splice(i,1);
  if(activeIdx>=config.zones.length)activeIdx=config.zones.length-1;
  if(!config.zones.length)activeIdx=null;
  buildZoneList();updPropsPanel();render();
}

// ── PROPS PANEL ───────────────────────────────────────────────────────────────
function updPropsPanel(){
  var empty=document.getElementById('props-empty');
  var form=document.getElementById('props-form');
  if(activeIdx===null||activeIdx>=config.zones.length){empty.style.display='block';form.style.display='none';return;}
  empty.style.display='none';form.style.display='block';
  var z=config.zones[activeIdx];
  document.getElementById('pName').value=z.name||'';
  document.getElementById('pView').value=z.view||activeView;
  document.getElementById('pMaxMm').value=z.maxMm||80;
  document.getElementById('pSq').checked=false;
  updModeButtons();updPropsInputs();
  var tg=document.getElementById('techcks');tg.innerHTML='';
  TECHS.forEach(function(t){
    var on=(z.techniques||[]).indexOf(t)>=0;
    var sp=document.createElement('span');
    sp.className='tck'+(on?' on':'');sp.textContent=TN[t];sp.dataset.tech=t;
    sp.onclick=function(){sp.classList.toggle('on');};
    tg.appendChild(sp);
  });
}

function updPropsInputs(){
  if(activeIdx===null)return;
  var r=getZoneRect(config.zones[activeIdx]);
  document.getElementById('pX').value=Math.round(r.x);
  document.getElementById('pY').value=Math.round(r.y);
  document.getElementById('pW').value=Math.round(r.w);
  document.getElementById('pH').value=Math.round(r.h);
}

function liveUpd(){
  if(activeIdx===null)return;
  var z=config.zones[activeIdx];
  z.name=document.getElementById('pName').value;
  z.view=document.getElementById('pView').value||activeView;
  z.maxMm=parseInt(document.getElementById('pMaxMm').value)||80;
  buildZoneList();render();
}

function updFromProps(){
  if(activeIdx===null)return;
  var x=parseFloat(document.getElementById('pX').value)||0;
  var y=parseFloat(document.getElementById('pY').value)||0;
  var w=Math.max(5,parseFloat(document.getElementById('pW').value)||50);
  var h=Math.max(5,parseFloat(document.getElementById('pH').value)||50);
  setZoneRect(config.zones[activeIdx],x,y,w,h);render();
}

function applySquare(){
  if(!document.getElementById('pSq').checked)return;
  makeSquare();
  document.getElementById('pSq').checked=false;
}

function applyProps(){
  if(activeIdx===null)return;
  var z=config.zones[activeIdx];
  z.name=document.getElementById('pName').value;
  z.view=document.getElementById('pView').value||activeView;
  z.maxMm=parseInt(document.getElementById('pMaxMm').value)||80;
  z.techniques=Array.from(document.querySelectorAll('.tck.on')).map(function(el){return el.dataset.tech;});
  updFromProps();buildZoneList();render();toast('Zone mise a jour');
}

// ── COORDS ────────────────────────────────────────────────────────────────────
function c2i(cx,cy){return{x:(cx-panX)/zoom,y:(cy-panY)/zoom};}
function i2c(ix,iy){return{x:ix*zoom+panX,y:iy*zoom+panY};}
function mpt(e){var r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function snp(v){return document.getElementById('snapG').checked?Math.round(v/SNAP)*SNAP:v;}

// ── RENDER ────────────────────────────────────────────────────────────────────
function render(){
  if(!cv.width)resizeCv();
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.fillStyle='#1a1025';ctx.fillRect(0,0,cv.width,cv.height);

  var cw=Math.round(imgW*zoom),ch=Math.round(imgH*zoom);
  ctx.save();ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=16;
  ctx.fillStyle='#fff';ctx.fillRect(panX,panY,cw,ch);ctx.restore();

  var im=imgCache[activeView];
  if(im){ctx.drawImage(im,panX,panY,cw,ch);}
  else{ctx.fillStyle='#f0ede8';ctx.fillRect(panX,panY,cw,ch);
    ctx.fillStyle='#bbb';ctx.font='13px Inter';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('Uploade une image de vue',panX+cw/2,panY+ch/2);}

  // Grille
  if(document.getElementById('snapG').checked&&zoom>0.7){
    ctx.save();ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=0.5;
    for(var gx=0;gx<imgW;gx+=SNAP){var cx2=panX+gx*zoom;ctx.beginPath();ctx.moveTo(cx2,panY);ctx.lineTo(cx2,panY+ch);ctx.stroke();}
    for(var gy=0;gy<imgH;gy+=SNAP){var cy3=panY+gy*zoom;ctx.beginPath();ctx.moveTo(panX,cy3);ctx.lineTo(panX+cw,cy3);ctx.stroke();}
    ctx.restore();
  }

  // Zones
  config.zones.forEach(function(z,i){
    if(z.view!==activeView||!z.pts||z.pts.length<4)return;
    var color=COLORS[i%COLORS.length];
    var isAct=i===activeIdx;
    var pts=z.pts.map(function(p){return i2c(p.x,p.y);});

    ctx.save();ctx.beginPath();ctx.rect(panX,panY,cw,ch);ctx.clip();

    // Fill avec clip du polygone
    ctx.beginPath();
    ctx.moveTo(pts[0].x,pts[0].y);
    for(var k=1;k<pts.length;k++)ctx.lineTo(pts[k].x,pts[k].y);
    ctx.closePath();
    ctx.fillStyle=color+(isAct?'30':'18');ctx.fill();

    // Border
    ctx.beginPath();
    ctx.moveTo(pts[0].x,pts[0].y);
    for(var k2=1;k2<pts.length;k2++)ctx.lineTo(pts[k2].x,pts[k2].y);
    ctx.closePath();
    ctx.strokeStyle=color;ctx.lineWidth=isAct?2:1.5;
    ctx.setLineDash(isAct?[]:[5,4]);ctx.stroke();ctx.setLineDash([]);

    // Label
    var cx3=(pts[0].x+pts[1].x+pts[2].x+pts[3].x)/4;
    var cy4=(pts[0].y+pts[1].y+pts[2].y+pts[3].y)/4;
    ctx.fillStyle=color;
    ctx.font='bold '+Math.max(10,Math.min(13,zoom*13))+'px Inter';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(z.name||(i+1+'. Zone'),cx3,cy4);

    if(isAct){
      // En mode perspective : poignées sur chaque coin
      if(z.mode==='perspective'){
        pts.forEach(function(p,pi){
          ctx.fillStyle=pi===persHandle?color:'#fff';
          ctx.fillRect(p.x-HANDLE,p.y-HANDLE,HANDLE*2,HANDLE*2);
          ctx.strokeStyle=color;ctx.lineWidth=1.5;
          ctx.strokeRect(p.x-HANDLE,p.y-HANDLE,HANDLE*2,HANDLE*2);
        });
      } else {
        // Mode rect : 8 poignées classiques
        var r2=getZoneRect(z);
        var sc=i2c(r2.x,r2.y);
        var sw2=r2.w*zoom,sh2=r2.h*zoom;
        var hpts=[
          {x:sc.x,y:sc.y},{x:sc.x+sw2/2,y:sc.y},{x:sc.x+sw2,y:sc.y},
          {x:sc.x+sw2,y:sc.y+sh2/2},{x:sc.x+sw2,y:sc.y+sh2},
          {x:sc.x+sw2/2,y:sc.y+sh2},{x:sc.x,y:sc.y+sh2},{x:sc.x,y:sc.y+sh2/2}
        ];
        var hids=['nw','n','ne','e','se','s','sw','w'];
        hpts.forEach(function(h,hi){
          ctx.fillStyle='#fff';ctx.fillRect(h.x-HANDLE/2,h.y-HANDLE/2,HANDLE,HANDLE);
          ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.strokeRect(h.x-HANDLE/2,h.y-HANDLE/2,HANDLE,HANDLE);
        });
      }
    }
    ctx.restore();
  });

  // Zone en dessin
  if(isDrawing&&drawRect){
    var ds=i2c(drawRect.x,drawRect.y);
    ctx.save();ctx.strokeStyle='#3b1f6e';ctx.lineWidth=2;ctx.setLineDash([5,4]);
    ctx.strokeRect(ds.x,ds.y,drawRect.w*zoom,drawRect.h*zoom);
    ctx.fillStyle='rgba(59,31,110,.1)';ctx.fillRect(ds.x,ds.y,drawRect.w*zoom,drawRect.h*zoom);
    ctx.setLineDash([]);
    ctx.fillStyle='#3b1f6e';ctx.font='bold 11px Inter';ctx.textAlign='center';ctx.textBaseline='bottom';
    ctx.fillText(Math.round(drawRect.w)+'x'+Math.round(drawRect.h),ds.x+drawRect.w*zoom/2,ds.y-3);
    ctx.restore();
  }

  // Guides
  if(activeGuides.length){
    ctx.save();ctx.strokeStyle='#ff3366';ctx.lineWidth=1;ctx.setLineDash([4,3]);
    activeGuides.forEach(function(g){
      if(g.type==='x'){var gx2=i2c(g.v,0).x;ctx.beginPath();ctx.moveTo(gx2,0);ctx.lineTo(gx2,cv.height);ctx.stroke();}
      else{var gy2=i2c(0,g.v).y;ctx.beginPath();ctx.moveTo(0,gy2);ctx.lineTo(cv.width,gy2);ctx.stroke();}
    });
    ctx.setLineDash([]);ctx.restore();
  }
}

// ── HIT TESTS ─────────────────────────────────────────────────────────────────
function hitPersCorner(mx,my){
  if(activeIdx===null)return -1;
  var z=config.zones[activeIdx];
  if(!z||z.mode!=='perspective')return -1;
  for(var i=0;i<z.pts.length;i++){
    var p=i2c(z.pts[i].x,z.pts[i].y);
    if(Math.abs(mx-p.x)<HANDLE*1.5&&Math.abs(my-p.y)<HANDLE*1.5)return i;
  }
  return -1;
}

function hitRectHandle(mx,my){
  if(activeIdx===null)return null;
  var z=config.zones[activeIdx];
  if(!z||z.mode==='perspective')return null;
  var r=getZoneRect(z),sc=i2c(r.x,r.y),sw=r.w*zoom,sh=r.h*zoom;
  var hpts=[
    {x:sc.x,y:sc.y,id:'nw'},{x:sc.x+sw/2,y:sc.y,id:'n'},{x:sc.x+sw,y:sc.y,id:'ne'},
    {x:sc.x+sw,y:sc.y+sh/2,id:'e'},{x:sc.x+sw,y:sc.y+sh,id:'se'},
    {x:sc.x+sw/2,y:sc.y+sh,id:'s'},{x:sc.x,y:sc.y+sh,id:'sw'},{x:sc.x,y:sc.y+sh/2,id:'w'}
  ];
  for(var i=0;i<hpts.length;i++){if(Math.abs(mx-hpts[i].x)<HANDLE&&Math.abs(my-hpts[i].y)<HANDLE)return hpts[i].id;}
  return null;
}

function hitZone(mx,my){
  for(var i=config.zones.length-1;i>=0;i--){
    var z=config.zones[i];if(z.view!==activeView||!z.pts)continue;
    var pts=z.pts.map(function(p){return i2c(p.x,p.y);});
    if(ptInPoly(mx,my,pts))return i;
  }
  return -1;
}

function ptInPoly(px,py,pts){
  var inside=false;
  for(var i=0,j=pts.length-1;i<pts.length;j=i++){
    var xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y;
    if(((yi>py)!=(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}

// ── SNAP & GUIDES ─────────────────────────────────────────────────────────────
function computeGuidesAndSnap(nx,ny,nw,nh,excl){
  if(!document.getElementById('snapZ').checked)return{x:nx,y:ny,guides:[]};
  var threshold=6/zoom;
  var guides=[];
  config.zones.forEach(function(z,i){
    if(i===excl||z.view!==activeView||!z.pts)return;
    var r=getZoneRect(z);
    var edges=[
      {v:r.x,t:'x'},{v:r.x+r.w,t:'x'},{v:r.x+r.w/2,t:'x'},
      {v:r.y,t:'y'},{v:r.y+r.h,t:'y'},{v:r.y+r.h/2,t:'y'}
    ];
    var myX=[nx,nx+nw,nx+nw/2],myY=[ny,ny+nh,ny+nh/2];
    edges.forEach(function(e){
      var vals=e.t==='x'?myX:myY;
      vals.forEach(function(mv){
        if(Math.abs(mv-e.v)<threshold){
          guides.push({type:e.t,v:e.v});
          if(e.t==='x'){
            if(Math.abs(nx-e.v)<threshold)nx=e.v;
            else if(Math.abs(nx+nw-e.v)<threshold)nx=e.v-nw;
            else if(Math.abs(nx+nw/2-e.v)<threshold)nx=e.v-nw/2;
          } else {
            if(Math.abs(ny-e.v)<threshold)ny=e.v;
            else if(Math.abs(ny+nh-e.v)<threshold)ny=e.v-nh;
            else if(Math.abs(ny+nh/2-e.v)<threshold)ny=e.v-nh/2;
          }
        }
      });
    });
  });
  return{x:nx,y:ny,guides:guides};
}

// ── EVENTS ────────────────────────────────────────────────────────────────────
cv.addEventListener('mousedown',function(e){
  e.preventDefault();
  var m=mpt(e),p=c2i(m.x,m.y);
  activeGuides=[];

  if(tool==='draw'){
    isDrawing=true;
    drawStart={x:snp(p.x),y:snp(p.y)};
    drawRect={x:drawStart.x,y:drawStart.y,w:0,h:0};
    return;
  }

  // Mode perspective : drag coin
  var pc=hitPersCorner(m.x,m.y);
  if(pc>=0){isPerspDrag=true;persHandle=pc;dragStart=p;return;}

  // Mode rect : drag poignée
  var rh=hitRectHandle(m.x,m.y);
  if(rh){
    isResizing=true;
    var r=getZoneRect(config.zones[activeIdx]);
    origZone={x:r.x,y:r.y,w:r.w,h:r.h,handle:rh};
    dragStart=p;return;
  }

  // Hit zone
  var hit=hitZone(m.x,m.y);
  if(hit>=0){
    activeIdx=hit;isDragging=true;
    var r2=getZoneRect(config.zones[activeIdx]);
    origZone={x:r2.x,y:r2.y,w:r2.w,h:r2.h};
    // Sauvegarder tous les pts originaux pour le drag (preserve perspective)
    origZone.pts=JSON.parse(JSON.stringify(config.zones[activeIdx].pts));
    dragStart=p;
    buildZoneList();updPropsPanel();render();return;
  }

  activeIdx=null;buildZoneList();updPropsPanel();render();
});

document.addEventListener('mousemove',function(e){
  var m=mpt(e),p=c2i(m.x,m.y);
  activeGuides=[];

  if(isDrawing&&drawStart){
    var fs=e.shiftKey;
    var dx=p.x-drawStart.x,dy=p.y-drawStart.y;
    if(fs){var s=Math.max(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx)*s;dy=Math.sign(dy)*s;}
    drawRect={x:snp(Math.min(drawStart.x,drawStart.x+dx)),y:snp(Math.min(drawStart.y,drawStart.y+dy)),
      w:snp(Math.abs(dx)),h:fs?snp(Math.abs(dx)):snp(Math.abs(dy))};
    render();showInfo(Math.round(drawRect.w)+'x'+Math.round(drawRect.h));return;
  }

  if(isPerspDrag&&persHandle>=0&&activeIdx!==null){
    var z=config.zones[activeIdx];
    z.pts[persHandle]={x:snp(p.x),y:snp(p.y)};
    updPropsInputs();render();showInfo(Math.round(p.x)+', '+Math.round(p.y));return;
  }

  if(isDragging&&dragStart&&activeIdx!==null){
    var dx2=p.x-dragStart.x,dy2=p.y-dragStart.y;
    var nx=snp(origZone.x+dx2),ny=snp(origZone.y+dy2);
    var sg=computeGuidesAndSnap(nx,ny,origZone.w,origZone.h,activeIdx);
    nx=sg.x;ny=sg.y;activeGuides=sg.guides;
    nx=Math.max(0,Math.min(imgW-origZone.w,nx));
    ny=Math.max(0,Math.min(imgH-origZone.h,ny));
    // Déplacer tous les pts (preserve forme perspective)
    var offX=nx-origZone.x,offY=ny-origZone.y;
    origZone.pts.forEach(function(pt,i){
      config.zones[activeIdx].pts[i]={x:pt.x+offX,y:pt.y+offY};
    });
    updPropsInputs();render();showInfo(Math.round(nx)+', '+Math.round(ny));return;
  }

  if(isResizing&&dragStart&&activeIdx!==null){
    var o=origZone,dx3=p.x-dragStart.x,dy3=p.y-dragStart.y;
    var nx2=o.x,ny2=o.y,nw=o.w,nh=o.h,h=o.handle;
    var fs2=e.shiftKey||(document.getElementById('pSq')&&document.getElementById('pSq').checked);
    if(h.indexOf('e')>=0)nw=Math.max(5,o.w+dx3);
    if(h.indexOf('w')>=0){nx2=o.x+dx3;nw=Math.max(5,o.w-dx3);}
    if(h.indexOf('s')>=0)nh=Math.max(5,o.h+dy3);
    if(h.indexOf('n')>=0){ny2=o.y+dy3;nh=Math.max(5,o.h-dy3);}
    nw=snp(nw);nh=snp(nh);nx2=snp(nx2);ny2=snp(ny2);
    if(fs2){var sd=Math.max(nw,nh);nw=sd;nh=sd;}
    setZoneRect(config.zones[activeIdx],nx2,ny2,nw,nh);
    updPropsInputs();render();showInfo(Math.round(nw)+'x'+Math.round(nh));return;
  }

  // Curseur
  if(tool==='select'){
    var pc2=hitPersCorner(m.x,m.y);
    var rh2=hitRectHandle(m.x,m.y);
    if(pc2>=0){cv.style.cursor='move';}
    else if(rh2){
      var cs={nw:'nw-resize',n:'n-resize',ne:'ne-resize',e:'e-resize',se:'se-resize',s:'s-resize',sw:'sw-resize',w:'w-resize'};
      cv.style.cursor=cs[rh2]||'pointer';
    }else if(hitZone(m.x,m.y)>=0){cv.style.cursor='move';}
    else cv.style.cursor='default';
  }
});

document.addEventListener('mouseup',function(e){
  if(isDrawing&&drawRect&&drawRect.w>5&&drawRect.h>5){
    var fs=e.shiftKey||(document.getElementById('pSq')&&document.getElementById('pSq').checked);
    var x=drawRect.x,y=drawRect.y,w=drawRect.w,h=drawRect.h;
    if(fs){var s=Math.max(w,h);w=s;h=s;}
    config.zones.push(makeZoneRect(x,y,w,h,activeView));
    activeIdx=config.zones.length-1;
    buildZoneList();updPropsPanel();showSTab('props');
  }
  isDrawing=false;isDragging=false;isResizing=false;isPerspDrag=false;
  drawRect=null;drawStart=null;dragStart=null;origZone=null;persHandle=null;
  activeGuides=[];hideInfo();render();
});

// ── KEYBOARD ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown',function(e){
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
  if(e.key==='v'||e.key==='V')setTool('select');
  if(e.key==='d'||e.key==='D')setTool('draw');
  if((e.key==='Delete'||e.key==='Backspace')&&activeIdx!==null){
    if(!confirm('Supprimer ?'))return;
    config.zones.splice(activeIdx,1);
    if(activeIdx>=config.zones.length)activeIdx=config.zones.length-1;
    if(!config.zones.length)activeIdx=null;
    buildZoneList();updPropsPanel();render();
  }
  if(e.ctrlKey&&(e.key==='d'||e.key==='D')){e.preventDefault();dupZone();}
  if(e.key==='Escape'){activeIdx=null;buildZoneList();updPropsPanel();render();}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)>=0&&activeIdx!==null){
    e.preventDefault();
    var step=e.shiftKey?10:1;
    var offX2=0,offY2=0;
    if(e.key==='ArrowLeft')offX2=-step;if(e.key==='ArrowRight')offX2=step;
    if(e.key==='ArrowUp')offY2=-step;if(e.key==='ArrowDown')offY2=step;
    config.zones[activeIdx].pts=config.zones[activeIdx].pts.map(function(pt){return{x:pt.x+offX2,y:pt.y+offY2};});
    updPropsInputs();render();
  }
});

// ── TOOL ──────────────────────────────────────────────────────────────────────
function setTool(t){
  tool=t;
  cv.style.cursor=t==='draw'?'crosshair':'default';
  var mb=document.getElementById('modebadge');
  if(t==='draw')mb.textContent='Dessiner (glisse + Shift=carre)';
  else if(activeIdx!==null&&config.zones[activeIdx]&&config.zones[activeIdx].mode==='perspective')mb.textContent='Mode Perspective — glisse les coins';
  else mb.textContent='Selectionner (V)';
}

// ── ZOOM ──────────────────────────────────────────────────────────────────────
function zmFit(){
  var wrap=document.getElementById('cwrap');
  var ww=wrap.clientWidth-40,wh=wrap.clientHeight-40;
  zoom=Math.min(ww/imgW,wh/imgH,2);
  var cw=Math.round(imgW*zoom),ch=Math.round(imgH*zoom);
  panX=(ww-cw)/2+20;panY=(wh-ch)/2+20;
  resizeCv();render();
}
function zmIn(){zoom=Math.min(zoom*1.2,8);render();}
function zmOut(){zoom=Math.max(zoom/1.2,0.1);render();}
function resizeCv(){var w=document.getElementById('cwrap');cv.width=w.clientWidth;cv.height=w.clientHeight;}

cv.addEventListener('wheel',function(e){
  e.preventDefault();
  var f=e.deltaY<0?1.1:0.9,m=mpt(e),b=c2i(m.x,m.y);
  zoom=Math.min(Math.max(zoom*f,0.1),8);
  var a=i2c(b.x,b.y);panX+=m.x-a.x;panY+=m.y-a.y;render();
},{passive:false});

// ── ALIGN ─────────────────────────────────────────────────────────────────────
function getVZ(){return config.zones.map(function(z,i){return{z:z,i:i};}).filter(function(o){return o.z.view===activeView&&o.z.pts;});}

function aln(type){
  var zs=getVZ();if(zs.length<2)return;
  var rs=zs.map(function(o){return{i:o.i,r:getZoneRect(o.z)};});
  var ref;
  if(type==='left')ref=Math.min.apply(null,rs.map(function(r){return r.r.x;}));
  if(type==='right')ref=Math.max.apply(null,rs.map(function(r){return r.r.x+r.r.w;}));
  if(type==='top')ref=Math.min.apply(null,rs.map(function(r){return r.r.y;}));
  if(type==='bottom')ref=Math.max.apply(null,rs.map(function(r){return r.r.y+r.r.h;}));
  if(type==='cx')ref=rs.reduce(function(s,r){return s+r.r.x+r.r.w/2;},0)/rs.length;
  if(type==='cy')ref=rs.reduce(function(s,r){return s+r.r.y+r.r.h/2;},0)/rs.length;
  rs.forEach(function(item){
    var r=item.r,z=config.zones[item.i];
    if(type==='left')moveZone(z,ref,r.y);
    else if(type==='right')moveZone(z,ref-r.w,r.y);
    else if(type==='top')moveZone(z,r.x,ref);
    else if(type==='bottom')moveZone(z,r.x,ref-r.h);
    else if(type==='cx')moveZone(z,ref-r.w/2,r.y);
    else if(type==='cy')moveZone(z,r.x,ref-r.h/2);
  });
  render();
}

function moveZone(z,nx,ny){
  var r=getZoneRect(z),dx=nx-r.x,dy=ny-r.y;
  z.pts=z.pts.map(function(p){return{x:p.x+dx,y:p.y+dy};});
}

function dist(axis){
  var zs=getVZ();if(zs.length<3)return;
  var rs=zs.map(function(o){return{i:o.i,r:getZoneRect(o.z)};});
  if(axis==='h'){
    rs.sort(function(a,b){return a.r.x-b.r.x;});
    var tw=rs.reduce(function(s,r){return s+r.r.w;},0);
    var sp=(rs[rs.length-1].r.x+rs[rs.length-1].r.w-rs[0].r.x-tw)/(rs.length-1);
    var cx=rs[0].r.x;
    rs.forEach(function(item){moveZone(config.zones[item.i],cx,item.r.y);cx+=item.r.w+sp;});
  } else {
    rs.sort(function(a,b){return a.r.y-b.r.y;});
    var th=rs.reduce(function(s,r){return s+r.r.h;},0);
    var sp2=(rs[rs.length-1].r.y+rs[rs.length-1].r.h-rs[0].r.y-th)/(rs.length-1);
    var cy=rs[0].r.y;
    rs.forEach(function(item){moveZone(config.zones[item.i],item.r.x,cy);cy+=item.r.h+sp2;});
  }
  render();
}

function sameSize(){
  if(activeIdx===null){toast('Selectionnez la zone de reference',false);return;}
  var ref=getZoneRect(config.zones[activeIdx]);
  getVZ().forEach(function(o){
    var r=getZoneRect(o.z);
    setZoneRect(config.zones[o.i],r.x,r.y,ref.w,ref.h);
  });
  render();
}

// ── INFO ──────────────────────────────────────────────────────────────────────
function showInfo(txt){var el=document.getElementById('cinfo');el.textContent=txt;el.classList.add('show');clearTimeout(infoTimer);infoTimer=setTimeout(function(){el.classList.remove('show');},1500);}
function hideInfo(){clearTimeout(infoTimer);document.getElementById('cinfo').classList.remove('show');}

// ── SAVE ──────────────────────────────────────────────────────────────────────
async function saveAll(){
  var r=await fetch('/products',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sku:SKU,name:config.product.name,config:config,margin:${margin},prix_achat:${prixAchat}})});
  if(r.ok)toast('Enregistre !');else toast('Erreur',false);
}

function toast(msg,ok){ok=ok!==false;var t=document.getElementById('toast');t.textContent=msg;t.style.background=ok?'#22c55e':'#ef4444';t.style.display='block';setTimeout(function(){t.style.display='none';},2200);}

// ── INIT ──────────────────────────────────────────────────────────────────────
function init(){
  var views=getViews();
  if(!config.viewImgs[views[0]])config.viewImgs[views[0]]=null;
  buildVTabs();switchView(views[0]);
  window.addEventListener('resize',function(){resizeCv();zmFit();});
}

function loadImages(){
  var proms=Object.keys(config.viewImgs||{}).filter(function(v){return config.viewImgs[v];}).map(function(v){
    return new Promise(function(res){
      var im=new Image();im.onload=function(){imgCache[v]=im;res();};im.onerror=res;im.src=config.viewImgs[v];
    });
  });
  Promise.all(proms).then(function(){
    var views=getViews();
    if(views.length&&imgCache[views[0]]){imgW=imgCache[views[0]].naturalWidth;imgH=imgCache[views[0]].naturalHeight;}
    init();
  });
}

window.addEventListener('load',function(){resizeCv();loadImages();});
</script>
</body>
</html>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('GOODS API sur port ' + PORT));
