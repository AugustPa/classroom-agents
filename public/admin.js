(function () {
  const socket = io({ autoConnect: false, query: { role: "admin", key: sessionStorage.getItem("lecturerKey") || "" } });
  const $ = (id) => document.getElementById(id);
  const phaseEl=$("phase"), botModelEl=$("botModel"), boundaryModeEl=$("boundaryMode"), visibilityRuleEl=$("visibilityRule");
  const swarmDirectionDegEl=$("swarmDirectionDeg"), swarmDirBadgeEl=$("swarmDirBadge"), swarmREl=$("swarmR"), swarmRBadgeEl=$("swarmRBadge"), swarmSplitAngleDegEl=$("swarmSplitAngleDeg"), splitAngleBadgeEl=$("splitAngleBadge");
  const swarmNoiseEl=$("swarmNoise"), swarmAlignStrengthEl=$("swarmAlignStrength"), informedCountEl=$("informedCount");
  const topologicalKEl=$("topologicalK"), metricRadiusEl=$("metricRadius");
  const oasisEnabledEl=$("oasisEnabled"), oasisShowHintEl=$("oasisShowHint"), oasisRadiusEl=$("oasisRadius"), oasisSlowFactorEl=$("oasisSlowFactor");
  const stopAndGoEnabledEl=$("stopAndGoEnabled"), collisionScoreEnabledEl=$("collisionScoreEnabled"), collisionStopDistEl=$("collisionStopDist"), collisionRadiusEl=$("collisionRadius"), deadTimeSecEl=$("deadTimeSec");
  const showScarvesEl=$("showScarves"), showTagsEl=$("showTags"), matchBotsToHumansEl=$("matchBotsToHumans");
  const botCountEl=$("botCount"), humanSpeedEl=$("humanSpeed"), botSpeedEl=$("botSpeed"), speedVarianceEl=$("speedVariance"), speedVarBadgeEl=$("speedVarBadge"), humanSizeEl=$("humanSize"), botSizeEl=$("botSize");
  const randomWalkTurnRateEl=$("randomWalkTurnRate"), randomWalkSpeedJitterEl=$("randomWalkSpeedJitter"), humanSpawnRadiusEl=$("humanSpawnRadius"), botSpawnRadiusEl=$("botSpawnRadius");
  const runningEl=$("running"), followCentroidEl=$("followCentroid"), showTrailsEl=$("showTrails"), trailSecondsEl=$("trailSeconds"), trailWidthEl=$("trailWidth"), godZoomEl=$("godZoom");
  const overridesEl=$("overrides"), downloadTrajCsvEl=$("downloadTrajCsv"), downloadMetricsCsvEl=$("downloadMetricsCsv"), downloadEventsCsvEl=$("downloadEventsCsv");
  const statsEl=$("stats"), logFileEl=$("logFile"), matrixWrap=$("matrixWrap"), rosterWrap=$("rosterWrap");
  const cruxTitleEl=$("cruxTitle"), cruxBodyEl=$("cruxBody");
  const sessionStatusBadgeEl=$("sessionStatusBadge"), kpiPhaseEl=$("kpiPhase"), kpiModelEl=$("kpiModel"), kpiHumansEl=$("kpiHumans"), kpiBotsEl=$("kpiBots"), kpiMatchStatusEl=$("kpiMatchStatus");
  const kpiHumanPhiEl=$("kpiHumanPhi"), kpiHumanHeadingEl=$("kpiHumanHeading"), kpiEntrainmentEl=$("kpiEntrainment"), kpiBotHeadingEl=$("kpiBotHeading"), kpiOasisEl=$("kpiOasis"), kpiSpreadEl=$("kpiSpread");
  const hexSpacingEl=$("hexSpacing"), hexRingsEl=$("hexRings"), mirrorGhostsEl=$("mirrorGhosts"), trailSourceEl=$("trailSource");
  const expectedCanvas=$("expectedCanvas"), expectedCtx=expectedCanvas?expectedCanvas.getContext("2d"):null;
  const godCanvas=$("adminCanvas"), godCtx=godCanvas.getContext("2d");
  const polarCanvas=$("polarCanvas"), polarCtx=polarCanvas.getContext("2d");
  const metricsCanvas=$("metricsCanvas"), metricsCtx=metricsCanvas.getContext("2d");
  const cruxCanvas=$("cruxCanvas"), cruxCtx=cruxCanvas.getContext("2d");

  const dpr=Math.min(window.devicePixelRatio||1,2);
  [godCanvas,polarCanvas,metricsCanvas,cruxCanvas,expectedCanvas].forEach(c=>{
    if(!c)return;
    const lw=c.width,lh=c.height;
    c._lw=lw;c._lh=lh;
    if(dpr>1){
      c.width=Math.round(lw*dpr);
      c.height=Math.round(lh*dpr);
      const ctx=c.getContext("2d");
      if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
    }
  });

  const CRUX = {
    expt1_entrain:{title:"Expt 1A — Locust marching entrainment · Vicsek (1995); Buhl et al., Science (2006)",body:"<strong>Do:</strong> 14 bots march at θ<sub>swarm</sub>; students see only bots. <strong>Watch:</strong> Φ<sub>humans</sub> (alignment, 0=gas, 1=marching band) and entrainment ⟨cos(θ−θ<sub>swarm</sub>)⟩. Sweep noise η high→low to show disorder→order. <strong>Explain:</strong> density + alignment can create a marching band with no leader."},
    expt1_handoff:{title:"Expt 1B — Handoff: do 15 students keep marching alone? · Buhl et al. (2006)",body:"<strong>Do:</strong> bots vanish; the same 15 students now see only each other (same peer count, N−1=14). <strong>Watch:</strong> does Φ<sub>humans</sub> stay high, decay, or re-form in a new direction (polar rose)? <strong>Explain:</strong> entrainment can persist through peer feedback — or collapse without the external flow."},
    expt2_bifurcation:{title:"Expt 2 — Two-choice decision & bifurcation · Couzin et al., Nature (2005)",body:"<strong>Do:</strong> bots split into two streams at θ<sub>swarm</sub> ± Δθ/2. Try Δθ = 20°, 45°, 70°, 100°. <strong>Watch:</strong> heading histogram — one central peak = compromise averaging; two peaks at ±Δθ/2 = symmetry breaking. <strong>Crux:</strong> groups cannot average widely separated options."},
    expt3_informed:{title:"Expt 3 — Informed minority: can 3 steer 15? · Couzin et al., Nature (2005)",body:"<strong>Do:</strong> only K informed students see the golden beacon toward θ<sub>swarm</sub>; everyone else: “stay with the group”. <strong>Watch:</strong> entrainment rises as the uninformed follow informed neighbours. <strong>Crux:</strong> a small, silent minority can steer a group — larger groups need a smaller fraction informed."},
    expt4_echo:{title:"Expt 4A — Echo chambers + bridge · social networks / polarisation",body:"<strong>Do:</strong> chamber A (blue scarves) sees only A, chamber B (red) sees only B, one gold bridge sees both. Everyone thinks it is one room. <strong>Watch:</strong> God view + matrix A<sub>ij</sub>: two headings can persist; the bridge may (or may not) merge them. Reveal the hidden network afterwards."},
    expt4_sensory:{title:"Expt 4B — Who can you sense? Topological vs metric · Ballerini et al., PNAS (2008)",body:"<strong>Do:</strong> topological: see k=4 nearest peers at any distance. Compare metric: see only peers within R metres (use the rule dropdown). <strong>Watch:</strong> Φ and spread R<sub>gyr</sub>. <strong>Crux:</strong> starlings interact with ~6–7 nearest neighbours, not everyone within a fixed radius — topological groups stay cohesive when stretched."},
    expt5_predator:{title:"Expt 5 — Predator escape wave · looming / DCMD-inspired",body:"<strong>Do:</strong> one random student gets a looming predator; the other 14 see no predator, only that neighbour fleeing. <strong>Watch:</strong> moving/startled fraction and trails — how fast does the escape wave cross the group? <strong>Crux:</strong> information travels socially, faster than most individuals could sense the threat alone."},
    expt6_taxis:{title:"Expt 6 — Collective taxis: finding shade you cannot navigate to · Berdahl et al., Science (2013)",body:"<strong>Do:</strong> inside the blue oasis everyone simply moves slower (calm zone); nobody is told where it is. Compare 6B solo (see nobody) vs 6A social (see peers). <strong>Watch:</strong> % in oasis. <strong>Crux:</strong> groups can accumulate where conditions are good even when individuals cannot sense the direction to get there."},
    expt7_stopgo:{title:"Expt 7 — Locust stop-and-go collision avoidance · Ariel et al. (2014); Bazazi et al. (2008)",body:"<strong>Do:</strong> when you are about to bump a neighbour ahead (within stop distance), you automatically pause briefly, then continue with stop-and-go movement. Speed variance σ<sub>v</sub> makes faster individuals catch up to slower ones. <strong>Watch:</strong> amber paused rings in God view and how intermittent pause-and-go traffic waves feel from the student perspective."},
    expt8_avoid_bumps:{title:"Expt 8 — Emergent order from avoiding collisions (Damage & Score) · Bazazi et al. (2008); Romanczuk et al. (2009)",body:"<strong>Do:</strong> every collision deals damage and lowers your score — the more you bump into someone, the more damage you take. <strong>Watch:</strong> does polarization Φ(t) rise spontaneously because aligning in the same direction is the only way a moving crowd avoids bumping?"},
    custom:{title:"Custom exploration",body:"<strong>Tip:</strong> change one variable at a time (noise η, speed variance σ<sub>v</sub>, k, R, Δθ, K, speed), watch Φ(t), the polar rose and the heading histogram, then download the CSVs. One-click presets above reset each experiment cleanly."}
  };

  const state={world:{width:90,height:70},agents:[],counts:{humans:0,bots:0,total:0},config:{activePreset:"expt1_entrain",phase:"bots_only",botCount:14,botModel:"directed_swarm",boundaryMode:"hex_torus",hexSpacing:24,hexRings:2,mirrorGhosts:true,visibilityRule:"all",matchBotsToHumans:false,swarmDirectionDeg:0,swarmR:0.96,swarmSplitAngleDeg:70,swarmNoise:0.08,swarmAlignStrength:0.35,informedCount:0,metricRadius:10,topologicalK:4,oasisEnabled:false,oasisShowHint:true,oasisRadius:11,oasisSlowFactor:0.32,stopAndGoEnabled:false,collisionScoreEnabled:false,collisionStopDist:2.1,collisionRadius:1.25,showScarves:true,showTags:false,showBotTrails:true,showHumanTrails:true,running:true,humanSpeed:6.2,botSpeed:5.5,speedVariance:0.15,humanSize:1,botSize:1,randomWalkTurnRate:0.12,randomWalkSpeedJitter:0.15,humanSpawnRadius:7,botSpawnRadius:12,oasisX:62,oasisY:35},metrics:null,metricsHistory:[],phaseTransitionCurve:[],phaseEvents:[],matrix:null,logFile:"",lastLocalConfigEditAt:0,lastCruxKey:"",rosterSignature:"",cameraCenter:{x:45,y:35},ui:{followCentroid:true,showTrails:true,showBotTrails:true,showHumanTrails:true,trailSeconds:35,trailWidth:1.8,godSpanMeters:80,trailSource:"both",mapMode:"global",showClones:true,god:{cx:0,cy:0,span:90,userMoved:false}}};
  state.publicUrl="";
  state.lecturerKey=sessionStorage.getItem("lecturerKey")||"";
  state.trialLive=null;
  state.trialSeries=[];
  state.replay={live:true,playing:false,t:0,trial:null,tracks:null};
  const plotViews={metrics:{custom:false,t0:0,t1:1},dynamics:{custom:false,t0:0,t1:1}};
  const trailsByAgent=new Map();
  const globalTracks=new Map();
  const CONTROL_IDS=new Set(["phase","botModel","boundaryMode","visibilityRule","swarmDirectionDeg","swarmR","swarmSplitAngleDeg","swarmNoise","swarmAlignStrength","informedCount","topologicalK","metricRadius","oasisEnabled","oasisShowHint","oasisRadius","oasisSlowFactor","stopAndGoEnabled","collisionScoreEnabled","collisionStopDist","collisionRadius","deadTimeSec","showScarves","showTags","matchBotsToHumans","botCount","humanSpeed","botSpeed","speedVariance","humanSize","botSize","running","hexSpacing","hexRings","mirrorGhosts","trailSource"]);
  const isFocused=()=>{const a=document.activeElement;return !!a&&CONTROL_IDS.has(a.id);};
  const num=(el,f=0)=>{if(!el)return f;const v=Number(String(el.value).replace(",","."));return Number.isFinite(v)?v:f;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mark=()=>{state.lastLocalConfigEditAt=Date.now();};
  function cardinal(deg){const d=["E","SE","S","SW","W","NW","N","NE"];return d[Math.round((((deg%360)+360)%360)/45)%8];}
  function rLabel(r){if(r>=0.995)return"Lock";if(r>=0.85)return"Strong";if(r>=0.55)return"Med";if(r>=0.2)return"Weak";return"CRW";}
  function badges(){swarmDirBadgeEl.textContent=`${Math.round(num(swarmDirectionDegEl,0))}° (${cardinal(num(swarmDirectionDegEl,0))})`;const s=num(swarmSplitAngleDegEl,70);splitAngleBadgeEl.textContent=`${Math.round(s)}° (±${Math.round(s/2)}°)`;if(swarmRBadgeEl){const r=num(swarmREl,0.96);swarmRBadgeEl.textContent=`R = ${r.toFixed(2)} (${rLabel(r)})`;}if(speedVarBadgeEl){const sv=num(speedVarianceEl,0.15);speedVarBadgeEl.textContent=`${Math.round(sv*100)}% (${sv.toFixed(2)})`;}}

  function emitConfig(){
    badges();
    socket.emit("admin:setConfig",{phase:phaseEl.value,botModel:botModelEl.value,boundaryMode:boundaryModeEl.value,visibilityRule:visibilityRuleEl.value,swarmDirectionDeg:num(swarmDirectionDegEl,0),swarmR:num(swarmREl,0.96),swarmSplitAngleDeg:num(swarmSplitAngleDegEl,70),swarmAlignStrength:num(swarmAlignStrengthEl,0.35),metricRadius:num(metricRadiusEl,10),topologicalK:num(topologicalKEl,4),oasisEnabled:oasisEnabledEl.checked,oasisShowHint:oasisShowHintEl.checked,oasisRadius:num(oasisRadiusEl,11),oasisSlowFactor:num(oasisSlowFactorEl,0.32),stopAndGoEnabled:stopAndGoEnabledEl?stopAndGoEnabledEl.checked:false,collisionScoreEnabled:collisionScoreEnabledEl?collisionScoreEnabledEl.checked:false,collisionStopDist:num(collisionStopDistEl,2.1),collisionRadius:num(collisionRadiusEl,1.25),deadTimeSec:num(deadTimeSecEl,8),showScarves:showScarvesEl.checked,showTags:showTagsEl.checked,showBotTrails:!!state.ui.showBotTrails,showHumanTrails:!!state.ui.showHumanTrails,matchBotsToHumans:matchBotsToHumansEl.checked,botCount:num(botCountEl,14),humanSpeed:num(humanSpeedEl,6.2),botSpeed:num(botSpeedEl,5.5),speedVariance:num(speedVarianceEl,0.15),humanSize:num(humanSizeEl,1),botSize:num(botSizeEl,1),randomWalkTurnRate:num(randomWalkTurnRateEl,0.12),randomWalkSpeedJitter:num(speedVarianceEl,0.15),humanSpawnRadius:num(humanSpawnRadiusEl,7),botSpawnRadius:num(botSpawnRadiusEl,12),running:runningEl.checked,hexSpacing:num(hexSpacingEl,24),hexRings:num(hexRingsEl,2),mirrorGhosts:mirrorGhostsEl?mirrorGhostsEl.checked:true});
  }
  const debouncers=new Map();
  const debounced=(k)=>{clearTimeout(debouncers.get(k));debouncers.set(k,setTimeout(emitConfig,120));};
  function wire(el,immediate=false){if(!el)return;el.addEventListener(immediate?"change":"input",()=>{mark();immediate?emitConfig():debounced(el.id);});if(!immediate)el.addEventListener("change",()=>{mark();emitConfig();});}
  [phaseEl,botModelEl,boundaryModeEl,visibilityRuleEl,matchBotsToHumansEl,oasisEnabledEl,oasisShowHintEl,stopAndGoEnabledEl,collisionScoreEnabledEl,showScarvesEl,showTagsEl,runningEl].forEach(e=>wire(e,true));
  [swarmDirectionDegEl,swarmREl,swarmSplitAngleDegEl,swarmAlignStrengthEl,topologicalKEl,metricRadiusEl,oasisRadiusEl,oasisSlowFactorEl,collisionStopDistEl,collisionRadiusEl,deadTimeSecEl,botCountEl,humanSpeedEl,botSpeedEl,speedVarianceEl,humanSizeEl,botSizeEl,hexSpacingEl,hexRingsEl].forEach(e=>wire(e,false));
  if(mirrorGhostsEl)mirrorGhostsEl.addEventListener("change",()=>{mark();emitConfig();});
  if(swarmNoiseEl)swarmNoiseEl.addEventListener("change",()=>{mark();socket.emit("admin:setConfig",{swarmNoise:num(swarmNoiseEl,0.08)});});
  if(informedCountEl)informedCountEl.addEventListener("change",()=>{mark();socket.emit("admin:setConfig",{informedCount:num(informedCountEl,0)});});
  if(randomWalkTurnRateEl)randomWalkTurnRateEl.addEventListener("change",()=>{mark();emitConfig();});
  document.querySelectorAll(".chip-r").forEach(b=>b.onclick=()=>{if(swarmREl)swarmREl.value=b.dataset.r;mark();emitConfig();});

  function setCrux(key){const c=CRUX[key]||CRUX.custom;if(state.lastCruxKey===key)return;state.lastCruxKey=key;cruxTitleEl.textContent=c.title;cruxBodyEl.innerHTML=c.body;}
  function action(payload,key){mark();state.replay.live=true;state.replay.playing=false;if(key)setCrux(key);socket.emit("admin:experimentAction",payload);}
  $("btnExpt1A").onclick=()=>action({action:"preset_expt1a_entrain"},"expt1_entrain");
  $("btnExpt1BInPlace").onclick=()=>{clearTrackStores();action({action:"preset_expt1b_handoff",resetPositions:false},"expt1_handoff");};
  $("btnExpt1BReset").onclick=()=>{clearTrackStores();action({action:"preset_expt1b_handoff",resetPositions:true},"expt1_handoff");};
  $("btnExpt2Bifurc").onclick=()=>action({action:"preset_expt2_bifurcation",swarmSplitAngleDeg:num(swarmSplitAngleDegEl,70)},"expt2_bifurcation");
  $("btnExpt3Informed").onclick=()=>{if(informedCountEl)informedCountEl.value="3";action({action:"preset_expt3_informed",informedCount:3},"expt3_informed");};
  $("btnExpt4Echo").onclick=()=>action({action:"preset_expt4_echo",colorScarvesByChamber:true},"expt4_echo");
  $("btnExpt4Topo").onclick=()=>{visibilityRuleEl.value="topological_k";action({action:"preset_expt4_topological",rule:"topological_k"},"expt4_sensory");};
  $("btnExpt5Predator").onclick=()=>action({action:"preset_expt5_predator"},"expt5_predator");
  $("btnExpt6Social").onclick=()=>action({action:"preset_expt6_taxis",asocialSolo:false},"expt6_taxis");
  $("btnExpt6Solo").onclick=()=>action({action:"preset_expt6_taxis",asocialSolo:true},"expt6_taxis");
  if($("btnExpt7StopGo"))$("btnExpt7StopGo").onclick=()=>{clearTrackStores();action({action:"preset_expt7_stopgo"},"expt7_stopgo");};
  if($("btnExpt8AvoidBumps"))$("btnExpt8AvoidBumps").onclick=()=>{clearTrackStores();action({action:"preset_expt8_avoid_bumps"},"expt8_avoid_bumps");};
  if($("btnResetScores"))$("btnResetScores").onclick=()=>socket.emit("admin:experimentAction",{action:"reset_scores"});
  $("btnResetPos").onclick=()=>{clearTrackStores();socket.emit("admin:experimentAction",{action:"reset_positions"});};
  $("clearTrails").onclick=()=>clearTrackStores();
  $("clearHistory").onclick=()=>socket.emit("admin:experimentAction",{action:"clear_history"});
  $("btnUniqueScarves").onclick=()=>socket.emit("admin:experimentAction",{action:"colorize_scarves_unique"});
  $("btnUniformScarves").onclick=()=>socket.emit("admin:experimentAction",{action:"colorize_scarves_uniform"});
  $("applyConfig").onclick=()=>{mark();emitConfig();};
  document.querySelectorAll(".chip-btn").forEach(b=>b.onclick=()=>{swarmDirectionDegEl.value=b.dataset.angle;mark();emitConfig();});
  document.querySelectorAll(".chip-split").forEach(b=>b.onclick=()=>{swarmSplitAngleDegEl.value=b.dataset.split;mark();emitConfig();});

  function applyTrailSource(src){
    if(src==="bots"){state.ui.showBotTrails=true;state.ui.showHumanTrails=false;}
    else if(src==="humans"){state.ui.showBotTrails=false;state.ui.showHumanTrails=true;}
    else if(src==="none"){state.ui.showBotTrails=false;state.ui.showHumanTrails=false;}
    else {state.ui.showBotTrails=true;state.ui.showHumanTrails=true;}
    state.ui.trailSource=src;
    state.ui.showTrails=src!=="none";
    if(trailSourceEl)trailSourceEl.value=src;
    if(showTrailsEl)showTrailsEl.checked=state.ui.showTrails;
    const botOn=!!state.ui.showBotTrails, humOn=!!state.ui.showHumanTrails;
    for(const id of ["btnToggleBotTrails","btnToggleBotTrailsTop"]){const el=$(id);if(!el)continue;el.textContent=`Bot Trails: ${botOn?"ON":"OFF"}`;el.classList.toggle("active-amber",botOn);}
    for(const id of ["btnToggleHumanTrails","btnToggleHumanTrailsTop"]){const el=$(id);if(!el)continue;el.textContent=`Student Trails: ${humOn?"ON":"OFF"}`;el.classList.toggle("active-cyan",humOn);}
  }
  function emitTrailConfig(){
    applyTrailSource(state.ui.showBotTrails&&state.ui.showHumanTrails?"both":state.ui.showBotTrails?"bots":state.ui.showHumanTrails?"humans":"none");
    socket.emit("admin:setConfig",{showBotTrails:!!state.ui.showBotTrails,showHumanTrails:!!state.ui.showHumanTrails});
  }
  function toggleBotTrails(){state.ui.showBotTrails=!state.ui.showBotTrails;emitTrailConfig();}
  function toggleHumanTrails(){state.ui.showHumanTrails=!state.ui.showHumanTrails;emitTrailConfig();}
  for(const id of ["btnToggleBotTrails","btnToggleBotTrailsTop"]){const el=$(id);if(el)el.onclick=toggleBotTrails;}
  for(const id of ["btnToggleHumanTrails","btnToggleHumanTrailsTop"]){const el=$(id);if(el)el.onclick=toggleHumanTrails;}
  if(trailSourceEl)trailSourceEl.addEventListener("change",()=>{applyTrailSource(trailSourceEl.value);emitTrailConfig();});
  const headerClear=$("btnHeaderClearTrails");if(headerClear)headerClear.onclick=()=>clearTrackStores();

  function setLiveMode(on){
    document.body.classList.toggle("live-mode",on);
    const btn=$("btnToggleLiveMode");
    if(btn)btn.textContent=on?"↩ Exit Big Picture":"📺 Fullscreen Big Picture";
    const sideBtn=$("btnToggleSidebar");
    if(sideBtn)sideBtn.textContent=document.body.classList.contains("sidebar-hidden")?"🎛️ Show Sidebar":"🎛️ Hide Sidebar";
  }
  if($("btnToggleLiveMode"))$("btnToggleLiveMode").onclick=()=>setLiveMode(!document.body.classList.contains("live-mode"));
  if($("btnToggleSidebar"))$("btnToggleSidebar").onclick=()=>{
    document.body.classList.toggle("sidebar-hidden");
    $("btnToggleSidebar").textContent=document.body.classList.contains("sidebar-hidden")?"🎛️ Show Sidebar":"🎛️ Hide Sidebar";
  };
  if($("btnOpenLiveTab"))$("btnOpenLiveTab").onclick=()=>{
    const u=new URL(location.href);
    u.searchParams.set("live","1");
    window.open(u.toString(),"classroom-live","noopener");
  };
  if(new URLSearchParams(location.search).get("live")==="1"||new URLSearchParams(location.search).get("view")==="live"){
    document.body.classList.add("live-view");
    document.title="Live Big Picture — Collective Behavior Lab";
  }
  window.addEventListener("keydown",(e)=>{
    if(e.target&&(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA"||e.target.tagName==="SELECT"))return;
    if(e.key==="f"||e.key==="F"){e.preventDefault();setLiveMode(!document.body.classList.contains("live-mode"));}
    if(e.key==="b"||e.key==="B"){e.preventDefault();toggleBotTrails();}
  });
  $("clearOverrides").onclick=()=>socket.emit("admin:clearVisibilityOverrides");
  if($("applyOverrides"))$("applyOverrides").onclick=()=>{try{socket.emit("admin:setVisibilityOverrides",{edges:JSON.parse(overridesEl.value||"[]")});}catch(e){alert("Invalid JSON");}};

  followCentroidEl.onchange=()=>state.ui.followCentroid=followCentroidEl.checked;
  showTrailsEl.onchange=()=>{
    const on=showTrailsEl.checked;
    state.ui.showBotTrails=on;
    state.ui.showHumanTrails=on;
    emitTrailConfig();
  };
  trailSecondsEl.oninput=()=>state.ui.trailSeconds=clamp(num(trailSecondsEl,35),1,300);
  trailWidthEl.oninput=()=>state.ui.trailWidth=clamp(num(trailWidthEl,1.8),0.5,6);
  if(godZoomEl)godZoomEl.oninput=()=>{state.ui.godSpanMeters=clamp(num(godZoomEl,80),12,600);state.ui.god.span=state.ui.godSpanMeters;};

  // Roster delegation (survives re-renders)
  rosterWrap.addEventListener("change",(e)=>{
    const id=e.target.dataset?.id;if(!id)return;
    if(e.target.matches("input[type=color]"))socket.emit("admin:updateAgentMeta",{id,scarfColor:e.target.value});
    else if(e.target.matches("input[data-field=tag]"))socket.emit("admin:updateAgentMeta",{id,tag:e.target.value});
    else if(e.target.matches("select[data-field=role]"))socket.emit("admin:updateAgentMeta",{id,role:e.target.value});
    else if(e.target.matches("select[data-field=group]"))socket.emit("admin:updateAgentMeta",{id,group:e.target.value});
  });
  rosterWrap.addEventListener("click",(e)=>{const b=e.target.closest("button[data-startle]");if(b)socket.emit("admin:triggerLooming",{targetId:b.dataset.startle});});
  matrixWrap.addEventListener("click",(e)=>{const c=e.target.closest("td.matrix-cell");if(!c||c.dataset.observerId===c.dataset.targetId)return;socket.emit("admin:setVisibilityOverrides",{edges:[{observerId:c.dataset.observerId,targetId:c.dataset.targetId,canSee:Number(c.dataset.value)!==1}]});});

  const wrapLat=(c)=>c-Math.floor(c+0.5);
  function adminTorusDelta(a,b){
    if(!isHex())return{x:b.x-a.x,y:b.y-a.y,dist:Math.hypot(b.x-a.x,b.y-a.y)};
    const s=Math.max(6,Number(state.config.hexSpacing)||20);
    const rt3h=Math.sqrt(3)/2;
    const la=worldToLatAdmin(a.x,a.y),lb=worldToLatAdmin(b.x,b.y);
    const u0=wrapLat(lb.u-la.u),v0=wrapLat(lb.v-la.v);
    let bestX=0,bestY=0,bestD2=Infinity;
    for(const [du,dv] of [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,1],[1,-1]]){
      const u=u0+du,v=v0+dv,wx=s*(u+v*0.5),wy=s*rt3h*v,d2=wx*wx+wy*wy;
      if(d2<bestD2){bestD2=d2;bestX=wx;bestY=wy;}
    }
    return{x:bestX,y:bestY,dist:Math.sqrt(bestD2)};
  }
  function trailPlotJump(a,b){
    if(!a||!b)return true;
    if(!isHex())return Math.hypot(b.x-a.x,b.y-a.y)>14;
    const la=worldToLatAdmin(a.x,a.y),lb=worldToLatAdmin(b.x,b.y);
    return Math.abs(wrapLat(la.u)-wrapLat(lb.u))>0.36||Math.abs(wrapLat(la.v)-wrapLat(lb.v))>0.36;
  }
  function hexSpacingNow(){return Math.max(6,Number(state.config.hexSpacing)||24);}
  function toVoronoiAt(x,y,spacing){
    const s=Math.max(6,spacing||hexSpacingNow());
    const rt3h=Math.sqrt(3)/2;
    const v=y/(s*rt3h);
    const u=x/s-v/2;
    const wrap=c=>c-Math.floor(c+0.5);
    const u0=wrap(u),v0=wrap(v);
    let bx=x,by=y,bd=Infinity;
    for(const [du,dv] of [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,1],[1,-1]]){
      const wx=s*((u0+du)+(v0+dv)*0.5),wy=s*rt3h*(v0+dv),d=wx*wx+wy*wy;
      if(d<bd){bd=d;bx=wx;by=wy;}
    }
    return{x:bx,y:by};
  }
  function toVoronoi(x,y){return toVoronoiAt(x,y,hexSpacingNow());}
  function jumpCutNow(){return Math.max(3.2,hexSpacingNow()*0.28);}
  function pushTrackPoint(tr,point,maxAge,now,cap){
    tr.push(point);
    while(tr.length&&now-tr[0].t>maxAge)tr.shift();
    if(tr.length>cap)tr.splice(0,tr.length-cap);
  }
  function updateTrails(now){
    const maxAge=state.ui.trailSeconds*1000;
    const alive=new Set();
    const cut=jumpCutNow();
    for(const a of state.agents){
      alive.add(a.id);
      if(!trailsByAgent.has(a.id))trailsByAgent.set(a.id,[]);
      const tr=trailsByAgent.get(a.id);
      const vor=toVoronoi(a.x,a.y);
      const last=tr[tr.length-1];
      const rawD=last?Math.hypot(vor.x-last.x,vor.y-last.y):0;
      const jumped=!!last&&rawD>cut;
      if(!last||jumped||rawD>0.22||now-last.t>150){
        pushTrackPoint(tr,{t:now,x:vor.x,y:vor.y,jump:jumped,type:a.type},maxAge,now,1400);
      }
      let g=globalTracks.get(a.id);
      if(!g){
        globalTracks.set(a.id,{canon:{x:a.x,y:a.y},pts:[{t:now,x:a.x,y:a.y,jump:false,type:a.type}]});
      }else{
        const d=adminTorusDelta(g.canon,a);
        const lp=g.pts[g.pts.length-1];
        const reset=d.dist>cut;
        if(reset){
          pushTrackPoint(g.pts,{t:now,x:a.x,y:a.y,jump:true,type:a.type},maxAge,now,1800);
        }else if(!lp||d.dist>0.18||now-lp.t>150){
          pushTrackPoint(g.pts,{t:now,x:lp.x+d.x,y:lp.y+d.y,jump:false,type:a.type},maxAge,now,1800);
        }
        g.canon={x:a.x,y:a.y};
      }
    }
    for(const id of [...trailsByAgent.keys()]){
      if(!alive.has(id)){trailsByAgent.delete(id);globalTracks.delete(id);}
    }
  }
  function clearTrackStores(){trailsByAgent.clear();globalTracks.clear();}
  function drawTrailPolylines(mapXY,tracks,agents){
    if(!state.ui.showTrails)return;
    const roster=agents||state.agents;
    const list=tracks||trailsByAgent;
    const breakPx=(godCanvas._lw||800)*0.42;
    for(const [id,tr] of list){
      const pts=tr.pts||tr;
      if(!pts||pts.length<2)continue;
      const ag=roster.find(z=>z.id===id);
      const type=ag?.type||pts[0]?.type;
      if(type==="bot"&&!state.ui.showBotTrails)continue;
      if(type==="human"&&!state.ui.showHumanTrails)continue;
      godCtx.beginPath();
      let started=false,prevPx=0,prevPy=0;
      for(const p of pts){
        if(p.t!==undefined&&state._trailUntil!=null&&p.t>state._trailUntil)break;
        const[px,py]=mapXY(p.x,p.y);
        const slash=started&&Math.hypot(px-prevPx,py-prevPy)>breakPx;
        if(!started||p.jump||slash){godCtx.moveTo(px,py);started=true;}
        else godCtx.lineTo(px,py);
        prevPx=px;prevPy=py;
      }
      godCtx.strokeStyle=(ag?.scarfColor||"#94a3b8")+"cc";
      godCtx.lineWidth=(type==="human"?state.ui.trailWidth*1.3:state.ui.trailWidth);
      godCtx.stroke();
    }
  }
  function drawGlyph(px,py,dir,human,color,faint){
    const r=human?8:5.2;
    godCtx.save();
    godCtx.translate(px,py);
    godCtx.rotate(dir);
    godCtx.beginPath();
    godCtx.moveTo(r+4,0);godCtx.lineTo(-r,r*0.78);godCtx.lineTo(-r*0.55,0);godCtx.lineTo(-r,-r*0.78);godCtx.closePath();
    if(faint){
      godCtx.globalAlpha=0.22;
      godCtx.strokeStyle=color;
      godCtx.lineWidth=1.15;
      godCtx.stroke();
    }else{
      godCtx.fillStyle=color;
      godCtx.fill();
      godCtx.strokeStyle=human?"#fff":"rgba(15,23,42,0.85)";
      godCtx.lineWidth=human?1.7:1.05;
      godCtx.stroke();
    }
    godCtx.restore();
  }
  function neighborShifts(){
    const s=hexSpacingNow();
    const e2y=s*Math.sqrt(3)/2;
    return [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]].map(([i,j])=>({x:i*s+j*s/2,y:j*e2y}));
  }

  function drawGodEdges(XY){
    const matrix=state.matrix;
    if(!matrix||!matrix.ids||!matrix.ids.length)return;
    const hexMode=isHex()&&state.world;
    const wrapDx=hexMode?(state.world.width||90):0;
    const wrapDy=hexMode?(state.world.height||70):0;
    const lookup=new Map(state.agents.map(a=>[a.id,a]));
    const idx=new Map(matrix.ids.map((id,i)=>[id,i]));
    const step=wrapDx?wrapDx*0.5:0;
    godCtx.lineWidth=0.65;
    for(let i=0;i<matrix.ids.length;i++){
      const obs=lookup.get(matrix.ids[i]);
      if(!obs)continue;
      for(let j=0;j<matrix.ids.length;j++){
        if(i===j||!matrix.rows[i]?.[j])continue;
        const tgt=lookup.get(matrix.ids[j]);
        if(!tgt)continue;
        const isBridge=obs.group==="bridge"||tgt.group==="bridge"||obs.role==="bridge"||tgt.role==="bridge";
        const isInformed=tgt.role==="informed";
        const isEcho=state.config.visibilityRule==="echo_chambers";
        const isDirected=state.config.visibilityRule==="directed_ring";
        const isTopo=state.config.visibilityRule==="topological_k";
        const isMetric=state.config.visibilityRule==="metric_radius";
        if(!isEcho&&!isDirected&&!isTopo&&!isMetric&&!isBridge&&!isInformed)continue;
        const alpha=isTopo?0.13:isBridge||isInformed?0.52:0.16;
        godCtx.strokeStyle=(isBridge?"rgba(251,191,36,":isDirected?"rgba(168,85,247,":isTopo?"rgba(45,212,191,":isMetric?"rgba(96,165,250,":"rgba(148,163,184,")+alpha+")";
        const [x1,y1]=XY(obs.x,obs.y),[x2,y2]=XY(tgt.x,tgt.y);
        const dx=x2-x1,dy=y2-y1;
        const jumps=[[0,0],[wrapDx,0],[-wrapDx,0],[0,wrapDy],[0,-wrapDy],[wrapDx,wrapDy],[wrapDx,-wrapDy],[-wrapDx,wrapDy],[-wrapDx,-wrapDy]];
        let best=null;
        for(const[jx,jy]of jumps){
          const [px,py]=XY(tgt.x+jx,tgt.y+jy);
          const d=Math.hypot(px-x1-Math.sign(dx)*(step*0),py-y1);
          if(step){const wrapErr=Math.abs(Math.abs(px-x1)-step)<32||Math.abs(Math.abs(py-y1)-step)<32?0:0;
            if(!best||d<best.d)best={x:px,y:py,d,err:wrapErr};}
          else if(!best||d<best.d)best={x:px,y:py,d};
        }
        if(!best)continue;
        godCtx.beginPath();godCtx.moveTo(x1,y1);godCtx.lineTo(best.x,best.y);godCtx.stroke();
        if(godCanvas._lw>760&&best.d<190){
          const ang=Math.atan2(best.y-y1,best.x-x1);
          godCtx.fillStyle=(isBridge?"rgba(251,191,36,":isDirected?"rgba(168,85,247,":isTopo?"rgba(45,212,191,":"rgba(148,163,184,")+alpha+")";
          godCtx.save();godCtx.translate((x1+best.x)/2,(y1+best.y)/2);godCtx.rotate(ang);
          godCtx.beginPath();godCtx.moveTo(0,0);godCtx.lineTo(-4,-2);godCtx.lineTo(-4,2);godCtx.closePath();godCtx.fill();
          godCtx.restore();
        }
      }
    }
  }

  function drawGodAgentsAndTrails(XY){
    const w=godCanvas._lw||godCanvas.width,h=godCanvas._lh||godCanvas.height;
    const bx=w-58,by=48,base=(state.config.swarmDirectionDeg*Math.PI)/180;const branches=state.config.botModel==="bifurcating_swarm"?[base-(state.config.swarmSplitAngleDeg*Math.PI/180)/2,base+(state.config.swarmSplitAngleDeg*Math.PI/180)/2]:[base];
    godCtx.save();godCtx.translate(bx,by);godCtx.beginPath();godCtx.arc(0,0,30,0,Math.PI*2);godCtx.fillStyle="rgba(15,25,45,0.85)";godCtx.fill();godCtx.strokeStyle="rgba(16,185,129,0.5)";godCtx.stroke();for(const r of branches){godCtx.save();godCtx.rotate(r);godCtx.strokeStyle="#10b981";godCtx.fillStyle="#10b981";godCtx.lineWidth=2.4;godCtx.beginPath();godCtx.moveTo(-14,0);godCtx.lineTo(14,0);godCtx.stroke();godCtx.beginPath();godCtx.moveTo(19,0);godCtx.lineTo(9,-5);godCtx.lineTo(9,5);godCtx.closePath();godCtx.fill();godCtx.restore();}godCtx.restore();
    drawGodEdges(XY);
    drawTrailPolylines(XY);
    const sorted=[...state.agents].sort((a,b)=>(a.type==="human"?1:0)-(b.type==="human"?1:0));
    for(const a of sorted){const[x,y]=XY(a.x,a.y);const human=a.type==="human",r=human?8:5.5,spd=Math.hypot(a.vx||0,a.vy||0),dir=spd>0.2?Math.atan2(a.vy,a.vx):a.heading||0;godCtx.save();godCtx.translate(x,y);if(human){godCtx.beginPath();godCtx.arc(0,0,r+5,0,Math.PI*2);godCtx.fillStyle="rgba(56,189,248,0.18)";godCtx.fill();}if(a.bumpingNow){godCtx.beginPath();godCtx.arc(0,0,r+7,0,Math.PI*2);godCtx.strokeStyle="#ef4444";godCtx.lineWidth=2.2;godCtx.stroke();}else if(a.stoppedByCollision){godCtx.beginPath();godCtx.arc(0,0,r+6,0,Math.PI*2);godCtx.strokeStyle="#fbbf24";godCtx.lineWidth=1.8;godCtx.stroke();}godCtx.rotate(dir);godCtx.fillStyle=a.scarfColor||(human?"#38bdf8":"#f59e0b");godCtx.strokeStyle=human?"#fff":"rgba(15,23,42,0.85)";godCtx.lineWidth=human?1.8:1.1;godCtx.beginPath();godCtx.moveTo(r+4,0);godCtx.lineTo(-r,r*0.78);godCtx.lineTo(-r*0.55,0);godCtx.lineTo(-r,-r*0.78);godCtx.closePath();godCtx.fill();godCtx.stroke();godCtx.restore();godCtx.fillStyle="#e0f2fe";godCtx.font="10px ui-monospace,Menlo,monospace";const extra=state.config.collisionScoreEnabled&&human?` [${a.score??100}]`:a.stoppedByCollision?" ⏸":"";godCtx.fillText((a.tag||"")+(a.role==="informed"?" ★":a.role==="bridge"?" ⚡":"")+extra,x+10,y-8);}
  }

  const isHex=()=>state.config.boundaryMode==="hex_torus";
  function worldToLatAdmin(x,y){const s=Math.max(6,Number(state.config.hexSpacing)||20);const v=y/(s*(Math.sqrt(3)/2));return{u:x/s-v/2,v};}

  function drawGod(){
    const w=godCanvas._lw||godCanvas.width,h=godCanvas._lh||godCanvas.height;
    godCtx.fillStyle="#070e1b";godCtx.fillRect(0,0,w,h);
    const replayAgents=replayAgentsNow();
    const cellMode=state.ui.mapMode==="cell";
    const agents=replayAgents||state.agents;
    state._trailUntil=replayAgents?state.replay.t:null;
    if(cellMode&&!state.ui.god.userMoved){state.ui.god.cx=0;state.ui.god.cy=0;}
    else if(!cellMode&&state.ui.followCentroid&&!state.ui.god.userMoved){
      let sx=0,sy=0,n=0;
      const pool=agents.filter(a=>a.type==="human");
      for(const a of (pool.length?pool:agents)){
        const pos=agentWorldPos(a,cellMode);
        sx+=pos.x;sy+=pos.y;n+=1;
      }
      if(n){state.ui.god.cx+=(sx/n-state.ui.god.cx)*0.18;state.ui.god.cy+=(sy/n-state.ui.god.cy)*0.18;}
    }
    const span=Math.max(12,state.ui.god.span),scale=w/span,cx=state.ui.god.cx,cy=state.ui.god.cy;
    const XY=(x,y)=>[w/2+(x-cx)*scale,h/2+(y-cy)*scale];
    godCtx.strokeStyle="rgba(148,163,184,0.12)";godCtx.fillStyle="rgba(148,163,184,0.55)";godCtx.font="10px ui-monospace,Menlo,monospace";godCtx.lineWidth=1;
    const x0=cx-span/2,x1=cx+span/2,y0=cy-(h/scale)/2,y1=cy+(h/scale)/2,step=span>160?40:span>70?20:10;
    for(let gx=Math.floor(x0/step)*step;gx<=x1;gx+=step){const[px]=XY(gx,0);godCtx.beginPath();godCtx.moveTo(px,0);godCtx.lineTo(px,h);godCtx.stroke();if(Math.abs(gx)%(step*2)<0.1)godCtx.fillText(`${gx}m`,px+3,h-6);}
    for(let gy=Math.floor(y0/step)*step;gy<=y1;gy+=step){const[,py]=XY(0,gy);godCtx.beginPath();godCtx.moveTo(0,py);godCtx.lineTo(w,py);godCtx.stroke();if(Math.abs(gy)%(step*2)<0.1)godCtx.fillText(`${gy}m`,6,py-3);}
    if(cellMode){
      const R=hexSpacingNow()/Math.sqrt(3);
      godCtx.beginPath();
      for(let k=0;k<6;k++){const ang=Math.PI/6+k*Math.PI/3;const[px,py]=XY(R*Math.cos(ang),R*Math.sin(ang));k?godCtx.lineTo(px,py):godCtx.moveTo(px,py);}
      godCtx.closePath();godCtx.strokeStyle="rgba(96,165,250,0.8)";godCtx.lineWidth=1.7;godCtx.stroke();
      godCtx.fillStyle="#93c5fd";godCtx.fillText("Periodic cell — seam trails are cut. Clones are faint outlines, not extra paths.",10,16);
    }else{
      godCtx.fillStyle="#93c5fd";godCtx.fillText("Global metres, unwrapped — a straight march stays a straight line.",10,16);
    }
    if(state.config.oasisEnabled){const[ox,oy]=XY(state.config.oasisX,state.config.oasisY);godCtx.beginPath();godCtx.arc(ox,oy,(state.config.oasisRadius||11)*scale,0,Math.PI*2);godCtx.fillStyle="rgba(14,165,233,0.16)";godCtx.fill();godCtx.strokeStyle="#38bdf8";godCtx.lineWidth=1.6;godCtx.stroke();}
    const cellTracks=replayAgents?state.replay.tracks.cell:trailsByAgent;
    const globTracks=replayAgents?state.replay.tracks.global:globalTracks;
    drawTrailPolylines(XY,cellMode?cellTracks:globTracks,agents);
    const sorted=[...agents].sort((a,b)=>(a.type==="human"?1:0)-(b.type==="human"?1:0));
    if(cellMode&&state.ui.showClones){
      for(const shift of neighborShifts()){
        for(const a of sorted){
          const base=toVoronoi(a.x,a.y);
          const[px,py]=XY(base.x+shift.x,base.y+shift.y);
          if(px<-24||px>w+24||py<-24||py>h+24)continue;
          const spd=Math.hypot(a.vx||0,a.vy||0),dir=spd>0.2?Math.atan2(a.vy,a.vx):(a.heading||0);
          drawGlyph(px,py,dir,a.type==="human",a.scarfColor||(a.type==="human"?"#38bdf8":"#f59e0b"),true);
        }
      }
    }
    for(const a of sorted){
      const pos=agentWorldPos(a,cellMode);
      const[px,py]=XY(pos.x,pos.y);
      if(px<-40||px>w+40||py<-40||py>h+40)continue;
      const human=a.type==="human",spd=Math.hypot(a.vx||0,a.vy||0),dir=spd>0.2?Math.atan2(a.vy,a.vx):(a.heading||0);
      if(human){godCtx.beginPath();godCtx.arc(px,py,12,0,Math.PI*2);godCtx.fillStyle="rgba(56,189,248,0.15)";godCtx.fill();}
      drawGlyph(px,py,dir,human,a.scarfColor||(human?"#38bdf8":"#f59e0b"),false);
      godCtx.fillStyle="#e0f2fe";godCtx.font="10px ui-monospace,Menlo,monospace";
      const extra=state.config.collisionScoreEnabled&&human?` [${a.score??100}]`:"";
      godCtx.fillText((a.tag||"")+extra,px+10,py-8);
    }
    state._trailUntil=null;
    const bx=w-58,by=48,base=(state.config.swarmDirectionDeg*Math.PI)/180;
    const branches=state.config.botModel==="bifurcating_swarm"?[base-(state.config.swarmSplitAngleDeg*Math.PI/180)/2,base+(state.config.swarmSplitAngleDeg*Math.PI/180)/2]:[base];
    godCtx.save();godCtx.translate(bx,by);godCtx.beginPath();godCtx.arc(0,0,30,0,Math.PI*2);godCtx.fillStyle="rgba(15,25,45,0.85)";godCtx.fill();godCtx.strokeStyle="rgba(16,185,129,0.5)";godCtx.stroke();
    for(const r of branches){godCtx.save();godCtx.rotate(r);godCtx.strokeStyle="#10b981";godCtx.fillStyle="#10b981";godCtx.lineWidth=2.4;godCtx.beginPath();godCtx.moveTo(-14,0);godCtx.lineTo(14,0);godCtx.stroke();godCtx.beginPath();godCtx.moveTo(19,0);godCtx.lineTo(9,-5);godCtx.lineTo(9,5);godCtx.closePath();godCtx.fill();godCtx.restore();}
    godCtx.restore();godCtx.fillStyle="#a7f3d0";godCtx.textAlign="center";godCtx.fillText(state.config.botModel==="bifurcating_swarm"?`±${Math.round(state.config.swarmSplitAngleDeg/2)}°`:`Flow ${Math.round(state.config.swarmDirectionDeg)}°`,bx,by+44);godCtx.textAlign="left";
  }
  function agentWorldPos(a,cellMode){
    if(cellMode){const v=toVoronoi(a.x,a.y);return{x:v.x,y:v.y};}
    if(Number.isFinite(a.gx))return{x:a.gx,y:a.gy};
    const g=globalTracks.get(a.id);
    const p=g&&g.pts[g.pts.length-1];
    return p?{x:p.x,y:p.y}:{x:a.x,y:a.y};
  }
  function replayAgentsNow(){
    if(state.replay.live||!state.replay.tracks)return null;
    const t=state.replay.t,out=[];
    for(const [id,pack] of state.replay.tracks.byId){
      let frame=null;
      for(const f of pack.frames){if(f.t<=t)frame=f;else break;}
      if(!frame)continue;
      let gp=null;
      for(const p of (state.replay.tracks.global.get(id)?.pts||[])){if(p.t<=t)gp=p;else break;}
      out.push({...frame,gx:gp?gp.x:frame.x,gy:gp?gp.y:frame.y});
    }
    return out;
  }

  function drawPolar(){
    const w=polarCanvas._lw||polarCanvas.width,h=polarCanvas._lh||polarCanvas.height,cx=w/2,cy=h/2,R=Math.min(w,h)*0.38;polarCtx.fillStyle="#070e1b";polarCtx.fillRect(0,0,w,h);
    for(const f of [0.5,1]){polarCtx.beginPath();polarCtx.arc(cx,cy,R*f,0,Math.PI*2);polarCtx.strokeStyle=f===1?"rgba(148,163,184,0.35)":"rgba(148,163,184,0.15)";polarCtx.stroke();}
    polarCtx.strokeStyle="rgba(148,163,184,0.16)";polarCtx.beginPath();polarCtx.moveTo(cx-R-8,cy);polarCtx.lineTo(cx+R+8,cy);polarCtx.moveTo(cx,cy-R-8);polarCtx.lineTo(cx,cy+R+8);polarCtx.stroke();
    polarCtx.fillStyle="#94a3b8";polarCtx.font="11px ui-monospace,Menlo,monospace";polarCtx.textAlign="center";polarCtx.fillText("0° E",cx+R+20,cy);polarCtx.fillText("180° W",cx-R-22,cy);polarCtx.fillText("-90° N",cx,cy-R-12);polarCtx.fillText("90° S",cx,cy+R+14);
    const base=(state.config.swarmDirectionDeg*Math.PI)/180,split=(state.config.swarmSplitAngleDeg*Math.PI)/180;const rays=state.config.botModel==="bifurcating_swarm"?[base-split/2,base+split/2]:[base];
    const targetR=clamp(Number(state.config.swarmR??0.96),0,1);
    polarCtx.save();polarCtx.strokeStyle="rgba(16,185,129,0.35)";polarCtx.setLineDash([3,3]);polarCtx.beginPath();polarCtx.arc(cx,cy,R*targetR,0,Math.PI*2);polarCtx.stroke();polarCtx.restore();
    polarCtx.save();polarCtx.strokeStyle="rgba(16,185,129,0.95)";polarCtx.fillStyle="#10b981";polarCtx.setLineDash([]);polarCtx.lineWidth=2.6;for(const r of rays){const len=R*Math.max(0.06,targetR);polarCtx.beginPath();polarCtx.moveTo(cx,cy);polarCtx.lineTo(cx+Math.cos(r)*len,cy+Math.sin(r)*len);polarCtx.stroke();polarCtx.beginPath();polarCtx.arc(cx+Math.cos(r)*len,cy+Math.sin(r)*len,4,0,Math.PI*2);polarCtx.fill();}polarCtx.restore();
    polarCtx.fillStyle="#a7f3d0";polarCtx.font="11px ui-monospace,Menlo,monospace";polarCtx.textAlign="center";polarCtx.fillText(`R ${targetR.toFixed(2)}  θ ${Math.round(state.config.swarmDirectionDeg||0)}°`,cx,h-10);
    let hc=0,hs=0,hn=0,bc=0,bs=0,bn=0;
    for(const a of state.agents){const spd=Math.hypot(a.vx||0,a.vy||0),ang=spd>0.2?Math.atan2(a.vy,a.vx):a.heading||0,human=a.type==="human",rr=human?R:R*0.92;polarCtx.beginPath();polarCtx.arc(cx+Math.cos(ang)*rr,cy+Math.sin(ang)*rr,human?5:3.4,0,Math.PI*2);polarCtx.fillStyle=a.scarfColor||(human?"#38bdf8":"#f59e0b");polarCtx.fill();if(human){polarCtx.strokeStyle="#fff";polarCtx.stroke();hc+=Math.cos(ang);hs+=Math.sin(ang);hn++;}else{bc+=Math.cos(ang);bs+=Math.sin(ang);bn++;}}
    if(bn){polarCtx.strokeStyle="#f59e0b";polarCtx.lineWidth=2.4;polarCtx.beginPath();polarCtx.moveTo(cx,cy);polarCtx.lineTo(cx+bc/bn*R,cy+bs/bn*R);polarCtx.stroke();}
    if(hn){polarCtx.strokeStyle="#38bdf8";polarCtx.lineWidth=3.2;polarCtx.beginPath();polarCtx.moveTo(cx,cy);polarCtx.lineTo(cx+hc/hn*R,cy+hs/hn*R);polarCtx.stroke();}
  }
  let dragPolar=false;
  function polarSet(e){const r=polarCanvas.getBoundingClientRect(),lw=polarCanvas._lw||polarCanvas.width,lh=polarCanvas._lh||polarCanvas.height,sx=(e.clientX-r.left)/r.width*lw,sy=(e.clientY-r.top)/r.height*lh,dx=sx-lw/2,dy=sy-lh/2,dist=Math.hypot(dx,dy);if(dist<6)return;const Rmax=Math.min(lw,lh)*0.38;swarmDirectionDegEl.value=String(Math.round(Math.atan2(dy,dx)*180/Math.PI));if(swarmREl)swarmREl.value=String(clamp(dist/Rmax,0,1).toFixed(2));mark();emitConfig();}
  polarCanvas.addEventListener("mousedown",e=>{dragPolar=true;polarSet(e);});window.addEventListener("mousemove",e=>{if(dragPolar)polarSet(e);});window.addEventListener("mouseup",()=>dragPolar=false);

  function drawMetrics(){
    const hist=state.metricsHistory||[];
    const pinkKey=state.config.collisionScoreEnabled?"humanCollidingFraction":state.config.stopAndGoEnabled?"botStoppedFraction":state.config.oasisEnabled?"oasisFraction":"startledFraction";
    const series=[
      ["#f59e0b",1.8,"botPolarization"],
      ["#10b981",2,"humanEntrainment"],
      ["#ec4899",1.8,pinkKey],
      ["#38bdf8",2.6,"humanPolarization"],
    ].map(([color,width,key])=>({color,width,pts:hist.map(p=>({t:p.t,y:Number(p[key])||0}))}));
    paintTimePlot(metricsCanvas,metricsCtx,plotViews.metrics,series,-1,1,{ticks:[1,0.5,0,-0.5,-1],events:state.phaseEvents});
  }

  function drawCrux(){
    const w=cruxCanvas._lw||cruxCanvas.width,h=cruxCanvas._lh||cruxCanvas.height;cruxCtx.fillStyle="#070e1b";cruxCtx.fillRect(0,0,w,h);
    const L=38,Rr=12,T=24,B=30,pw=w-L-Rr,ph=h-T-B,bins=18,bw=pw/bins;
    const target=state.config.swarmDirectionDeg*Math.PI/180;
    const hc=new Array(bins).fill(0),bc=new Array(bins).fill(0);
    const hRels=[],bRels=[];
    const rel=a=>{const spd=Math.hypot(a.vx||0,a.vy||0);let d=(spd>0.2?Math.atan2(a.vy,a.vx):a.heading||0)-target;while(d<=-Math.PI)d+=Math.PI*2;while(d>Math.PI)d-=Math.PI*2;return d;};
    for(const a of state.agents){const r=rel(a);const idx=clamp(Math.floor((r+Math.PI)/(Math.PI*2)*bins),0,bins-1);if(a.type==="human"){hc[idx]++;hRels.push(r);}else{bc[idx]++;bRels.push(r);}}
    const max=Math.max(1,...hc,...bc);
    cruxCtx.strokeStyle="rgba(148,163,184,0.22)";cruxCtx.lineWidth=1;cruxCtx.strokeRect(L,T,pw,ph);
    cruxCtx.strokeStyle="rgba(148,163,184,0.10)";
    for(let gy=1;gy<4;gy++){const y=T+ph*gy/4;cruxCtx.beginPath();cruxCtx.moveTo(L,y);cruxCtx.lineTo(L+pw,y);cruxCtx.stroke();}
    for(let i=0;i<bins;i++){
      const x=L+i*bw;
      const hh=hc[i]/max*ph;
      cruxCtx.fillStyle="rgba(56,189,248,0.82)";
      if(hh>0)cruxCtx.fillRect(x+1,T+ph-hh,Math.max(1,bw-2),hh);
      const bh=bc[i]/max*ph;
      cruxCtx.strokeStyle="#f59e0b";cruxCtx.lineWidth=1.7;
      if(bh>0)cruxCtx.strokeRect(x+1,T+ph-bh,Math.max(1,bw-2),bh);
    }
    // Circular KDE overlay (wrap-aware at ±180°) makes the one-peak vs two-peak pattern legible at N=15.
    const kde=(rels,deg,bwDeg=17)=>{
      if(!rels.length)return 0;
      let s=0;
      for(const r of rels){
        let d=(deg*Math.PI/180)-r;
        while(d<=-Math.PI)d+=Math.PI*2;
        while(d>Math.PI)d-=Math.PI*2;
        const u=d/(bwDeg*Math.PI/180);
        s+=Math.exp(-0.5*u*u);
      }
      return s/rels.length;
    };
    const drawKde=(rels,col)=>{
      if(!rels.length)return;
      let kmax=0.0001;const vals=[];
      for(let deg=-180;deg<=180;deg+=3){const v=kde(rels,deg);vals.push([deg,v]);if(v>kmax)kmax=v;}
      cruxCtx.strokeStyle=col;cruxCtx.lineWidth=2.2;cruxCtx.beginPath();
      vals.forEach(([deg,v],i)=>{
        const x=L+((deg+180)/360)*pw;
        const y=T+ph-(v/kmax)*(ph*0.92);
        i?cruxCtx.lineTo(x,y):cruxCtx.moveTo(x,y);
      });
      cruxCtx.stroke();
    };
    drawKde(bRels,"rgba(251,191,36,0.95)");
    drawKde(hRels,"rgba(125,211,252,0.98)");
    const markAt=deg=>{const x=L+((deg+180)/360)*pw;cruxCtx.save();cruxCtx.strokeStyle="#10b981";cruxCtx.setLineDash([4,3]);cruxCtx.lineWidth=1.4;cruxCtx.beginPath();cruxCtx.moveTo(x,T);cruxCtx.lineTo(x,T+ph);cruxCtx.stroke();cruxCtx.restore();};
    if(state.config.botModel==="bifurcating_swarm"){markAt(-state.config.swarmSplitAngleDeg/2);markAt(state.config.swarmSplitAngleDeg/2);}else markAt(0);
    cruxCtx.fillStyle="#94a3b8";cruxCtx.font="10px ui-monospace,Menlo,monospace";cruxCtx.textAlign="center";
    cruxCtx.fillText("-180",L+10,h-10);cruxCtx.fillText("0 = target",L+pw/2,h-10);cruxCtx.fillText("+180",L+pw-12,h-10);
    cruxCtx.textAlign="left";cruxCtx.fillStyle="#e2e8f0";cruxCtx.font="11px ui-monospace,Menlo,monospace";
    const isSplit=state.config.botModel==="bifurcating_swarm";
    cruxCtx.fillText(isSplit?"Two peaks = split":"Peak at 0 = entrained",L,T-8);
    cruxCtx.fillStyle="#7dd3fc";cruxCtx.fillText("students",L+pw-104,T-8);
    cruxCtx.fillStyle="#fbbf24";cruxCtx.fillText("bots",L+pw-38,T-8);
  }

  // Schematic "expected result" templates, redrawn from the model papers (not copied figures)
  function drawExpected(){
    if(!expectedCtx)return;
    const c=expectedCtx,w=expectedCanvas._lw||expectedCanvas.width,h=expectedCanvas._lh||expectedCanvas.height;
    c.fillStyle="#0a1424";c.fillRect(0,0,w,h);
    c.font="10.5px ui-monospace,Menlo,monospace";c.textAlign="left";
    const preset=state.config.activePreset||"";
    const m=state.metrics||{};
    const fmt=(v,d=2)=>Number(v||0).toFixed(d);
    const arrow=(x,y,ang,len,col)=>{c.save();c.translate(x,y);c.rotate(ang);c.strokeStyle=col;c.fillStyle=col;c.lineWidth=2;c.beginPath();c.moveTo(-len/2,0);c.lineTo(len/2,0);c.stroke();c.beginPath();c.moveTo(len/2+5,0);c.lineTo(len/2-3,-4);c.lineTo(len/2-3,4);c.closePath();c.fill();c.restore();};
    const label=t=>{c.fillStyle="#e2e8f0";c.fillText(t,10,16);};
    const live=(t,y=h-10)=>{c.fillStyle="#fde68a";c.fillText(t,10,y);};
    const frame=(x=30,y=34,fw=w-55,fh=h-72)=>{c.strokeStyle="rgba(148,163,184,0.38)";c.lineWidth=1;c.strokeRect(x,y,fw,fh);return{x,y,fw,fh};};
    if(preset==="expt2_bifurcation"){
      label("Couzin 2005: small split averages · large split chooses");
      const split=Number(state.config.swarmSplitAngleDeg||0);
      const hist=(ox,peaks,title)=>{
        c.strokeStyle="rgba(148,163,184,0.38)";c.strokeRect(ox,36,150,104);
        const bw=150/7;
        for(const pk of peaks){c.fillStyle="rgba(56,189,248,0.85)";c.fillRect(ox+pk*bw+2,36+104-72,bw-4,72);}
        c.fillStyle="#94a3b8";c.fillText(title,ox+18,158);
      };
      hist(24,[3],"small: 1 peak");
      hist(226,[1,5],"large: 2 peaks");
      c.strokeStyle=split>=60?"#fbbf24":"#38bdf8";c.lineWidth=2;c.strokeRect(split>=60?226:24,36,150,104);
      live(`LIVE split ${Math.round(split)} deg · branch alignment ${fmt(m.branchAlignment,3)} · bot Phi ${fmt(m.botPolarization,2)}`);
    } else if(preset==="expt3_informed"){
      label("Couzin 2005: a silent informed minority steers everyone");
      const K=Math.max(0,Number(state.config.informedCount||0));
      for(let i=0;i<15;i++){
        const x=48+(i%5)*68,y=58+Math.floor(i/5)*38;
        arrow(x,y,-0.42+i*0.035,25,i<K?"#fbbf24":"#38bdf8");
      }
      c.fillStyle="#fbbf24";c.fillText("gold = informed K",292,48);
      c.fillStyle="#93c5fd";c.fillText("blue follows locally",292,66);
      live(`LIVE K=${K} · entrainment ${fmt(m.humanEntrainment,3)} · student Phi ${fmt(m.humanPolarization,3)}`);
    } else if(preset==="expt4_echo"){
      label("Echo chambers persist unless the bridge couples them");
      const meanFor=(g)=>{
        const arr=state.agents.filter(a=>a.type==="human"&&(a.group===g||(g==="bridge"&&(a.group==="bridge"||a.role==="bridge"))));
        if(!arr.length)return null;
        let cs=0,sn=0;
        for(const a of arr){const ang=Math.hypot(a.vx||0,a.vy||0)>0.2?Math.atan2(a.vy,a.vx):(a.heading||0);cs+=Math.cos(ang);sn+=Math.sin(ang);}
        return Math.atan2(sn,cs);
      };
      const aA=meanFor("A"),aB=meanFor("B"),aBr=meanFor("bridge");
      for(let i=0;i<7;i++)arrow(52+(i%4)*36,62+Math.floor(i/4)*52,aA??-0.6,21,"#3b82f6");
      for(let i=0;i<7;i++)arrow(252+(i%4)*36,62+Math.floor(i/4)*52,aB??0.7,21,"#ef4444");
      arrow(208,88,aBr??0,25,"#fbbf24");
      c.fillStyle="#93c5fd";c.fillText("A",42,48);c.fillStyle="#fca5a5";c.fillText("B",242,48);c.fillStyle="#fbbf24";c.fillText("bridge",184,126);
      const deg=r=>r===null?"--":`${Math.round(r*180/Math.PI)} deg`;
      live(`LIVE mean headings A ${deg(aA)} · B ${deg(aB)} · bridge ${deg(aBr)}`);
    } else if(preset==="expt4_sensory"){
      label("Ballerini 2008: fixed neighbour count beats fixed distance");
      const f=frame();
      c.fillStyle="#5eead4";c.fillText(`TOPOLOGICAL k=${Math.round(Number(state.config.topologicalK||4))}`,f.x+12,f.y+22);
      c.fillStyle="#93c5fd";c.fillText(`METRIC R=${fmt(state.config.metricRadius,0)} m`,f.x+12,f.y+42);
      c.strokeStyle="#2dd4bf";c.lineWidth=2.2;c.beginPath();c.moveTo(f.x+12,f.y+f.fh-18);c.bezierCurveTo(f.x+f.fw*0.35,f.y+f.fh-24,f.x+f.fw*0.55,f.y+34,f.x+f.fw-14,f.y+28);c.stroke();
      c.strokeStyle="#64748b";c.lineWidth=1.8;c.beginPath();c.moveTo(f.x+12,f.y+f.fh-12);c.bezierCurveTo(f.x+f.fw*0.4,f.y+f.fh-18,f.x+f.fw*0.6,f.y+f.fh-46,f.x+f.fw-14,f.y+f.fh-58);c.stroke();
      live(`LIVE rule ${state.config.visibilityRule||"all"} · Phi ${fmt(m.humanPolarization,3)} · spread ${fmt(m.humanSpreadRadius,1)} m`);
    } else if(preset==="expt6_taxis"){
      label("Berdahl 2013: social groups accumulate where it is calm");
      const f=frame();
      c.strokeStyle="#10b981";c.lineWidth=2.4;c.beginPath();c.moveTo(f.x,f.y+f.fh-8);c.bezierCurveTo(f.x+f.fw*0.3,f.y+f.fh-12,f.x+f.fw*0.55,f.y+28,f.x+f.fw,f.y+18);c.stroke();
      c.strokeStyle="#94a3b8";c.lineWidth=2;c.beginPath();c.moveTo(f.x,f.y+f.fh-4);c.bezierCurveTo(f.x+f.fw*0.35,f.y+f.fh-8,f.x+f.fw*0.65,f.y+f.fh-16,f.x+f.fw,f.y+f.fh-22);c.stroke();
      c.fillStyle="#6ee7b7";c.fillText("social",f.x+f.fw-62,f.y+16);
      c.fillStyle="#94a3b8";c.fillText("solo",f.x+f.fw-48,f.y+f.fh-26);c.fillText("time ->",f.x+f.fw-58,h-28);
      live(`LIVE in oasis ${Math.round(Number(m.oasisFraction||0)*100)}% · mode ${state.config.visibilityRule==="blind_solo"?"SOLO":"SOCIAL"}`);
    } else if(preset==="expt5_predator"){
      label("Escape wave: one fox bolts, neighbours copy the escape");
      const f=frame();
      c.strokeStyle="#ec4899";c.lineWidth=2.4;c.beginPath();c.moveTo(f.x,f.y+f.fh-8);c.lineTo(f.x+f.fw*0.38,f.y+f.fh-8);c.lineTo(f.x+f.fw*0.47,f.y+20);c.bezierCurveTo(f.x+f.fw*0.62,f.y+18,f.x+f.fw*0.7,f.y+f.fh-34,f.x+f.fw,f.y+f.fh-12);c.stroke();
      c.fillStyle="#fda4af";c.fillText("looming",f.x+f.fw*0.28,f.y+18);
      const ago=state.lastStartleAt?Math.max(0,Math.round((Date.now()-state.lastStartleAt)/1000)):null;
      live(`LIVE moving/startled ${Math.round(Number(m.startledFraction||0)*100)}%${ago===null?"":" · last looming "+ago+"s ago"}`);
    } else if(preset==="expt7_stopgo"||state.config.stopAndGoEnabled){
      label("Ariel 2014 / Bazazi 2008: stop-and-go pauses propagate waves");
      const f=frame();
      c.strokeStyle="#fbbf24";c.lineWidth=2.2;c.beginPath();
      const steps=[0,0.18,0.22,0.34,0.38,0.56,0.60,0.72,0.76,0.94,1.0];
      const vals=[0.8,0.8,0.08,0.08,0.82,0.82,0.08,0.08,0.8,0.8,0.8];
      steps.forEach((s,i)=>{const px=f.x+s*f.fw,py=f.y+f.fh-vals[i]*(f.fh-18)-6;i?c.lineTo(px,py):c.moveTo(px,py);});
      c.stroke();
      c.fillStyle="#fde68a";c.fillText("GO -> STOP (fox ahead) -> GO",f.x+10,f.y+18);
      const stpH=Math.round(Number(m.humanStoppedFraction||0)*100),stpB=Math.round(Number(m.botStoppedFraction||0)*100);
      live(`LIVE stopped: students ${stpH}% · bots ${stpB}% · speed var ${Math.round((state.config.speedVariance||0)*100)}%`);
    } else if(preset==="expt8_avoid_bumps"||state.config.collisionScoreEnabled){
      label("Bazazi 2008 / Romanczuk 2009: avoiding bumps drives alignment");
      const f=frame();
      c.strokeStyle="#38bdf8";c.lineWidth=2.4;c.beginPath();c.moveTo(f.x,f.y+f.fh-10);c.bezierCurveTo(f.x+f.fw*0.35,f.y+f.fh-18,f.x+f.fw*0.58,f.y+28,f.x+f.fw,f.y+18);c.stroke();
      c.strokeStyle="#ef4444";c.lineWidth=2.0;c.beginPath();c.moveTo(f.x,f.y+22);c.bezierCurveTo(f.x+f.fw*0.35,f.y+30,f.x+f.fw*0.6,f.y+f.fh-24,f.x+f.fw,f.y+f.fh-12);c.stroke();
      c.fillStyle="#7dd3fc";c.fillText("order Phi rises",f.x+f.fw-108,f.y+16);
      c.fillStyle="#fca5a5";c.fillText("bump rate drops",f.x+f.fw-112,f.y+f.fh-16);
      live(`LIVE avg score ${fmt(m.humanMeanScore??100,0)} · dmg ${fmt(m.humanMeanDamage,1)} · bumps ${m.humanTotalBumps||0} · Phi ${fmt(m.humanPolarization,3)}`);
    } else {
      label(preset==="expt1_handoff"?"Buhl 2006: marching may persist after bots disappear":"Vicsek / Buhl: alignment creates order without a leader");
      const f=frame();
      c.strokeStyle="#38bdf8";c.lineWidth=2.6;c.beginPath();c.moveTo(f.x,f.y+f.fh-8);c.bezierCurveTo(f.x+f.fw*0.3,f.y+f.fh-12,f.x+f.fw*0.52,f.y+28,f.x+f.fw,f.y+18);c.stroke();
      if(preset==="expt1_handoff"){
        c.save();c.setLineDash([5,4]);c.strokeStyle="#f59e0b";c.beginPath();c.moveTo(f.x+f.fw*0.48,f.y+18);c.bezierCurveTo(f.x+f.fw*0.68,f.y+28,f.x+f.fw*0.82,f.y+f.fh-42,f.x+f.fw,f.y+f.fh-18);c.stroke();c.restore();
        c.fillStyle="#fbbf24";c.fillText("possible decay",f.x+f.fw-112,f.y+f.fh-30);
      }
      c.fillStyle="#94a3b8";c.fillText("Phi 0 disordered -> 1 marching",f.x+10,f.y+18);c.fillText("time / lower noise ->",f.x+f.fw-132,h-28);
      const phi=preset==="expt1_entrain"&&Number(m.humanPolarization||0)===0?Number(m.botPolarization||0):Number(m.humanPolarization||0);
      live(`LIVE Phi ${fmt(phi,3)} · entrainment ${fmt(m.humanEntrainment,3)} · noise ${fmt(state.config.swarmNoise,2)}`);
    }
  }

  // Copy a URL that re-creates this exact experiment (preset + config in the query string)
  const copyBtn=$("btnCopyUrl");
  if(copyBtn)copyBtn.addEventListener("click",async()=>{
    const cfg=state.config;const q=new URLSearchParams();
    q.set("preset",cfg.activePreset||"custom");
    for(const k of ["swarmDirectionDeg","swarmR","swarmSplitAngleDeg","swarmNoise","swarmAlignStrength","speedVariance","visibilityRule","topologicalK","metricRadius","informedCount","hexSpacing","hexRings","boundaryMode","botCount","phase","botModel","stopAndGoEnabled","collisionScoreEnabled"])if(cfg[k]!==undefined)q.set(k,String(cfg[k]));
    const url=`${location.origin}/admin?${q.toString()}`;
    try{await navigator.clipboard.writeText(url);copyBtn.textContent="✅ Copied experiment URL";}catch(e){window.prompt("Copy experiment URL:",url);}
    setTimeout(()=>{copyBtn.textContent="🔗 Copy Experiment URL (encodes preset + config)";},2200);
  });
  let urlApplied=false;
  function applyUrlConfigOnce(){
    if(urlApplied)return;urlApplied=true;
    const q=new URLSearchParams(location.search);if(![...q.keys()].length)return;
    const cfg={};for(const k of ["swarmDirectionDeg","swarmR","swarmSplitAngleDeg","swarmNoise","swarmAlignStrength","speedVariance","topologicalK","metricRadius","informedCount","hexSpacing","hexRings","botCount","collisionStopDist","collisionRadius"])if(q.has(k))cfg[k]=Number(q.get(k));
    for(const k of ["visibilityRule","boundaryMode","phase","botModel"])if(q.has(k))cfg[k]=q.get(k);
    for(const k of ["stopAndGoEnabled","collisionScoreEnabled"])if(q.has(k))cfg[k]=q.get(k)==="true"||q.get(k)==="1";
    if(Object.keys(cfg).length)socket.emit("admin:setConfig",cfg);
    const preset=q.get("preset");const map={expt1_entrain:"preset_expt1a_entrain",expt1a:"preset_expt1a_entrain",expt1_handoff:"preset_expt1b_handoff",expt1b:"preset_expt1b_handoff",expt2_bifurcation:"preset_expt2_bifurcation",expt2:"preset_expt2_bifurcation",expt3_informed:"preset_expt3_informed",expt3:"preset_expt3_informed",expt4_echo:"preset_expt4_echo",expt4_sensory:"preset_expt4_topological",expt5_predator:"preset_expt5_predator",expt6_taxis:"preset_expt6_taxis",expt7_stopgo:"preset_expt7_stopgo",expt7:"preset_expt7_stopgo",expt8_avoid_bumps:"preset_expt8_avoid_bumps",expt8:"preset_expt8_avoid_bumps"};
    if(preset&&map[preset])setTimeout(()=>socket.emit("admin:experimentAction",{action:map[preset],resetPositions:true,informedCount:cfg.informedCount??3,swarmSplitAngleDeg:cfg.swarmSplitAngleDeg,colorScarvesByChamber:true}),350);
  }

  function renderRoster(){
    const sig=state.agents.map(a=>[a.id,a.tag,a.type,a.role,a.group,a.scarfColor,Math.round(a.score??100),a.bumps||0,a.stoppedByCollision?1:0].join(":")).join("|");
    if(sig===state.rosterSignature)return;state.rosterSignature=sig;
    if(!state.agents.length){rosterWrap.textContent="No agents yet — open the student view in another tab/window.";return;}
    let html="<table><thead><tr><th>Tag</th><th>Kind</th><th>Scarf</th><th>Label</th><th>Role</th><th>Group</th><th>Score / Dmg</th><th>⚡</th></tr></thead><tbody>";
    for(const a of [...state.agents].sort((x,y)=>(x.type===y.type?(x.tag||"").localeCompare(y.tag||"",undefined,{numeric:true}):x.type==="human"?-1:1))){
      const scoreTxt=`${a.score??100} <span class="small">(-${Number(a.damage||0).toFixed(0)} / ${a.bumps||0}b)</span>`;
      html+=`<tr><td><strong>${a.tag||""}</strong></td><td>${a.type==="human"?"Student":"Bot"}</td><td><input type="color" data-id="${a.id}" value="${a.scarfColor||"#f59e0b"}" title="Scarf colour"></td><td><input data-field="tag" data-id="${a.id}" value="${String(a.tag||"").replace(/"/g,"&quot;")}" style="width:64px"></td><td><select data-field="role" data-id="${a.id}">${["normal","informed","bridge"].map(r=>`<option ${r===a.role?"selected":""}>${r}</option>`).join("")}</select></td><td><select data-field="group" data-id="${a.id}">${["A","B","bridge"].map(g=>`<option ${g===a.group?"selected":""}>${g}</option>`).join("")}</select></td><td>${scoreTxt}</td><td>${a.type==="human"?`<button data-startle="${a.id}" title="Looming predator for ${a.tag}">⚡</button>`:""}</td></tr>`;
    }
    rosterWrap.innerHTML=html+"</tbody></table>";
  }

  function renderMatrix(m){
    if(!m||!m.ids?.length){matrixWrap.textContent="No matrix data yet.";return;}
    let html="<table><thead><tr><th>obs\\tgt</th>"+m.ids.map((id,i)=>`<th title="${id}">${m.tags?.[i]||id.slice(0,6)}</th>`).join("")+"</tr></thead><tbody>";
    m.ids.forEach((rid,r)=>{html+=`<tr><th title="${rid}">${m.tags?.[r]||rid.slice(0,6)}</th>`+m.ids.map((cid,c)=>{const v=m.rows[r]?.[c]?1:0;return `<td class="matrix-cell ${v?"yes":"no"}" data-observer-id="${rid}" data-target-id="${cid}" data-value="${v}">${v}</td>`;}).join("")+"</tr>";});
    matrixWrap.innerHTML=html+"</tbody></table>";
  }

  function syncControls(){
    phaseEl.value=state.config.phase;botModelEl.value=state.config.botModel;boundaryModeEl.value=state.config.boundaryMode;visibilityRuleEl.value=state.config.visibilityRule||"all";
    swarmDirectionDegEl.value=String(state.config.swarmDirectionDeg??0);if(swarmREl)swarmREl.value=String(state.config.swarmR??0.96);swarmSplitAngleDegEl.value=String(state.config.swarmSplitAngleDeg??70);
    if(speedVarianceEl)speedVarianceEl.value=String(state.config.speedVariance??0.15);
    badges();
    swarmNoiseEl.value=String(state.config.swarmNoise??0.08);swarmAlignStrengthEl.value=String(state.config.swarmAlignStrength??0.35);
    if(document.activeElement!==informedCountEl)informedCountEl.value=String(state.config.informedCount??0);
    topologicalKEl.value=String(state.config.topologicalK??4);metricRadiusEl.value=String(state.config.metricRadius??10);
    oasisEnabledEl.checked=!!state.config.oasisEnabled;oasisShowHintEl.checked=!!state.config.oasisShowHint;oasisRadiusEl.value=String(state.config.oasisRadius??11);oasisSlowFactorEl.value=String(state.config.oasisSlowFactor??0.32);
    if(stopAndGoEnabledEl)stopAndGoEnabledEl.checked=!!state.config.stopAndGoEnabled;
    if(collisionScoreEnabledEl)collisionScoreEnabledEl.checked=!!state.config.collisionScoreEnabled;
    if(collisionStopDistEl)collisionStopDistEl.value=String(state.config.collisionStopDist??2.1);
    if(collisionRadiusEl)collisionRadiusEl.value=String(state.config.collisionRadius??1.25);
    if(deadTimeSecEl&&document.activeElement!==deadTimeSecEl)deadTimeSecEl.value=String(state.config.deadTimeSec??8);
    showScarvesEl.checked=!!state.config.showScarves;showTagsEl.checked=!!state.config.showTags;matchBotsToHumansEl.checked=!!state.config.matchBotsToHumans;
    botCountEl.value=String(state.config.botCount);if(hexSpacingEl)hexSpacingEl.value=String(state.config.hexSpacing??24);if(hexRingsEl)hexRingsEl.value=String(state.config.hexRings??2);if(mirrorGhostsEl)mirrorGhostsEl.checked=!!state.config.mirrorGhosts;humanSpeedEl.value=String(state.config.humanSpeed);botSpeedEl.value=String(state.config.botSpeed);humanSizeEl.value=String(state.config.humanSize);botSizeEl.value=String(state.config.botSize);runningEl.checked=!!state.config.running;
  }
  const PRESET_BUTTONS={
    expt1_entrain:["btnExpt1A"],
    expt1_handoff:["btnExpt1BInPlace","btnExpt1BReset"],
    expt2_bifurcation:["btnExpt2Bifurc"],
    expt3_informed:["btnExpt3Informed"],
    expt4_echo:["btnExpt4Echo"],
    expt4_sensory:["btnExpt4Topo"],
    expt5_predator:["btnExpt5Predator"],
    expt6_taxis:["btnExpt6Social","btnExpt6Solo"],
    expt7_stopgo:["btnExpt7StopGo"],
    expt8_avoid_bumps:["btnExpt8AvoidBumps"]
  };
  function updateActivePresetButtons(){
    const active=state.config.activePreset||"";
    const solo=state.config.visibilityRule==="blind_solo";
    for(const [preset,ids] of Object.entries(PRESET_BUTTONS)){
      for(const id of ids){
        const el=$(id);if(!el)continue;
        let on=preset===active;
        if(preset==="expt6_taxis")on=on&&((id==="btnExpt6Solo")===solo);
        if(preset==="expt1_handoff"&&id==="btnExpt1BReset")on=false;
        el.classList.toggle("active-preset",on);
      }
    }
  }
  function updateKpis(){
    const m=state.metrics||{};sessionStatusBadgeEl.textContent=state.config.running?"LIVE":"PAUSED";
    updateActivePresetButtons();
    kpiPhaseEl.textContent=state.config.phase;kpiModelEl.textContent=`${state.config.botModel} | vis: ${state.config.visibilityRule||"all"}`;
    kpiHumansEl.textContent=state.counts.humans;kpiBotsEl.textContent=state.counts.bots;
    kpiMatchStatusEl.textContent=state.config.matchBotsToHumans?"Auto-matched (N−1)":"14 bots (N−1 for 15 students)";
    kpiHumanPhiEl.textContent=Number(m.humanPolarization??0).toFixed(3);
    kpiHumanHeadingEl.textContent=`Mean θ: ${Math.round(m.humanMeanHeadingDeg??0)}° | Speed: ${Number(m.humanMeanSpeed??0).toFixed(1)} m/s`;
    kpiEntrainmentEl.textContent=Number(m.humanEntrainment??0).toFixed(3);
    kpiBotHeadingEl.textContent=`R: ${Number(state.config.swarmR??0.96).toFixed(2)} | θ: ${Math.round(state.config.swarmDirectionDeg??0)}°${state.config.botModel==="bifurcating_swarm"?" ±"+Math.round(state.config.swarmSplitAngleDeg/2)+"°":""} | Φbots ${Number(m.botPolarization??0).toFixed(2)}`;
    if(state.config.collisionScoreEnabled){
      kpiOasisEl.textContent=`Score: ${Math.round(m.humanMeanScore??100)} | Dmg: ${Number(m.humanMeanDamage??0).toFixed(1)}`;
      kpiSpreadEl.textContent=`Bumps: ${m.humanTotalBumps??0} | Colliding: ${Math.round((m.humanCollidingFraction??0)*100)}%`;
    } else if(state.config.stopAndGoEnabled){
      kpiOasisEl.textContent=`Stopped: ${Math.round((m.humanStoppedFraction??0)*100)}%H / ${Math.round((m.botStoppedFraction??0)*100)}%B`;
      kpiSpreadEl.textContent=`Spread Rgyr: ${Number(m.humanSpreadRadius??0).toFixed(1)} m | Moving: ${Math.round((m.startledFraction??0)*100)}%`;
    } else {
      kpiOasisEl.textContent=state.config.oasisEnabled?`${Math.round((m.oasisFraction??0)*100)}% in Oasis`:`${Math.round((m.startledFraction??0)*100)}% moving`;
      kpiSpreadEl.textContent=`Spread Rgyr: ${Number(m.humanSpreadRadius??0).toFixed(1)} m | Moving: ${Math.round((m.startledFraction??0)*100)}%`;
    }
    setCrux(state.config.activePreset||"custom");
  }

  function fitCanvas(c){
    if(!c||c._fit)return c;
    c._fit=true;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const lw=c.width,lh=c.height;
    c._lw=lw;c._lh=lh;
    if(dpr>1){
      c.width=Math.round(lw*dpr);c.height=Math.round(lh*dpr);
      const ctx=c.getContext("2d");
      if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    return c;
  }
  const dynamicsCanvas=fitCanvas($("dynamicsCanvas"));
  const dynamicsCtx=dynamicsCanvas?dynamicsCanvas.getContext("2d"):null;
  const trialCanvas=fitCanvas($("trialCanvas"));
  const trialCtx=trialCanvas?trialCanvas.getContext("2d"):null;
  const distCanvas=fitCanvas($("distCanvas"));
  const distCtx=distCanvas?distCanvas.getContext("2d"):null;

  function paintTimePlot(canvas,ctx,view,series,y0,y1,opts){
    if(!canvas||!ctx)return;
    const w=canvas._lw||canvas.width,h=canvas._lh||canvas.height;
    ctx.fillStyle="#070e1b";ctx.fillRect(0,0,w,h);
    const L=44,Rr=12,T=16,B=22,pw=w-L-Rr,ph=h-T-B;
    const ptsAll=series.flatMap(s=>s.pts);
    if(ptsAll.length<2){ctx.fillStyle="#64748b";ctx.textAlign="center";ctx.fillText("Collecting samples…",w/2,h/2);return;}
    const full0=ptsAll[0].t,full1=Math.max(full0+1000,ptsAll[ptsAll.length-1].t);
    if(!view.custom){view.t0=full0;view.t1=full1;}
    const span=Math.max(800,view.t1-view.t0);
    view.t1=view.t0+span;
    const X=t=>L+((t-view.t0)/span)*pw;
    const Y=v=>T+(1-(clamp(v,y0,y1)-y0)/(y1-y0))*ph;
    ctx.font="10px ui-monospace,Menlo,monospace";ctx.textAlign="right";
    const ticks=opts?.ticks||[y1,(y0+y1)/2,y0];
    for(const v of ticks){
      ctx.strokeStyle=Math.abs(v)<1e-6?"rgba(148,163,184,0.32)":"rgba(148,163,184,0.12)";
      ctx.beginPath();ctx.moveTo(L,Y(v));ctx.lineTo(w-Rr,Y(v));ctx.stroke();
      ctx.fillStyle="#94a3b8";ctx.fillText(Number(v).toFixed(Math.abs(v)>=10?0:1),L-4,Y(v)+3);
    }
    ctx.save();ctx.beginPath();ctx.rect(L,T,pw,ph);ctx.clip();
    for(const ev of opts?.events||[]){
      if(ev.t<view.t0||ev.t>view.t1)continue;
      ctx.strokeStyle="rgba(244,63,94,0.55)";ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.moveTo(X(ev.t),T);ctx.lineTo(X(ev.t),T+ph);ctx.stroke();ctx.setLineDash([]);
    }
    for(const s of series){
      ctx.strokeStyle=s.color;ctx.lineWidth=s.width||1.8;ctx.beginPath();
      let moved=false;
      for(const p of s.pts){
        if(p.t<view.t0-span||p.t>view.t1+span)continue;
        const xx=X(p.t),yy=Y(p.y);
        if(!moved){ctx.moveTo(xx,yy);moved=true;}else ctx.lineTo(xx,yy);
      }
      if(moved)ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle="#94a3b8";ctx.textAlign="right";
    ctx.fillText(`${Math.round(span/1000)}s window`,w-Rr,h-6);
    ctx.textAlign="left";
  }
  function bindTimeZoom(canvas,view){
    if(!canvas)return;
    canvas.addEventListener("wheel",(e)=>{
      e.preventDefault();
      view.custom=true;
      const rect=canvas.getBoundingClientRect();
      const frac=clamp((e.clientX-rect.left)/rect.width,0,1);
      const span=Math.max(800,view.t1-view.t0);
      const focal=view.t0+frac*span;
      const next=clamp(span*Math.exp(e.deltaY*0.0014),1500,1000*60*30);
      view.t0=focal-frac*next;view.t1=view.t0+next;
    },{passive:false});
    let drag=null;
    canvas.addEventListener("mousedown",(e)=>{
      if(e.button!==0)return;
      view.custom=true;
      drag={x:e.clientX,t0:view.t0,t1:view.t1};
    });
    window.addEventListener("mousemove",(e)=>{
      if(!drag)return;
      const rect=canvas.getBoundingClientRect();
      const dx=(e.clientX-drag.x)/Math.max(1,rect.width);
      const span=drag.t1-drag.t0;
      view.t0=drag.t0-dx*span;view.t1=view.t0+span;
    });
    window.addEventListener("mouseup",()=>{drag=null;});
    canvas.addEventListener("dblclick",()=>{view.custom=false;});
  }
  bindTimeZoom(metricsCanvas,plotViews.metrics);
  bindTimeZoom(dynamicsCanvas,plotViews.dynamics);

  function drawDynamics(){
    const hist=state.metricsHistory||[];
    const series=[
      {color:"#38bdf8",width:2.2,pts:hist.map(p=>({t:p.t,y:Number(p.humanMeanSpeed)||0}))},
      {color:"#f59e0b",width:1.6,pts:hist.map(p=>({t:p.t,y:Number(p.botMeanSpeed)||0}))},
      {color:"#a78bfa",width:2,pts:hist.map(p=>({t:p.t,y:Number(p.humanSpreadRadius)||0}))},
    ];
    paintTimePlot(dynamicsCanvas,dynamicsCtx,plotViews.dynamics,series,0,Math.max(8,...series.flatMap(s=>s.pts.map(p=>p.y))),{ticks:[0,4,8,12,20]});
  }
  function keptTrials(){return (state.trialSeries||[]).filter(tr=>tr.kept!==false&&tr.metrics&&tr.metrics.length>2);}
  function drawTrialOverlay(){
    if(!trialCtx)return;
    const kept=keptTrials();
    const palette=["#38bdf8","#f59e0b","#34d399","#f472b6","#a78bfa","#fb7185","#facc15","#2dd4bf"];
    const series=kept.map((tr,i)=>({color:palette[i%palette.length],width:1.3,pts:tr.metrics.map(m=>({t:m.t,y:Number(m.humanPolarization)||0}))}));
    if(kept.length){
      const maxT=Math.max(...kept.map(tr=>tr.metrics[tr.metrics.length-1].t));
      const mean=[];
      for(let t=0;t<=maxT;t+=500){
        const vals=[];
        for(const tr of kept){
          let best=null,bestD=1e12;
          for(const m of tr.metrics){const d=Math.abs(m.t-t);if(d<bestD){bestD=d;best=m;}}
          if(best&&bestD<800)vals.push(Number(best.humanPolarization)||0);
        }
        if(vals.length)mean.push({t,y:vals.reduce((a,b)=>a+b,0)/vals.length});
      }
      series.push({color:"#f8fafc",width:2.8,pts:mean});
    }
    const view={custom:false,t0:0,t1:1};
    paintTimePlot(trialCanvas,trialCtx,view,series,-0.05,1.05,{ticks:[0,0.5,1]});
  }
  function drawDist(){
    if(!distCtx)return;
    const w=distCanvas._lw||distCanvas.width,h=distCanvas._lh||distCanvas.height;
    distCtx.fillStyle="#070e1b";distCtx.fillRect(0,0,w,h);
    const kept=keptTrials();
    const rows=[
      ["mean Φ",tr=>tr.meanPhi,"#38bdf8"],
      ["final Φ",tr=>tr.finalPhi,"#67e8f9"],
      ["entrain",tr=>tr.meanEntrain,"#34d399"],
    ];
    const L=62,R=w-16,rowH=(h-28)/rows.length;
    distCtx.font="11px ui-monospace,Menlo,monospace";
    distCtx.strokeStyle="rgba(148,163,184,0.25)";
    for(const x of [0,0.5,1]){const px=L+x*(R-L);distCtx.beginPath();distCtx.moveTo(px,10);distCtx.lineTo(px,h-12);distCtx.stroke();distCtx.fillStyle="#94a3b8";distCtx.fillText(x.toFixed(1),px-8,h-2);}
    rows.forEach((row,i)=>{
      const y=22+i*rowH;
      distCtx.fillStyle="#cbd5e1";distCtx.textAlign="right";distCtx.fillText(row[0],L-8,y+4);distCtx.textAlign="left";
      kept.forEach((tr,k)=>{
        const v=clamp(Number(row[1](tr))||0,0,1);
        const px=L+v*(R-L);
        const py=y+((k%5)-2)*3.2;
        distCtx.beginPath();distCtx.arc(px,py,4.2,0,Math.PI*2);distCtx.fillStyle=row[2];distCtx.fill();
      });
    });
    if(!kept.length){distCtx.fillStyle="#64748b";distCtx.textAlign="center";distCtx.fillText("Keep a trial to see the spread",w/2,h/2);}
  }

  function exportHref(path){
    const key=encodeURIComponent(state.lecturerKey||"");
    return `${path}?key=${key}`;
  }
  function refreshExportLinks(ts){
    downloadTrajCsvEl.href=exportHref(`/export/samples.csv`)+`&t=${ts}`;
    downloadMetricsCsvEl.href=exportHref(`/export/metrics.csv`)+`&t=${ts}`;
    downloadEventsCsvEl.href=exportHref(`/export/events.csv`)+`&t=${ts}`;
    const csv=$("btnTrialsCsv"),json=$("btnTrialsJson");
    if(csv)csv.href=exportHref("/export/trials.csv");
    if(json)json.href=exportHref("/export/trials.json");
  }
  function updateShareBar(){
    const el=$("shareUrl");
    if(!el)return;
    const url=state.publicUrl||"";
    el.textContent=url?`${url}/`:"Not public yet. In the project folder run npm run public";
  }
  function renderTrials(){
    const list=$("trialList");
    const live=$("trialLiveLabel");
    if(live){
      if(state.trialLive){
        const sec=Math.max(0,Math.round((Date.now()-state.trialLive.t0)/1000));
        live.textContent=`RECORDING ${state.trialLive.name} · ${sec}s · ${state.trialLive.n} samples`;
      }else live.textContent="";
    }
    if(!list)return;
    const rows=state.trialSeries||[];
    if(!rows.length){list.textContent="No saved trials yet. Record a take, then stop it.";return;}
    list.innerHTML=rows.map(tr=>{
      const sec=tr.t1?Math.round((tr.t1-tr.t0)/1000):Math.round((tr.metrics?.at(-1)?.t||0)/1000);
      const on=state.replay.trial&&state.replay.trial.id===tr.id;
      return `<div class="trial-row">
        <input type="checkbox" data-keep="${tr.id}" ${tr.kept!==false?"checked":""} title="Include in the mean" />
        <button type="button" data-replay="${tr.id}">${on?"Playing":"Replay"}</button>
        <span>${tr.name} · ${tr.preset||""} · ${sec}s · mean Φ ${Number(tr.meanPhi||0).toFixed(2)}</span>
        <button type="button" data-del="${tr.id}">Delete</button>
      </div>`;
    }).join("");
  }
  const trialListEl=$("trialList");
  if(trialListEl){
    trialListEl.addEventListener("change",(e)=>{
      const id=e.target?.dataset?.keep;
      if(!id)return;
      socket.emit("admin:experimentAction",{action:"set_trial_kept",id,kept:e.target.checked});
    });
    trialListEl.addEventListener("click",(e)=>{
      const replay=e.target?.dataset?.replay;
      const del=e.target?.dataset?.del;
      if(replay)loadTrial(replay);
      if(del)socket.emit("admin:experimentAction",{action:"delete_trial",id:del});
    });
  }
  if($("btnTrialStart"))$("btnTrialStart").onclick=()=>socket.emit("admin:experimentAction",{action:"start_trial",name:($("trialName")&&$("trialName").value)||""});
  if($("btnTrialStop"))$("btnTrialStop").onclick=()=>socket.emit("admin:experimentAction",{action:"stop_trial"});
  if($("btnCopyShare"))$("btnCopyShare").onclick=async()=>{
    const url=state.publicUrl?`${state.publicUrl}/`:"";
    if(!url){alert("Run npm run public first. The student link will show up here.");return;}
    try{await navigator.clipboard.writeText(url);$("btnCopyShare").textContent="Copied";}catch(e){window.prompt("Student link:",url);}
    setTimeout(()=>{$("btnCopyShare").textContent="Copy student link";},1600);
  };
  const joinCodeEl=$("joinCode");
  if(joinCodeEl)joinCodeEl.addEventListener("change",()=>{mark();socket.emit("admin:setConfig",{joinCode:joinCodeEl.value||""});});

  function applyMapMode(mode){
    state.ui.mapMode=mode==="cell"?"cell":"global";
    state.ui.god.userMoved=false;
    if(state.ui.mapMode==="cell"){state.ui.god.cx=0;state.ui.god.cy=0;state.ui.god.span=hexSpacingNow()*2.7;}
    else state.ui.god.span=Math.max(40,state.ui.godSpanMeters||90);
    const g=$("btnMapGlobal"),c=$("btnMapCell");
    if(g)g.classList.toggle("active-cyan",state.ui.mapMode==="global");
    if(c)c.classList.toggle("active-cyan",state.ui.mapMode==="cell");
    const cap=$("godModeCaption");
    if(cap)cap.textContent=state.ui.mapMode==="global"
      ?"Unwrapped world metres. Scroll to zoom, drag to pan."
      :"One periodic cell. Trails stop at the seam. Clones are outlines only.";
    if(godZoomEl)godZoomEl.value=String(Math.round(state.ui.god.span));
  }
  if($("btnMapGlobal"))$("btnMapGlobal").onclick=()=>applyMapMode("global");
  if($("btnMapCell"))$("btnMapCell").onclick=()=>applyMapMode("cell");
  if($("btnShowClones"))$("btnShowClones").onclick=()=>{
    state.ui.showClones=!state.ui.showClones;
    $("btnShowClones").textContent=`Clones: ${state.ui.showClones?"ON":"OFF"}`;
    $("btnShowClones").classList.toggle("active-amber",state.ui.showClones);
  };
  if($("btnResetView"))$("btnResetView").onclick=()=>applyMapMode(state.ui.mapMode);
  godCanvas.addEventListener("wheel",(e)=>{
    e.preventDefault();
    const factor=Math.exp(e.deltaY*0.0011);
    state.ui.god.span=clamp(state.ui.god.span*factor,12,800);
    if(godZoomEl)godZoomEl.value=String(Math.round(state.ui.god.span));
  },{passive:false});
  let godDrag=null;
  godCanvas.addEventListener("mousedown",(e)=>{
    if(e.button!==0||e.target!==godCanvas)return;
    godDrag={x:e.clientX,y:e.clientY,cx:state.ui.god.cx,cy:state.ui.god.cy};
  });
  window.addEventListener("mousemove",(e)=>{
    if(!godDrag)return;
    const rect=godCanvas.getBoundingClientRect();
    const scale=(godCanvas._lw||godCanvas.width)/Math.max(12,state.ui.god.span);
    const dx=(e.clientX-godDrag.x)*(godCanvas._lw||godCanvas.width)/rect.width/scale;
    const dy=(e.clientY-godDrag.y)*(godCanvas._lh||godCanvas.height)/rect.height/scale;
    state.ui.god.cx=godDrag.cx-dx;
    state.ui.god.cy=godDrag.cy-dy;
    state.ui.god.userMoved=true;
  });
  window.addEventListener("mouseup",()=>{godDrag=null;});

  function deltaForReplay(a,b,hex,spacing){
    if(!hex)return{x:b.x-a.x,y:b.y-a.y,dist:Math.hypot(b.x-a.x,b.y-a.y)};
    const s=Math.max(6,spacing||24),rt3h=Math.sqrt(3)/2;
    const lat=(x,y)=>{const v=y/(s*rt3h);return{u:x/s-v/2,v};};
    const wrap=c=>c-Math.floor(c+0.5);
    const la=lat(a.x,a.y),lb=lat(b.x,b.y);
    const u0=wrap(lb.u-la.u),v0=wrap(lb.v-la.v);
    let bestX=0,bestY=0,bestD2=Infinity;
    for(const [du,dv] of [[0,0],[-1,0],[1,0],[0,-1],[0,1],[-1,1],[1,-1]]){
      const u=u0+du,v=v0+dv,wx=s*(u+v*0.5),wy=s*rt3h*v,d2=wx*wx+wy*wy;
      if(d2<bestD2){bestD2=d2;bestX=wx;bestY=wy;}
    }
    return{x:bestX,y:bestY,dist:Math.sqrt(bestD2)};
  }
  function buildReplayTracks(trial){
    const hex=(trial.config&&trial.config.boundaryMode?trial.config.boundaryMode:state.config.boundaryMode)==="hex_torus";
    const spacing=Number(trial.config?.hexSpacing||state.config.hexSpacing||24);
    const cut=Math.max(3.2,spacing*0.28);
    const cell=new Map(),glob=new Map(),byId=new Map();
    for(const sample of trial.samples||[]){
      for(const a of sample.agents||[]){
        const frame={...a,t:sample.t};
        if(!byId.has(a.id))byId.set(a.id,{frames:[]});
        byId.get(a.id).frames.push(frame);
        if(!cell.has(a.id))cell.set(a.id,[]);
        const ctr=cell.get(a.id);
        const vor=toVoronoiAt(a.x,a.y,spacing);
        const cl=ctr[ctr.length-1];
        const raw=cl?Math.hypot(vor.x-cl.x,vor.y-cl.y):0;
        const jumped=!!cl&&raw>cut;
        if(!cl||jumped||raw>0.15)ctr.push({t:sample.t,x:vor.x,y:vor.y,jump:jumped,type:a.type});
        if(!glob.has(a.id))glob.set(a.id,{canon:{x:a.x,y:a.y},pts:[{t:sample.t,x:a.x,y:a.y,jump:false,type:a.type}]});
        else{
          const g=glob.get(a.id);
          const d=deltaForReplay(g.canon,a,hex,spacing);
          const lp=g.pts[g.pts.length-1];
          if(d.dist>cut)g.pts.push({t:sample.t,x:a.x,y:a.y,jump:true,type:a.type});
          else g.pts.push({t:sample.t,x:lp.x+d.x,y:lp.y+d.y,jump:false,type:a.type});
          g.canon={x:a.x,y:a.y};
        }
      }
    }
    return{cell,global:glob,byId};
  }
  async function loadTrial(id){
    const res=await fetch(exportHref(`/export/trial/${id}.json`));
    if(!res.ok){alert("Could not load that trial.");return;}
    const trial=await res.json();
    state.replay.trial=trial;
    state.replay.tracks=buildReplayTracks(trial);
    state.replay.live=false;
    state.replay.playing=false;
    state.replay.t=0;
    const scrub=$("playScrub");if(scrub)scrub.value="0";
    const label=$("playLabel");
    if(label)label.textContent=`Replay ${trial.name}`;
    renderTrials();
    drawGod();
  }
  function trialDuration(){
    const tr=state.replay.trial;
    if(!tr)return 1;
    if(tr.t1&&tr.t0)return Math.max(1,tr.t1-tr.t0);
    const last=(tr.metrics&&tr.metrics[tr.metrics.length-1])||(tr.samples&&tr.samples[tr.samples.length-1]);
    return Math.max(1,last?last.t:1);
  }
  if($("btnTrialPlay"))$("btnTrialPlay").onclick=()=>{
    if(!state.replay.trial){
      const first=keptTrials()[0]||(state.trialSeries||[])[0];
      if(!first)return;
      loadTrial(first.id).then(()=>{state.replay.playing=true;state.replay.live=false;});
      return;
    }
    state.replay.live=false;
    state.replay.playing=!state.replay.playing;
    $("btnTrialPlay").textContent=state.replay.playing?"⏸ Pause":"▶ Replay on god view";
  };
  const scrub=$("playScrub");
  if(scrub)scrub.addEventListener("input",()=>{
    if(!state.replay.trial){state.replay.live=true;return;}
    state.replay.live=false;
    state.replay.playing=false;
    state.replay.t=(Number(scrub.value)||0)/1000*trialDuration();
    drawGod();drawTrialOverlay();
  });
  let playStamp=0;
  function playLoop(now){
    if(state.replay.playing&&state.replay.trial){
      const dt=playStamp?Math.min(50,now-playStamp):0;
      playStamp=now;
      state.replay.t+=dt;
      const dur=trialDuration();
      if(state.replay.t>=dur){state.replay.t=dur;state.replay.playing=false;const b=$("btnTrialPlay");if(b)b.textContent="▶ Replay on god view";}
      if(scrub)scrub.value=String(Math.round(1000*state.replay.t/dur));
      const label=$("playLabel");
      if(label)label.textContent=`Replay ${state.replay.trial.name} · ${(state.replay.t/1000).toFixed(1)}s`;
      drawGod();
    }else playStamp=now;
    requestAnimationFrame(playLoop);
  }
  requestAnimationFrame(playLoop);

  function showAdminLock(message){
    const lock=$("adminLock");
    if(lock)lock.classList.remove("is-hidden");
    const err=$("adminLockError");
    if(err&&message)err.textContent=message;
  }
  function hideAdminLock(){const lock=$("adminLock");if(lock)lock.classList.add("is-hidden");}
  socket.on("admin:denied",()=>{
    sessionStorage.removeItem("lecturerKey");
    state.lecturerKey="";
    showAdminLock("That key does not match the one printed in the server terminal.");
    socket.disconnect();
  });
  socket.on("admin:trialSeries",(payload)=>{
    state.trialSeries=payload?.trials||[];
    renderTrials();
    drawTrialOverlay();
    drawDist();
  });
  const lockForm=$("adminLockForm");
  if(lockForm)lockForm.addEventListener("submit",(e)=>{
    e.preventDefault();
    const key=($("lecturerKeyInput")?.value||"").trim();
    if(!key)return;
    sessionStorage.setItem("lecturerKey",key);
    state.lecturerKey=key;
    socket.io.opts.query={role:"admin",key};
    if(socket.connected)socket.disconnect();
    socket.connect();
    hideAdminLock();
  });
  socket.on("admin:state",(p)=>{
    if(!p)return;state.world=p.world||state.world;state.agents=p.agents||[];state.counts=p.counts||state.counts;state.config=p.config||state.config;state.matrix=p.matrix;state.metrics=p.metrics;state.metricsHistory=p.metricsHistory||[];state.phaseTransitionCurve=p.phaseTransitionCurve||[];state.phaseEvents=p.phaseEvents||[];state.logFile=p.logFile||"";state.lastStartleAt=p.lastStartleAt||state.lastStartleAt||0;
    state.publicUrl=p.publicUrl||state.publicUrl||"";
    state.trialLive=p.trialLive||null;
    if(Array.isArray(p.trials)&&!state.trialSeries.length)state.trialSeries=p.trials;
    if(state._lastPresetKey&&state._lastPresetKey!==((p.config&&p.config.activePreset)||"")+":"+(p.config&&p.config.boundaryMode))clearTrackStores();
    state._lastPresetKey=((p.config&&p.config.activePreset)||"")+":"+(p.config&&p.config.boundaryMode);
    if(typeof state.config.showBotTrails==="boolean")state.ui.showBotTrails=state.config.showBotTrails;
    if(typeof state.config.showHumanTrails==="boolean")state.ui.showHumanTrails=state.config.showHumanTrails;
    applyTrailSource(state.ui.showBotTrails&&state.ui.showHumanTrails?"both":state.ui.showBotTrails?"bots":state.ui.showHumanTrails?"humans":"none");
    updateTrails(p.t||Date.now());
    updateKpis();
    const ts=p.t||Date.now();
    refreshExportLinks(ts);
    updateShareBar();
    renderTrials();
    statsEl.textContent=`${state.config.activePreset||""} · humans=${state.counts.humans} bots=${state.counts.bots} · Φh=${Number(state.metrics?.humanPolarization??0).toFixed(2)} Φb=${Number(state.metrics?.botPolarization??0).toFixed(2)} entrain=${Number(state.metrics?.humanEntrainment??0).toFixed(2)}`;
    logFileEl.textContent="Log: "+state.logFile.split("/").pop();
    if(!isFocused()&&Date.now()-state.lastLocalConfigEditAt>900){
      syncControls();
      if(joinCodeEl&&document.activeElement!==joinCodeEl)joinCodeEl.value=state.config.joinCode||"";
    }
    applyUrlConfigOnce();
    drawGod();drawPolar();drawMetrics();drawDynamics();drawTrialOverlay();drawDist();drawCrux();drawExpected();renderRoster();renderMatrix(state.matrix);
  });
  badges();setCrux("expt1_entrain");applyMapMode("global");
  if(state.lecturerKey){
    hideAdminLock();
    socket.connect();
  }
})();
