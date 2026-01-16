import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  getDocs
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getDb, getAuthClient } from '../lib/firebase';
import { BLACK_CARDS, WHITE_CARDS } from '../data/deck';

function randInt(max) {
  return Math.floor(Math.random() * max);
}

function makeCode() {
  const n = randInt(9000) + 1000;
  return String(n);
}

function getOrCreateId(key) {
  if (typeof window === 'undefined') return '';
  let v = window.localStorage.getItem(key);
  if (!v) {
    v = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, v);
  }
  return v;
}

function fillBlank(template, fill) {
  if (template.includes('___')) return template.replace('___', fill);
  return `${template} ${fill}`;
}

function pickWhiteOptions() {
  const options = [];
  const used = new Set();
  while (options.length < Math.min(3, WHITE_CARDS.length)) {
    const t = WHITE_CARDS[randInt(WHITE_CARDS.length)];
    if (!used.has(t)) {
      used.add(t);
      options.push(t);
    }
  }
  return options;
}

export default function Home() {
  const [mode, setMode] = useState('lobby'); // lobby | player | host
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [room, setRoom] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [myPick, setMyPick] = useState('');
  const [myCustom, setMyCustom] = useState('');
  const [whiteOptions, setWhiteOptions] = useState(() => pickWhiteOptions());
  const [copied, setCopied] = useState(false);

  const playerId = useMemo(() => getOrCreateId('absurd_player_id'), []);
  const hostId = useMemo(() => getOrCreateId('absurd_host_id'), []);

  // Anonymous auth (keeps Firestore rules sane)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = getAuthClient();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch(() => {});
      }
    });
    return () => unsub();
  }, []);


  // Subscribe to room + submissions
  useEffect(() => {
    if (!roomCode) return;
    const db = getDb();
    const roomRef = doc(db, 'rooms', roomCode);

    const unsubRoom = onSnapshot(roomRef, (snap) => {
      setRoom(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });

    const subsRef = collection(db, 'rooms', roomCode, 'submissions');
    const unsubSubs = onSnapshot(subsRef, (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setSubmissions(rows);
    });

    return () => {
      unsubRoom();
      unsubSubs();
    };
  }, [roomCode]);

  // When round changes, reset player pick UI
  const lastRoundRef = useRef(null);
  useEffect(() => {
    if (!room?.currentRound) return;
    if (lastRoundRef.current === room.currentRound) return;
    lastRoundRef.current = room.currentRound;
    setMyPick('');
    setMyCustom('');
    setWhiteOptions(pickWhiteOptions());
  }, [room?.currentRound]);

  async function createRoom() {
    setError('');
    try {
      const db = getDb();
      const code = makeCode();
      const prompt = BLACK_CARDS[randInt(BLACK_CARDS.length)];

      await setDoc(doc(db, 'rooms', code), {
        code,
        hostName: name || 'Host',
        hostId,
        createdAt: serverTimestamp(),
        phase: 'submitting',
        currentRound: 1,
        prompt,
        winnerName: '',
        winnerText: ''
      });

      setRoomCode(code);
      setMode('host');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function joinAsPlayer() {
    setError('');
    try {
      const db = getDb();
      const snap = await getDoc(doc(db, 'rooms', roomCode));
      if (!snap.exists()) throw new Error('Room not found. Check the code.');
      setMode('player');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function joinAsHost() {
    setError('');
    try {
      const db = getDb();
      const snap = await getDoc(doc(db, 'rooms', roomCode));
      if (!snap.exists()) throw new Error('Room not found. Check the code.');
      setMode('host');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function submitPick() {
    setError('');
    try {
      if (!room) throw new Error('Room not loaded');
      if (!name.trim()) throw new Error('Add a nickname');
      if (room.phase !== 'submitting') throw new Error('Submissions are closed');

      const choice = (myPick || myCustom).trim();
      if (!choice) throw new Error('Pick an option or type your own');

      const db = getDb();
      const subId = `${room.currentRound}_${playerId}`;
      const subRef = doc(db, 'rooms', roomCode, 'submissions', subId);

      await setDoc(subRef, {
        round: room.currentRound,
        playerId,
        playerName: name.trim(),
        text: choice,
        createdAt: serverTimestamp()
      });

      // Make it harder to spam by clearing options after submit
      setMyPick(choice);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function closeSubmissions() {
    setError('');
    try {
      if (!room) throw new Error('Room not loaded');
      if (room.hostId && room.hostId !== hostId) {
        throw new Error('This room already has a different host on record. Use the original host device.');
      }
      const db = getDb();
      await updateDoc(doc(db, 'rooms', roomCode), {
        phase: 'judging',
        winnerName: '',
        winnerText: ''
      });
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function pickWinner(sub) {
    setError('');
    try {
      if (!room) throw new Error('Room not loaded');
      if (room.phase !== 'judging') throw new Error('Not in judging phase');
      const db = getDb();
      await updateDoc(doc(db, 'rooms', roomCode), {
        phase: 'revealed',
        winnerName: sub.playerName,
        winnerText: sub.text
      });
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function nextRound() {
    setError('');
    try {
      if (!room) throw new Error('Room not loaded');
      const db = getDb();
      const next = (room.currentRound || 1) + 1;
      const prompt = BLACK_CARDS[randInt(BLACK_CARDS.length)];

      // delete old submissions (keep DB tidy)
      const subsRef = collection(db, 'rooms', roomCode, 'submissions');
      const snap = await getDocs(query(subsRef, where('round', '==', room.currentRound)));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));

      await updateDoc(doc(db, 'rooms', roomCode), {
        phase: 'submitting',
        currentRound: next,
        prompt,
        winnerName: '',
        winnerText: ''
      });
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  function buildWhatsAppText() {
    if (!room) return '';
    const header = `ROUND ${room.currentRound}  ROOM ${room.code}`;
    const vibe = `No essays. No mercy. One shot.`;
    const prompt = room.prompt || '';
    const options = whiteOptions
      .map((t, i) => `${i + 1}) ${fillBlank(prompt, t)}`)
      .join('\n');
    return `${header}\n${vibe}\n\n${prompt}\n\nReply with 1, 2, 3 or drop your own.\n\n${options}`;
  }

  async function copyRound() {
    try {
      const txt = buildWhatsAppText();
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      setError('Copy failed. Select and copy manually.');
    }
  }

  return (
    <div className="container">
      <div className="grid">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>ABSURD ROOM</div>
              <div className="muted">Group-play via link. Host picks the winner. No app install.</div>
            </div>
            {roomCode ? <span className="tag">Room: {roomCode}</span> : <span className="tag">Not joined</span>}
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="Your nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ maxWidth: 260 }}
            />
            <input
              className="input"
              placeholder="Room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={{ maxWidth: 160 }}
            />
            <button className="btn btnPrimary" onClick={createRoom}>Create room (Host)</button>
            <button className="btn" onClick={joinAsPlayer}>Join (Player)</button>
            <button className="btn" onClick={joinAsHost}>Join (Host)</button>
          </div>

          {error ? <div style={{ marginTop: 12, color: 'var(--danger)' }}>{error}</div> : null}
        </div>

        {mode === 'lobby' ? (
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>How it feels</div>
            <div className="muted">
              Host starts a room. Players join with the code. Each round: everyone submits a line, host chooses a winner, next round.
              You can still paste the round prompt into WhatsApp for hype, but the gameplay stays on this page.
            </div>
          </div>
        ) : null}

        {mode === 'player' && room ? (
          <PlayerView
            room={room}
            submissions={submissions}
            whiteOptions={whiteOptions}
            myPick={myPick}
            setMyPick={setMyPick}
            myCustom={myCustom}
            setMyCustom={setMyCustom}
            submitPick={submitPick}
            buildWhatsAppText={buildWhatsAppText}
            copyRound={copyRound}
            copied={copied}
          />
        ) : null}

        {mode === 'host' && room ? (
          <HostView
            room={room}
            submissions={submissions}
            closeSubmissions={closeSubmissions}
            pickWinner={pickWinner}
            nextRound={nextRound}
            buildWhatsAppText={buildWhatsAppText}
            copyRound={copyRound}
            copied={copied}
          />
        ) : null}
      </div>
    </div>
  );
}

function PlayerView({
  room,
  submissions,
  whiteOptions,
  myPick,
  setMyPick,
  myCustom,
  setMyCustom,
  submitPick,
  buildWhatsAppText,
  copyRound,
  copied
}) {
  const phase = room.phase;
  const prompt = room.prompt || '';

  const alreadySubmitted = submissions.some((s) => s.playerName && s.text && s.playerId);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Round {room.currentRound}</div>
          <div className="muted">Phase: {phase}</div>
        </div>
        <button className="btn" onClick={copyRound}>{copied ? 'Copied' : 'Copy for WhatsApp'}</button>
      </div>

      <div style={{ marginTop: 12, fontWeight: 800 }}>Prompt</div>
      <div style={{ marginTop: 6 }}>{prompt}</div>

      <div style={{ marginTop: 14, fontWeight: 800 }}>Pick one</div>
      <div className="grid" style={{ marginTop: 8 }}>
        {whiteOptions.map((t, i) => {
          const full = fillBlank(prompt, t);
          const active = myPick === t;
          return (
            <button
              key={i}
              className="btn"
              onClick={() => {
                setMyPick(t);
                setMyCustom('');
              }}
              style={{ textAlign: 'left', outline: active ? '2px solid var(--accent)' : 'none' }}
              disabled={phase !== 'submitting'}
            >
              {i + 1}. {full}
            </button>
          );
        })}

        <div className="card" style={{ padding: 12 }}>
          <div className="muted" style={{ marginBottom: 8 }}>Or type your own (short, punchy)</div>
          <input
            className="input"
            value={myCustom}
            onChange={(e) => {
              setMyCustom(e.target.value);
              setMyPick('');
            }}
            placeholder="Your answer"
            disabled={phase !== 'submitting'}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btnPrimary" onClick={submitPick} disabled={phase !== 'submitting'}>
          Submit
        </button>
        <span className="muted">One submit per round.</span>
      </div>

      {phase === 'revealed' ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800 }}>Winner</div>
          <div className="muted" style={{ marginTop: 4 }}>{room.winnerName}</div>
          <div style={{ marginTop: 6 }}>{room.winnerText}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 800 }}>Submissions</div>
        <div className="muted">You will see them appear as people submit. Host will reveal the winner.</div>
        <div className="grid" style={{ marginTop: 8 }}>
          {submissions
            .filter((s) => s.round === room.currentRound)
            .map((s) => (
              <div key={s.id} className="card" style={{ padding: 12 }}>
                <div className="muted" style={{ fontSize: 12 }}>{s.playerName || 'Player'}</div>
                <div style={{ marginTop: 4 }}>{s.text}</div>
              </div>
            ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 12 }}>
        <div style={{ fontWeight: 800 }}>WhatsApp paste text (optional)</div>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, marginTop: 8, fontFamily: 'inherit' }}>{buildWhatsAppText()}</pre>
      </div>
    </div>
  );
}

function HostView({ room, submissions, closeSubmissions, pickWinner, nextRound, buildWhatsAppText, copyRound, copied }) {
  const phase = room.phase;
  const prompt = room.prompt || '';
  const roundSubs = submissions.filter((s) => s.round === room.currentRound);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Host Console</div>
          <div className="muted">Round {room.currentRound} • Phase: {phase}</div>
        </div>
        <button className="btn" onClick={copyRound}>{copied ? 'Copied' : 'Copy for WhatsApp'}</button>
      </div>

      <div style={{ marginTop: 12, fontWeight: 800 }}>Prompt</div>
      <div style={{ marginTop: 6 }}>{prompt}</div>

      <div className="row" style={{ marginTop: 12 }}>
        {phase === 'submitting' ? (
          <button className="btn btnPrimary" onClick={closeSubmissions}>Close submissions</button>
        ) : null}
        {phase === 'revealed' ? (
          <button className="btn btnPrimary" onClick={nextRound}>Next round</button>
        ) : null}
        <span className="muted">Submissions this round: {roundSubs.length}</span>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 800 }}>Submissions</div>
        <div className="muted">In judging phase, tap a submission to pick the winner.</div>
        <div className="grid" style={{ marginTop: 8 }}>
          {roundSubs.map((s) => {
            const clickable = phase === 'judging';
            return (
              <button
                key={s.id}
                className="btn"
                onClick={() => clickable && pickWinner(s)}
                disabled={!clickable}
                style={{ textAlign: 'left', padding: 14 }}
              >
                <div className="muted" style={{ fontSize: 12 }}>{s.playerName || 'Player'}</div>
                <div style={{ marginTop: 6 }}>{s.text}</div>
              </button>
            );
          })}
          {!roundSubs.length ? <div className="muted">No submissions yet.</div> : null}
        </div>
      </div>

      {phase === 'revealed' ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800 }}>Winner</div>
          <div className="muted" style={{ marginTop: 4 }}>{room.winnerName}</div>
          <div style={{ marginTop: 6 }}>{room.winnerText}</div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16, padding: 12 }}>
        <div style={{ fontWeight: 800 }}>WhatsApp paste text (optional)</div>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, marginTop: 8, fontFamily: 'inherit' }}>{buildWhatsAppText()}</pre>
      </div>
    </div>
  );
}
