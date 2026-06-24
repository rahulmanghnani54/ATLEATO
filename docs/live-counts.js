// Live waitlist + vanguard counters (extracted from inline <script> so the page
// can ship a strict CSP without 'unsafe-inline' in script-src). The Supabase
// anon key is public by design (RLS-protected, read-only RPC).
(function(){
  var SUPA = 'https://kbldncrurztfwlqzajen.supabase.co';
  var KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtibGRuY3J1cnp0ZndscXphamVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Njg3NDcsImV4cCI6MjA5NDE0NDc0N30.rIT9u4d5dht_UWJ9er7ic1-TBa4C5ISRMdDwOolgIUA';
  function rpc(name){
    return fetch(SUPA + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function(r){return r.ok?r.json():0;}).then(function(n){return typeof n==='number'?n:0;}).catch(function(){return 0;});
  }
  function refresh() {
    Promise.all([ rpc('waitlist_count'), rpc('vanguard_claimed_count') ]).then(function(r){
      var w = document.getElementById('live-waitlist-count');
      var v = document.getElementById('live-vanguard-count');
      if (w) w.textContent = (r[0]||0).toLocaleString();
      if (v) v.textContent = Math.min(r[1]||0, 500);
    });
  }
  refresh();
  setInterval(refresh, 20000);
})();
