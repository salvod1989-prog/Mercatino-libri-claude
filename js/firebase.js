// ============================================================
// MERCATINO LIBRI — Integrazione Firebase v10 (Modular SDK)
// Sostituisce completamente js/data.js e la logica mock di app.js
//
// SETUP: incolla le tue credenziali Firebase in FIREBASE_CONFIG
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// ============================================================
// 1. CONFIGURAZIONE — sostituisci con i tuoi dati da Firebase Console
//    https://console.firebase.google.com → Impostazioni progetto → Le tue app
// ============================================================
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA0yJgkPONn20T1QgOb_ieA1sCFkNWC8xA",
  authDomain: "mercatino-scuola-claude.firebaseapp.com",
  projectId: "mercatino-scuola-claude",
  storageBucket: "mercatino-scuola-claude.firebasestorage.app",
  messagingSenderId: "888971006167",
  appId: "1:888971006167:web:8c8aabefdf74327d046092",
  measurementId: "G-PVN75QRRKN"
};

// ============================================================
// 2. INIZIALIZZAZIONE
// ============================================================
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const storage     = getStorage(firebaseApp);

// Esponi globalmente per compatibilità con app.js
window._fb = { auth, db, storage };

// ============================================================
// 3. AUTENTICAZIONE
// ============================================================

/**
 * Registrazione nuovo utente
 * @param {string} email
 * @param {string} password
 * @param {object} profilo  { nome, cognome, classe, indirizzo }
 */
export async function registraUtente(email, password, profilo) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;

    // Aggiorna displayName in Auth
    await updateProfile(credential.user, {
      displayName: `${profilo.nome} ${profilo.cognome}`
    });

    // Crea documento profilo in Firestore
    await setDoc(doc(db, 'utenti', uid), {
      nome:      profilo.nome,
      cognome:   profilo.cognome,
      classe:    profilo.classe   || '',
      indirizzo: profilo.indirizzo || '',
      ruolo:     'studente',
      creato_il: serverTimestamp()
    });

    return { ok: true, uid };
  } catch (err) {
    return { ok: false, errore: tradiciErroreAuth(err.code) };
  }
}

/**
 * Login con email e password
 */
export async function loginEmail(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, uid: credential.user.uid };
  } catch (err) {
    return { ok: false, errore: tradiciErroreAuth(err.code) };
  }
}

/**
 * Logout
 */
export async function logoutUtente() {
  await signOut(auth);
}

/**
 * Ascolta i cambiamenti di sessione — chiama il callback con il profilo completo
 * o null se non autenticato.
 */
export function ascoltaSessione(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { callback(null); return; }
    const snap = await getDoc(doc(db, 'utenti', user.uid));
    if (snap.exists()) {
      callback({ uid: user.uid, email: user.email, ...snap.data() });
    } else {
      callback({ uid: user.uid, email: user.email, nome: user.displayName, ruolo: 'studente' });
    }
  });
}

function tradiciErroreAuth(code) {
  const mappa = {
    'auth/email-already-in-use': 'Email già registrata.',
    'auth/invalid-email':        'Email non valida.',
    'auth/weak-password':        'Password troppo corta (minimo 6 caratteri).',
    'auth/user-not-found':       'Nessun account con questa email.',
    'auth/wrong-password':       'Password errata.',
    'auth/too-many-requests':    'Troppi tentativi. Riprova tra qualche minuto.',
  };
  return mappa[code] || 'Errore di autenticazione. Riprova.';
}

// ============================================================
// 4. LIBRI — CRUD
// ============================================================

/**
 * Carica libri con filtri dinamici
 * @param {object} filtri
 * @returns {Array} libri
 */
export async function caricaLibri(filtri = {}) {
  let q = collection(db, 'libri');
  const vincoli = [];

  if (filtri.statoAnnuncio) vincoli.push(where('stato_annuncio', '==', filtri.statoAnnuncio));
  if (filtri.classe)        vincoli.push(where('classe', '==', filtri.classe));
  if (filtri.indirizzo)     vincoli.push(where('indirizzo', '==', filtri.indirizzo));
  if (filtri.materia)       vincoli.push(where('materia', '==', filtri.materia));
  if (filtri.statoLibro)    vincoli.push(where('stato_libro', '==', filtri.statoLibro));

  // Ordinamento di default: più recenti prima
  vincoli.push(orderBy('creato_il', 'desc'));

  const snap = await getDocs(query(q, ...vincoli));
  let libri = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Filtri client-side (Firestore non supporta LIKE su stringa)
  if (filtri.titolo) {
    const t = filtri.titolo.toLowerCase();
    libri = libri.filter(l => l.titolo?.toLowerCase().includes(t));
  }
  if (filtri.isbn) {
    libri = libri.filter(l => l.isbn?.includes(filtri.isbn));
  }
  if (filtri.prezzoMax) {
    libri = libri.filter(l => l.prezzo <= parseFloat(filtri.prezzoMax));
  }

  return libri;
}

/**
 * Carica un singolo libro per ID
 */
export async function caricaLibro(id) {
  const snap = await getDoc(doc(db, 'libri', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Pubblica un nuovo annuncio
 * @param {object} datiLibro
 * @param {File|null} fileImmagine
 * @param {string} venditoreId
 */
export async function pubblicaLibro(datiLibro, fileImmagine, venditoreId) {
  try {
    // 1. Crea documento in Firestore (senza immagine per ora)
    const docRef = await addDoc(collection(db, 'libri'), {
      ...datiLibro,
      venditore_id:    venditoreId,
      stato_annuncio:  'disponibile',
      immagine_url:    null,
      creato_il:       serverTimestamp(),
      aggiornato_il:   serverTimestamp()
    });

    // 2. Se c'è un'immagine, caricala e aggiorna il documento
    if (fileImmagine) {
      const url = await caricaImmagineCopertina(fileImmagine, docRef.id);
      if (url) await updateDoc(docRef, { immagine_url: url });
    }

    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error('pubblicaLibro:', err);
    return { ok: false, errore: 'Errore nella pubblicazione. Riprova.' };
  }
}

/**
 * Aggiorna i dati di un libro (solo il venditore)
 */
export async function aggiornaLibro(id, campi) {
  await updateDoc(doc(db, 'libri', id), {
    ...campi,
    aggiornato_il: serverTimestamp()
  });
}

/**
 * Segna un libro come venduto e chiude l'annuncio
 */
export async function segnaVenduto(libroId) {
  await updateDoc(doc(db, 'libri', libroId), {
    stato_annuncio: 'venduto',
    aggiornato_il:  serverTimestamp()
  });
}

/**
 * Elimina un annuncio (e la relativa immagine)
 */
export async function eliminaLibro(libroId) {
  // Elimina immagine da Storage se esiste
  try {
    const imgRef = ref(storage, `copertine/${libroId}`);
    await deleteObject(imgRef);
  } catch (_) { /* nessuna immagine, ignorato */ }

  await deleteDoc(doc(db, 'libri', libroId));
}

/**
 * Carica i libri di un venditore specifico
 */
export async function caricaMieiLibri(venditoreId) {
  const q = query(
    collection(db, 'libri'),
    where('venditore_id', '==', venditoreId),
    orderBy('creato_il', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ============================================================
// 5. STORAGE — Upload immagini copertina
// ============================================================

/**
 * Carica un'immagine su Firebase Storage e restituisce la URL pubblica
 * @param {File} file
 * @param {string} libroId
 */
export async function caricaImmagineCopertina(file, libroId) {
  try {
    // Estendi l'estensione dal nome file
    const ext = file.name.split('.').pop().toLowerCase();
    const percorso = `copertine/${libroId}.${ext}`;
    const imgRef = ref(storage, percorso);

    // Carica il file
    const snapshot = await uploadBytes(imgRef, file, {
      contentType: file.type,
      customMetadata: { libroId }
    });

    // Ottieni l'URL pubblica
    const url = await getDownloadURL(snapshot.ref);
    return url;
  } catch (err) {
    console.error('caricaImmagineCopertina:', err);
    return null;
  }
}

// ============================================================
// 6. PRENOTAZIONI — CRUD
// ============================================================

/**
 * Crea una nuova prenotazione
 */
export async function creaPrenotazione(dati) {
  try {
    // Crea la prenotazione
    const docRef = await addDoc(collection(db, 'prenotazioni'), {
      ...dati,
      stato_prenotazione:  'in_attesa',
      conferma_venditore:  false,
      conferma_acquirente: false,
      creato_il:           serverTimestamp()
    });

    // Aggiorna stato del libro a "prenotato"
    await updateDoc(doc(db, 'libri', dati.libro_id), {
      stato_annuncio: 'prenotato',
      aggiornato_il:  serverTimestamp()
    });

    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error('creaPrenotazione:', err);
    return { ok: false, errore: 'Errore nella prenotazione. Riprova.' };
  }
}

/**
 * Carica le prenotazioni di un acquirente
 */
export async function caricaMiePrenotazioni(acquirenteId) {
  const q = query(
    collection(db, 'prenotazioni'),
    where('acquirente_id', '==', acquirenteId),
    orderBy('creato_il', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Carica le prenotazioni ricevute da un venditore
 * (prenotazioni sui suoi libri)
 */
export async function caricaPrenotazioniRicevute(venditoreId) {
  // Prima ottieni gli ID dei libri del venditore
  const libriSnap = await getDocs(query(
    collection(db, 'libri'),
    where('venditore_id', '==', venditoreId)
  ));
  const libriIds = libriSnap.docs.map(d => d.id);

  if (!libriIds.length) return [];

  // Firestore limita 'in' a 30 valori — per semplicità usiamo il primo batch
  const batch = libriIds.slice(0, 30);
  const q = query(
    collection(db, 'prenotazioni'),
    where('libro_id', 'in', batch),
    orderBy('creato_il', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Il venditore conferma o rifiuta una prenotazione
 */
export async function rispondiPrenotazione(prenotazioneId, libroId, azione) {
  // azione: 'conferma' | 'rifiuta'
  if (azione === 'conferma') {
    await updateDoc(doc(db, 'prenotazioni', prenotazioneId), {
      stato_prenotazione: 'confermata',
      conferma_venditore: true
    });
  } else {
    await updateDoc(doc(db, 'prenotazioni', prenotazioneId), {
      stato_prenotazione: 'annullata'
    });
    // Rimette il libro disponibile
    await updateDoc(doc(db, 'libri', libroId), {
      stato_annuncio: 'disponibile',
      aggiornato_il:  serverTimestamp()
    });
  }
}

/**
 * Aggiorna data/ora/luogo scambio
 */
export async function aggiornaScambio(prenotazioneId, { data, ora, luogo }) {
  await updateDoc(doc(db, 'prenotazioni', prenotazioneId), {
    data_scambio: data,
    ora_scambio:  ora,
    luogo_scambio: luogo
  });
}

/**
 * Conferma avvenuta consegna (venditore)
 * → se anche l'acquirente ha confermato, chiude tutto
 */
export async function confermaConsegna(prenotazioneId, libroId, ruolo) {
  const campo = ruolo === 'venditore' ? 'conferma_venditore' : 'conferma_acquirente';
  await updateDoc(doc(db, 'prenotazioni', prenotazioneId), { [campo]: true });

  // Controlla se entrambi hanno confermato
  const snap = await getDoc(doc(db, 'prenotazioni', prenotazioneId));
  const dati = snap.data();
  if (dati.conferma_venditore && dati.conferma_acquirente) {
    await updateDoc(doc(db, 'prenotazioni', prenotazioneId), {
      stato_prenotazione: 'completata'
    });
    await updateDoc(doc(db, 'libri', libroId), {
      stato_annuncio: 'venduto',
      aggiornato_il:  serverTimestamp()
    });
  }
}

// ============================================================
// 7. SEGNALAZIONI
// ============================================================

export async function inviaSegnalazione(libroId, segnalatoId, motivo) {
  await addDoc(collection(db, 'segnalazioni'), {
    libro_id:     libroId,
    segnalato_da: segnalatoId,
    motivo,
    stato:        'in_revisione',
    creato_il:    serverTimestamp()
  });
}

export async function caricaSegnalazioni() {
  const snap = await getDocs(
    query(collection(db, 'segnalazioni'), orderBy('creato_il', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function risolviSegnalazione(id, esito) {
  await updateDoc(doc(db, 'segnalazioni', id), { stato: esito });
}

// ============================================================
// 8. ADMIN — statistiche e moderazione
// ============================================================

export async function caricaStatisticheAdmin() {
  const [libriSnap, prenSnap, segSnap, utentiSnap] = await Promise.all([
    getDocs(collection(db, 'libri')),
    getDocs(collection(db, 'prenotazioni')),
    getDocs(collection(db, 'segnalazioni')),
    getDocs(collection(db, 'utenti'))
  ]);

  const libri = libriSnap.docs.map(d => d.data());
  return {
    totaleAnnunci:    libri.length,
    disponibili:      libri.filter(l => l.stato_annuncio === 'disponibile').length,
    prenotati:        libri.filter(l => l.stato_annuncio === 'prenotato').length,
    venduti:          libri.filter(l => l.stato_annuncio === 'venduto').length,
    totalePrenotazioni: prenSnap.size,
    totaleSegnalazioni: segSnap.docs.filter(d => d.data().stato === 'in_revisione').length,
    totaleUtenti:     utentiSnap.size
  };
}

export async function caricaTuttiLibriAdmin() {
  const snap = await getDocs(
    query(collection(db, 'libri'), orderBy('creato_il', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function rimuoviLibroAdmin(libroId) {
  await eliminaLibro(libroId);
}

// ============================================================
// 9. REAL-TIME LISTENER — aggiorna la UI quando cambia Firestore
// ============================================================

/**
 * Ascolta in tempo reale i libri disponibili (per home e catalogo)
 * @param {Function} callback  riceve array di libri aggiornato
 * @returns unsubscribe function
 */
export function ascoltaLibriDisponibili(callback) {
  const q = query(
    collection(db, 'libri'),
    where('stato_annuncio', '==', 'disponibile'),
    orderBy('creato_il', 'desc'),
    limit(20)
  );
  return onSnapshot(q, snap => {
    const libri = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(libri);
  });
}

/**
 * Ascolta le prenotazioni di un utente in tempo reale
 */
export function ascoltaPrenotazioniUtente(uid, callback) {
  const q = query(
    collection(db, 'prenotazioni'),
    where('acquirente_id', '==', uid),
    orderBy('creato_il', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ============================================================
// 10. HELPER — carica profilo utente
// ============================================================

export async function caricaProfilo(uid) {
  const snap = await getDoc(doc(db, 'utenti', uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

export async function aggiornaProfilo(uid, campi) {
  await updateDoc(doc(db, 'utenti', uid), campi);
}

// Necessario per la funzione registraUtente (manca l'import sopra)
import { setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
