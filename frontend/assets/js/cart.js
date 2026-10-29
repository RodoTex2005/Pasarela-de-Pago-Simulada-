'use strict';
const API='http://localhost:3000/api';const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
let products=[];
function cart(){try{return JSON.parse(localStorage.getItem('storeCart')||'[]')}catch{return []}}
function save(c){localStorage.setItem('storeCart',JSON.stringify(c))}
function render(){
 const c=cart(),el=document.getElementById('cartItems');el.replaceChildren();let total=0;
 if(!c.length){document.getElementById('notice').textContent='Tu carrito está vacío.';document.getElementById('total').textContent='';document.getElementById('checkoutBtn').disabled=true;return}
 document.getElementById('notice').textContent='';
 for(const item of c){const p=products.find(x=>x.id===item.productId);if(!p)continue;total+=p.price*item.quantity;
  const row=document.createElement('div');row.className='cart-row';const label=document.createElement('div');const strong=document.createElement('strong');strong.textContent=p.name;const price=document.createElement('p');price.textContent=money(p.price)+' por unidad';label.append(strong,price);
  const qty=document.createElement('input');qty.type='number';qty.min='1';qty.max=String(Math.max(1,p.stock-p.reserved));qty.value=String(item.quantity);qty.setAttribute('aria-label','Cantidad de '+p.name);
  qty.addEventListener('change',()=>{const val=Math.max(1,Math.min(Number(qty.value)||1,p.stock-p.reserved));const next=cart();const it=next.find(x=>x.productId===p.id);if(it)it.quantity=val;save(next);render()});
  const remove=document.createElement('button');remove.className='btn btn-ghost';remove.textContent='Eliminar';remove.addEventListener('click',()=>{save(cart().filter(x=>x.productId!==p.id));render()});
  row.append(label,qty,remove);el.append(row);
 }
 document.getElementById('total').textContent='Total: '+money(total);document.getElementById('checkoutBtn').disabled=!cart().length;
}
document.getElementById('checkoutBtn').addEventListener('click',()=>{if(!cart().length)return;if(!localStorage.getItem('storeToken')){location.href='login.html?next=checkout';return}location.href='index.html'});
fetch(`${API}/inventory/products`).then(async r=>{const d=await r.json();if(!r.ok)throw Error();products=d.products||[];render()}).catch(()=>{document.getElementById('notice').textContent='No se pudo consultar el inventario. Comprueba que los servicios estén activos.'});
