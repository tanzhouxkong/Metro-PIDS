const fs=require('fs');
const en=JSON.parse(fs.readFileSync('src/locales/en.json','utf8'));
const zh=JSON.parse(fs.readFileSync('src/locales/zh-CN.json','utf8'));
const missing=[];
function walk(e,z,p=''){
  if(e && typeof e==='object' && !Array.isArray(e)){
    if(!z || typeof z!=='object'){ missing.push(p||'<root>'); return; }
    for(const k of Object.keys(e)){
      const np = p ? (p + '.' + k) : k;
      if(!(k in z)) missing.push(np);
      else walk(e[k], z[k], np);
    }
  }
}
walk(en,zh);
console.log(missing.join('\n'));
console.log('TOTAL', missing.length);
