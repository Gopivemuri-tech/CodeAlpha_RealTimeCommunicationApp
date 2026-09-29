(() => {
'use strict';

const c = window.NEXAROOM;
const $ = id => document.getElementById(id);
const esc = v => { const d=document.createElement('div'); d.textContent=String(v??''); return d.innerHTML; };

const peers = new Map(), names = new Map(), streams = new Map(), remoteMedia = new Map(), analysers = new Map();
const peerCohost = new Map();
let socket=null, localStream=null, cameraTrack=null, screenTrack=null, roomKey=null;
let startedAt=Date.now(), selectedPeer='local', manualPinUntil=0, audioCtx=null;
let currentPolicy={allow_chat:true,allow_screen_share:true,allow_unmute:true,allow_video:true};
let captionsOn=false, recognition=null, recorder=null, recordedChunks=[], recording=false;

function toast(t){
  const el=$('toast'); if(!el)return;
  el.textContent=t; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2300);
}
function fatal(t){
  const el=$('fatalBanner'); if(el){el.textContent=t;el.classList.remove('hidden')}
  if($('connectionState')) $('connectionState').textContent='Connection issue';
}
function appDialog({title,message,confirmText='OK',cancelText='Cancel',danger=false,showCancel=false}={}){
  return new Promise(resolve=>{
    const modal=$('appDialog'), titleEl=$('appDialogTitle'), msgEl=$('appDialogMessage'), ok=$('appDialogConfirm'), cancel=$('appDialogCancel'), icon=$('appDialogIcon');
    titleEl.textContent=title||'NexaRoom'; msgEl.textContent=message||'';
    ok.textContent=confirmText; cancel.textContent=cancelText;
    ok.classList.toggle('danger-action',!!danger); icon.classList.toggle('danger-icon',!!danger);
    cancel.classList.toggle('hidden',!showCancel); modal.classList.remove('hidden');
    const done=v=>{modal.classList.add('hidden');ok.onclick=null;cancel.onclick=null;resolve(v)};
    ok.onclick=()=>done(true); cancel.onclick=()=>done(false);
  });
}
function quality(){
  return c.videoQuality==='1080p'
    ? {width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}}
    : {width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}};
}
function initials(name){return String(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'?'}
function micStatusSvg(muted){
  return muted
    ? '<span class="mute-status mic-off" title="Muted"><svg viewBox="0 0 24 24"><path d="M9 8v4a3 3 0 0 0 4.7 2.5M15 11V7a3 3 0 0 0-5.4-1.8M6 11.5v.5a6 6 0 0 0 9.8 4.6M12 18v3M9 21h6M4 4l16 16"/></svg></span>'
    : '<span class="mute-status mic-on" title="Microphone on"><svg viewBox="0 0 24 24"><path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM6 11.5v.5a6 6 0 0 0 12 0v-.5M12 18v3M9 21h6"/></svg></span>';
}

async function initMedia(deviceIds={}){
  if($('connectionState')) $('connectionState').textContent='Requesting camera and microphone…';
  const constraints={
    video:{...quality(), ...(deviceIds.video?{deviceId:{exact:deviceIds.video}}:{})},
    audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1,...(deviceIds.audio?{deviceId:{exact:deviceIds.audio}}:{})}
  };
  const next=await navigator.mediaDevices.getUserMedia(constraints);
  const old=localStream;
  localStream=next; cameraTrack=next.getVideoTracks()[0];

  if(old){
    for(const pc of peers.values()){
      for(const kind of ['audio','video']){
        const t=next.getTracks().find(x=>x.kind===kind);
        const sender=pc.getSenders().find(x=>x.track?.kind===kind);
        if(t&&sender) await sender.replaceTrack(t);
      }
    }
    old.getTracks().forEach(t=>t.stop());
  }
  $('localThumbVideo').srcObject=localStream;
  streams.set('local',localStream); setMain('local',false);
  addAnalyser('local',localStream);
  if($('connectionState')) $('connectionState').textContent='Media ready';
  await loadDevices();
}
async function loadDevices(){
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    const cams=devices.filter(d=>d.kind==='videoinput'), mics=devices.filter(d=>d.kind==='audioinput');
    const cs=$('cameraSelect'), ms=$('micSelect');
    if(cs){cs.innerHTML='';cams.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||`Camera ${i+1}`;cs.appendChild(o)});if(cameraTrack)cs.value=cameraTrack.getSettings().deviceId||''}
    if(ms){ms.innerHTML='';mics.forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||`Microphone ${i+1}`;ms.appendChild(o)});const at=localStream?.getAudioTracks()[0];if(at)ms.value=at.getSettings().deviceId||''}
  }catch{}
}

function setMain(peerId,manual=true){
  const stream=streams.get(peerId); if(!stream)return;
  selectedPeer=peerId; if(manual)manualPinUntil=Date.now()+8000;
  $('mainVideo').srcObject=stream; $('mainVideo').muted=peerId==='local';
  const name=peerId==='local'?c.displayName:(names.get(peerId)||'Participant');
  $('speakerName').textContent=name; $('speakerAvatar').textContent=initials(name);
  document.querySelectorAll('.participant-thumb').forEach(x=>x.classList.toggle('active',x.dataset.peer===peerId));
}
function thumb(peerId,name,stream){
  let el=$('thumb-'+peerId);
  if(!el){
    el=document.createElement('article'); el.id='thumb-'+peerId; el.className='participant-thumb'; el.dataset.peer=peerId;
    el.innerHTML=`<div class="participant-avatar">${esc(initials(name))}</div><video autoplay playsinline></video><div class="participant-name"><span class="remote-mic">${micStatusSvg(false)}</span><span class="n"></span></div>`;
    el.querySelector('.n').textContent=name; el.onclick=()=>setMain(peerId,true); $('filmstrip').appendChild(el);
  }
  el.querySelector('video').srcObject=stream; streams.set(peerId,stream); return el;
}
function removePeer(id){
  peers.get(id)?.close(); peers.delete(id); names.delete(id); streams.delete(id); remoteMedia.delete(id); analysers.delete(id); peerCohost.delete(id);
  $('thumb-'+id)?.remove(); if(selectedPeer===id)setMain('local',false); renderPeople();
}
function createPeer(id,name){
  if(peers.has(id))return peers.get(id);
  names.set(id,name||'Participant');
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]});
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.onicecandidate=e=>{if(e.candidate&&socket)socket.emit('ice_candidate',{target:id,candidate:e.candidate})};
  pc.ontrack=e=>{const st=e.streams[0];thumb(id,names.get(id),st);addAnalyser(id,st);if(selectedPeer===id)$('mainVideo').srcObject=st};
  pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))removePeer(id)};
  peers.set(id,pc);renderPeople();return pc;
}
async function callPeer(p){
  const pc=createPeer(p.sid,p.name||p.username); remoteMedia.set(p.sid,p.media||{}); peerCohost.set(p.sid,!!p.cohost);
  const offer=await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('webrtc_offer',{target:p.sid,sdp:pc.localDescription});
}

function participantMenu(id,name){
  if(!c.isHost)return '';
  return `<div class="participant-actions">
    <button class="person-more" data-person="${esc(id)}">•••</button>
    <div class="person-menu hidden" id="person-menu-${esc(id)}">
      <button data-action="cohost" data-target="${esc(id)}">Make co-host</button>
      <button class="remove-person" data-action="remove" data-target="${esc(id)}">Remove from meeting</button>
    </div>
  </div>`;
}
function bindParticipantMenus(){
  document.querySelectorAll('.person-more').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation(); document.querySelectorAll('.person-menu').forEach(m=>m.classList.add('hidden'));
    $('person-menu-'+btn.dataset.person)?.classList.toggle('hidden');
  });
  document.querySelectorAll('.person-menu button').forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.target;
    if(btn.dataset.action==='cohost'){
      socket?.emit('host_make_cohost',{target:id}); toast('Co-host permission sent');
    }else if(btn.dataset.action==='remove'){
      const yes=await appDialog({title:'Remove participant?',message:'This participant will be disconnected from the meeting.',confirmText:'Remove',cancelText:'Cancel',danger:true,showCancel:true});
      if(yes)socket?.emit('host_remove',{target:id});
    }
  });
}
function renderPeople(){
  const list=$('peopleList');list.innerHTML='';
  const me=document.createElement('div');me.className='person-row';
  me.innerHTML=`<div class="person-avatar">${esc(initials(c.displayName))}</div><div class="person-copy"><b>${esc(c.displayName)} (You)</b><span>${c.isHost?'Host · ':''}In meeting</span></div>`;
  list.appendChild(me);
  for(const [id,n] of names){
    const st=remoteMedia.get(id)||{}, co=peerCohost.get(id);
    const row=document.createElement('div');row.className='person-row';
    row.innerHTML=`<div class="person-avatar">${esc(initials(n))}</div><div class="person-copy"><b>${esc(n)}${co?' <em>CO-HOST</em>':''}</b><span>${st.mic===false?'Muted':'Microphone on'} · ${st.camera===false?'Camera off':'Camera on'}</span></div>${participantMenu(id,n)}`;
    list.appendChild(row);
  }
  bindParticipantMenus();
  const n=1+names.size; $('peopleCount').textContent=n;$('toolbarPeopleCount').textContent=n;$('infoPeopleCount').textContent=n;
}
function emitMedia(){
  if(socket?.connected)socket.emit('media_state',{mic:localStream?.getAudioTracks()[0]?.enabled!==false,camera:cameraTrack?.enabled!==false,sharing:!!screenTrack});
}
function addAnalyser(id,stream){
  try{
    if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const tracks=stream.getAudioTracks();if(!tracks.length)return;
    const src=audioCtx.createMediaStreamSource(new MediaStream([tracks[0]])), an=audioCtx.createAnalyser();
    an.fftSize=256;src.connect(an);analysers.set(id,an);
  }catch{}
}
function monitorSpeaker(){
  if(Date.now()<manualPinUntil)return;
  let best=null,bestVol=.028;
  for(const [id,an] of analysers){
    const a=new Uint8Array(an.frequencyBinCount);an.getByteFrequencyData(a);
    const avg=a.reduce((s,v)=>s+v,0)/(a.length*255), card=id==='local'?$('thumb-local'):$('thumb-'+id);
    card?.classList.toggle('speaking',avg>.035);if(avg>bestVol){bestVol=avg;best=id}
  }
  if(best&&best!==selectedPeer)setMain(best,false);
}

async function waitForIO(){
  if(window.io)return window.io;
  return new Promise((resolve,reject)=>{
    const ok=()=>{cleanup();resolve(window.io)},bad=()=>{cleanup();reject(new Error('Socket.IO client could not load.'))};
    const cleanup=()=>{window.removeEventListener('nexaroom-socket-ready',ok);window.removeEventListener('nexaroom-socket-failed',bad)};
    window.addEventListener('nexaroom-socket-ready',ok,{once:true});window.addEventListener('nexaroom-socket-failed',bad,{once:true});
    setTimeout(()=>window.io?ok():bad(),9000);
  });
}
function applyPolicy(p={}){
  currentPolicy={...currentPolicy,...p};
  if($('allowChatToggle'))$('allowChatToggle').checked=currentPolicy.allow_chat!==false;
  if($('allowShareToggle'))$('allowShareToggle').checked=currentPolicy.allow_screen_share!==false;
  if($('allowUnmuteToggle'))$('allowUnmuteToggle').checked=currentPolicy.allow_unmute!==false;
  if($('allowVideoToggle'))$('allowVideoToggle').checked=currentPolicy.allow_video!==false;
  $('chatBtn')?.classList.toggle('restricted',currentPolicy.allow_chat===false&&!c.isHost);
  $('screenBtn')?.classList.toggle('restricted',currentPolicy.allow_screen_share===false&&!c.isHost);
}
async function connectRealtime(){
  const ioLib=await waitForIO();
  socket=ioLib({path:'/socket.io',transports:['websocket','polling'],withCredentials:true,reconnection:true,reconnectionAttempts:8});
  socket.on('connect',()=>{$('connectionState').textContent='Connected securely';socket.emit('join_room',{room:c.room});emitMedia()});
  socket.on('connect_error',e=>{$('connectionState').textContent='Reconnecting…';console.error(e)});
  socket.on('disconnect',()=>{$('connectionState').textContent='Reconnecting…'});
  socket.on('room-ready',async d=>{
    startedAt=d.meeting.started_at?new Date(d.meeting.started_at).getTime():Date.now();applyPolicy(d.policy||{});
    $('lockBadge')?.classList.toggle('hidden',!d.meeting.locked); if($('lockMeetingToggle'))$('lockMeetingToggle').checked=!!d.meeting.locked;
    for(const p of d.peers)await callPeer(p);renderPeople();
  });
  socket.on('peer-joined',p=>{names.set(p.sid,p.name||p.username);remoteMedia.set(p.sid,p.media||{});peerCohost.set(p.sid,!!p.cohost);renderPeople();toast((p.name||p.username)+' joined')});
  socket.on('webrtc-offer',async d=>{const pc=createPeer(d.from,d.name);await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));const a=await pc.createAnswer();await pc.setLocalDescription(a);socket.emit('webrtc_answer',{target:d.from,sdp:pc.localDescription})});
  socket.on('webrtc-answer',async d=>{const pc=peers.get(d.from);if(pc)await pc.setRemoteDescription(new RTCSessionDescription(d.sdp))});
  socket.on('ice-candidate',async d=>{const pc=peers.get(d.from);if(pc&&d.candidate)try{await pc.addIceCandidate(new RTCIceCandidate(d.candidate))}catch{}});
  socket.on('peer-left',d=>removePeer(d.sid));
  socket.on('media-state',d=>{remoteMedia.set(d.sid,d);const card=$('thumb-'+d.sid);if(card){card.classList.toggle('camera-off',d.camera===false);card.querySelector('.remote-mic').innerHTML=micStatusSvg(d.mic===false)}renderPeople()});
  socket.on('room-policy',d=>{applyPolicy(d.policy||{});toast('Host updated meeting permissions')});
  socket.on('meeting-lock',d=>{$('lockBadge')?.classList.toggle('hidden',!d.locked);if($('lockMeetingToggle'))$('lockMeetingToggle').checked=!!d.locked;toast(d.locked?'Meeting locked':'Meeting unlocked')});
  socket.on('host-mute',d=>{const t=localStream?.getAudioTracks()[0];if(t){t.enabled=false;syncLocalMicUI(false);emitMedia()}toast(d.message||'Host muted your microphone')});
  socket.on('policy-message',d=>toast(d.message||'This feature is disabled by the host.'));
  socket.on('cohost-status',d=>{peerCohost.set(d.sid,!!d.cohost);renderPeople();if(d.sid===socket.id)toast('You are now a co-host')});
  socket.on('removed-from-meeting',async d=>{await appDialog({title:'Removed from meeting',message:d.message||'The host removed you from this room.',confirmText:'Back to workspace'});location.href='/'});
  socket.on('room-error',async d=>{await appDialog({title:'Unable to join meeting',message:d.message||'This room is unavailable.',confirmText:'Back to workspace'});location.href='/'});
  socket.on('meeting-ended',async d=>{await appDialog({title:'Meeting ended',message:d.message||'This meeting has ended.',confirmText:'Back to workspace'});location.href='/'});
  socket.on('reaction',showReaction);socket.on('chat-message',addChat);socket.on('encrypted-file',receiveFile);socket.on('whiteboard-draw',drawBoard);socket.on('whiteboard-clear',clearBoardLocal);socket.on('caption-line',showCaption);
}

function syncLocalMicUI(enabled){
  $('micBtn').classList.toggle('off',!enabled);$('micBtn').querySelector('small').textContent=enabled?'Mute':'Unmute';
  const holder=$('localMuteMark'); if(holder)holder.outerHTML= enabled
    ? '<span id="localMuteMark" class="mute-status mic-on"><svg viewBox="0 0 24 24"><path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM6 11.5v.5a6 6 0 0 0 12 0v-.5M12 18v3M9 21h6"/></svg></span>'
    : '<span id="localMuteMark" class="mute-status mic-off"><svg viewBox="0 0 24 24"><path d="M9 8v4a3 3 0 0 0 4.7 2.5M15 11V7a3 3 0 0 0-5.4-1.8M6 11.5v.5a6 6 0 0 0 9.8 4.6M12 18v3M9 21h6M4 4l16 16"/></svg></span>';
}

$('thumb-local').onclick=()=>setMain('local',true);
$('micBtn').onclick=()=>{
  const t=localStream?.getAudioTracks()[0];if(!t)return;
  if(!t.enabled && !c.isHost && currentPolicy.allow_unmute===false)return toast('Host disabled participant unmute.');
  t.enabled=!t.enabled;syncLocalMicUI(t.enabled);emitMedia();
};
$('camBtn').onclick=()=>{
  if(!cameraTrack)return;
  if(!cameraTrack.enabled&&!c.isHost&&currentPolicy.allow_video===false)return toast('Host disabled participant video.');
  cameraTrack.enabled=!cameraTrack.enabled;$('camBtn').classList.toggle('off',!cameraTrack.enabled);$('camBtn').querySelector('small').textContent=cameraTrack.enabled?'Stop Video':'Start Video';
  $('thumb-local').classList.toggle('camera-off',!cameraTrack.enabled);$('mainVideo').classList.toggle('camera-off',!cameraTrack.enabled&&selectedPeer==='local');emitMedia();
};
$('screenBtn').onclick=async()=>{
  if(!c.allowScreenShare||(!c.isHost&&currentPolicy.allow_screen_share===false))return toast('Screen sharing is disabled by the host.');
  if(screenTrack){await stopShare();return}
  try{
    const d=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30}},audio:false});screenTrack=d.getVideoTracks()[0];
    for(const pc of peers.values()){const s=pc.getSenders().find(x=>x.track?.kind==='video');if(s)await s.replaceTrack(screenTrack)}
    streams.set('local',new MediaStream([screenTrack,...localStream.getAudioTracks()]));$('localThumbVideo').srcObject=streams.get('local');setMain('local',false);
    $('screenBtn').classList.add('active');$('screenBtn').querySelector('small').textContent='Stop Share';screenTrack.onended=stopShare;emitMedia();
  }catch(e){if(e.name!=='NotAllowedError')toast('Could not start screen sharing.')}
};
async function stopShare(){
  if(!screenTrack)return;
  for(const pc of peers.values()){const s=pc.getSenders().find(x=>x.track?.kind==='video');if(s)await s.replaceTrack(cameraTrack)}
  screenTrack.stop();screenTrack=null;streams.set('local',localStream);$('localThumbVideo').srcObject=localStream;if(selectedPeer==='local')setMain('local',false);
  $('screenBtn').classList.remove('active');$('screenBtn').querySelector('small').textContent='Share';emitMedia();
}

$('copyInvite').onclick=copyInvite;$('copyInfoInvite').onclick=copyInvite;
async function copyInvite(){await navigator.clipboard.writeText(location.href);toast('Invite link copied')}
function openMeetingInfo(){$('inviteLinkValue').value=location.href;$('meetingInfoModal').classList.remove('hidden')}
$('meetingInfoBtn').onclick=openMeetingInfo;$('moreMeetingInfo').onclick=()=>{$('moreMenu').classList.add('hidden');openMeetingInfo()};
$('closeMeetingInfo').onclick=()=>$('meetingInfoModal').classList.add('hidden');

$('leaveBtn')?.addEventListener('click',()=>{localStream?.getTracks().forEach(t=>t.stop());location.href='/'});
$('endBtn')?.addEventListener('click',async()=>{const yes=await appDialog({title:'End meeting for everyone?',message:'Everyone will be disconnected from this NexaRoom.',confirmText:'End meeting',cancelText:'Keep meeting',danger:true,showCancel:true});if(yes)socket?.emit('end_meeting')});

function openSide(tab){
  $('sidePanel').classList.remove('closed');document.querySelectorAll('.side-pane').forEach(x=>x.classList.add('hidden'));$('tab-'+tab).classList.remove('hidden');
  document.querySelectorAll('.side-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
}
$('chatBtn').onclick=()=>openSide('chat');$('peopleBtn').onclick=()=>openSide('people');
$('moreBtn').onclick=e=>{e.stopPropagation();$('moreMenu').classList.toggle('hidden')};
document.addEventListener('click',e=>{if(!$('moreMenu').classList.contains('hidden')&&!e.target.closest('.more-wrap'))$('moreMenu').classList.add('hidden');document.querySelectorAll('.person-menu').forEach(m=>{if(!e.target.closest('.participant-actions'))m.classList.add('hidden')})});
$('fileBtn').onclick=()=>{$('moreMenu').classList.add('hidden');openSide('files');$('fileInput').click()};
$('closeSide').onclick=()=>$('sidePanel').classList.add('closed');
document.querySelectorAll('.side-tab').forEach(b=>b.onclick=()=>openSide(b.dataset.tab));

$('chatForm').onsubmit=e=>{
  e.preventDefault();const t=$('chatInput').value.trim();if(!t)return;
  if(!c.isHost&&currentPolicy.allow_chat===false)return toast('Chat is disabled by the host.');
  if(socket?.connected){socket.emit('chat_message',{text:t});$('chatInput').value=''}
};
function addChat(m){
  document.querySelector('.empty-chat')?.remove();const r=document.createElement('div');r.className='chat-msg';
  r.innerHTML=`<div><b>${esc(m.sender)}</b><span>${new Date(m.at||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div><p>${esc(m.text)}</p>`;
  $('chatMessages').appendChild(r);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;
}

$('reactBtn').onclick=()=>$('reactionMenu').classList.toggle('hidden');
$('reactionMenu').querySelectorAll('button').forEach(b=>b.onclick=()=>{socket?.emit('reaction',{emoji:b.textContent});$('reactionMenu').classList.add('hidden')});
function showReaction(r){const x=document.createElement('div');x.className='floating-reaction';x.innerHTML=`<b>${esc(r.name)}</b> ${esc(r.emoji)}`;$('reactionLayer').appendChild(x);setTimeout(()=>x.remove(),2600)}

function b64(b){let x='';b.forEach(v=>x+=String.fromCharCode(v));return btoa(x).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function un64(v){v=v.replace(/-/g,'+').replace(/_/g,'/');while(v.length%4)v+='=';const x=atob(v);return Uint8Array.from(x,a=>a.charCodeAt(0))}
async function initKey(){
  const h=new URLSearchParams(location.hash.slice(1));let k=h.get('k');
  if(!k&&c.isHost){k=b64(crypto.getRandomValues(new Uint8Array(32)));history.replaceState(null,'',location.pathname+location.search+'#k='+k)}
  if(k)roomKey=await crypto.subtle.importKey('raw',un64(k),{name:'AES-GCM'},false,['encrypt','decrypt']);else toast('Invite encryption key missing.');
}
$('fileInput').onchange=async()=>{
  const f=$('fileInput').files?.[0];if(!f)return;if(!c.allowFiles)return toast('File sharing disabled.');
  if(f.size>c.maxFileMb*1024*1024)return toast(`Maximum file size is ${c.maxFileMb} MB`);if(!roomKey)return toast('Secure room key unavailable.');
  const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},roomKey,await f.arrayBuffer());
  socket?.emit('encrypted_file',{name:f.name,type:f.type,size:f.size,iv:Array.from(iv),cipher});addFile('You',f.name,null,true);$('fileInput').value='';
};
function addFile(sender,name,url,sent){
  const r=document.createElement('div');r.className='file-row';r.innerHTML=`<div><b>${esc(name)}</b><span>${esc(sender)}</span></div>`;
  if(url){const a=document.createElement('a');a.href=url;a.download=name;a.textContent='Download';r.appendChild(a)}else{const s=document.createElement('span');s.textContent=sent?'Sent':'';r.appendChild(s)}
  $('fileList').prepend(r);
}
async function receiveFile(p){
  try{const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(p.iv)},roomKey,p.cipher),url=URL.createObjectURL(new Blob([plain],{type:p.type}));addFile(p.sender,p.name,url,false);toast(`${p.sender} shared a file`)}
  catch{toast('Could not decrypt the shared file.')}
}

const boardModal=$('boardModal'),cv=$('whiteboard'),ctx=cv.getContext('2d');let drawing=false,last=null;
function resizeBoard(){const r=cv.getBoundingClientRect(),d=devicePixelRatio||1;cv.width=r.width*d;cv.height=r.height*d;ctx.setTransform(d,0,0,d,0,0);ctx.lineCap='round'}
function point(e){const r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}}
function drawBoard(a){const r=cv.getBoundingClientRect();ctx.strokeStyle=a.c;ctx.lineWidth=a.w;ctx.beginPath();ctx.moveTo(a.x0*r.width,a.y0*r.height);ctx.lineTo(a.x1*r.width,a.y1*r.height);ctx.stroke()}
function clearBoardLocal(){ctx.clearRect(0,0,cv.width,cv.height)}
$('boardBtn').onclick=()=>{$('moreMenu').classList.add('hidden');if(!c.allowWhiteboard)return toast('Whiteboard disabled.');boardModal.classList.remove('hidden');setTimeout(resizeBoard,30)};
$('closeBoard').onclick=()=>boardModal.classList.add('hidden');cv.onpointerdown=e=>{drawing=true;last=point(e)};cv.onpointermove=e=>{if(!drawing)return;const p=point(e),a={x0:last.x,y0:last.y,x1:p.x,y1:p.y,c:$('boardColor').value,w:+$('boardSize').value};drawBoard(a);socket?.emit('whiteboard_draw',a);last=p};window.addEventListener('pointerup',()=>{drawing=false;last=null});$('clearBoard').onclick=()=>{clearBoardLocal();socket?.emit('whiteboard_clear')};

/* Host tools */
$('hostToolsBtn')?.addEventListener('click',()=>{$('hostToolsPanel').classList.remove('hidden')});
$('closeHostTools')?.addEventListener('click',()=>$('hostToolsPanel').classList.add('hidden'));
$('muteAllBtn')?.addEventListener('click',async()=>{const yes=await appDialog({title:'Mute everyone?',message:'All other participants will be muted.',confirmText:'Mute all',cancelText:'Cancel',showCancel:true});if(yes)socket?.emit('host_mute_all')});
[['allowChatToggle','allow_chat'],['allowShareToggle','allow_screen_share'],['allowUnmuteToggle','allow_unmute'],['allowVideoToggle','allow_video']].forEach(([id,name])=>{
  $(id)?.addEventListener('change',e=>socket?.emit('host_policy',{name,value:e.target.checked}));
});
$('lockMeetingToggle')?.addEventListener('change',e=>socket?.emit('host_policy',{name:'locked',value:e.target.checked}));

/* Recording */
$('recordBtn').onclick=async()=>{
  $('moreMenu').classList.add('hidden');
  if(recording){recorder.stop();return}
  try{
    const stream=$('mainVideo').captureStream?$('mainVideo').captureStream():localStream;
    recordedChunks=[];recorder=new MediaRecorder(stream,{mimeType:MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm'});
    recorder.ondataavailable=e=>{if(e.data?.size)recordedChunks.push(e.data)};
    recorder.onstop=()=>{
      const blob=new Blob(recordedChunks,{type:'video/webm'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`NexaRoom-${c.meetingCode.replace(/\s/g,'-')}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      recording=false;$('recordBtn').classList.remove('recording');$('recordBtn').querySelector('b').textContent='Record meeting';toast('Recording saved');
    };
    recorder.start(1000);recording=true;$('recordBtn').classList.add('recording');$('recordBtn').querySelector('b').textContent='Stop recording';toast('Recording started');
  }catch{toast('Recording is not supported in this browser.')}
};

/* Captions */
function showCaption(d){
  if(!captionsOn)return;const el=$('captionOverlay');el.innerHTML=`<b>${esc(d.name)}:</b> ${esc(d.text)}`;el.classList.remove('hidden');clearTimeout(showCaption.t);showCaption.t=setTimeout(()=>el.classList.add('hidden'),5000);
}
$('captionsBtn').onclick=()=>{
  $('moreMenu').classList.add('hidden');
  if(captionsOn){captionsOn=false;try{recognition?.stop()}catch{};$('captionOverlay').classList.add('hidden');$('captionsBtn').classList.remove('active');return toast('Captions off')}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR)return appDialog({title:'Captions unavailable',message:'Live speech recognition is not supported by this browser. Try the latest Chrome or Edge.',confirmText:'OK'});
  recognition=new SR();recognition.continuous=true;recognition.interimResults=false;recognition.lang='en-IN';
  recognition.onresult=e=>{const text=e.results[e.results.length-1][0].transcript.trim();if(text){showCaption({name:c.displayName,text});socket?.emit('caption_line',{text})}};
  recognition.onend=()=>{if(captionsOn)try{recognition.start()}catch{}};
  try{recognition.start();captionsOn=true;$('captionsBtn').classList.add('active');toast('Live captions on')}catch{toast('Could not start captions')}
};

/* Notes */
$('notesBtn').onclick=()=>{$('moreMenu').classList.add('hidden');$('meetingNotes').value=localStorage.getItem('nexaroom-notes-'+c.room)||'';$('notesModal').classList.remove('hidden')};
$('closeNotes').onclick=()=>{$('notesModal').classList.add('hidden');localStorage.setItem('nexaroom-notes-'+c.room,$('meetingNotes').value)};
$('meetingNotes').addEventListener('input',()=>localStorage.setItem('nexaroom-notes-'+c.room,$('meetingNotes').value));
$('clearNotes').onclick=async()=>{const yes=await appDialog({title:'Clear meeting notes?',message:'Your local notes for this room will be deleted.',confirmText:'Clear',cancelText:'Cancel',danger:true,showCancel:true});if(yes){$('meetingNotes').value='';localStorage.removeItem('nexaroom-notes-'+c.room)}};
$('downloadNotes').onclick=()=>{const text=$('meetingNotes').value||'No notes.';const blob=new Blob([`${c.meetingCode} — NexaRoom notes\n\n${text}`],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`NexaRoom-${c.meetingCode.replace(/\s/g,'-')}-notes.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};


/* Built-in Apps */
$('appsBtn').onclick=()=>{$('moreMenu').classList.add('hidden');$('appsModal').classList.remove('hidden')};
$('closeApps').onclick=()=>$('appsModal').classList.add('hidden');
document.querySelectorAll('[data-open-tool]').forEach(btn=>btn.onclick=()=>{
  $('appsModal').classList.add('hidden');
  const tool=btn.dataset.openTool;
  if(tool==='notes')$('notesBtn').click();
  if(tool==='board')$('boardBtn').click();
  if(tool==='files')$('fileBtn').click();
});

/* Device settings */
$('settingsBtn').onclick=async()=>{$('moreMenu').classList.add('hidden');await loadDevices();$('settingsModal').classList.remove('hidden')};
$('closeSettings').onclick=()=>$('settingsModal').classList.add('hidden');
$('applyDevices').onclick=async()=>{try{await initMedia({video:$('cameraSelect').value,audio:$('micSelect').value});$('settingsModal').classList.add('hidden');emitMedia();toast('Devices updated')}catch{toast('Could not switch devices')}};

setInterval(()=>{
  const sec=Math.max(0,Math.floor((Date.now()-startedAt)/1000));$('timer').textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
  if(c.durationLimit&&sec>=c.durationLimit*60&&c.isHost&&socket?.connected)socket.emit('end_meeting');
},1000);
setInterval(monitorSpeaker,450);

(async()=>{
  try{await initKey();await initMedia();renderPeople();await connectRealtime()}
  catch(e){console.error(e);if(!localStream)fatal('Camera or microphone could not start. Allow browser permissions and reload.');else fatal('Video is ready, but realtime connection could not start. Check your internet connection and reload.')}
})();
})();
