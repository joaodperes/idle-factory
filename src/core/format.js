const SUFFIXES = ['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc'];
function trimStr(s){ return s.indexOf('.')>=0 ? s.replace(/0+$/,'').replace(/\.$/,'') : s; }
export function fmt(n){
  if(!isFinite(n)) return '∞';
  if(n===0) return '0';
  if(n<0) return '-'+fmt(-n);
  if(n<0.01) return n.toExponential(1);
  if(n<1000){
    if(n<10) return trimStr(n.toFixed(2));
    if(n<100) return trimStr(n.toFixed(1));
    return Math.floor(n).toString();
  }
  const tier = Math.floor(Math.log10(n)/3);
  if(tier>=SUFFIXES.length) return n.toExponential(2);
  return trimStr((n/Math.pow(1000,tier)).toFixed(2)) + SUFFIXES[tier];
}
export function fmtTime(s){
  s = Math.floor(s);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if(h) return `${h}h ${m}m`;
  if(m) return `${m}m ${sec}s`;
  return `${sec}s`;
}
