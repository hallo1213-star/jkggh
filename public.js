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
  let isPrivateRoom = false;
  let isPrivateHost = false;
  let connectionMode = '';

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

  const privateModal = $('privateModal');
  $('openPrivate').onclick = () => {
    privateModal.classList.remove('hidden');
    $('privateError').textContent = '';
    $('privateName').focus();
  };
  $('closePrivate').onclick = closePrivateModal;
  privateModal.addEventListener('click', (event) => {
    if (event.target === privateModal && !roomId) closePrivateModal();
  });
  $('privateName').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') createPrivateRoom();
  });
  $('inviteCode').addEventListener('input', () => {
    $('inviteCode').value = $('inviteCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  $('inviteCode').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') joinPrivateRoom();
  });
  $('createPrivate').onclick = createPrivateRoom;
  $('joinPrivate').onclick = joinPrivateRoom;
  $('startPrivate').onclick = () => {
    if (isPrivateRoom && isPrivateHost && roomPlayers.length >= 3) send({ type: 'start_private' });
  };
  $('copyInvite').onclick = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      $('copyInvite').textContent = 'KOPIERT ✓';
      setTimeout(() => { $('copyInvite').textContent = 'CODE KOPIEREN'; }, 1800);
    } catch {
      $('privateLobbyStatus').textContent = 'Dein Einladungscode ist ' + roomId + '. Markiere ihn und kopiere ihn an deine Freunde.';
    }
  };

  function selectedQuestionPool() {
    return [...new Set(activeCats.flatMap((category) => questions[category] || []))];
  }

  function cancelSearch() {
    if (socket && !roomId && connectionMode === 'public') {
      const oldSocket = socket;
      socket = null;
      if (oldSocket.readyState === WebSocket.OPEN) oldSocket.send(JSON.stringify({ type: 'leave' }));
      oldSocket.close();
      resetJoinButton();
    }
    modal.classList.add('hidden');
  }

  function closePrivateModal() {
    if (socket && !roomId && connectionMode === 'private') {
      const oldSocket = socket;
      socket = null;
      if (oldSocket.readyState === WebSocket.OPEN) oldSocket.send(JSON.stringify({ type: 'leave' }));
      oldSocket.close();
      resetJoinButton();
    }
    privateModal.classList.add('hidden');
  }

  function connectToServer(type, name, mode, extra = {}) {
    connectionMode = mode;
    const errorBox = mode === 'private' ? $('privateError') : $('publicError');
    if (socket) socket.close();
    try {
      const currentSocket = new WebSocket(serverAddress());
      socket = currentSocket;
      currentSocket.onopen = () => currentSocket.send(JSON.stringify({
        type, name, questions: selectedQuestionPool(), ...extra
      }));
      currentSocket.onmessage = (event) => handleMessage(JSON.parse(event.data));
      currentSocket.onerror = () => {
        errorBox.textContent = mode === 'private'
          ? 'Verbindung zum Spielserver fehlgeschlagen. Versuch es gleich nochmal.'
          : 'Der öffentliche Server ist gerade nicht erreichbar. Die lokale Runde funktioniert weiterhin.';
        resetJoinButton();
      };
      currentSocket.onclose = () => {
        if (socket !== currentSocket) return;
        socket = null;
        if (roomId) {
          $('publicStatus').textContent = 'Verbindung verloren. Du kannst den Raum verlassen.';
          $('publicStatus').className = 'public-status';
        }
        resetJoinButton();
      };
    } catch {
      errorBox.textContent = 'Serververbindung nicht möglich. Öffne die Seite über den Spielserver.';
      resetJoinButton();
    }
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
    isPrivateRoom = false;
    connectToServer('join', name, 'public');
  }

  function createPrivateRoom() {
    const name = $('privateName').value.trim();
    if (name.length < 2) {
      $('privateError').textContent = 'Gib bitte einen Namen mit mindestens zwei Zeichen ein.';
      $('privateName').focus();
      return;
    }
    $('createPrivate').disabled = true;
    $('createPrivate').querySelector('span').textContent = 'RAUM WIRD ERSTELLT …';
    $('privateError').textContent = 'Dein privater Raum wird vorbereitet …';
    isPrivateRoom = true;
    connectToServer('create_private', name, 'private');
  }

  function joinPrivateRoom() {
    const name = $('privateName').value.trim();
    const code = $('inviteCode').value.trim().toUpperCase();
    if (name.length < 2) {
      $('privateError').textContent = 'Gib zuerst deinen Namen ein.';
      $('privateName').focus();
      return;
    }
    if (code.length !== 6) {
      $('privateError').textContent = 'Der Einladungscode muss genau 6 Zeichen haben.';
      $('inviteCode').focus();
      return;
    }
    $('joinPrivate').disabled = true;
    $('joinPrivate').textContent = 'SUCHE …';
    $('privateError').textContent = 'Wir suchen euren privaten Raum …';
    isPrivateRoom = true;
    connectToServer('join_private', name, 'private', { code });
  }

  function resetJoinButton() {
    $('joinPublic').disabled = false;
    $('joinPublic').querySelector('span').textContent = 'SERVER SUCHEN';
    $('createPrivate').disabled = false;
    $('createPrivate').querySelector('span').textContent = 'RAUM ERSTELLEN';
    $('joinPrivate').disabled = false;
    $('joinPrivate').textContent = 'BEITRETEN';
  }

  function renderPrivateLobby(message) {
    isPrivateRoom = true;
    roomId = message.roomId;
    myId = message.playerId;
    isPrivateHost = message.hostId === myId;
    roomPlayers = message.players;
    $('publicModal').classList.add('hidden');
    privateModal.classList.add('hidden');
    $('home').classList.add('hidden');
    $('play').classList.add('hidden');
    $('publicPlay').classList.remove('hidden');
    $('privateLobby').classList.remove('hidden');
    $('publicProgress').parentElement.classList.add('hidden');
    $('publicPeople').classList.add('hidden');
    $('voiceButton').classList.add('hidden');
    $('publicProgress').style.width = '0%';
    $('publicQuestion').innerHTML = '';
    $('publicChoices').innerHTML = '';
    $('publicRound').textContent = 'PRIVATER RAUM · ' + roomId;
    $('publicStatus').textContent = 'Lade deine Freunde mit dem Einladungscode ein.';
    $('publicStatus').className = 'public-status';
    $('privateCodeDisplay').textContent = roomId;
    $('privatePlayerCount').textContent = roomPlayers.length + ' / 3 MIN.';
    $('privateLobbyPlayers').innerHTML = roomPlayers.map((player) =>
      '<span class="private-lobby-player ' + (player.host ? 'host' : '') + '">' + safe(player.name) +
      (player.id === myId ? ' · DU' : '') + (player.host ? ' · HOST' : '') + '</span>'
    ).join('');
    $('startPrivate').classList.toggle('hidden', !isPrivateHost);
    $('startPrivate').disabled = roomPlayers.length < 3;
    if (roomPlayers.length < 3) {
      const missing = 3 - roomPlayers.length;
      $('privateLobbyStatus').textContent = 'Noch ' + missing + (missing === 1 ? ' Person fehlt' : ' Personen fehlen') + ' zum Starten. Teile den Code mit deinen Freunden.';
    } else if (isPrivateHost) {
      $('privateLobbyStatus').textContent = 'Eure Crew ist bereit! Du kannst die Spukrunde starten.';
    } else {
      $('privateLobbyStatus').textContent = 'Deine Crew ist bereit. Warte, bis der Host die Runde startet.';
    }
    $('privateError').textContent = '';
  }
  function handleMessage(message) {
    if (message.type === 'room_lobby') {
      renderPrivateLobby(message);
      return;
    }
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
      isPrivateRoom = Boolean(message.private);
      isPrivateHost = Boolean(roomPlayers.find((player) => player.id === myId)?.host);
      $('publicModal').classList.add('hidden');
      privateModal.classList.add('hidden');
      $('home').classList.add('hidden');
      $('play').classList.add('hidden');
      $('publicPlay').classList.remove('hidden');
      $('privateLobby').classList.add('hidden');
      $('publicProgress').parentElement.classList.remove('hidden');
      $('publicPeople').classList.remove('hidden');
      $('voiceButton').classList.remove('hidden');
      $('publicStatus').textContent = isPrivateRoom
        ? 'Ihr seid in eurem privaten Spukraum. Das Mikrofon bleibt aus, bis du es selbst einschaltest.'
        : 'Du bist im öffentlichen Spukserver. Mikrofon ist aus, bis du es einschaltest.';
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
      $('publicStatus').textContent = 'Der Raum wurde geschlossen, weil weniger als drei Spieler übrig sind.';
      roomId = null;
      isPrivateRoom = false;
      isPrivateHost = false;
      $('privateLobby').classList.add('hidden');
      stopVoice();
      return;
    }
    if (message.type === 'voice_signal') {
      receiveSignal(message.fromId, message.signal);
      return;
    }
    if (message.type === 'error') {
      if (connectionMode === 'private') {
        $('privateError').textContent = message.message;
        if (roomId) $('privateLobbyStatus').textContent = message.message;
      } else {
        $('publicError').textContent = message.message;
        $('publicStatus').textContent = message.message;
      }
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
    const oldSocket = socket;
    socket = null;
    if (oldSocket) oldSocket.close();
    roomId = null;
    isPrivateRoom = false;
    isPrivateHost = false;
    connectionMode = '';
    stopVoice();
    $('privateLobby').classList.add('hidden');
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
