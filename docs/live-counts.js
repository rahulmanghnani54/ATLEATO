// Live waitlist + vanguard counters (extracted from inline <script> so the page
// can ship a strict CSP without 'unsafe-inline' in script-src). The Supabase
// anon key is public by design (RLS-protected, read-only RPC).
(function(){
  var SUPA = 'https://kbldncrurztfwlqzajen.supabase.co';
  var KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtibGRuY3J1cnp0ZndscXphamVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Njg3NDcsImV4cCI6MjA5NDE0NDc0N30.rIT9u4d5dht_UWJ9er7ic1-TBa4C5ISRMdDwOolgIUA';
  // Below this, hide the live counters entirely — an empty "5 on waitlist / 0/500"
  // is negative social proof. They reappear automatically once the numbers are real.
  var LOW = 100;
  function rpc(name){
    return fetch(SUPA + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function(r){return r.ok?r.json():0;}).then(function(n){return typeof n==='number'?n:0;}).catch(function(){return 0;});
  }
  function setStat(el, show, text){
    if (!el) return;
    var stat = el.closest ? el.closest('.stat') : null;
    var div  = stat && stat.nextElementSibling;
    var isDiv = div && div.classList && div.classList.contains('stat-divider');
    if (show) {
      el.textContent = text;
      if (stat) stat.style.display = '';
      if (isDiv) div.style.display = '';
    } else {
      if (stat) stat.style.display = 'none';
      if (isDiv) div.style.display = 'none';
    }
  }
  function refresh() {
    Promise.all([ rpc('waitlist_count'), rpc('vanguard_claimed_count') ]).then(function(r){
      var w = document.getElementById('live-waitlist-count');
      var v = document.getElementById('live-vanguard-count');
      var show = (r[0]||0) >= LOW;          // only show real, credible numbers
      setStat(w, show, (r[0]||0).toLocaleString());
      setStat(v, show, String(Math.min(r[1]||0, 500)));
    });
  }
  refresh();
  setInterval(refresh, 20000);
})();
