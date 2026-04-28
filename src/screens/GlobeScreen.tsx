import React, { useCallback, useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useGardenStore } from '../stores/gardenStore';
import { BAND_META, getLocationProfile } from '../services/latitudeUtils';

// ── Latitude band colours passed into the HTML ───────────────────────────────
const BANDS_FOR_HTML = [
  { minLat:  66.5, maxLat:  90,    color: 'rgba(200,220,235,0.75)', name: 'Polar' },
  { minLat:  55,   maxLat:  66.5,  color: 'rgba(60,140,220,0.75)',  name: 'Subpolar' },
  { minLat:  45,   maxLat:  55,    color: 'rgba(60,180,80,0.75)',   name: 'Cool temperate' },
  { minLat:  35,   maxLat:  45,    color: 'rgba(140,210,50,0.75)',  name: 'Warm temperate' },
  { minLat:  23.5, maxLat:  35,    color: 'rgba(255,190,20,0.75)',  name: 'Subtropical' },
  { minLat: -23.5, maxLat:  23.5,  color: 'rgba(255,80,20,0.75)',   name: 'Tropical' },
  { minLat: -35,   maxLat: -23.5,  color: 'rgba(255,190,20,0.75)',  name: 'Subtropical' },
  { minLat: -45,   maxLat: -35,    color: 'rgba(140,210,50,0.75)',  name: 'Warm temperate' },
  { minLat: -55,   maxLat: -45,    color: 'rgba(60,180,80,0.75)',   name: 'Cool temperate' },
  { minLat: -66.5, maxLat: -55,    color: 'rgba(60,140,220,0.75)',  name: 'Subpolar' },
  { minLat: -90,   maxLat: -66.5,  color: 'rgba(200,220,235,0.75)', name: 'Polar' },
];

// ── D3 orthographic globe — 2D Canvas, no WebGL ──────────────────────────────
function buildGlobeHtml(initLat: number, initLon: number): string {
  const bandsJson = JSON.stringify(BANDS_FOR_HTML);
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;background:#050a14;overflow:hidden;touch-action:none}
    canvas{position:absolute;top:0;left:0}
    #loading{
      position:fixed;top:0;left:0;right:0;bottom:0;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:#050a14;color:rgba(255,255,255,0.85);
      font-family:-apple-system,sans-serif;font-size:15px;z-index:100;gap:14px
    }
    .sp{
      width:32px;height:32px;border:3px solid rgba(255,255,255,0.15);
      border-top-color:#4CAF50;border-radius:50%;
      animation:spin .8s linear infinite
    }
    @keyframes spin{to{transform:rotate(360deg)}}
    #hint{
      position:fixed;bottom:12px;left:0;right:0;text-align:center;
      color:rgba(255,255,255,0.55);font-family:-apple-system,sans-serif;
      font-size:12px;pointer-events:none;z-index:10
    }
  </style>
</head>
<body>
  <div id="loading"><div class="sp"></div><span>Loading globe\u2026</span></div>
  <canvas id="c"></canvas>
  <div id="hint">Drag to spin \u00b7 Tap to set your location</div>

  <script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"></script>
  <script>
  (function(){
    var W=window.innerWidth, H=window.innerHeight;
    var R=Math.min(W,H)*0.42;
    var BANDS=${bandsJson};
    var INIT_LON=${initLon};
    var INIT_LAT=${initLat};

    var canvas=document.getElementById('c');
    canvas.width=W; canvas.height=H;
    var ctx=canvas.getContext('2d');

    var proj=d3.geoOrthographic()
      .scale(R).translate([W/2,H/2])
      .clipAngle(90).rotate([-INIT_LON,-INIT_LAT,0]);

    var gp=d3.geoPath(proj,ctx);
    var world=null, land=null, borders=null, pin=null;
    var spinning=true, loopRunning=false;

    function draw(){
      ctx.clearRect(0,0,W,H);

      // ocean
      ctx.beginPath(); gp({type:'Sphere'}); ctx.fillStyle='#0d2137'; ctx.fill();

      // latitude bands — drawn as 2D canvas strips clipped to the globe circle.
      // This avoids D3 GeoJSON anti-meridian / winding issues entirely.
      // Project each band's lat boundaries at the center-facing longitude to get screen Y.
      (function(){
        ctx.save();
        ctx.beginPath(); gp({type:'Sphere'}); ctx.clip();
        var rot=proj.rotate();
        var centerLon=-rot[0]; // the longitude currently facing the viewer
        var cx=W/2;
        for(var i=0;i<BANDS.length;i++){
          var b=BANDS[i];
          var ptBot=proj([centerLon,b.minLat]);
          var ptTop=proj([centerLon,b.maxLat]);
          if(!ptBot||!ptTop) continue;
          var top=Math.min(ptBot[1],ptTop[1]);
          var bottom=Math.max(ptBot[1],ptTop[1]);
          ctx.fillStyle=b.color;
          ctx.fillRect(cx-R-2,top,(R+2)*2,bottom-top);
        }
        ctx.restore();
      })();

      // land (pre-merged features for speed)
      if(land){
        ctx.beginPath(); gp(land);
        ctx.fillStyle='rgba(45,85,45,0.9)'; ctx.fill();
      }
      if(borders){
        ctx.beginPath(); gp(borders);
        ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=0.7; ctx.stroke();
      }

      // globe outline
      ctx.beginPath(); gp({type:'Sphere'});
      ctx.strokeStyle='rgba(100,160,255,0.6)'; ctx.lineWidth=2; ctx.stroke();

      // pin
      if(pin){
        var rot=proj.rotate();
        if(d3.geoDistance([pin.lng,pin.lat],[-rot[0],-rot[1]])<Math.PI/2){
          var xy=proj([pin.lng,pin.lat]);
          if(xy){
            ctx.beginPath(); ctx.arc(xy[0],xy[1],8,0,2*Math.PI);
            ctx.fillStyle='#FF4444'; ctx.fill();
            ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
          }
        }
      }
    }

    // Throttled loop: ~12 fps — enough for smooth spin, safe for emulator
    var FRAME_MS=85;
    function startLoop(){
      if(loopRunning) return;
      loopRunning=true;
      function tick(){
        if(!spinning){ loopRunning=false; return; }
        var r=proj.rotate(); proj.rotate([r[0]+0.5,r[1],r[2]]);
        draw();
        setTimeout(tick, FRAME_MS);
      }
      setTimeout(tick, FRAME_MS);
    }

    var dragStart=null, startRot=null, sens=90/R;

    canvas.addEventListener('touchstart',function(e){
      spinning=false;
      var t=e.touches[0];
      dragStart=[t.clientX,t.clientY];
      startRot=proj.rotate().slice();
      e.preventDefault();
    },{passive:false});

    canvas.addEventListener('touchmove',function(e){
      if(!dragStart) return;
      var t=e.touches[0];
      proj.rotate([
        startRot[0]+(t.clientX-dragStart[0])*sens,
        Math.max(-90,Math.min(90,startRot[1]-(t.clientY-dragStart[1])*sens)),
        startRot[2]
      ]);
      draw(); e.preventDefault();
    },{passive:false});

    canvas.addEventListener('touchend',function(e){
      var t=e.changedTouches[0];
      var dx=Math.abs(t.clientX-dragStart[0]);
      var dy=Math.abs(t.clientY-dragStart[1]);
      if(dx<10&&dy<10){
        var c=proj.invert([t.clientX,t.clientY]);
        if(c&&!isNaN(c[0])&&!isNaN(c[1])){
          pin={lat:c[1],lng:c[0]};
          draw();
          if(window.ReactNativeWebView){
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',lat:c[1],lng:c[0]}));
          }
        }
      }
      dragStart=null;
      setTimeout(function(){spinning=true; loopRunning=false; startLoop();},3000);
      e.preventDefault();
    },{passive:false});

    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
      .then(function(r){return r.json();})
      .then(function(data){
        // pre-merge topology once — never call topojson.feature per frame
        land=topojson.feature(data,data.objects.countries);
        borders=topojson.mesh(data,data.objects.countries,function(a,b){return a!==b;});
        document.getElementById('loading').style.display='none';
        draw();
        startLoop();
      })
      .catch(function(){
        var el=document.getElementById('loading');
        el.innerHTML='<span style="color:#ff8080;text-align:center;padding:24px">Could not load map.<br>Please check your internet connection.</span>';
      });
  })();
  </script>
</body>
</html>`;
}

// ── React Native screen ───────────────────────────────────────────────────────

export function GlobeScreen() {
  const latitude = useGardenStore((s) => s.latitude);
  const longitude = useGardenStore((s) => s.longitude);
  const saveLocation = useGardenStore((s) => s.saveLocation);

  const [savedLat, setSavedLat] = useState<number | null>(null);
  const [snackVisible, setSnackVisible] = useState(false);

  const initLat = latitude ?? -43.53;
  const initLon = longitude ?? 172.63;

  const html = useMemo(() => buildGlobeHtml(initLat, initLon), [initLat, initLon]);
  const profile = latitude != null ? getLocationProfile(latitude) : null;

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'location') {
        // Save immediately on tap — no confirmation step required
        saveLocation(data.lat, data.lng);
        setSavedLat(data.lat);
        setSnackVisible(true);
      }
    } catch { /* ignore malformed messages */ }
  }, [saveLocation]);

  const savedProfile = savedLat != null ? getLocationProfile(savedLat) : null;

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://localhost' }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        mixedContentMode="always"
        cacheEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
      />

      {/* Current location profile badge */}
      {profile && (
        <View style={styles.profileBadge} pointerEvents="none">
          <Text style={styles.profileBand}>{profile.band}</Text>
          <Text style={styles.profileDetail}>
            {profile.hemisphere} · {latitude?.toFixed(2)}°, {longitude?.toFixed(2)}°
          </Text>
        </View>
      )}

      {/* Band legend */}
      <View style={styles.legend} pointerEvents="none">
        {BAND_META.slice().reverse().map((b) => (
          <View key={b.band} style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: b.color }]} />
            <Text style={styles.legendLabel}>{b.band}</Text>
          </View>
        ))}
      </View>

      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={3000}
        style={styles.snackbar}
      >
        {savedProfile
          ? `✅ Location set: ${latitude?.toFixed(2)}°, ${longitude?.toFixed(2)}° — ${savedProfile.band}`
          : '✅ Location saved'}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050a14' },
  webview: { flex: 1 },

  profileBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profileBand: { color: '#fff', fontWeight: '700', fontSize: 14 },
  profileDetail: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  legend: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendLabel: { color: '#fff', fontSize: 11 },

  snackbar: { backgroundColor: '#1B5E20' },
});


