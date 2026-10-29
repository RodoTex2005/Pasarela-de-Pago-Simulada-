'use strict';
const API='http://localhost:3000/api';
const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
const emojis = {'laptop':'💻','mouse':'🖱️','audifonos':'🎧','teclado':'⌨️','monitor':'🖥️','mousepad':'🖱️','webcam':'📷','microfono':'🎙️','silla':'🪑','ssd':'💾','ram':'🧠','hub':'🔌','bocina':'🔊','tablet':'📱','cargador':'🔋','mochila':'🎒','soporte':'💻','control':'🎮','impresora':'🖨️','router':'📡'};
let products=[];
function cart(){try{return JSON.parse(localStorage.getItem('storeCart')||'[]')}catch{return []}}
function saveCart(v){localStorage.setItem('storeCart',JSON.stringify(v));updateCount()}
function updateCount(){document.getElementById('cartCount').textContent=cart().reduce((n,x)=>n+x.quantity,0)}
function updateAccount(){
 const token=localStorage.getItem('storeToken'); let user=null;
 try{user=JSON.parse(localStorage.getItem('storeUser')||'null')}catch{}
 document.getElementById('welcome').textContent=token&&user?`Hola, ${user.name}`:'';
 document.getElementById('accountLink').textContent=token?'Mi cuenta':'Iniciar sesión';
 document.getElementById('accountLink').href=token?'cart.html':'login.html';
 document.getElementById('logoutBtn').hidden=!token;
}
document.getElementById('logoutBtn').addEventListener('click',()=>{localStorage.removeItem('storeToken');localStorage.removeItem('storeUser');updateAccount()});
function normalizeSearch(value){
 return String(value).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();
}
function render(){
 const q=normalizeSearch(document.getElementById('search').value);const sort=document.getElementById('sort').value;
 let list=products.filter(p=>normalizeSearch(p.name).includes(q)||normalizeSearch(p.id).includes(q));
 if(sort==='price-asc')list.sort((a,b)=>a.price-b.price);if(sort==='price-desc')list.sort((a,b)=>b.price-a.price);if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name,'es'));
 const el=document.getElementById('products');el.replaceChildren();
 for(const p of list){
  const card=document.createElement('article');card.className='product';
  const art=document.createElement('div');art.className='product-art';art.setAttribute('aria-hidden','true');art.textContent=emojis[p.id.split('-')[0]]||'🛍️';
  const title=document.createElement('h3');title.textContent=p.name;
  const id=document.createElement('small');id.className='muted';id.textContent=p.id;
  const price=document.createElement('p');price.className='price';price.textContent=money(p.price);
  const stock=document.createElement('p');stock.className='stock';stock.textContent=p.stock-p.reserved>0?`${p.stock-p.reserved} disponibles`:'Agotado';
  const actions=document.createElement('div');actions.className='product-actions';
  const add=document.createElement('button');add.className='btn btn-primary';add.textContent='Añadir al carrito';add.disabled=p.stock-p.reserved<1;
  add.addEventListener('click',()=>{const c=cart();const existing=c.find(x=>x.productId===p.id);if(existing)existing.quantity=Math.min(existing.quantity+1,p.stock-p.reserved);else c.push({productId:p.id,quantity:1});saveCart(c);add.textContent='Añadido ✓';setTimeout(()=>add.textContent='Añadir al carrito',900)});
  const buy=document.createElement('button');buy.className='btn btn-ghost';buy.textContent='Comprar ahora';buy.disabled=p.stock-p.reserved<1;
  buy.addEventListener('click',()=>{saveCart([{productId:p.id,quantity:1}]);if(localStorage.getItem('storeToken'))location.href='index.html';else location.href='login.html?next=checkout'});
  actions.append(add,buy);card.append(art,title,id,price,stock,actions);el.append(card);
 }
 document.getElementById('notice').textContent=list.length?`${list.length} producto(s) disponibles en el catálogo.`:'No encontramos productos con esa búsqueda.';
}
document.getElementById('search').addEventListener('input',render);document.getElementById('sort').addEventListener('change',render);
updateCount();updateAccount();
fetch(`${API}/inventory/products`).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.detail||d.error||'No se pudo cargar el catálogo');products=d.products||[];render()}).catch(e=>{document.getElementById('notice').textContent=`No se pudo cargar el inventario: ${e.message}. Comprueba Docker y el API Gateway.`});
