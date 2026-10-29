const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

const config = window.CHARACTER_LAB_CONFIG || {};
let selectedFiles = [];
let lastPlan = null;
let lastRequest = null;

function authConfig(){ return config.cognito || {}; }
function authReady(){ const c = authConfig(); return Boolean(c.domain && c.clientId && c.redirectUri); }
function decodeToken(token){ try { const part = token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"); return JSON.parse(atob(part)); } catch { return {}; } }
function currentToken(){
  const token = sessionStorage.getItem("character_lab_id_token");
  if(!token) return "";
  const payload = decodeToken(token);
  if(!payload.exp || payload.exp * 1000 < Date.now() + 30000){ sessionStorage.removeItem("character_lab_id_token"); return ""; }
  return token;
}
function randomUrlSafe(bytes=32){ const values = crypto.getRandomValues(new Uint8Array(bytes)); return btoa(String.fromCharCode(...values)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
async function challengeFor(value){ const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
async function beginLogin(){
  if(!authReady()){ toast("The secure sign-in configuration is not connected yet."); return; }
  const verifier = randomUrlSafe(48); const state = randomUrlSafe(24); const c = authConfig();
  sessionStorage.setItem("character_lab_pkce_verifier", verifier); sessionStorage.setItem("character_lab_oauth_state", state);
  const query = new URLSearchParams({response_type:"code",client_id:c.clientId,redirect_uri:c.redirectUri,scope:"openid email",state,code_challenge:await challengeFor(verifier),code_challenge_method:"S256"});
  location.assign(`${c.domain}/oauth2/authorize?${query}`);
}
async function finishLogin(){
  if(!authReady()) return;
  const query = new URLSearchParams(location.search); const code = query.get("code"); if(!code) return;
  const verifier = sessionStorage.getItem("character_lab_pkce_verifier");
  if(query.get("state") !== sessionStorage.getItem("character_lab_oauth_state") || !verifier) throw new Error("The sign-in response could not be verified.");
  const c = authConfig();
  const response = await fetch(`${c.domain}/oauth2/token`, {method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:c.clientId,code,redirect_uri:c.redirectUri,code_verifier:verifier})});
  const tokens = await response.json();
  if(!response.ok || !tokens.id_token) throw new Error("Sign-in could not be completed.");
  sessionStorage.setItem("character_lab_id_token", tokens.id_token); sessionStorage.removeItem("character_lab_pkce_verifier"); sessionStorage.removeItem("character_lab_oauth_state"); history.replaceState({},document.title,location.pathname);
}
function updateAuth(){
  const button = $("#authButton"); const status = $("#authStatus");
  if(!authReady()){ button.textContent="Sign-in pending"; button.disabled=true; status.textContent="AWS configuration pending"; return; }
  const signedIn = Boolean(currentToken()); button.textContent = signedIn ? "Sign out" : "Sign in"; button.disabled=false; status.textContent = signedIn ? "Signed in securely" : "Secure access";
}
$("#authButton").addEventListener("click",()=>{
  if(!currentToken()) return beginLogin();
  const c = authConfig(); sessionStorage.removeItem("character_lab_id_token"); location.assign(`${c.domain}/logout?${new URLSearchParams({client_id:c.clientId,logout_uri:c.redirectUri})}`);
});

function toast(message){ const element = $("#toast"); element.textContent = message; element.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>element.classList.remove("show"),3800); }
function setStatus(message){ $("#status").textContent = message; }
function canSubmit(){ return selectedFiles.length > 0 || $("#environmentDescription").value.trim() || $("#setting").value.trim() || $("#notes").value.trim(); }
function updateReadyState(){
  $("#analyseButton").disabled = !canSubmit();
  if(!selectedFiles.length && canSubmit()) setStatus("Environment brief ready. You can add photographs too.");
  if(!canSubmit()) setStatus("Add photographs or describe the environment to begin.");
}
function renderPreviews(){
  const grid = $("#previewGrid"); $("#dropzoneEmpty").style.display = selectedFiles.length ? "none" : "flex";
  grid.innerHTML = selectedFiles.map((file,index)=>`<div class="preview-tile"><img src="${esc(URL.createObjectURL(file))}" alt="Environment photograph ${index+1}"><span>Photo ${index+1}</span><button class="remove-photo" data-index="${index}" type="button" aria-label="Remove photo ${index+1}">×</button></div>`).join("");
  $$(".remove-photo",grid).forEach(button=>button.addEventListener("click",()=>{ selectedFiles.splice(Number(button.dataset.index),1); renderPreviews(); }));
  if(selectedFiles.length) setStatus(`${selectedFiles.length} photograph${selectedFiles.length===1?"":"s"} ready. Add a description if useful.`);
  updateReadyState();
}
function addFiles(fileList){
  const valid = [...fileList].filter(file=>file.type.startsWith("image/"));
  if(!valid.length){ toast("Please choose JPG, PNG or WEBP photographs."); return; }
  selectedFiles = [...selectedFiles, ...valid].slice(0,6); if(fileList.length > 6) toast("The MVP accepts up to six photographs."); renderPreviews();
}
$("#chooseButton").addEventListener("click",()=>$("#imageFile").click());
$("#dropzone").addEventListener("click",event=>{ if(event.target.id === "dropzone" || event.target.closest(".dropzone-empty")) $("#imageFile").click(); });
$("#dropzone").addEventListener("keydown",event=>{ if((event.key === "Enter" || event.key === " ") && event.target.id === "dropzone"){ event.preventDefault(); $("#imageFile").click(); } });
$("#imageFile").addEventListener("change",event=>{ addFiles(event.target.files); event.target.value=""; });
["dragenter","dragover"].forEach(name=>$("#dropzone").addEventListener(name,event=>{event.preventDefault();$("#dropzone").classList.add("dragging");}));
["dragleave","drop"].forEach(name=>$("#dropzone").addEventListener(name,event=>{event.preventDefault();$("#dropzone").classList.remove("dragging");}));
$("#dropzone").addEventListener("drop",event=>addFiles(event.dataTransfer.files));

function compressImage(file){
  return new Promise((resolve,reject)=>{ const image=new Image(); const reader=new FileReader(); reader.onerror=reject; image.onerror=reject; reader.onload=()=>{image.src=reader.result}; image.onload=()=>{ const max=1600; const scale=Math.min(1,max/Math.max(image.width,image.height)); const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(image.width*scale)); canvas.height=Math.max(1,Math.round(image.height*scale)); canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height); resolve(canvas.toDataURL("image/jpeg",.82)); }; reader.readAsDataURL(file); });
}
function list(items){ return (items || []).map(item=>`<li>${esc(item)}</li>`).join(""); }
function renderPlan(plan){
  lastPlan = plan; $("#environmentReading").textContent = plan.environment_summary || "The environment was analysed through the selected lenses.";
  $("#lensGrid").innerHTML = (plan.visual_lenses || []).map((lens,index)=>`<article class="lens-card"><div class="lens-index">LENS 0${index+1} · ${esc(lens.confidence)}% CONFIDENCE</div><h3>${esc(lens.name)}</h3><p>${esc(lens.observed_features)}</p><ul>${list(lens.possible_learning_links)}</ul></article>`).join("");
  $("#activityCount").textContent = `${(plan.ranked_activities || []).length} ranked AI-draft experiences`;
  $("#activityList").innerHTML = (plan.ranked_activities || []).map(activity=>`<article class="activity-card"><div class="activity-top"><div class="activity-title-wrap"><div class="rank">${esc(activity.rank)}</div><div><h3>${esc(activity.title)}</h3><div class="activity-meta">${esc(activity.activity_type)} · ${esc(activity.phase)} · ${esc(activity.duration)} · ${esc(activity.risk_level)} risk</div></div></div><span class="draft-pill">AI-DRAFT</span></div><div class="activity-purpose"><strong>Purpose:</strong> ${esc(activity.purpose_and_beneficiary)}</div><div class="activity-grid"><div class="activity-block"><h4>Character lens</h4><p><strong>Primary:</strong> ${esc(activity.primary_virtue)}</p><p><strong>Secondary:</strong> ${esc((activity.secondary_virtues||[]).join(", "))}</p><p><strong>Heritage anchor:</strong> ${esc(activity.heritage_anchor)}</p></div><div class="activity-block"><h4>Why this fits</h4><p>${esc(activity.why_this_fits)}</p></div><div class="activity-block"><h4>Student responsibility</h4><ul>${list(activity.student_actions)}</ul></div><div class="activity-block"><h4>Adult boundary</h4><p>${esc(activity.adult_role_and_boundary)}</p></div><div class="activity-block"><h4>Experience arc</h4><p><strong>Prepare:</strong> ${esc(activity.before_preparation)}</p><p><strong>Do:</strong> ${esc(activity.during_sequence)}</p><p><strong>Reflect:</strong> ${esc(activity.after_reflection)}</p></div><div class="activity-block"><h4>Evidence and access</h4><p><strong>Evidence:</strong> ${esc(activity.evidence_of_character)}</p><p><strong>Access:</strong> ${esc(activity.inclusion_and_adaptations)}</p></div></div><div class="activity-footer">${(activity.curriculum_links||[]).map(link=>`<span class="tag">${esc(link.subject)} · ${esc(link.objective)}</span>`).join("")}</div></article>`).join("");
  $("#crossLinks").innerHTML = `<h3>Cross-curricular possibilities</h3><div class="cross-link-list">${(plan.cross_curricular_links||[]).map(link=>`<div class="cross-link"><strong>${esc(link.subject)}</strong>${esc(link.application)}</div>`).join("")}</div>`;
  $("#limitations").textContent = plan.limitations?.length ? "Planning notes: " + plan.limitations.join(" · ") : "Only evidence supported by the photographs and brief is shown.";
  $("#results").classList.add("visible"); $("#results").scrollIntoView({behavior:"smooth",block:"start"});
}
function collectBrief(images, regenerate=false){ return {images,curriculum_framework:$("#curriculum").value,phase:$("#phase").value,year_group:$("#yearGroup").value,group_size:Number($("#groupSize").value),session_type:$("#sessionType").value,duration:$("#duration").value,setting:$("#setting").value.trim(),environment_description:$("#environmentDescription").value.trim(),notes:$("#notes").value.trim(),faces_consent:$("#faceConsent").checked,regenerate,previous_titles:(lastPlan?.ranked_activities||[]).map(item=>item.title)}; }
async function runAnalysis(regenerate=false){
  if(!canSubmit()){ toast("Add photographs or describe the environment first."); return; }
  if(!config.apiUrl){ toast("The AWS API address is not configured yet."); return; }
  const token=currentToken(); if(!token){ toast("Sign in to use live AI analysis."); await beginLogin(); return; }
  const button = regenerate ? $("#moreButton") : $("#analyseButton"); button.disabled=true; button.classList.add("loading"); if(!regenerate){button.innerHTML="Generating experiences <span>↻</span>";} setStatus("Reading the environment, checking the CPD guide and designing age-appropriate options…");
  try{ const images=regenerate && lastRequest?.images ? lastRequest.images : await Promise.all(selectedFiles.map(compressImage)); const request=collectBrief(images,regenerate); lastRequest=request; const response=await fetch(config.apiUrl,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify(request)}); const payload=await response.json(); if(!response.ok) throw new Error(payload.error || "The environment could not be analysed."); renderPlan(payload.plan); setStatus("Plan generated. Review it before delivery."); }
  catch(error){ setStatus(""); toast(error.message || "The environment could not be analysed."); }
  finally{ button.disabled=false; button.classList.remove("loading"); if(!regenerate) button.innerHTML="Generate three experiences <span>↗</span>"; }
}
$("#analyseButton").addEventListener("click",()=>runAnalysis(false)); $("#moreButton").addEventListener("click",()=>runAnalysis(true));
$("#setting").addEventListener("input", updateReadyState); $("#environmentDescription").addEventListener("input", updateReadyState); $("#notes").addEventListener("input", updateReadyState);
$("#downloadButton").addEventListener("click",()=>{ if(!lastPlan){toast("Generate a plan first.");return;} const text=JSON.stringify(lastPlan,null,2); const blob=new Blob([text],{type:"text/plain;charset=utf-8"}); const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download="character-development-environment-plan.txt"; link.click(); URL.revokeObjectURL(link.href); });
finishLogin().then(()=>{updateAuth();if(currentToken())toast("Signed in securely.");}).catch(error=>{updateAuth();toast(error.message)}); updateAuth();
