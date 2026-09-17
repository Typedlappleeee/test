// Écrans du CRM, portés du prototype « CRM Agence ».
//
// Chaque écran est une fonction pure `render(ctx) → HTML`, plus un `bind` qui
// branche ses interactions. Elles vivent ici plutôt que dans index.html, qui
// porte déjà tout le sourcing Telegram — et elles partagent ses classes CSS,
// pour que l'ensemble reste d'un seul tenant visuellement.
//
// `ctx` fournit : les collections (ctx.get), l'écriture (ctx.put, ctx.remove),
// les utilitaires d'échappement et de formatage.

;(function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  // Teintes par réseau, reprises du prototype.
  const NET = {
    Instagram: ['rgba(255,120,180,.14)', '#F09AC4'],
    OnlyFans:  ['rgba(120,190,255,.14)', '#7FB6F0'],
    TikTok:    ['rgba(255,255,255,.08)', '#DDD5CB'],
    Reddit:    ['rgba(255,150,90,.14)',  '#F29A63'],
    X:         ['rgba(255,255,255,.06)', '#B9B1A5'],
    Telegram:  ['rgba(120,220,255,.13)', '#7ACFEA'],
  }
  const netChip = n => {
    const [bg, fg] = NET[n] ?? NET.X
    return `<span class="net" style="background:${bg};color:${fg}">${esc(n)}</span>`
  }

  const STATUS_TONE = { Actif: 'ok', Active: 'ok', Shadowban: 'warn', Pause: 'mute', Banni: 'bad', Inactif: 'mute' }
  const statusChip = st => `<span class="chip ${STATUS_TONE[st] ?? ''}">${esc(st ?? '—')}</span>`

  /** En-tête d'écran : titre, sous-titre, actions à droite. */
  const head = (title, sub, right = '') =>
    `<div class="panel-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`
    + (right ? `<div class="right">${right}</div>` : '') + '</div>'

  const empty = (title, text) =>
    `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`

  const tiles = cells => '<div class="counts">' + cells.map(([n, label, tone]) =>
    `<div class="count${tone ? ' is-' + tone : ''}"><b>${esc(n)}</b><span>${esc(label)}</span></div>`).join('') + '</div>'

  // ── Accueil ────────────────────────────────────────────────────────────────
  const home = {
    title: 'Accueil',
    render(ctx) {
      const creators = ctx.get('creators'), accounts = ctx.get('accounts')
      const employees = ctx.get('employees'), seqs = ctx.get('seqs')
      const actives = creators.filter(c => (c.status ?? 'Active') === 'Active').length
      const flagged = accounts.filter(a => a.status && a.status !== 'Actif')
      const pending = seqs.filter(q => !q.sent)

      return tiles([
        [actives, 'Créatrices actives'],
        [accounts.length, 'Comptes suivis'],
        [pending.length, 'Séquences à envoyer', pending.length ? 'match' : 'off'],
        [flagged.length, 'Comptes à surveiller', flagged.length ? 'off' : ''],
      ])
      + '<div class="split" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:18px">'
        + '<div class="panel">'
          + head('À faire aujourd’hui', pending.length ? 'Séquences préparées mais pas encore envoyées.' : 'Rien en attente.')
          + (pending.length
              ? pending.map(q => `<div class="salon-row">
                  <span class="id"><b>${esc(q.title)}</b><span>${esc(q.model ?? '')} · ${(q.rows ?? []).length} contenus</span></span>
                  <button class="btn" data-goto="today">Ouvrir</button></div>`).join('')
              : empty('Tout est envoyé', 'Les séquences préparées apparaîtront ici.'))
        + '</div>'
        + '<div class="panel">'
          + head('Comptes à surveiller', 'Shadowban, pause ou bannissement signalés.')
          + (flagged.length
              ? flagged.map(a => `<div class="salon-row">
                  <span class="id"><b>${esc(a.handle)}</b><span>${esc(a.creator ?? '')} · ${esc(a.network ?? '')}</span></span>
                  ${statusChip(a.status)}
                  <button class="btn" data-goto="accounts">Voir</button></div>`).join('')
              : empty('Aucun signalement', 'Tous les comptes suivis sont actifs.'))
        + '</div>'
      + '</div>'
      + `<div class="panel" style="margin-top:14px">${head('Équipe', `${employees.length} personnes`)}
          <div class="panel-body"><div class="chips">`
        + employees.map(e => `<span class="chip">${esc(e.name)} · <b style="font-weight:600">${esc(e.role ?? '')}</b></span>`).join('')
        + '</div></div></div>'
    },
  }

  // ── Créatrices ─────────────────────────────────────────────────────────────
  const creators = {
    title: 'Créatrices',
    render(ctx) {
      const list = ctx.get('creators')
      const accounts = ctx.get('accounts')
      if (!list.length) return `<div class="panel">${head('Créatrices', 'Les modèles sous contrat.')}${empty('Aucune créatrice', 'Ajoute-en une, ou signe un talent depuis le sourcing.')}</div>`

      return `<div class="panel">${head('Créatrices', `${list.length} sous contrat`,
        '<button class="btn primary" data-crm-add="creators">+ Ajouter</button>')}`
        + '<div class="rowhead" style="grid-template-columns:minmax(120px,1.2fr) 1fr 110px 110px 96px 90px">'
          + '<span>Nom</span><span>Comptes</span><span>Marketing</span><span>Chatting</span><span>Statut</span><span></span></div>'
        + list.map(c => {
            const her = accounts.filter(a => a.creator === c.name)
            return `<div class="listrow" style="grid-template-columns:minmax(120px,1.2fr) 1fr 110px 110px 96px 90px">
              <span class="who"><b>${esc(c.name)}</b><span>${esc(c.email ?? '')}</span></span>
              <span class="tags">${her.length ? her.map(a => netChip(a.network)).join('') : '<span style="color:var(--ink-3);font-size:11.5px">aucun</span>'}</span>
              <span style="font-size:12.5px">${esc(c.mkt ?? '—')}</span>
              <span style="font-size:12.5px">${esc(c.chat ?? '—')}</span>
              ${statusChip(c.status ?? 'Active')}
              <span class="acts"><button class="rm" data-crm-del="creators" data-id="${esc(c.id ?? c.name)}">Retirer</button></span>
            </div>`
          }).join('')
        + '</div>'
    },
  }

  // ── Comptes ────────────────────────────────────────────────────────────────
  const accounts = {
    title: 'Comptes',
    render(ctx) {
      const list = ctx.get('accounts')
      const nets = [...new Set(list.map(a => a.network).filter(Boolean))]
      const byNet = nets.map(n => [list.filter(a => a.network === n).length, n])

      return tiles([[list.length, 'Comptes'], ...byNet.slice(0, 3).map(([n, label]) => [n, label])])
        + `<div class="panel" style="margin-top:16px">${head('Comptes réseaux', 'Un compte, sa créatrice et la personne qui s’en occupe.',
            '<button class="btn primary" data-crm-add="accounts">+ Ajouter</button>')}`
        + '<div class="rowhead" style="grid-template-columns:minmax(140px,1.4fr) 110px 110px 110px 96px 110px 80px">'
          + '<span>Compte</span><span>Réseau</span><span>Créatrice</span><span>Employé</span>'
          + '<span>Statut</span><span class="hide">Activité</span><span></span></div>'
        + list.map(a => `<div class="listrow" style="grid-template-columns:minmax(140px,1.4fr) 110px 110px 110px 96px 110px 80px">
            <span class="who"><b>${esc(a.handle)}</b><span>${esc(a.email ?? '')}</span></span>
            <span>${netChip(a.network)}</span>
            <span style="font-size:12.5px">${esc(a.creator ?? '—')}</span>
            <span style="font-size:12.5px">${esc(a.employee ?? '—')}</span>
            ${statusChip(a.status)}
            <span class="hide" style="font-size:11.5px;color:var(--ink-3)">${esc(a.last ?? '—')}</span>
            <span class="acts"><button class="rm" data-crm-del="accounts" data-id="${esc(a.id)}">Retirer</button></span>
          </div>`).join('')
        + '</div>'
    },
  }

  // ── Daily content ──────────────────────────────────────────────────────────
  const daily = {
    title: 'Daily content',
    render(ctx) {
      const list = ctx.get('seqs')
      if (!list.length) return `<div class="panel">${head('Daily content', 'Les séquences de contenu par créatrice.')}${empty('Aucune séquence', 'Les séquences préparées apparaîtront ici.')}</div>`

      return list.map(q => {
        const rows = q.rows ?? []
        return `<div class="panel" style="margin-bottom:14px">`
          + head(q.title ?? 'Séquence', `${esc(q.model ?? '')} · ${rows.length} contenu${rows.length > 1 ? 's' : ''}`,
              q.sent
                ? '<span class="chip ok">Envoyée</span>'
                : `<span class="chip warn">À envoyer</span><button class="btn primary" data-seq-send="${esc(q.id)}">Marquer envoyée</button>`)
          + (rows.length
              ? rows.map(r => `<div class="salon-row">
                  <span class="id"><b style="font-weight:600;font-size:13px">${esc(r.note ?? 'Sans consigne')}</b>
                  <span>${esc(r.ref ?? '')}</span></span>
                  ${r.done ? '<span class="chip ok">Fait</span>' : '<span class="chip">À faire</span>'}
                </div>`).join('')
              : empty('Séquence vide', 'Aucun contenu dans cette séquence.'))
          + '</div>'
      }).join('')
    },
  }

  // ── Équipe ─────────────────────────────────────────────────────────────────
  const team = {
    title: 'Équipe',
    render(ctx) {
      const list = ctx.get('employees')
      const invites = ctx.get('invites')
      const byRole = {}
      for (const e of list) (byRole[e.role ?? 'Sans rôle'] ??= []).push(e)

      return `<div class="panel">${head('Employés', `${list.length} personnes`,
          '<button class="btn primary" data-crm-add="employees">+ Ajouter</button>')}`
        + Object.entries(byRole).map(([role, people]) =>
            `<div class="panel-body" style="padding-bottom:6px">
              <div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">${esc(role)} · ${people.length}</div>
            </div>`
            + people.map(e => `<div class="salon-row">
                <span class="id"><b>${esc(e.name)}</b><span>${esc(e.email ?? '')} · depuis ${esc(e.since ?? '—')}</span></span>
                ${statusChip(e.status)}
                <span class="acts"><button class="rm" data-crm-del="employees" data-id="${esc(e.id)}">Retirer</button></span>
              </div>`).join('')
          ).join('')
        + '</div>'
        + (invites.length
            ? `<div class="panel" style="margin-top:14px">${head('Invitations en cours', 'Codes à transmettre pour rejoindre l’agence.')}`
              + invites.map(i => `<div class="salon-row">
                  <span class="id"><b style="font-family:var(--font-mono)">${esc(i.code)}</b><span>${esc(i.role ?? '')} · créé ${esc(i.created ?? '')}</span></span>
                  <span class="chip">${esc(i.uses ?? 0)} utilisation(s)</span></div>`).join('')
              + '</div>'
            : '')
    },
  }

  // ── Banque ─────────────────────────────────────────────────────────────────
  const bank = {
    title: 'Banque',
    render(ctx) {
      const all = ctx.get('bank')
      const folders = all.filter(b => b.kind === 'folder' && !b.parent)
      if (!folders.length) return `<div class="panel">${head('Banque', 'Les contenus prêts à publier.')}${empty('Banque vide', 'Les dossiers de contenu apparaîtront ici.')}</div>`

      return `<div class="panel">${head('Banque de contenu', `${folders.length} dossiers`)}</div>`
        + '<div class="favs" style="margin-top:14px">'
        + folders.map(f => {
            const items = all.filter(b => b.parent === f.id)
            const medias = items.filter(b => b.kind !== 'folder')
            return `<article class="fav">
              <div class="fav-thumb" style="background:repeating-linear-gradient(115deg,var(--surface-2) 0 9px,var(--surface) 9px 18px)"></div>
              <div class="fav-body">
                <div class="fav-name">${esc(f.name)}</div>
                <div class="fav-line"><span>${medias.length} fichier${medias.length > 1 ? 's' : ''}</span></div>
                ${medias.slice(0, 4).map(m => `<div class="fav-mm">${esc(m.name ?? '')}</div>`).join('')}
              </div></article>`
          }).join('')
        + '</div>'
    },
  }

  // ── Écrans de référence, encore en lecture seule ───────────────────────────
  const simpleList = (title, sub, collection, line) => ({
    title,
    render(ctx) {
      const list = ctx.get(collection)
      return `<div class="panel">${head(title, sub)}`
        + (list.length ? list.map(line).join('') : empty('Rien ici', 'Cette liste est vide.'))
        + '</div>'
    },
  })

  const sop = simpleList('SOP', 'Les procédures de l’agence.', 'sops', s =>
    `<div class="salon-row"><span class="id"><b>${esc(s.title)}</b><span>${esc(s.cat ?? '')} · ${esc(s.duration ?? '')} · ${esc(s.who ?? '')}</span></span>
     <span class="chip">${esc(s.updated ?? '')}</span></div>`)

  const inspo = simpleList('Inspiration', 'Comptes suivis pour leurs idées.', 'inspos', i =>
    `<div class="salon-row"><span class="id"><b>${esc(i.handle)}</b><span>${esc(i.niche ?? '')} · ${esc(i.followers ?? '')}</span></span>
     <span class="tags">${(i.tags ?? []).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</span></div>`)

  const links = simpleList('Operate link', 'Les liens de travail partagés.', 'opLinks', l =>
    `<div class="salon-row"><span class="id"><b>${esc(l.name)}</b><span style="font-family:var(--font-mono)">${esc(l.url ?? '')}</span></span>
     <span class="chip">${esc(l.type ?? '')}</span></div>`)

  const shift = simpleList('Shift report', 'Les comptes rendus de fin de poste.', 'shiftReports', r =>
    `<div class="salon-row"><span class="id"><b>${esc(r.name ?? r.who ?? '—')}</b><span>${esc(r.summary ?? r.note ?? '')}</span></span>
     <span class="chip">${esc(r.date ?? r.when ?? '')}</span></div>`)

  window.CRM = {
    views: { home, creators, accounts, daily, team, bank, sop, inspo, links, shift },

    /** Branche les interactions communes à tous les écrans. */
    bind(root, ctx) {
      root.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => ctx.goto(b.dataset.goto))

      root.querySelectorAll('[data-crm-del]').forEach(b => b.onclick = async () => {
        const name = b.dataset.crmDel
        if (!confirm('Retirer cette entrée ? Elle disparaît de la liste.')) return
        b.disabled = true
        await ctx.remove(name, b.dataset.id)
      })

      root.querySelectorAll('[data-crm-add]').forEach(b => b.onclick = async () => {
        const name = b.dataset.crmAdd
        const label = name === 'creators' ? 'Nom de la créatrice'
          : name === 'accounts' ? 'Identifiant du compte (@…)'
          : 'Nom'
        const value = prompt(label)
        if (!value?.trim()) return
        const row = name === 'accounts'
          ? { handle: value.trim(), network: 'Instagram', status: 'Actif' }
          : { name: value.trim(), status: 'Actif' }
        await ctx.put(name, row)
      })

      root.querySelectorAll('[data-seq-send]').forEach(b => b.onclick = async () => {
        b.disabled = true
        await ctx.put('seqs', { id: b.dataset.seqSend, sent: true })
      })
    },
  }
})()
