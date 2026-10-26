(() => {
  const $ = (id) => document.getElementById(id);
  const modal = $('publicModal');
  const input = $('publicName');
  let socket = null;
  let myId = null;
  let roomId = null;
  let roomPlayers = [];
  let localStream = null;
  let peers = new Map();
  const mutedPlayers = new Set();
  let voted = false;
  let round = 0;

  const safe = (value) => String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  function send(data) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
  }

  function serverAddress() {
    if (window.PUBLIC_GAME_SERVER_URL) return window.PUBLIC_GAME_SERVER_URL;
    if (location.protocol === 'https:') return `wss://${location.host}/ws`;
    if (location.protocol === 'http:') return `ws://${location.host}/ws`;
    return 'ws://localhost:8787/ws';
  }

  $('openPublic').onclick = () => {
    modal.classList.remove('hidden');
    $('publicError').textContent = '';
    input.focus();
  };
  $('closePublic').onclick = cancelSearch;
  modal.addEventListener('click', (event) => {
    if (event.target === modal && !roomId) cancelSearch();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') joinPublic();
  });
  $('joinPublic').onclick = joinPublic;

  function cancelSearch() {
    if (socket && !roomId) {
      send({ type: 'leave' });
      socket.close();
      socket = null;
      resetJoinButton();
    }
    modal.classList.add('hidden');
  }

  function joinPublic() {
    const name = input.value.trim();
    if (name.length < 2) {
      $('publicError').textContent = 'Gib bitte einen Namen mit mindestens zwei Zeichen ein.';
      input.focus();
      return;
    }
    $('joinPublic').disabled = true;
    $('joinPublic').querySelector('span').textContent = 'SERVER WIRD GESUCHT …';
    $('publicError').textContent = 'Verbinde dich mit der offenen Lobby …';
    try {
      socket = new WebSocket(serverAddress());
      socket.onopen = () => {
        const pool = [...new Set(activeCats.flatMap((category) => questions[category] || []))];
        send({ type: 'join', name, questions: pool });
      };
      socket.onmessage = (event) => handleMessage(JSON.parse(event.data));
      socket.onerror = () => {
        $('publicError').textContent = 'Der öffentliche Server ist noch nicht online. Die lokale Runde funktioniert weiterhin.';
        resetJoinButton();
      };
      socket.onclose = () => {
        if (roomId) {
          $('publicStatus').textContent = 'Verbindung verloren. Du kannst die Runde verlassen.';
          $('publicStatus').className = 'public-status';
        }
        resetJoinButton();
      };
    } catch {
      $('publicError').textContent = 'Serververbindung nicht möglich. Öffne die Seite über den Spielserver.';
      resetJoinButton();
    }
  }

  function resetJoinButton() {
    $('joinPublic').disabled = false;
    $('joinPublic').querySelector('span').textContent = 'SERVER SUCHEN';
  }

  function handleMessage(message) {
    if (message.type === 'queue') {
      $('publicError').textContent = `Du bist in der Warteschlange. ${message.waiting} Spieler warten gerade.`;
      $('publicStatus').textContent = `Suche Mitspieler … ${message.waiting} in der Lobby`;
      $('publicStatus').className = 'public-status waiting';
      return;
    }
    if (message.type === 'room_start') {
      myId = message.playerId;
      roomId = message.roomId;
      roomPlayers = message.players;
      $('publicModal').classList.add('hidden');
      $('home').classList.add('hidden');
      $('play').classList.add('hidden');
      $('publicPlay').classList.remove('hidden');
      $('publicStatus').textContent = 'Du bist im öffentlichen Spukserver. Mikrofon ist aus, bis du es einschaltest.';
      renderPeople();
      beginVoicePeers();
      return;
    }
    if (message.type === 'round_start') {
      round = message.round;
      roomPlayers = message.players;
      voted = false;
      renderPeople();
      renderPublicRound(message.question);
      return;
    }
    if (message.type === 'vote_count') {
      $('publicStatus').textContent = `${message.count} von ${message.total} Stimmen abgegeben · geheim bis zur Auflösung`;
      return;
    }
    if (message.type === 'round_result') {
      roomPlayers = message.players;
      renderPeople();
      renderResult(message);
      return;
    }
    if (message.type === 'player_left') {
      roomPlayers = message.players;
      renderPeople();
      $('publicStatus').textContent = `${message.name} hat die Runde verlassen.`;
      return;
    }
    if (message.type === 'room_closed') {
      $('publicStatus').textContent = 'Die Runde wurde geschlossen, weil zu wenige Spieler übrig sind.';
      roomId = null;
      stopVoice();
      return;
    }
    if (message.type === 'voice_signal') {
      receiveSignal(message.fromId, message.signal);
      return;
    }
    if (message.type === 'error') {
      $('publicError').textContent = message.message;
      $('publicStatus').textContent = message.message;
      resetJoinButton();
    }
  }

  function renderPublicRound(question) {
    $('publicRound').textContent = `ÖFFENTLICHER SERVER · RUNDE ${round}`;
    $('publicProgress').style.width = '0%';
    $('publicStatus').textContent = 'Wählt geheim eine Person aus. Die Stimmen werden erst am Ende gezeigt.';
    $('publicQuestion').innerHTML = `<div class="card qcard"><div class="categoryline">🎃 DIE FRAGE · RUNDE ${round}</div><div class="qtext">Wer von euch <em>${safe(question)}</em></div></div>`;
    const candidates = roomPlayers.filter((player) => player.id !== myId);
    $('publicChoices').innerHTML = `<div class="public-choice-title">Wen tippst du?</div><div class="targetlist">${candidates.map((player, index) => `<button class="target" data-target="${safe(player.id)}"><span class="avatar">${emoji[index % emoji.length]}</span>${safe(player.name)}</button>`).join('')}</div>`;
    document.querySelectorAll('[data-target]').forEach((button) => {
      button.onclick = () => {
        if (voted) return;
        voted = true;
        send({ type: 'vote', targetId: button.dataset.target });
        $('publicChoices').innerHTML = `<div class="public-voted">🔮 Stimme gespeichert!<br><small>Warte auf die anderen aus dem Server …</small></div>`;
        $('publicProgress').style.width = '100%';
      };
    });
  }

  function renderResult(result) {
    const winner = roomPlayers.find((player) => player.id === result.winnerId);
    const tied = result.tied;
    $('publicRound').textContent = `AUFLÖSUNG · RUNDE ${round}`;
    $('publicProgress').style.width = '100%';
    $('publicStatus').textContent = tied ? 'Gleichstand! Das Geisterrad hat genau eine Person ausgewählt.' : 'Die geheime Abstimmung ist vorbei.';
    $('publicQuestion').innerHTML = `<div class="resulttop"><span class="bigemoji">${tied ? '🌀' : '🎃'}</span><h2>${tied ? 'Das Geisterrad hat gewählt!' : 'Die Gruppe hat entschieden!'}</h2><p>Runde ${round} · nächste Frage startet gleich</p></div><div class="card public-result"><div class="winner ${tied ? 'tiebreak' : ''}"><span class="crown">${tied ? '🎡' : '👑'}</span><div class="winnername">${safe(winner?.name || 'Unbekannt')}</div><div class="count">${tied ? 'GEISTER-RAD-GEWINNER · ' : ''}${result.counts[result.winnerId] || 0} Stimmen</div><div class="winbadge">🏆 RUNDE GEWONNEN</div></div><div class="bars">${roomPlayers.slice().sort((a, b) => (result.counts[b.id] || 0) - (result.counts[a.id] || 0)).map((player) => `<div class="barrow"><span class="barname">${safe(player.name)} · ${player.score || 0} Siege</span><div class="track"><div class="fill" data-width="${Math.round((result.counts[player.id] || 0) / Math.max(1, result.total) * 100)}%"></div></div><span class="num">${result.counts[player.id] || 0}</span></div>`).join('')}</div></div>`;
    $('publicChoices').innerHTML = '<div class="public-round-note">Die nächste Runde beginnt automatisch in wenigen Sekunden …</div>';
    requestAnimationFrame(() => document.querySelectorAll('.fill').forEach((bar) => { bar.style.width = bar.dataset.width; }));
  }

  function renderPeople() {
    $('publicPeople').innerHTML = `<div class="public-players-title">DEINE RUNDE · DU KANNST JEDERZEIT STUMMSCHALTEN ODER GEHEN</div>${roomPlayers.map((player) => `<span class="player-pill">${safe(player.name)}${player.id === myId ? ' · DU' : ''} · ${player.score || 0} 🏆${player.id === myId ? '' : `<button class="player-mute" data-mute="${safe(player.id)}" title="Spieler stummschalten">${mutedPlayers.has(player.id) ? '🔇' : '🔊'}</button>`}</span>`).join('')}`;
    document.querySelectorAll('[data-mute]').forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.mute;
        if (mutedPlayers.has(id)) mutedPlayers.delete(id); else mutedPlayers.add(id);
        const audio = document.getElementById(`audio-${id}`);
        if (audio) audio.muted = mutedPlayers.has(id);
        button.textContent = mutedPlayers.has(id) ? '🔇' : '🔊';
      };
    });
  }

  function beginVoicePeers() {
    roomPlayers.filter((player) => player.id !== myId).forEach((player) => {
      const pc = makePeer(player);
      if (localStream && !pc.getSenders().some((sender) => sender.track?.kind === 'audio')) {
        localStream.getAudioTracks().forEach((track) => pc.addTrack(track, localStream));
      }
    });
  }

  function makePeer(player) {
    if (peers.has(player.id)) return peers.get(player.id);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.polite = String(myId) > String(player.id);
    pc.makingOffer = false;
    pc.ignoreOffer = false;
    peers.set(player.id, pc);
    if (localStream) localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    pc.onicecandidate = (event) => {
      if (event.candidate) send({ type: 'voice_signal', targetId: player.id, signal: { candidate: event.candidate } });
    };
    pc.ontrack = (event) => {
      let audio = document.getElementById(`audio-${player.id}`);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-${player.id}`;
        audio.autoplay = true;
        audio.playsInline = true;
        $('remoteAudios').append(audio);
      }
      audio.srcObject = event.streams[0];
      audio.muted = mutedPlayers.has(player.id);
      audio.play().catch(() => {});
    };
    pc.onnegotiationneeded = async () => {
      try {
        pc.makingOffer = true;
        await pc.setLocalDescription();
        send({ type: 'voice_signal', targetId: player.id, signal: { description: pc.localDescription } });
      } catch { /* The other peer may have left during negotiation. */ }
      finally { pc.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') $('publicStatus').textContent = 'Voice Chat konnte diese Verbindung nicht erreichen. Du kannst es erneut versuchen oder stumm weiterspielen.';
    };
    return pc;
  }

  async function receiveSignal(fromId, signal) {
    const player = roomPlayers.find((person) => person.id === fromId);
    if (!player) return;
    const pc = makePeer(player);
    try {
      if (signal.description) {
        const description = signal.description;
        const collision = description.type === 'offer' && (pc.makingOffer || pc.signalingState !== 'stable');
        pc.ignoreOffer = !pc.polite && collision;
        if (pc.ignoreOffer) return;
        if (collision && pc.polite) await pc.setLocalDescription({ type: 'rollback' });
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          send({ type: 'voice_signal', targetId: fromId, signal: { description: pc.localDescription } });
        }
      } else if (signal.candidate && !pc.ignoreOffer) {
        await pc.addIceCandidate(signal.candidate);
      }
    } catch { /* Network changes can invalidate late voice packets. */ }
  }

  $('voiceButton').onclick = async () => {
    if (localStream) {
      const enabled = localStream.getAudioTracks().some((track) => track.enabled);
      localStream.getAudioTracks().forEach((track) => { track.enabled = !enabled; });
      $('voiceButton').textContent = enabled ? '🎙️ MIKRO AN' : '🎙️ MIKRO AUS';
      $('voiceButton').classList.toggle('on', !enabled);
      $('publicStatus').textContent = enabled ? 'Dein Mikro ist stumm. Du hörst weiterhin die anderen.' : 'Dein Mikro ist an. Tippe erneut, um dich stummzuschalten.';
      return;
    }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      beginVoicePeers();
      $('voiceButton').textContent = '🎙️ MIKRO AUS';
      $('voiceButton').classList.add('on');
      $('publicStatus').textContent = 'Dein Mikro ist an. Tippe auf „Mikro aus“, wann immer du möchtest.';
    } catch {
      $('publicStatus').textContent = 'Mikrofon nicht freigegeben. Du kannst die Runde trotzdem ohne Voice Chat spielen.';
    }
  };

  $('leavePublic').onclick = leavePublic;
  function leavePublic() {
    send({ type: 'leave' });
    if (socket) socket.close();
    socket = null;
    roomId = null;
    stopVoice();
    $('publicPlay').classList.add('hidden');
    $('home').classList.remove('hidden');
  }

  function stopVoice() {
    for (const pc of peers.values()) pc.close();
    peers.clear();
    document.querySelectorAll('#remoteAudios audio').forEach((audio) => { audio.srcObject = null; audio.remove(); });
    if (localStream) localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
    $('voiceButton').textContent = '🎙️ VOICE AN';
    $('voiceButton').classList.remove('on');
  }
})();
