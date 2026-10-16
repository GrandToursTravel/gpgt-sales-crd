export function $(id){ return document.getElementById(id); }

export function escapeHtml(s){
  return s.replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
