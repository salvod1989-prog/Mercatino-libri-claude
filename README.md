# Mercatino Libri — Versione Firebase
## Guida completa all'integrazione e al deploy

---

## Struttura del progetto Firebase

```
mercatino-firebase/
├── index.html                ← SPA aggiornata (form reali, nessun dato demo)
├── css/
│   └── stile.css             ← Stile (invariato)
├── js/
│   ├── firebase.js           ← Modulo Firebase: Auth, Firestore, Storage
│   └── app-firebase.js       ← Logica UI collegata a Firebase
├── firebase.json             ← Configurazione Hosting + Rules
├── firestore.rules           ← Security Rules Firestore (+ Storage rules in commento)
├── firestore.indexes.json    ← Indici compositi per le query
└── README.md                 ← Questa guida
```

---

## 1. Creare il progetto Firebase

1. Vai su https://console.firebase.google.com
2. Clicca "Aggiungi progetto" → dai un nome, es. "mercatino-libri"
3. Disabilita Google Analytics (non necessario) → Crea progetto

### Abilita i servizi necessari

Nel pannello laterale della console:

| Servizio | Dove abilitarlo |
|----------|----------------|
| Authentication | Build → Authentication → Inizia → Email/password → Abilita |
| Firestore | Build → Firestore Database → Crea database → modalità produzione → regione eur3 |
| Storage | Build → Storage → Inizia → modalità produzione → stessa regione |
| Hosting | Build → Hosting → Inizia |

### Registra l'app web

1. Ingranaggio → Impostazioni progetto → Le tue app → icona </>
2. Dai un nome (es. mercatino-web) → Registra app
3. Copia il blocco firebaseConfig — ti serve nel prossimo step

---

## 2. Inserire le credenziali

Apri js/firebase.js e sostituisci il blocco FIREBASE_CONFIG:

```javascript
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain:        "mercatino-libri.firebaseapp.com",
  projectId:         "mercatino-libri",
  storageBucket:     "mercatino-libri.appspot.com",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abcdef123456"
};
```

---

## 3. Pubblicare le Security Rules

### Firestore Rules
1. Console Firebase → Firestore → Regole
2. Copia il contenuto di firestore.rules (dalla riga rules_version in poi)
3. Incolla → Pubblica

### Storage Rules
1. Console Firebase → Storage → Regole
2. Copia il blocco commentato in fondo a firestore.rules (racchiuso tra /* */)
3. Incolla senza i commenti → Pubblica

---

## 4. Creare gli indici Firestore

### Metodo A: Firebase CLI (consigliato)

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:indexes
```

### Metodo B: Manuale dalla console

Per ogni indice in firestore.indexes.json, vai su:
Firestore → Indici → Aggiungi indice → inserisci raccolta e campi.

---

## 5. Deploy su Firebase Hosting

```bash
# Installa Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Collega al progetto (dalla cartella mercatino-firebase/)
firebase init hosting
# cartella pubblica: .
# SPA: Sì
# sovrascrivere index.html: No

# Deploy
firebase deploy
# Output: https://mercatino-libri.web.app
```

Per i deploy successivi:
```bash
firebase deploy --only hosting
```

Deploy completo (hosting + rules + indexes):
```bash
firebase deploy
```

---

## 6. Dominio personalizzato

1. Console Firebase → Hosting → Aggiungi dominio personalizzato
2. Inserisci il dominio, es. libri.nomescuola.edu.it
3. Firebase ti darà due record DNS da configurare:
   - Record A → IP Firebase
   - Record TXT → per la verifica del dominio
4. Attendi la propagazione DNS (15 minuti – 48 ore)
5. Firebase gestisce automaticamente il certificato SSL

---

## 7. Struttura Firestore — riferimento rapido

### Collezione utenti
```
/utenti/{uid}
  nome: string
  cognome: string
  classe: string
  indirizzo: string
  ruolo: "studente" | "admin"
  creato_il: timestamp
```

### Collezione libri
```
/libri/{libroId}
  titolo: string
  autore: string
  isbn: string
  editore: string
  materia: string
  classe: string
  indirizzo: string
  prezzo: number
  stato_libro: "ottimo" | "buono" | "accettabile" | "da_revisionare"
  descrizione: string
  immagine_url: string | null
  venditore_id: string (uid)
  stato_annuncio: "disponibile" | "prenotato" | "venduto"
  pagamento_online: boolean
  pagamento_presenza: boolean
  allegati: string[]
  creato_il: timestamp
  aggiornato_il: timestamp
```

### Collezione prenotazioni
```
/prenotazioni/{prenId}
  libro_id: string
  acquirente_id: string (uid)
  stato_prenotazione: "in_attesa" | "confermata" | "completata" | "annullata"
  metodo_pagamento: "online" | "presenza"
  luogo_scambio: string
  data_scambio: string | null
  ora_scambio: string | null
  conferma_venditore: boolean
  conferma_acquirente: boolean
  note_acquirente: string
  creato_il: timestamp
```

### Collezione segnalazioni
```
/segnalazioni/{segId}
  libro_id: string
  segnalato_da: string (uid)
  motivo: string
  stato: "in_revisione" | "risolta" | "ignorata"
  creato_il: timestamp
```

---

## 8. Creare il primo account Admin

Dopo aver creato il tuo account tramite l'app, vai su:
Console Firebase → Firestore → utenti → [il tuo uid] → modifica ruolo → imposta "admin"

Oppure con Node.js e Admin SDK:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const uid = 'IL-TUO-UID';
admin.firestore().doc(`utenti/${uid}`).update({ ruolo: 'admin' });
```

---

## 9. Integrazione pagamenti Stripe (opzionale)

```bash
firebase init functions
cd functions && npm install stripe
```

functions/index.js:
```javascript
const functions = require('firebase-functions');
const Stripe = require('stripe');
const stripe = Stripe(functions.config().stripe.secret);

exports.creaPagamento = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login richiesto');
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(data.importo * 100),
    currency: 'eur',
    metadata: { prenotazione_id: data.prenotazione_id }
  });
  return { clientSecret: intent.client_secret };
});
```

```bash
firebase functions:config:set stripe.secret="sk_live_..."
firebase deploy --only functions
```

---

## 10. Checklist pre-pubblicazione

- [ ] Credenziali Firebase inserite in js/firebase.js
- [ ] Authentication abilitata (Email/Password)
- [ ] Firestore creato in modalità produzione
- [ ] Storage creato in modalità produzione
- [ ] Security Rules pubblicate (Firestore + Storage)
- [ ] Indici Firestore creati
- [ ] Testato: registrazione → pubblica libro → prenota → area utente
- [ ] Primo account admin impostato manualmente
- [ ] firebase deploy eseguito con successo
- [ ] Dominio personalizzato configurato (opzionale)

---

## 11. Note sulla sicurezza

- Le Security Rules limitano già l'accesso per ruolo — verificale sempre in produzione.
- Non committare mai le credenziali Firebase su un repo pubblico.
- Le chiavi apiKey per app web sono pubbliche per design — la sicurezza è garantita dalle Security Rules.
- Per maggiore protezione, abilita App Check in Console Firebase.
