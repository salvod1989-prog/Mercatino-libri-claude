// ============================================================
// MERCATINO LIBRI — app-firebase.js
// Collega firebase.js all'interfaccia HTML esistente.
// Sostituisce i blocchi mock di app.js con chiamate Firebase reali.
//
// COME USARLO:
//   Sostituisci in index.html:
//     <script src="js/data.js"></script>
//     <script src="js/app.js"></script>
//   con:
//     <script type="module" src="js/app-firebase.js"></script>
// ============================================================

import {
  registraUtente,
  loginEmail,
  logoutUtente,
  ascoltaSessione,
  caricaLibri,
  caricaLibro,
  pubblicaLibro,
  aggiornaLibro,
  segnaVenduto as fbSegnaVenduto,
  eliminaLibro,
  caricaMieiLibri,
  creaPrenotazione,
  caricaMiePrenotazioni,
  caricaPrenotazioniRicevute,
  rispondiPrenotazione,
  confermaConsegna,
  inviaSegnalazione,
  caricaSegnalazioni,
  risolviSegnalazione as fbRisolviSegnalazione,
  caricaStatisticheAdmin,
  caricaTuttiLibriAdmin,
  ascoltaLibriDisponibili,
  ascoltaPrenotazioniUtente,
  caricaProfilo,
  aggiornaProfilo,
  caricaImmagineCopertina
} from './firebase.js';

// ============================================================
// STATO
// ============================================================
const App = {
  paginaCorrente: 'home',
  utenteCorrente: null,
  filtri: {
    classe: '', indirizzo: '', materia: '', titolo: '',
    isbn: '', prezzoMax: '', statoLibro: '', statoAnnuncio: 'disponibile'
  },
  libriVisibili: [],
  prenotazioneTemp: null,
  libroSelezionato: null,
  unsubscribers: []   // cleanup dei listener real-time
};

// ============================================================
// NAVIGAZIONE
// ============================================================
function mostraPagina(id) {
  document.querySelectorAll('.pagina').forEach(p => p.hidden = true);
  const el = document.getElementById('pag-' + id);
  if (el) { el.hidden = false; App.paginaCorrente = id; }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  history.pushState({}, '', '#' + id);
  chiudiMenuMobile();
}
window.mostraPagina = mostraPagina;

window.addEventListener('popstate', () => {
  mostraPagina(location.hash.replace('#', '') || 'home');
});

// ============================================================
// SESSIONE FIREBASE
// ============================================================
ascoltaSessione(async (profilo) => {
  App.utenteCorrente = profilo;
  aggiornaNavbarUtente();

  // Se era in una pagina protetta e ora non è loggato → home
  const pagineSicure = ['area-utente', 'admin', 'pubblica'];
  if (!profilo && pagineSicure.includes(App.paginaCorrente)) {
    mostraPagina('home');
  }
  // Se admin → carica dashboard
  if (profilo?.ruolo === 'admin' && App.paginaCorrente === 'admin') {
    await caricaAdmin();
  }
});

function aggiornaNavbarUtente() {
  const area = document.getElementById('navbar-utente');
  if (!area) return;
  if (App.utenteCorrente) {
    area.innerHTML = `
      <span style="font-size:.88rem;color:var(--testo-muted)">Ciao, <strong>${App.utenteCorrente.nome}</strong></span>
      <button class="btn-nav btn-nav-outline" onclick="mostraPagina('area-utente');caricaAreaUtente()">La mia area</button>
      <button class="btn-nav btn-nav-solid" onclick="eseguitlogout()">Esci</button>`;
  } else {
    area.innerHTML = `
      <button class="btn-nav btn-nav-outline" onclick="apriModal('modal-login')">Accedi</button>
      <button class="btn-nav btn-nav-solid" onclick="apriModal('modal-registrazione')">Registrati</button>`;
  }
}
window.aggiornaNavbarUtente = aggiornaNavbarUtente;

// ============================================================
// AUTH — Login / Registrazione / Logout
// ============================================================
window.eseguitlogin = async function() {
  const email = document.getElementById('login-email')?.value?.trim();
  const pw    = document.getElementById('login-pw')?.value;
  if (!email || !pw) { mostraToast('Compila email e password.', 'errore'); return; }

  mostraToast('Accesso in corso…');
  const res = await loginEmail(email, pw);
  if (res.ok) {
    mostraToast('Accesso effettuato!', 'ok');
    chiudiModal('modal-login');
    mostraPagina('area-utente');
    await caricaAreaUtente();
  } else {
    mostraToast(res.errore, 'errore');
  }
};

window.eseguitRegistrazione = async function() {
  const nome     = document.getElementById('reg-nome')?.value?.trim();
  const cognome  = document.getElementById('reg-cognome')?.value?.trim();
  const email    = document.getElementById('reg-email')?.value?.trim();
  const pw       = document.getElementById('reg-pw')?.value;
  const classe   = document.getElementById('reg-classe')?.value?.trim();
  const indirizzo= document.getElementById('reg-indirizzo')?.value?.trim();

  if (!nome || !cognome || !email || !pw) {
    mostraToast('Compila tutti i campi obbligatori.', 'errore'); return;
  }
  mostraToast('Creazione account…');
  const res = await registraUtente(email, pw, { nome, cognome, classe, indirizzo });
  if (res.ok) {
    mostraToast('Account creato! Accesso effettuato.', 'ok');
    chiudiModal('modal-registrazione');
    mostraPagina('area-utente');
    await caricaAreaUtente();
  } else {
    mostraToast(res.errore, 'errore');
  }
};

window.eseguitlogout = async function() {
  App.unsubscribers.forEach(u => u());
  App.unsubscribers = [];
  await logoutUtente();
  App.utenteCorrente = null;
  aggiornaNavbarUtente();
  mostraPagina('home');
  mostraToast('Disconnessione effettuata.', 'ok');
};

// ============================================================
// CATALOGO & FILTRI
// ============================================================
window.caricaCatalogo = async function() {
  popolaSelectFiltri();
  await applicaFiltri();
};

function popolaSelectFiltri() {
  const aggiungi = (id, valori) => {
    const el = document.getElementById(id);
    if (!el || el.options.length > 1) return;
    valori.forEach(v => {
      const o = new Option(typeof v === 'object' ? v.label : v + '° anno', typeof v === 'object' ? v.val : v);
      el.add(o);
    });
  };
  aggiungi('filtro-classe', ['1','2','3','4','5']);
  aggiungi('filtro-indirizzo', ['Scientifico','Classico','Linguistico','Liceo delle Scienze Umane','Tecnico Economico','Tecnico Tecnologico']);
  aggiungi('filtro-materia', ['Italiano','Latino','Greco','Matematica','Fisica','Scienze','Storia','Filosofia','Inglese','Arte','Storia dell\'arte','Informatica','Diritto','Economia']);
  aggiungi('filtro-stato-libro', [
    {val:'ottimo',label:'Ottimo'},{val:'buono',label:'Buono'},
    {val:'accettabile',label:'Accettabile'},{val:'da_revisionare',label:'Da revisionare'}
  ]);
}

window.applicaFiltri = async function() {
  leggiValoriFiltri();
  const griglia = document.getElementById('griglia-libri');
  if (griglia) griglia.innerHTML = '<p style="color:var(--testo-muted);padding:1rem">Caricamento…</p>';

  try {
    App.libriVisibili = await caricaLibri(App.filtri);
  } catch (err) {
    console.error(err);
    App.libriVisibili = [];
    mostraToast('Errore nel caricamento libri.', 'errore');
  }

  renderGrigliaLibri();
  const cont = document.getElementById('conteggio-risultati');
  if (cont) cont.textContent = App.libriVisibili.length
    ? `${App.libriVisibili.length} libro/i trovato/i` : '';
};

function leggiValoriFiltri() {
  const map = [
    ['filtro-classe','classe'], ['filtro-indirizzo','indirizzo'], ['filtro-materia','materia'],
    ['filtro-stato-libro','statoLibro'], ['filtro-titolo','titolo'],
    ['filtro-isbn','isbn'], ['filtro-prezzo-max','prezzoMax']
  ];
  map.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) App.filtri[key] = el.value;
  });
  const sa = document.getElementById('filtro-stato-annuncio');
  if (sa) App.filtri.statoAnnuncio = sa.value;
}

window.resetFiltri = function() {
  document.querySelectorAll('#pannello-filtri select, #pannello-filtri input').forEach(el => el.value = '');
  App.filtri = { classe:'',indirizzo:'',materia:'',titolo:'',isbn:'',prezzoMax:'',statoLibro:'',statoAnnuncio:'' };
  applicaFiltri();
};

function renderGrigliaLibri() {
  const griglia = document.getElementById('griglia-libri');
  if (!griglia) return;
  if (!App.libriVisibili.length) {
    griglia.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📚</div>
      <h3>Nessun libro trovato</h3>
      <p>Prova a modificare i filtri o cerca con termini diversi.</p>
      <button class="btn btn-outline" onclick="resetFiltri()">Rimuovi filtri</button>
    </div>`;
    return;
  }
  griglia.innerHTML = App.libriVisibili.map(l => cardLibro(l)).join('');
}

function cardLibro(l) {
  const badgeClass = {disponibile:'badge-disponibile',prenotato:'badge-prenotato',venduto:'badge-venduto'}[l.stato_annuncio]||'';
  const badgeLabel = {disponibile:'✓ Disponibile',prenotato:'⏳ Prenotato',venduto:'✗ Venduto'}[l.stato_annuncio]||l.stato_annuncio;
  const bs = badgeTipoLibro(l.stato_libro);
  const pag = [];
  if (l.pagamento_online)   pag.push('💳 Online');
  if (l.pagamento_presenza) pag.push('🤝 Presenza');
  return `<article class="libro-card" onclick="apriScheda('${l.id}')" style="cursor:pointer" role="button" tabindex="0" aria-label="Visualizza: ${l.titolo}" onkeydown="if(event.key==='Enter')apriScheda('${l.id}')">
    <div class="libro-card-cover">
      ${l.immagine_url ? `<img src="${l.immagine_url}" alt="Copertina ${l.titolo}">` : '📖'}
      <span class="badge ${badgeClass} badge-annuncio">${badgeLabel}</span>
    </div>
    <div class="libro-card-body">
      <span class="libro-card-materia">${l.materia}</span>
      <h3 class="libro-card-titolo">${l.titolo}</h3>
      <p class="libro-card-autore">${l.autore}</p>
      <div class="libro-card-meta">
        <span class="libro-card-prezzo">€ ${Number(l.prezzo).toFixed(2)}</span>
        <span class="libro-card-classe">${l.classe}° · ${l.indirizzo}</span>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem">
        <span class="badge ${bs.cls}">${bs.lbl}</span>
        ${pag.map(p=>`<span class="chip">${p}</span>`).join('')}
      </div>
    </div>
    <div class="libro-card-footer">
      <button class="btn btn-primario btn-sm btn-blocco" onclick="event.stopPropagation();apriScheda('${l.id}')">Visualizza dettaglio →</button>
    </div>
  </article>`;
}

function badgeTipoLibro(stato) {
  return {
    ottimo:          {cls:'badge badge-libro-ottimo',      lbl:'Ottimo'},
    buono:           {cls:'badge badge-libro-buono',       lbl:'Buono'},
    accettabile:     {cls:'badge badge-libro-accettabile', lbl:'Accettabile'},
    da_revisionare:  {cls:'badge badge-libro-da_revisionare', lbl:'Da revisionare'}
  }[stato] || {cls:'badge', lbl: stato};
}

// ============================================================
// SCHEDA DETTAGLIO
// ============================================================
window.apriScheda = async function(id) {
  const libro = await caricaLibro(id);
  if (!libro) { mostraToast('Libro non trovato.', 'errore'); return; }
  App.libroSelezionato = libro;
  renderScheda(libro);
  mostraPagina('scheda-libro');
};

function renderScheda(l) {
  const el = document.getElementById('scheda-contenuto');
  if (!el) return;
  const bs = badgeTipoLibro(l.stato_libro);
  const badgeA = {disponibile:'badge-disponibile',prenotato:'badge-prenotato',venduto:'badge-venduto'}[l.stato_annuncio]||'';
  const badgeLblA = {disponibile:'✓ Disponibile',prenotato:'⏳ Prenotato',venduto:'✗ Venduto'}[l.stato_annuncio]||'';
  const pag = [];
  if (l.pagamento_online)   pag.push('<span class="pill-pagamento">💳 Pagamento online</span>');
  if (l.pagamento_presenza) pag.push('<span class="pill-pagamento">🤝 Pagamento di presenza</span>');
  const puoPren = l.stato_annuncio === 'disponibile';

  el.innerHTML = `
    <nav class="breadcrumb container">
      <a href="#" onclick="mostraPagina('catalogo');return false">Catalogo</a>
      <span>›</span><span>${l.materia}</span><span>›</span><span>${l.titolo}</span>
    </nav>
    <div class="container">
      <div class="scheda-layout">
        <div>
          <div class="scheda-copertina">
            ${l.immagine_url ? `<img src="${l.immagine_url}" alt="Copertina">` : '📖'}
          </div>
          <div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap">
            <span class="badge ${badgeA}">${badgeLblA}</span>
            <span class="badge ${bs.cls}">${bs.lbl}</span>
          </div>
        </div>
        <div class="scheda-info">
          <div>
            <p class="scheda-materia">${l.materia} · ${l.classe}° anno · ${l.indirizzo}</p>
            <h1 class="scheda-titolo">${l.titolo}</h1>
            <p class="scheda-autore">${l.autore}</p>
          </div>
          <dl class="scheda-dati-list">
            ${l.isbn ? `<div class="scheda-dato"><dt>ISBN</dt><dd>${l.isbn}</dd></div>` : ''}
            ${l.editore ? `<div class="scheda-dato"><dt>Editore</dt><dd>${l.editore}</dd></div>` : ''}
            <div class="scheda-dato"><dt>Classe</dt><dd>${l.classe}° anno</dd></div>
            <div class="scheda-dato"><dt>Indirizzo</dt><dd>${l.indirizzo}</dd></div>
          </dl>
          <div class="scheda-prezzo-box">
            <div class="scheda-prezzo-num">€ ${Number(l.prezzo).toFixed(2)}</div>
            <div class="scheda-pagamenti">${pag.join('')}</div>
          </div>
          ${l.descrizione ? `<div class="messaggio messaggio-info"><span>💬</span><div><strong>Note</strong><br><span style="font-size:.88rem">${l.descrizione}</span></div></div>` : ''}
          ${puoPren
            ? `<button class="btn btn-secondario btn-lg btn-blocco" onclick="avviaPrenotazione('${l.id}')">📚 Prenota questo libro</button>`
            : `<div class="messaggio messaggio-attenzione"><span>⚠️</span><span>Non disponibile al momento.</span></div>`
          }
          <button class="btn btn-ghost btn-sm" onclick="apriModalSegnalazione('${l.id}')" style="margin-top:.5rem">🚩 Segnala annuncio</button>
          <div class="messaggio messaggio-info" style="font-size:.82rem;margin-top:.5rem">
            <span>🔒</span>
            <span>Lo scambio avviene sempre <strong>a scuola</strong>. Non condividere dati personali fuori dalla piattaforma.</span>
          </div>
        </div>
      </div>
    </div>`;
}

// ============================================================
// RICERCA RAPIDA
// ============================================================
window.cercaRapido = function(q) {
  if (!q.trim()) return;
  App.filtri = { classe:'',indirizzo:'',materia:'',titolo:q.trim(),isbn:'',prezzoMax:'',statoLibro:'',statoAnnuncio:'' };
  mostraPagina('catalogo');
  setTimeout(() => {
    const el = document.getElementById('filtro-titolo');
    if (el) el.value = q.trim();
    applicaFiltri();
  }, 50);
};

// ============================================================
// PRENOTAZIONE
// ============================================================
const LUOGHI_SCAMBIO = [
  'Ingresso scuola, vicino alla portineria',
  'Atrio principale, piano terra',
  'Biblioteca scolastica',
  'Cortile interno'
];

window.avviaPrenotazione = function(libroId) {
  if (!App.utenteCorrente) {
    mostraToast('Accedi per prenotare un libro.', 'attenzione');
    apriModal('modal-login'); return;
  }
  const libro = App.libriVisibili.find(l => l.id === libroId) || App.libroSelezionato;
  if (!libro) return;
  App.prenotazioneTemp = { libroId, libro, step: 1 };
  renderStepPrenotazione(1);
  mostraPagina('prenotazione');
};

function renderStepPrenotazione(step) {
  const el = document.getElementById('form-prenotazione');
  if (!el) return;
  const l = App.prenotazioneTemp.libro;
  const opz = [];
  if (l.pagamento_online)   opz.push({valore:'online',  titolo:'💳 Pagamento online',    sub:'Paga in modo sicuro prima dello scambio'});
  if (l.pagamento_presenza) opz.push({valore:'presenza', titolo:'🤝 Pagamento di presenza', sub:'Paghi al momento dello scambio a scuola'});

  if (step === 1) {
    el.innerHTML = `<div class="form-card">
      <h2>Prenota: ${l.titolo}</h2>
      <div class="messaggio messaggio-info"><span>📋</span><span>Scegli il metodo di pagamento e il luogo di scambio.</span></div>
      <form id="form-step1" novalidate>
        <div class="form-gruppo">
          <label>Modalità di pagamento *</label>
          <div class="scelta-pagamento">
            ${opz.map(o=>`<label><input type="radio" name="metodo-pag" value="${o.valore}" ${opz.length===1?'checked':''}>
              <span class="pay-titolo">${o.titolo}</span><span class="pay-sub">${o.sub}</span></label>`).join('')}
          </div>
        </div>
        <div class="form-gruppo">
          <label for="pren-luogo">Luogo di scambio preferito</label>
          <select id="pren-luogo">
            ${LUOGHI_SCAMBIO.map(lu=>`<option value="${lu}">${lu}</option>`).join('')}
          </select>
        </div>
        <div class="form-gruppo" id="fg-note">
          <label for="pren-note">Note per il venditore (opzionale)</label>
          <textarea id="pren-note" placeholder="Es: sono disponibile il lunedì e il mercoledì"></textarea>
        </div>
        <button type="submit" class="btn btn-primario btn-blocco">Continua →</button>
      </form>
    </div>`;
    document.getElementById('form-step1').addEventListener('submit', e => {
      e.preventDefault();
      App.prenotazioneTemp.metodo = document.querySelector('input[name="metodo-pag"]:checked')?.value || 'presenza';
      App.prenotazioneTemp.luogo  = document.getElementById('pren-luogo')?.value;
      App.prenotazioneTemp.note   = document.getElementById('pren-note')?.value;
      renderStepPrenotazione(2);
    });
  }

  if (step === 2) {
    const m = App.prenotazioneTemp.metodo;
    el.innerHTML = `<div class="form-card">
      <h2>Riepilogo prenotazione</h2>
      <dl class="riepilogo-card">
        <div class="riepilogo-riga"><dt>Libro</dt><dd>${l.titolo}</dd></div>
        <div class="riepilogo-riga"><dt>Prezzo</dt><dd>€ ${Number(l.prezzo).toFixed(2)}</dd></div>
        <div class="riepilogo-riga"><dt>Pagamento</dt><dd>${m==='online'?'💳 Online':'🤝 Di presenza'}</dd></div>
        <div class="riepilogo-riga"><dt>Luogo</dt><dd>${App.prenotazioneTemp.luogo}</dd></div>
        <div class="riepilogo-riga riepilogo-totale"><dt>Totale</dt><dd>€ ${Number(l.prezzo).toFixed(2)}</dd></div>
      </dl>
      ${m==='presenza'
        ? `<div class="messaggio messaggio-ok" style="margin-bottom:1rem"><span>✓</span><div><strong>Pagamento di presenza</strong><br><small>Porta l'importo esatto: € ${Number(l.prezzo).toFixed(2)}</small></div></div>`
        : `<div class="messaggio messaggio-info" style="margin-bottom:1rem"><span>🔒</span><span>Il pagamento online sarà gestito in modo sicuro. Riceverai le istruzioni dopo la conferma del venditore.</span></div>`
      }
      <div class="messaggio messaggio-attenzione" style="font-size:.82rem;margin-bottom:1rem">
        <span>⚠️</span><span>Completa lo scambio solo tramite la piattaforma. Non condividere dati personali.</span>
      </div>
      <div style="display:flex;gap:.75rem">
        <button class="btn btn-ghost" onclick="renderStepPrenotazione(1)">← Indietro</button>
        <button class="btn btn-secondario" style="flex:1" onclick="confermaPrenotazioneFirebase()" id="btn-conferma-pren">✓ Conferma prenotazione</button>
      </div>
    </div>`;
  }
}
window.renderStepPrenotazione = renderStepPrenotazione;

window.confermaPrenotazioneFirebase = async function() {
  const btn = document.getElementById('btn-conferma-pren');
  if (btn) btn.disabled = true;

  const res = await creaPrenotazione({
    libro_id:          App.prenotazioneTemp.libroId,
    acquirente_id:     App.utenteCorrente.uid,
    metodo_pagamento:  App.prenotazioneTemp.metodo,
    luogo_scambio:     App.prenotazioneTemp.luogo,
    note_acquirente:   App.prenotazioneTemp.note || ''
  });

  if (res.ok) {
    mostraToast('Prenotazione inviata! Il venditore riceverà una notifica.', 'ok');
    mostraPagina('area-utente');
    await caricaAreaUtente();
  } else {
    mostraToast(res.errore, 'errore');
    if (btn) btn.disabled = false;
  }
};

// ============================================================
// PUBBLICA LIBRO
// ============================================================
window.inviaAnnuncio = async function(e) {
  e.preventDefault();
  if (!App.utenteCorrente) { apriModal('modal-login'); return; }

  const val = id => document.getElementById(id)?.value || '';
  if (!val('pub-titolo') || !val('pub-autore') || !val('pub-prezzo') || !val('pub-materia') || !val('pub-classe')) {
    mostraToast('Compila tutti i campi obbligatori.', 'errore'); return;
  }

  const btn = e.target.querySelector('[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Pubblicazione…'; }

  const fileInput = document.getElementById('pub-immagine');
  const file = fileInput?.files?.[0] || null;

  const res = await pubblicaLibro({
    titolo:            val('pub-titolo'),
    autore:            val('pub-autore'),
    isbn:              val('pub-isbn'),
    editore:           val('pub-editore'),
    materia:           val('pub-materia'),
    classe:            val('pub-classe'),
    indirizzo:         val('pub-indirizzo'),
    prezzo:            parseFloat(val('pub-prezzo')) || 0,
    stato_libro:       val('pub-stato-libro'),
    descrizione:       val('pub-descrizione'),
    pagamento_online:  document.getElementById('pub-pag-online')?.checked || false,
    pagamento_presenza:document.getElementById('pub-pag-presenza')?.checked || true,
    allegati:          []
  }, file, App.utenteCorrente.uid);

  if (btn) { btn.disabled = false; btn.textContent = '📤 Pubblica l\'annuncio'; }

  if (res.ok) {
    e.target.reset();
    mostraToast('Annuncio pubblicato con successo! 🎉', 'ok');
    mostraPagina('area-utente');
    await caricaAreaUtente();
  } else {
    mostraToast(res.errore, 'errore');
  }
};

// ============================================================
// AREA UTENTE
// ============================================================
window.caricaAreaUtente = async function() {
  if (!App.utenteCorrente) { mostraPagina('home'); return; }
  const nc = document.getElementById('area-nome-utente');
  if (nc) nc.textContent = (App.utenteCorrente.nome || '') + ' ' + (App.utenteCorrente.cognome || '');

  await Promise.all([renderMieiAnnunci(), renderMiePrenotazioni()]);
  renderProfiloUtente();
};

async function renderMieiAnnunci() {
  const el = document.getElementById('lista-miei-annunci');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--testo-muted)">Caricamento…</p>';

  const miei = await caricaMieiLibri(App.utenteCorrente.uid);
  if (!miei.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><h3>Nessun annuncio</h3><p>Non hai ancora pubblicato nessun libro.</p><button class="btn btn-primario" onclick="mostraPagina('pubblica')">+ Pubblica il primo libro</button></div>`;
    return;
  }
  el.innerHTML = `<div class="tabella-wrap"><table class="tabella">
    <thead><tr><th>Titolo</th><th>Prezzo</th><th>Stato</th><th>Annuncio</th><th>Azioni</th></tr></thead>
    <tbody>${miei.map(l => {
      const bs = badgeTipoLibro(l.stato_libro);
      return `<tr>
        <td><strong>${l.titolo}</strong><br><small style="color:var(--grigio-4)">${l.autore}</small></td>
        <td>€ ${Number(l.prezzo).toFixed(2)}</td>
        <td><span class="badge ${bs.cls}">${bs.lbl}</span></td>
        <td><span class="badge badge-${l.stato_annuncio}">${labelStato(l.stato_annuncio)}</span></td>
        <td style="display:flex;gap:.4rem;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="apriScheda('${l.id}')">Vedi</button>
          ${l.stato_annuncio !== 'venduto' ? `<button class="btn btn-danger btn-sm" onclick="segnaVendutoUI('${l.id}')">Segna venduto</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="eliminaAnnuncioUI('${l.id}')">Elimina</button>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

async function renderMiePrenotazioni() {
  const el = document.getElementById('lista-mie-prenotazioni');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--testo-muted)">Caricamento…</p>';

  const mie = await caricaMiePrenotazioni(App.utenteCorrente.uid);
  if (!mie.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔖</div><h3>Nessuna prenotazione</h3><p>Non hai ancora prenotato nessun libro.</p><button class="btn btn-primario" onclick="mostraPagina('catalogo')">Sfoglia il catalogo</button></div>`;
    return;
  }

  // Carica i titoli dei libri
  const libriMap = {};
  await Promise.all(mie.map(async p => {
    if (!libriMap[p.libro_id]) {
      const l = await caricaLibro(p.libro_id);
      if (l) libriMap[p.libro_id] = l;
    }
  }));

  el.innerHTML = `<div class="tabella-wrap"><table class="tabella">
    <thead><tr><th>Libro</th><th>Metodo</th><th>Stato</th><th>Luogo</th><th>Data</th></tr></thead>
    <tbody>${mie.map(p => `<tr>
      <td><strong>${libriMap[p.libro_id]?.titolo || 'N/D'}</strong></td>
      <td>${p.metodo_pagamento==='online'?'💳 Online':'🤝 Presenza'}</td>
      <td><span class="badge badge-${p.stato_prenotazione}">${labelStatoPren(p.stato_prenotazione)}</span></td>
      <td style="font-size:.83rem">${p.luogo_scambio||'—'}</td>
      <td style="font-size:.83rem">${p.data_scambio?`${p.data_scambio} ${p.ora_scambio||''}` : 'Da concordare'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderProfiloUtente() {
  const el = document.getElementById('profilo-dati');
  if (!el || !App.utenteCorrente) return;
  const u = App.utenteCorrente;
  el.innerHTML = `
    <div class="scheda-dato"><dt>Nome</dt><dd>${u.nome||''} ${u.cognome||''}</dd></div>
    <div class="scheda-dato"><dt>Email</dt><dd>${u.email||''}</dd></div>
    ${u.classe    ? `<div class="scheda-dato"><dt>Classe</dt><dd>${u.classe}</dd></div>` : ''}
    ${u.indirizzo ? `<div class="scheda-dato"><dt>Indirizzo</dt><dd>${u.indirizzo}</dd></div>` : ''}
    <div class="scheda-dato"><dt>Ruolo</dt><dd>${u.ruolo||'studente'}</dd></div>
  `;
}

window.segnaVendutoUI = async function(id) {
  if (!confirm('Segna questo libro come venduto? L\'annuncio verrà chiuso.')) return;
  await fbSegnaVenduto(id);
  mostraToast('Libro segnato come venduto.', 'ok');
  await renderMieiAnnunci();
};

window.eliminaAnnuncioUI = async function(id) {
  if (!confirm('Eliminare definitivamente questo annuncio?')) return;
  await eliminaLibro(id);
  mostraToast('Annuncio eliminato.', 'ok');
  await renderMieiAnnunci();
};

// ============================================================
// SEGNALAZIONI
// ============================================================
window.apriModalSegnalazione = function(libroId) {
  const modal = document.getElementById('modal-segnalazione');
  if (modal) {
    document.getElementById('seg-libro-id').value = libroId;
    apriModal('modal-segnalazione');
  }
};

window.inviaSegnalazioneUI = async function() {
  if (!App.utenteCorrente) { mostraToast('Accedi per segnalare.', 'errore'); return; }
  const libroId = document.getElementById('seg-libro-id')?.value;
  const motivo  = document.getElementById('seg-motivo')?.value?.trim();
  if (!motivo || motivo.length < 10) { mostraToast('Descrivi il problema (almeno 10 caratteri).', 'errore'); return; }
  await inviaSegnalazione(libroId, App.utenteCorrente.uid, motivo);
  mostraToast('Segnalazione inviata. La verificheremo al più presto.', 'ok');
  chiudiModal('modal-segnalazione');
};

// ============================================================
// ADMIN
// ============================================================
window.caricaAdmin = async function() {
  if (App.utenteCorrente?.ruolo !== 'admin') return;

  const stats = await caricaStatisticheAdmin();
  document.getElementById('admin-stat-annunci').textContent      = stats.totaleAnnunci;
  document.getElementById('admin-stat-disponibili').textContent  = stats.disponibili;
  document.getElementById('admin-stat-prenotazioni').textContent = stats.totalePrenotazioni;
  document.getElementById('admin-stat-segnalazioni').textContent = stats.totaleSegnalazioni;

  await renderAdminAnnunci();
  await renderAdminSegnalazioni();
};

async function renderAdminAnnunci() {
  const el = document.getElementById('admin-lista-annunci');
  if (!el) return;
  const libri = await caricaTuttiLibriAdmin();
  el.innerHTML = `<div class="tabella-wrap"><table class="tabella">
    <thead><tr><th>Titolo</th><th>ISBN</th><th>Prezzo</th><th>Stato</th><th>Azioni</th></tr></thead>
    <tbody>${libri.map(l => `<tr>
      <td><strong>${l.titolo}</strong><br><small>${l.autore}</small></td>
      <td style="font-size:.82rem">${l.isbn||'—'}</td>
      <td>€ ${Number(l.prezzo).toFixed(2)}</td>
      <td><span class="badge badge-${l.stato_annuncio}">${labelStato(l.stato_annuncio)}</span></td>
      <td style="display:flex;gap:.4rem;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="apriScheda('${l.id}')">Vedi</button>
        <button class="btn btn-danger btn-sm" onclick="rimuoviAnnuncioAdmin('${l.id}')">Rimuovi</button>
      </td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function renderAdminSegnalazioni() {
  const el = document.getElementById('admin-segnalazioni');
  if (!el) return;
  const segs = await caricaSegnalazioni();
  const aperte = segs.filter(s => s.stato === 'in_revisione');
  if (!aperte.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><h3>Nessuna segnalazione aperta</h3></div>`;
    return;
  }
  el.innerHTML = `<div class="tabella-wrap"><table class="tabella">
    <thead><tr><th>Libro ID</th><th>Motivo</th><th>Stato</th><th>Azioni</th></tr></thead>
    <tbody>${aperte.map(s => `<tr>
      <td style="font-size:.82rem">${s.libro_id}</td>
      <td style="font-size:.88rem">${s.motivo}</td>
      <td><span class="badge badge-prenotato">${s.stato}</span></td>
      <td style="display:flex;gap:.4rem">
        <button class="btn btn-outline btn-sm" onclick="risolviSeg('${s.id}','risolta')">Risolvi</button>
        <button class="btn btn-ghost btn-sm" onclick="risolviSeg('${s.id}','ignorata')">Ignora</button>
      </td>
    </tr>`).join('')}</tbody></table></div>`;
}

window.rimuoviAnnuncioAdmin = async function(id) {
  if (!confirm('Eliminare questo annuncio?')) return;
  await eliminaLibro(id);
  mostraToast('Annuncio rimosso.', 'ok');
  await renderAdminAnnunci();
};

window.risolviSeg = async function(id, esito) {
  await fbRisolviSegnalazione(id, esito);
  mostraToast(`Segnalazione ${esito}.`, 'ok');
  await renderAdminSegnalazioni();
};

// ============================================================
// HOME — libri recenti real-time
// ============================================================
function avviaListenerHome() {
  const unsubscribe = ascoltaLibriDisponibili(libri => {
    const el = document.getElementById('libri-home');
    if (!el) return;
    el.innerHTML = libri.slice(0, 4).map(l => cardLibro(l)).join('');
  });
  App.unsubscribers.push(unsubscribe);
}

// ============================================================
// TABS
// ============================================================
window.attivaTab = function(tabId) {
  document.querySelectorAll('#pag-area-utente .area-tab').forEach(t => t.classList.remove('attivo'));
  document.querySelectorAll('#pag-area-utente .area-panel').forEach(p => p.classList.remove('visibile'));
  document.querySelector(`#pag-area-utente .area-tab[data-tab="${tabId}"]`)?.classList.add('attivo');
  document.getElementById('panel-' + tabId)?.classList.add('visibile');
  if (tabId === 'profilo') renderProfiloUtente();
};

window.attivaTabAdmin = function(nome) {
  document.querySelectorAll('#pag-admin .area-tab').forEach(t => t.classList.remove('attivo'));
  document.querySelectorAll('#pag-admin .area-panel').forEach(p => p.classList.remove('visibile'));
  const tabKey = nome === 'annunci' ? 'admin-annunci' : `admin-${nome}-tab`;
  document.querySelector(`#pag-admin .area-tab[data-tab="${tabKey}"]`)?.classList.add('attivo');
  document.getElementById('panel-admin-' + nome)?.classList.add('visibile');
  if (nome === 'segnalazioni') renderAdminSegnalazioni();
};

// ============================================================
// MODAL / TOAST
// ============================================================
window.apriModal = function(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('aperto'); document.body.style.overflow = 'hidden'; }
};
window.chiudiModal = function(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('aperto'); document.body.style.overflow = ''; }
};

window.mostraToast = function(msg, tipo='ok') {
  const cont = document.getElementById('toast-container');
  if (!cont) return;
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.innerHTML = `<span>${{ok:'✓',errore:'✗',attenzione:'⚠️'}[tipo]||'ℹ️'}</span><span>${msg}</span>`;
  cont.appendChild(t);
  setTimeout(() => { t.classList.add('uscita'); setTimeout(() => t.remove(), 400); }, 3500);
};

function chiudiMenuMobile() {
  document.getElementById('nav-menu')?.classList.remove('aperto');
}

// ============================================================
// LABEL HELPERS
// ============================================================
function labelStato(s) {
  return {disponibile:'✓ Disponibile',prenotato:'⏳ Prenotato',venduto:'✗ Venduto'}[s]||s;
}
function labelStatoPren(s) {
  return {in_attesa:'In attesa',confermata:'Confermata',pagamento_online:'Pagamento online',da_pagare:'Da pagare',completata:'Completata',annullata:'Annullata'}[s]||s;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const hash = location.hash.replace('#','') || 'home';
  mostraPagina(hash);

  // Tab default area utente
  attivaTab('annunci');

  // Chiudi modal cliccando overlay
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) chiudiModal(o.id); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.aperto').forEach(m => chiudiModal(m.id));
  });

  // Avvia listener real-time per la home
  avviaListenerHome();

  // Popola select filtri catalogo
  if (hash === 'catalogo') caricaCatalogo();
});
