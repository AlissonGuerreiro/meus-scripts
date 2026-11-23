// ==UserScript==
// @name         Projeto Retrabalho TESTE
// @namespace    https://erp.osirnet.com.br/
// @version      2.0.0-teste.8
// @description  [TESTE] Registrar retrabalhos no ERP Osirnet (Técnico x Relacionamento)
// @author       Alisson Guerreiro
// @match        https://erp.osirnet.com.br/ui/*
// @match        https://erp.osirnet.com.br/attendance*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/projeto-retrabalho-teste.user.js
// @updateURL    https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/projeto-retrabalho-teste.user.js
// ==/UserScript==

/*
  VERSÃO DE TESTE — aponta para a planilha "Retrabalho TESTE".
  Atualiza sozinho pelo GitHub (arquivo separado do oficial: não pega a versão oficial).
  Não deixe ligado junto com o "Projeto Retrabalho" oficial (os dois criariam botão).

  O QUE MUDOU NA 2.0
  - A lista de tipos vem do SERVIDOR (não fica mais diferente da planilha).
    Tipos agrupados em "Retrabalho Técnico" e "Retrabalho Relacionamento".
  - Novo campo TÉCNICO (vem do ERP: quem fez o atendimento em campo).
  - Cliente e técnico vêm pela API do ERP (usa o que o Assistente de Chamado já
    captura). Se o Assistente não estiver ligado, cai no jeito antigo (tela).
  - O Assistente pode abrir este formulário JÁ PREENCHIDO
    (evento "osir:registrar-retrabalho").
  - Aviso de "já enviado" agora é por PROTOCOLO + TIPO.
  - Mais leve: confere a tela a cada 2 s e nas mudanças (antes era 0,75 s + mudanças).
  - @grant none (antes GM_addStyle): roda na página, conversa direto com o Assistente.
  - PENDÊNCIA AUTOMÁTICA: quando o Assistente avisa que uma pendência foi criada
    (evento "osir:registrar-retrabalho-auto"), grava DIRETO na planilha, sem formulário.
    O servidor não grava a mesma pendência duas vezes (coluna P).
    Se faltar algum dado obrigatório, abre o formulário preenchido.
*/

(function () {
  'use strict';

  if (window.top !== window.self) return;

  // ============================================================
  // 1. CONFIGURAÇÃO
  // ============================================================
  const API_URL = 'https://script.google.com/macros/s/AKfycbxmBVTRZXNPKGPrmwtalWKXnd9wvy75PB_Mpo50kV6og64WZlOq0Zq5MabJoFsZOrCE/exec';
  const API_TOKEN = 'ddc8394b-7d80-489e-8ba1-c665d78ded3b';
  const VERSAO_SCRIPT = '2.0.0-teste.8';

  // ===== ESPELHO NA PLANILHA OFICIAL (até o dia 30) =====
  // Cada registro feito pelo formulário vai para a planilha de TESTE (completa, colunas L–P)
  // E TAMBÉM para a OFICIAL (A–K, igual ao script antigo) -> os indicadores atuais continuam.
  // A oficial ignora os campos novos. No dia 1, isto sai (o script oficial vira este).
  const ESPELHAR_OFICIAL = true;
  const API_URL_OFICIAL = 'https://script.google.com/macros/s/AKfycbwbzUOFp8iZkM1Rq04LPnEPWiL3_ixgZAP4N3Ugs-FLOG22FIoiYB1P2vbxe5TzjjU1uQ/exec';
  // Pendência (gravada sozinha ou pelo 📝 do cartão) não entra na oficial
  // (hoje pendência não conta no indicador).
  // Mude para true se a gestão quiser que conte já.
  const ESPELHAR_PENDENCIA_AUTO = false;

  // Usada só se o servidor não responder E não houver lista guardada.
  // A lista oficial fica no Code.gs (TIPOS).
  const TIPOS_RESERVA = [
    { nome: 'Provisionamento',      resp: 'Técnico', desc: 'O técnico provisionou, mas desprovisionou ao sair. Ou, no encerramento, ainda faltava provisionar.' },
    { nome: 'Instalação',           resp: 'Técnico', desc: 'Algo da instalação fora do padrão (inclui falta de fotos, conforme o relato).' },
    { nome: 'Sinal',                resp: 'Técnico', desc: 'Sinal fora do padrão no encerramento (-13 a -25 dBm).' },
    { nome: 'Material/Equipamento', resp: 'Técnico', desc: 'Equipamento ou material não alocado, alocado errado, ou antigo não removido da carga.' },
    { nome: 'Chip',                 resp: 'Técnico', desc: 'Técnico não levou o chip, ou não levou a quantidade correta.' },
    { nome: 'Wifi-Pro',             resp: 'Técnico', desc: 'O técnico fez a instalação, mas não fez o mesh.' },
    { nome: 'Técnico',              resp: 'Técnico', desc: 'Técnico com dificuldade em algum procedimento básico.' },
    { nome: 'Terceiros',            resp: 'Técnico', desc: 'Problema gerado pela terceirizada.' },
    { nome: 'Suporte',              resp: 'Relacionamento', desc: 'Suporte abriu OS sem necessidade (ex.: cliente com bloqueio) ou deletou equipamento para arrumar LOS, etc.' },
    { nome: 'Etiqueta',             resp: 'Relacionamento', desc: 'Etiquetas abertas erradas, ou para contratos sem conexão.' }
  ];

  const LIMITES_RESERVA = { cliente: 120, protocolo: 30, categoria: 120, relato: 2000, usuario: 120, tecnico: 120 };

  const TIMEOUT_ENVIO_MS = 20000;
  const CICLO_MS = 2000;
  const NAVBAR_ID = 'navbar-menu-buttons';
  const DISTANCIA_DO_STEPPER = 300;

  const CHAVE_CONFIG = 'rt_config_v2';           // localStorage: lista de tipos guardada
  const CHAVE_ENVIADOS = 'rt_enviados_v2';       // sessionStorage: protocolo|tipo já enviados

  // ============================================================
  // 2. UTILITÁRIOS
  // ============================================================
  function logar(...args) {
    console.log('%c[Retrabalho]', 'color:#1c2064;font-weight:bold;', ...args);
  }

  function agora() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function escaparHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function textoDeHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html || '').replace(/<\/p>|<br\s*\/?>/gi, '\n');
    return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  function detectarModo() {
    if (location.pathname.startsWith('/attendance')) return 'attendance';
    if (location.pathname.startsWith('/ui/')) return 'ui';
    return 'desconhecido';
  }

  // ---- já enviado (protocolo + tipo) ----
  function chaveEnvio(protocolo, tipo) { return protocolo + '|' + tipo; }

  function jaEnviou(protocolo, tipo) {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_ENVIADOS) || '[]').indexOf(chaveEnvio(protocolo, tipo)) !== -1;
    } catch (e) { return false; }
  }

  function marcarEnviado(protocolo, tipo) {
    try {
      const l = JSON.parse(sessionStorage.getItem(CHAVE_ENVIADOS) || '[]');
      const k = chaveEnvio(protocolo, tipo);
      if (l.indexOf(k) === -1) l.push(k);
      sessionStorage.setItem(CHAVE_ENVIADOS, JSON.stringify(l));
    } catch (e) { /* ignora */ }
  }

  // ============================================================
  // 3. CONFIGURAÇÃO VINDA DO SERVIDOR (lista de tipos)
  // ============================================================
  let CONFIG = carregarConfigGuardada();

  function carregarConfigGuardada() {
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE_CONFIG) || 'null');
      if (c && Array.isArray(c.tipos) && c.tipos.length) return c;
    } catch (e) { /* ignora */ }
    return { tipos: TIPOS_RESERVA, limites: LIMITES_RESERVA, origem: 'reserva' };
  }

  function atualizarConfig() {
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: API_TOKEN, acao: 'config' })
    })
      .then(r => r.json())
      .then(resp => {
        if (resp && resp.success && resp.config && Array.isArray(resp.config.tipos) && resp.config.tipos.length) {
          CONFIG = { tipos: resp.config.tipos, limites: Object.assign({}, LIMITES_RESERVA, resp.config.limites || {}), origem: 'servidor' };
          try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(CONFIG)); } catch (e) { /* ignora */ }
          logar('Tipos atualizados do servidor:', CONFIG.tipos.map(t => t.nome).join(', '));
        }
      })
      .catch(e => logar('Não consegui buscar os tipos (usando os guardados):', e));
  }

  function lim(campo) { return (CONFIG.limites && CONFIG.limites[campo]) || LIMITES_RESERVA[campo] || 200; }
  function descDoTipo(nome) { const t = CONFIG.tipos.find(x => x.nome === nome); return t ? t.desc : ''; }

  // ============================================================
  // 4. DOCUMENTOS (página + iframes)
  // ============================================================
  function coletarDocumentos() {
    const docs = [document];
    const vistos = new Set([document]);
    (function varrer(doc) {
      let ifr;
      try { ifr = doc.querySelectorAll('iframe'); } catch (e) { return; }
      ifr.forEach(f => {
        try {
          const d = f.contentDocument;
          if (d && !vistos.has(d)) { vistos.add(d); docs.push(d); varrer(d); }
        } catch (e) { /* outro site */ }
      });
    })(document);
    return docs;
  }

  // Iframe do cliente que está NA TELA (ignora abas escondidas)
  function iframeNaTela() {
    for (const f of document.querySelectorAll('iframe')) {
      try {
        if (f.offsetParent === null) continue;
        if (/customer-attendance\/\d+/i.test(String(f.contentWindow.location.hash))) return f;
      } catch (e) { /* ignora */ }
    }
    return null;
  }

  function docNaTela() {
    const f = iframeNaTela();
    try { return f ? f.contentDocument : document; } catch (e) { return document; }
  }

  // ============================================================
  // 5. CAPTURA PELA TELA (reserva, igual à 1.x)
  // ============================================================
  function capturarRotuloLink(doc, rotulo) {
    for (const sp of doc.querySelectorAll('span.MuiTypography-root')) {
      if (sp.textContent.trim() !== rotulo || sp.offsetParent === null) continue;
      const a = sp.nextElementSibling;
      if (a && a.tagName === 'A' && a.textContent.trim()) return a.textContent.trim();
    }
    return '';
  }

  function capturarUsuario() {
    for (const doc of coletarDocumentos()) {
      try {
        const el = doc.querySelector('p.username[aria-label]');
        if (el && el.getAttribute('aria-label').trim()) return el.getAttribute('aria-label').trim();
        for (const p of doc.querySelectorAll('p.MuiTypography-root')) {
          if (p.textContent.trim() !== 'Atendente' || p.offsetParent === null) continue;
          const cont = p.parentElement && p.parentElement.parentElement;
          if (!cont) continue;
          for (const v of cont.querySelectorAll('p.MuiTypography-root.MuiTypography-body1.MuiTypography-colorPrimary')) {
            const t = v.textContent.trim();
            if (t && t !== 'Atendente') return t;
          }
        }
      } catch (e) { /* ignora */ }
    }
    return '';
  }

  function capturarTela() {
    const doc = docNaTela();
    const docs = [doc].concat(coletarDocumentos().filter(d => d !== doc));
    const pegar = fn => { for (const d of docs) { try { const v = fn(d); if (v) return v; } catch (e) { /* ignora */ } } return ''; };
    const f = iframeNaTela();
    let protocolo = '';
    try { protocolo = (String(f && f.contentWindow.location.hash).match(/customer-attendance\/(\d+)/i) || [])[1] || ''; } catch (e) { /* ignora */ }
    return {
      usuario:   capturarUsuario(),
      protocolo: protocolo || pegar(d => capturarRotuloLink(d, 'Protocolo')),
      cliente:   pegar(d => capturarRotuloLink(d, 'Cliente')),
      categoria: pegar(d => { const el = d.querySelector('#serviceCategoryId1') || d.querySelector('input[name="serviceCategoryId1"]'); return el ? el.value.trim() : ''; })
    };
  }

  // ============================================================
  // 6. CAPTURA PELA API DO ERP (usa o que o Assistente guardou)
  // ============================================================
  function apiDoAssistente() {
    const c = window.__OSIR_API;
    return (c && c.apiBase && c.headers) ? c : null;
  }

  async function getApi(caminho) {
    const c = apiDoAssistente();
    if (!c) throw new Error('sem API');
    const r = await fetch(c.apiBase + caminho, { headers: c.headers, __osirProprio: true });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || !j.success) throw new Error('resposta sem sucesso');
    return j.response;
  }

  // Técnico = quem ENCAMINHOU a OS para o COP Encerramentos (com ou sem GPS).
  // Reserva: o atendimento mais recente com GPS.
  // Time sem "CCO" = terceirizada: o nome vai como "Fulano (ARCA TELECOM)".
  function acharTecnico(reports) {
    const lista = (reports || []).filter(r => r && r.person);
    const recente = (a, b) => String(b.finalDate || b.beginningDate).localeCompare(String(a.finalDate || a.beginningDate));
    let v = lista.filter(r => r.destinationTeam && /cop encerramento/i.test(r.destinationTeam.name || '') && r.team && !/cop encerramento/i.test(r.team.name || '')).sort(recente)[0];
    if (!v) v = lista.filter(r => r.beginningGeopositionLatitude != null).sort(recente)[0];
    if (!v) return null;
    const time = (v.team && v.team.name) || '';
    const empresa = time && !/^\s*CCO\b/i.test(time) ? time.replace(/^\s*COP\s+/i, '').trim() : '';
    return { nome: v.person.name + (empresa ? ' (' + empresa + ')' : ''), relato: textoDeHtml(v.description) };
  }

  // Devolve { cliente, tecnico, relatoTecnico, os } ou campos vazios
  async function capturarApi(protocolo) {
    const out = { cliente: '', tecnico: '', relatoTecnico: '', os: '' };
    const c = apiDoAssistente();
    if (!c || !protocolo) return out;
    const os = c.mapaOS && c.mapaOS[protocolo];
    if (!os) return out;
    out.os = String(os);
    const [info, rep] = await Promise.allSettled([
      getApi('/api/v1/ServiceDesk/AssignmentIncidents/GetSolicitationInformations?assignmentId=' + encodeURIComponent(os)),
      getApi('/api/v1/Projects/Attendance/GetAssignmetReports?assignmentId=' + encodeURIComponent(os))
    ]);
    if (info.status === 'fulfilled' && info.value && info.value.client) {
      out.cliente = info.value.client.name2 || info.value.client.name || '';
    }
    if (rep.status === 'fulfilled' && rep.value) {
      const t = acharTecnico(rep.value.reports);
      if (t) { out.tecnico = t.nome; out.relatoTecnico = t.relato; }
    }
    return out;
  }

  // ============================================================
  // 7. CSS
  // ============================================================
  const CSS = `
    #rt-btn-flutuante {
      position: fixed;
      z-index: 9998;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 40px;
      padding: 0 14px;
      border: none;
      background: #f6b706;
      color: #1c2064;
      font-family: Roboto, Arial, sans-serif;
      font-size: 12px;
      font-weight: 700;
      gap: 7px;
      cursor: pointer;
      white-space: nowrap;
      transition: background .15s, box-shadow .15s;
      box-shadow: 0 2px 6px rgba(0,0,0,.25);
      border-radius: 4px;
    }

    #rt-btn-flutuante .rt-btn-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      color: inherit;
      stroke: currentColor;
    }

    #rt-btn-flutuante:hover {
      background: #FFC72B;
      box-shadow: 0 4px 10px rgba(0,0,0,.35);
    }

    /* Modo navbar (ERP antigo): herda o comportamento inline-flex sem position fixed */
    #rt-btn-flutuante.rt-modo-navbar {
      position: static;
      height: 50px;
      border-radius: 0;
      box-shadow: 0 1px 3px rgba(0,0,0,.2);
      margin-right: 12px;
    }

    #rt-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      background: rgba(0,0,0,.45);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Roboto, Arial, sans-serif;
    }

    #rt-modal {
      all: initial;
      font-family: Roboto, Arial, sans-serif;
      background: #fff;
      color: #222;
      border-radius: 10px;
      width: 560px;
      max-width: 95vw;
      max-height: 92vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,.4);
      display: block;
    }

    #rt-modal * { box-sizing: border-box; }

    .rt-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid #eee;
    }
    .rt-header h2 { font-size: 16px; font-weight: 700; margin: 0; color: #222; }
    .rt-close {
      background: none; border: none; font-size: 22px; font-weight: 700;
      cursor: pointer; color: #888; line-height: 1; padding: 0 4px;
    }
    .rt-close:hover { color: #333; }

    .rt-body { padding: 18px 20px; display: grid; gap: 14px; }
    .rt-row { display: grid; gap: 14px; }
    .rt-row-2 { grid-template-columns: 1fr 1fr; }

    .rt-field label {
      display: block; font-size: 12px; font-weight: 600;
      color: #555; margin-bottom: 4px;
      text-transform: uppercase; letter-spacing: .3px;
    }
    .rt-field input,
    .rt-field select,
    .rt-field textarea {
      width: 100%; padding: 9px 10px;
      border: 1px solid #ccc; border-radius: 6px;
      font-size: 14px; font-family: inherit; color: #222;
      background: #fff; outline: none; transition: border-color .15s;
    }
    .rt-field input:focus,
    .rt-field select:focus,
    .rt-field textarea:focus { border-color: #f6b706; }
    .rt-field input[readonly] { background: #f5f5f5; color: #666; cursor: not-allowed; }
    .rt-field.rt-falha input { border-color: #e6a700; background: #fffbe6; }
    .rt-field textarea { min-height: 110px; resize: vertical; }
    .rt-aviso { font-size: 11px; color: #b07b00; margin-top: 3px; }
    .rt-contador { font-size: 11px; color: #888; margin-top: 3px; text-align: right; }
    .rt-contador.rt-limite { color: #c62828; font-weight: 700; }

    .rt-dica {
      font-size: 12px; color: #444; background: #f7f7f7;
      border-left: 3px solid #f6b706; border-radius: 4px;
      padding: 8px 10px; margin-top: 6px; line-height: 1.4;
    }
    .rt-dica.rt-dica-vazia { color: #888; border-left-color: #ddd; }
    .rt-lista-tipos { margin-top: 6px; font-size: 12px; color: #444; }
    .rt-lista-tipos summary { cursor: pointer; color: #1c2064; font-weight: 600; }
    .rt-lista-tipos ul { margin: 6px 0 0; padding-left: 18px; }
    .rt-lista-tipos li { margin-bottom: 4px; line-height: 1.4; }

    /* A caixa inteira é um <label>: clicar em qualquer lugar marca/desmarca */
    .rt-checkbox {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 14px; border: 1px solid #e0e0e0;
      border-radius: 8px; background: #fafafa;
      cursor: pointer; user-select: none;
      transition: background .15s, border-color .15s;
    }
    .rt-checkbox:hover { background: #f2f2f2; border-color: #ccc; }
    .rt-checkbox input[type="checkbox"] {
      width: 18px; height: 18px; cursor: pointer;
      accent-color: #f6b706; margin: 0; flex-shrink: 0;
    }
    .rt-checkbox span {
      font-size: 14px; font-weight: 500; color: #333;
    }

    .rt-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 14px 20px; border-top: 1px solid #eee;
    }
    .rt-btn {
      padding: 9px 18px; border-radius: 6px; border: none;
      font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
    }
    .rt-btn-cancelar { background: #eee; color: #333; }
    .rt-btn-cancelar:hover { background: #ddd; }
    .rt-btn-enviar { background: #f6b706; color: #1c2064; }
    .rt-btn-enviar:hover { background: #FFC72B; color: #1c2064; }
    .rt-btn-enviar:disabled { background: #bbb; color: #666; cursor: not-allowed; }

    #rt-toast {
      position: fixed; bottom: 100px; right: 25px;
      z-index: 2147483001;
      padding: 12px 18px; border-radius: 8px;
      font-family: Roboto, Arial, sans-serif;
      font-size: 14px; color: #fff;
      box-shadow: 0 6px 18px rgba(0,0,0,.3);
      opacity: 0; transform: translateY(10px);
      transition: opacity .25s, transform .25s;
      pointer-events: none;
    }
    #rt-toast.rt-show { opacity: 1; transform: translateY(0); }
    #rt-toast.rt-ok { background: #2e7d32; }
    #rt-toast.rt-info { background: #1c2064; }
    #rt-toast.rt-erro { background: #c62828; }
    .rt-row-3 { grid-template-columns: 1fr 1fr; }
    .rt-resp { display:inline-block; font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; margin-left:6px; vertical-align:middle; }
    .rt-resp-tec { background:#e3f2fd; color:#0d47a1; }
    .rt-resp-sup { background:#f3e5f5; color:#4a148c; }
    .rt-sugestao { font-size:12px; background:#e8f5e9; color:#1b5e20; border-left:3px solid #43a047; border-radius:4px; padding:8px 10px; }
    .rt-carregando { font-size:11px; color:#888; margin-top:3px; }
  `;

  function instalarCss() {
    if (document.getElementById('rt-css')) return;
    const st = document.createElement('style');
    st.id = 'rt-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // ============================================================
  // 8. BOTÃO (igual à 1.x)
  // ============================================================
  function elementoEstaAtivo(el) {
    if (!el || !el.isConnected || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    try {
      const est = el.ownerDocument.defaultView.getComputedStyle(el);
      if (est.display === 'none' || est.visibility === 'hidden' || est.visibility === 'collapse') return false;
      if (parseFloat(est.opacity || '1') === 0) return false;
      return el.getClientRects().length > 0;
    } catch (e) { return false; }
  }

  function possuiPresentationAtiva() {
    for (const doc of coletarDocumentos()) {
      try {
        for (const el of doc.querySelectorAll('div[role="presentation"]')) if (elementoEstaAtivo(el)) return true;
      } catch (e) { /* ignora */ }
    }
    return false;
  }

  function removerBotao() {
    const b = document.getElementById('rt-btn-flutuante');
    if (b) b.remove();
  }

  function criarBotao() {
    let btn = document.getElementById('rt-btn-flutuante');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'rt-btn-flutuante';
      btn.type = 'button';
      btn.innerHTML = `
        <svg class="rt-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>Registrar Retrabalho</span>`;
      btn.addEventListener('click', () => abrirModal());
    }
    return btn;
  }

  function injetarNaNavbar() {
    const navbar = document.getElementById(NAVBAR_ID);
    if (!possuiPresentationAtiva() || !navbar) { removerBotao(); return false; }
    const btn = criarBotao();
    btn.classList.add('rt-modo-navbar');
    if (btn.parentElement !== navbar) navbar.insertBefore(btn, navbar.firstChild);
    return true;
  }

  function acharStepper() {
    for (const doc of coletarDocumentos()) {
      try {
        for (const sp of doc.querySelectorAll('span')) {
          if (sp.textContent.trim() !== 'Dados Iniciais' || sp.offsetParent === null) continue;
          let el = sp;
          while (el && !(el.classList && el.classList.contains('MuiStepper-root'))) el = el.parentElement;
          if (el) return el;
        }
      } catch (e) { /* ignora */ }
    }
    return null;
  }

  function posicionarBotaoFlutuante() {
    const btn = document.getElementById('rt-btn-flutuante');
    if (!btn || btn.classList.contains('rt-modo-navbar')) return;
    const stepper = acharStepper();
    if (!stepper) return;
    const r = stepper.getBoundingClientRect();
    const h = btn.offsetHeight || 40, w = btn.offsetWidth || 160;
    btn.style.position = 'fixed';
    btn.style.top = (r.top + (r.height - h) / 2) + 'px';
    btn.style.left = Math.max(8, r.left - w - DISTANCIA_DO_STEPPER) + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  }

  function injetarNaBarraAtendimento() {
    if (!acharStepper()) { removerBotao(); return false; }
    const btn = criarBotao();
    btn.classList.remove('rt-modo-navbar');
    if (btn.parentElement !== document.body) document.body.appendChild(btn);
    requestAnimationFrame(posicionarBotaoFlutuante);
    return true;
  }

  function injetar() {
    const modo = detectarModo();
    if (modo === 'ui') return injetarNaNavbar();
    if (modo === 'attendance') return injetarNaBarraAtendimento();
    removerBotao();
    return false;
  }

  // ============================================================
  // 9. MODAL
  // ============================================================
  function opcoesTipos(selecionado) {
    const relac = r => r === 'Relacionamento' || r === 'Suporte';   // 'Suporte' = nome antigo
    const grupo = resp => CONFIG.tipos.filter(t => resp === 'Relacionamento' ? relac(t.resp) : t.resp === resp)
      .map(t => `<option value="${escaparHtml(t.nome)}" title="${escaparHtml(t.desc)}"${t.nome === selecionado ? ' selected' : ''}>${escaparHtml(t.nome)}</option>`).join('');
    const outros = CONFIG.tipos.filter(t => t.resp !== 'Técnico' && !relac(t.resp));
    return `<option value="">Selecione...</option>
      <optgroup label="Retrabalho Técnico">${grupo('Técnico')}</optgroup>
      <optgroup label="Retrabalho Relacionamento">${grupo('Relacionamento')}</optgroup>` +
      (outros.length ? `<optgroup label="Outros">${outros.map(t => `<option value="${escaparHtml(t.nome)}">${escaparHtml(t.nome)}</option>`).join('')}</optgroup>` : '');
  }

  function respDoTipo(nome) {
    const t = CONFIG.tipos.find(x => x.nome === nome);
    return t ? (t.resp === 'Suporte' ? 'Relacionamento' : t.resp) : '';
  }

  function campoFalha(id, temValor, aviso) {
    const f = document.querySelector(`#rt-modal [data-campo="${id}"]`);
    if (!f) return;
    f.classList.toggle('rt-falha', !temValor);
    const a = f.querySelector('.rt-aviso');
    if (a) a.style.display = temValor ? 'none' : '';
    if (!temValor && a && aviso) a.textContent = aviso;
  }

  /**
   * prefill (opcional), vindo do Assistente:
   *   { tipo, relato, sugestao: 'aviso'|'regra', motivo }
   */
  function abrirModal(prefill) {
    if (document.getElementById('rt-overlay')) return;
    prefill = prefill || {};

    const cap = capturarTela();
    const modo = detectarModo();
    const usuarioReadonly = cap.usuario && modo === 'ui';

    const overlay = document.createElement('div');
    overlay.id = 'rt-overlay';
    const modal = document.createElement('div');
    modal.id = 'rt-modal';
    modal.dataset.sugestao = prefill.sugestao || 'manual';
    modal.dataset.os = '';
    modal.dataset.pendencia = /^\d+$/.test(String(prefill.pendencia || '')) ? String(prefill.pendencia) : '';

    const tipoIni = prefill.tipo && respDoTipo(prefill.tipo) ? prefill.tipo : '';
    const relatoIni = String(prefill.relato || '').slice(0, lim('relato'));

    modal.innerHTML = `
      <div class="rt-header">
        <h2>Registrar Retrabalho <span style="font-size:11px;color:#c62828">[TESTE]</span></h2>
        <button class="rt-close" type="button" aria-label="Fechar">✕</button>
      </div>
      <div class="rt-body">
        ${prefill.motivo ? `<div class="rt-sugestao">💡 Sugestão do Assistente: ${escaparHtml(prefill.motivo)}<br><small>Confira os dados antes de enviar.</small></div>` : ''}
        <div class="rt-row rt-row-2">
          <div class="rt-field" data-campo="protocolo">
            <label for="rt-protocolo">Protocolo *</label>
            <input id="rt-protocolo" type="text" maxlength="${lim('protocolo')}" value="${escaparHtml(cap.protocolo)}" placeholder="Digite o protocolo">
            <div class="rt-aviso">⚠ Não capturado — preencha manualmente</div>
          </div>
          <div class="rt-field" data-campo="categoria">
            <label for="rt-categoria">Categoria ERP</label>
            <input id="rt-categoria" type="text" maxlength="${lim('categoria')}" value="${escaparHtml(cap.categoria)}" placeholder="Ex.: Fibra - Manutenção">
            <div class="rt-aviso">⚠ Não capturado — preencha se aplicável</div>
          </div>
        </div>
        <div class="rt-field" data-campo="cliente">
          <label for="rt-cliente">Cliente *</label>
          <input id="rt-cliente" type="text" maxlength="${lim('cliente')}" value="${escaparHtml(cap.cliente)}" placeholder="Nome do cliente">
          <div class="rt-aviso">⚠ Não capturado — preencha manualmente</div>
        </div>
        <div class="rt-row rt-row-2">
          <div class="rt-field" data-campo="usuario">
            <label for="rt-usuario">Atendente (você)</label>
            <input id="rt-usuario" type="text" maxlength="${lim('usuario')}" value="${escaparHtml(cap.usuario)}" placeholder="Seu nome" ${usuarioReadonly ? 'readonly' : ''}>
            <div class="rt-aviso">⚠ Não capturado — preencha</div>
          </div>
          <div class="rt-field" data-campo="tecnico">
            <label for="rt-tecnico">Técnico da OS</label>
            <input id="rt-tecnico" type="text" maxlength="${lim('tecnico')}" value="" placeholder="Buscando no ERP...">
            <div class="rt-carregando" id="rt-tecnico-info">Buscando no ERP...</div>
          </div>
        </div>
        <div class="rt-row rt-row-2">
          <div class="rt-field">
            <label for="rt-datahora">Data/Hora</label>
            <input id="rt-datahora" type="text" value="${escaparHtml(agora())}" readonly>
          </div>
          <label class="rt-checkbox" for="rt-devolvido" style="align-self:end">
            <input id="rt-devolvido" type="checkbox">
            <span>Protocolo foi devolvido?</span>
          </label>
        </div>
        <div class="rt-field">
          <label for="rt-tipo">Tipo de retrabalho * <span id="rt-resp-tag"></span></label>
          <select id="rt-tipo">${opcoesTipos(tipoIni)}</select>
          <div class="rt-dica rt-dica-vazia" id="rt-dica-tipo">Escolha um tipo para ver o que ele significa.</div>
          <details class="rt-lista-tipos">
            <summary>Ver o que cada tipo significa</summary>
            <ul>${CONFIG.tipos.map(t => `<li><b>${escaparHtml(t.nome)}</b> (${escaparHtml(t.resp)}): ${escaparHtml(t.desc)}</li>`).join('')}</ul>
          </details>
        </div>
        <div class="rt-field">
          <label for="rt-relato">Relato *</label>
          <textarea id="rt-relato" maxlength="${lim('relato')}" placeholder="Descreva o retrabalho...">${escaparHtml(relatoIni)}</textarea>
          <div class="rt-contador" id="rt-contador">${relatoIni.length} / ${lim('relato')}</div>
        </div>
      </div>
      <div class="rt-footer">
        <button class="rt-btn rt-btn-cancelar" type="button">Cancelar</button>
        <button class="rt-btn rt-btn-enviar" type="button">Enviar</button>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    campoFalha('protocolo', !!cap.protocolo);
    campoFalha('categoria', !!cap.categoria);
    campoFalha('cliente', !!cap.cliente);
    campoFalha('usuario', !!cap.usuario);

    modal.querySelector('.rt-close').addEventListener('click', fecharModal);
    modal.querySelector('.rt-btn-cancelar').addEventListener('click', fecharModal);
    modal.querySelector('.rt-btn-enviar').addEventListener('click', enviar);

    const relatoEl = modal.querySelector('#rt-relato');
    const contEl = modal.querySelector('#rt-contador');
    relatoEl.addEventListener('input', () => {
      const n = relatoEl.value.length;
      contEl.textContent = n + ' / ' + lim('relato');
      contEl.classList.toggle('rt-limite', n >= lim('relato'));
    });

    const tipoEl = modal.querySelector('#rt-tipo');
    const dicaEl = modal.querySelector('#rt-dica-tipo');
    const tagEl = modal.querySelector('#rt-resp-tag');
    const mostrarTipo = () => {
      const desc = descDoTipo(tipoEl.value);
      dicaEl.textContent = desc || 'Escolha um tipo para ver o que ele significa.';
      dicaEl.classList.toggle('rt-dica-vazia', !desc);
      let r = respDoTipo(tipoEl.value);
      const tecV = (document.getElementById('rt-tecnico') || {}).value || '';
      if (/\(([^)]+)\)\s*$/.test(tecV) && (tipoEl.value === 'Wifi-Pro' || tipoEl.value === 'Chip')) r = 'Relacionamento';
      tagEl.innerHTML = r ? `<span class="rt-resp ${r === 'Relacionamento' ? 'rt-resp-sup' : 'rt-resp-tec'}">Retrabalho ${escaparHtml(r)}</span>` : '';
    };
    tipoEl.addEventListener('change', mostrarTipo);
    mostrarTipo();

    overlay.addEventListener('click', ev => { if (ev.target === overlay) fecharModal(); });
    document.addEventListener('keydown', escutarEsc);

    // Completa com a API do ERP (cliente + técnico + nº da OS)
    capturarApi(cap.protocolo).then(api => {
      if (!document.getElementById('rt-modal')) return;
      const cli = document.getElementById('rt-cliente');
      const tec = document.getElementById('rt-tecnico');
      const info = document.getElementById('rt-tecnico-info');
      if (api.cliente && !cli.value.trim()) { cli.value = api.cliente; campoFalha('cliente', true); }
      if (api.tecnico && !tec.value.trim()) { tec.value = api.tecnico; tipoEl.dispatchEvent(new Event('change')); }
      tec.placeholder = 'Nome do técnico (se houver)';
      info.textContent = api.tecnico ? 'Vindo do ERP (atendimento em campo)'
        : apiDoAssistente() ? 'Não achei atendimento em campo nesta OS' : 'Assistente de Chamado desligado: preencha se souber';
      modal.dataset.os = api.os || '';
    }).catch(() => {
      const info = document.getElementById('rt-tecnico-info');
      if (info) info.textContent = 'Não consegui buscar no ERP: preencha se souber';
    });

    let foco = tipoIni ? 'rt-relato' : 'rt-tipo';
    if (!cap.protocolo) foco = 'rt-protocolo';
    else if (!cap.cliente && !apiDoAssistente()) foco = 'rt-cliente';
    setTimeout(() => { const el = document.getElementById(foco); if (el) el.focus(); }, 50);
  }

  function escutarEsc(ev) { if (ev.key === 'Escape') fecharModal(); }

  function fecharModal() {
    const o = document.getElementById('rt-overlay');
    if (o) o.remove();
    document.removeEventListener('keydown', escutarEsc);
  }

  // ============================================================
  // 10. ENVIO
  // ============================================================
  function enviar() {
    const modal = document.getElementById('rt-modal');
    const btn = modal.querySelector('.rt-btn-enviar');
    if (btn.disabled) return;

    const v = id => document.getElementById(id).value.trim();
    const protocolo = v('rt-protocolo');
    const cliente = v('rt-cliente');
    const usuario = v('rt-usuario');
    const tipo = document.getElementById('rt-tipo').value;
    const relato = v('rt-relato');

    const faltando = [];
    if (!protocolo) faltando.push('Protocolo');
    if (!cliente) faltando.push('Cliente');
    if (!usuario) faltando.push('Atendente');
    if (!tipo) faltando.push('Tipo de retrabalho');
    if (!relato) faltando.push('Relato');
    if (faltando.length) { mostrarToast('Preencha: ' + faltando.join(', '), 'erro'); return; }

    if (jaEnviou(protocolo, tipo)) {
      if (!window.confirm(`Já foi registrado "${tipo}" para o protocolo ${protocolo} nesta sessão.\n\nRegistrar de novo mesmo assim?`)) return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const payload = {
      token: API_TOKEN,
      usuario, cliente, protocolo,
      categoria: v('rt-categoria'),
      tipo, relato,
      devolvido: document.getElementById('rt-devolvido').checked ? 'Sim' : 'Não',
      origem: 'erp.osirnet.com.br/' + detectarModo(),
      versao: VERSAO_SCRIPT,
      tecnico: v('rt-tecnico'),
      sugestao: modal.dataset.sugestao || 'manual',
      os: modal.dataset.os || '',
      pendencia: modal.dataset.pendencia || ''
    };

    const liberar = () => { btn.disabled = false; btn.textContent = 'Enviar'; };

    // pendência (automática ou pelo 📝) só vai para a oficial se ESPELHAR_PENDENCIA_AUTO = true
    const vaiOficial = ESPELHAR_OFICIAL && !(payload.sugestao === 'pendencia' && !ESPELHAR_PENDENCIA_AUTO);
    Promise.all([
      postar(API_URL, payload),
      vaiOficial ? postar(API_URL_OFICIAL, payload) : Promise.resolve(null)
    ]).then(([teste, oficial]) => {
      // O que manda é a OFICIAL (alimenta o indicador). Teste é para conferir o script novo.
      const okTeste = teste.ok, okOficial = !vaiOficial || (oficial && oficial.ok);
      if (okOficial && (okTeste || vaiOficial)) {
        marcarEnviado(protocolo, tipo);
        const partes = [];
        if (vaiOficial) partes.push(oficial.dup ? `oficial já tinha (${oficial.id})` : `oficial ${oficial.id}`);
        partes.push(okTeste ? (teste.dup ? `teste já tinha ${tipo} neste protocolo (${teste.id})` : `teste ${teste.id}`) : 'teste FALHOU');
        mostrarToast(`✅ Registrado${teste.resp ? ' (Retrabalho ' + teste.resp + ')' : ''}: ${partes.join(' · ')}`, okTeste ? 'ok' : 'info');
        document.dispatchEvent(new CustomEvent('osir:retrabalho-enviado', { detail: JSON.stringify({ protocolo, tipo, id: teste.id || (oficial && oficial.id), pendencia: payload.pendencia }) }));
        fecharModal();
      } else if (!vaiOficial) {
        mostrarToast('❌ ' + (teste.msg || 'Erro desconhecido'), 'erro');
        liberar();
      } else {
        // oficial falhou: deixa o formulário aberto para tentar de novo
        // (reenviar não duplica: os dois servidores ignoram registro repetido em 10 min)
        mostrarToast('❌ Não gravou na planilha OFICIAL: ' + (oficial && oficial.msg || 'erro') +
          (okTeste ? ' (a de teste gravou). Clique em Enviar de novo.' : ''), 'erro');
        liberar();
      }
    });
  }

  // Envia para um servidor e devolve { ok, dup, id, resp, msg } (nunca dá erro)
  function postar(url, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_ENVIO_MS);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(resp => resp && resp.success
        ? { ok: true, dup: !!resp.duplicado, vinc: !!resp.vinculado, id: resp.id, resp: resp.responsavel || '', msgDup: resp.message || '' }
        : { ok: false, msg: (resp && resp.message) || 'erro desconhecido' })
      .catch(err => {
        console.error('[Retrabalho] Erro no envio para', url, err);
        return { ok: false, msg: err && err.name === 'AbortError' ? 'tempo esgotado (pode ter gravado, confira)' : 'falha de rede' };
      })
      .finally(() => clearTimeout(timer));
  }

  // ============================================================
  // 11. TOAST
  // ============================================================
  let toastTimer = null;
  function mostrarToast(msg, tipo) {
    let t = document.getElementById('rt-toast');
    if (!t) { t = document.createElement('div'); t.id = 'rt-toast'; document.body.appendChild(t); }
    const cls = tipo === 'ok' ? 'rt-ok' : tipo === 'info' ? 'rt-info' : 'rt-erro';
    t.className = 'rt-show ' + cls;
    t.textContent = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = cls; }, tipo === 'erro' ? 6000 : 3500);
  }

  // ============================================================
  // 12. CONVERSA COM O ASSISTENTE DE CHAMADO
  // ============================================================
  // O Assistente dispara:
  //   document.dispatchEvent(new CustomEvent('osir:registrar-retrabalho',
  //     { detail: JSON.stringify({ tipo, relato, sugestao, motivo }) }))
  document.addEventListener('osir:registrar-retrabalho', ev => {
    let d = {};
    try { d = typeof ev.detail === 'string' ? JSON.parse(ev.detail) : (ev.detail || {}); } catch (e) { /* ignora */ }
    abrirModal(d);
  });

  // Envio AUTOMÁTICO (pendência): sem formulário
  //   detail: { tipo, relato, pendencia, motivo }
  const autoEmAndamento = new Set();
  document.addEventListener('osir:registrar-retrabalho-auto', ev => {
    let d = {};
    try { d = typeof ev.detail === 'string' ? JSON.parse(ev.detail) : (ev.detail || {}); } catch (e) { /* ignora */ }
    enviarAutomatico(d);
  });

  async function enviarAutomatico(d) {
    const pend = String(d.pendencia || '');
    if (!pend || autoEmAndamento.has(pend)) return;
    autoEmAndamento.add(pend);
    try {
      const cap = capturarTela();
      let api = { cliente: '', tecnico: '', os: '' };
      try { api = await capturarApi(cap.protocolo); } catch (e) { /* segue com a tela */ }
      const payload = {
        token: API_TOKEN,
        usuario: cap.usuario,
        cliente: cap.cliente || api.cliente,
        protocolo: cap.protocolo,
        categoria: cap.categoria,
        tipo: d.tipo,
        relato: String(d.relato || '').slice(0, lim('relato')),
        devolvido: 'Não',
        origem: 'erp.osirnet.com.br/' + detectarModo(),
        versao: VERSAO_SCRIPT,
        tecnico: api.tecnico,
        sugestao: 'pendencia',
        os: api.os || '',
        pendencia: pend
      };
      const falta = ['usuario', 'cliente', 'protocolo', 'tipo', 'relato'].filter(k => !payload[k]);
      if (falta.length || !respDoTipo(payload.tipo)) {
        logar('Pendência: faltou ' + falta.join(', ') + ' — abrindo o formulário');
        abrirModal({ tipo: d.tipo, relato: d.relato, sugestao: 'pendencia', pendencia: pend,
          motivo: (d.motivo || 'Pendência ' + pend) + ' (não consegui registrar sozinho: confira e envie)' });
        return;
      }
      const [t, o] = await Promise.all([
        postar(API_URL, payload),
        ESPELHAR_OFICIAL && ESPELHAR_PENDENCIA_AUTO ? postar(API_URL_OFICIAL, payload) : Promise.resolve(null)
      ]);
      if (o && !o.ok) mostrarToast('⚠ Pendência não foi para a planilha OFICIAL: ' + o.msg, 'erro');
      const resp = t.ok ? { success: true, duplicado: t.dup, vinculado: t.vinc, id: t.id, responsavel: t.resp } : { success: false, message: t.msg };
      if (resp && resp.success) {
        marcarEnviado(payload.protocolo, payload.tipo);
        mostrarToast(resp.vinculado
          ? `ℹ Este protocolo já tinha retrabalho de ${payload.tipo} (${resp.id}): a pendência ${pend} foi ligada a ele, sem duplicar`
          : resp.duplicado
          ? `ℹ Pendência ${pend} já estava registrada (${resp.id})`
          : `✅ Pendência ${pend} registrada como Retrabalho ${resp.responsavel || ''} (${resp.id})`, resp.duplicado ? 'info' : 'ok');
        document.dispatchEvent(new CustomEvent('osir:retrabalho-enviado', { detail: JSON.stringify({ protocolo: payload.protocolo, tipo: payload.tipo, id: resp.id, pendencia: pend, auto: true }) }));
      } else {
        throw new Error((resp && resp.message) || 'erro desconhecido');
      }
    } catch (e) {
      console.error('[Retrabalho] Pendência automática falhou:', e);
      mostrarToast('❌ Não consegui registrar a pendência ' + pend + ' sozinho: abrindo o formulário', 'erro');
      abrirModal({ tipo: d.tipo, relato: d.relato, sugestao: 'pendencia', pendencia: pend, motivo: d.motivo || ('Pendência ' + pend) });
    } finally {
      autoEmAndamento.delete(pend);
    }
  }

  // ============================================================
  // 12.1 ENCERRAMENTOS DO DIA (para o % de retrabalho)
  // ============================================================
  // Pergunta ao ERP quantos protocolos o COP Encerramentos encerrou por dia
  // (mesma busca da tela "Todas as solicitações") e manda para a aba "Encerramentos".
  // - a cada 60 min: hoje + 3 dias anteriores
  // - 1x por dia: o mês inteiro (completa dias em que ninguém abriu o ERP)
  const ENC_TIME_ID = '1009';            // COP Encerramentos
  const ENC_INTERVALO_MIN = 60;

  function isoLocal(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  async function encerramentosDoDia(dia) {
    const filtro = JSON.stringify({ Connector: 'And', Values: [
      { PropertyName: 'teamId', Value: ENC_TIME_ID, Operation: 'equals' },
      { PropertyName: 'assignment.reportClosingDate', Value: dia + ' 00:00:00', Operation: 'greaterThanOrEquals' },
      { PropertyName: 'assignment.reportClosingDate', Value: dia + ' 23:59:59', Operation: 'lessThanOrEquals' }
    ] });
    const porCategoria = {}, porColaborador = {};
    let total = 0, pagina = 1;
    while (pagina <= 20) {
      const r = await getApi('/api/v1/ServiceDesk/AssignmentIncidents/GetAllSolicitations?OrderBy=%5B%5D&Page=' + pagina +
        '&PageSize=100&Filter=' + encodeURIComponent(filtro) + '&slaType=null');
      const lista = (r && r.data) || [];
      total = r && typeof r.totalRecords === 'number' ? r.totalRecords : total + lista.length;
      lista.forEach(x => {
        const t = (x.assignment && x.assignment.title) || '';
        const cat = (t.match(/^Protocolo \d+ - (.*?) \/ /) || [])[1] || '(sem categoria)';
        porCategoria[cat] = (porCategoria[cat] || 0) + 1;
        const resp = x.assignment && x.assignment.responsible;
        const quem = resp ? (resp.name || resp.name2 || '?') : '?';
        porColaborador[quem] = (porColaborador[quem] || 0) + 1;
      });
      if (lista.length < 100) break;
      pagina++;
    }
    return { data: dia, total, porCategoria, porColaborador };
  }

  let encRodando = false;
  async function sincronizarEncerramentos(forcar) {
    if (encRodando || !apiDoAssistente()) return;
    let ult = 0;
    try { ult = +localStorage.getItem('rt_enc_ultimo') || 0; } catch (e) { /* ignora */ }
    if (!forcar && Date.now() - ult < ENC_INTERVALO_MIN * 60000) return;
    encRodando = true;
    try {
      localStorage.setItem('rt_enc_ultimo', String(Date.now()));
      const hoje = new Date();
      const dias = [];
      let mesInteiro = false;
      try { mesInteiro = localStorage.getItem('rt_enc_mes') !== isoLocal(hoje); } catch (e) { /* ignora */ }
      const ate = mesInteiro ? Math.max(3, hoje.getDate() - 1) : 3;   // mês inteiro = do dia 1 até hoje
      for (let i = 0; i <= ate; i++) { const d = new Date(hoje); d.setDate(hoje.getDate() - i); dias.push(isoLocal(d)); }
      const resultado = [];
      for (const d of dias) {
        try { resultado.push(await encerramentosDoDia(d)); } catch (e) { logar('Encerramentos ' + d + ' falhou:', e); }
      }
      if (!resultado.length) return;
      const r = await fetch(API_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: API_TOKEN, acao: 'encerramentos', usuario: capturarUsuario(), dias: resultado })
      }).then(x => x.json());
      if (r && r.success && mesInteiro) localStorage.setItem('rt_enc_mes', isoLocal(hoje));
      logar('Encerramentos enviados:', resultado.map(x => x.data + '=' + x.total).join(' '), r);
    } catch (e) {
      logar('Falha ao sincronizar encerramentos:', e);
    } finally {
      encRodando = false;
    }
  }

  // Sinal para o Assistente saber que pode mostrar os botões
  function anunciar() {
    document.documentElement.dataset.rtVersao = VERSAO_SCRIPT;
    document.documentElement.dataset.rtAuto = '1';   // sabe registrar pendência sozinho
    document.documentElement.dataset.rtTipos = JSON.stringify(CONFIG.tipos.map(t => t.nome));
  }

  // ============================================================
  // 13. INICIALIZAÇÃO
  // ============================================================
  function iniciar() {
    instalarCss();
    anunciar();
    atualizarConfig();
    injetar();

    let agendado = false;
    const agendar = () => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(() => { agendado = false; injetar(); posicionarBotaoFlutuante(); });
    };
    new MutationObserver(agendar).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['role', 'class', 'style', 'hidden', 'aria-hidden']
    });
    window.addEventListener('scroll', posicionarBotaoFlutuante, { passive: true });
    window.addEventListener('resize', posicionarBotaoFlutuante, { passive: true });
    setInterval(() => { if (!document.hidden) { injetar(); posicionarBotaoFlutuante(); anunciar(); } }, CICLO_MS);
    // encerramentos: tenta 30 s depois de abrir (dá tempo do Assistente capturar o login) e a cada 5 min
    setTimeout(() => sincronizarEncerramentos(false), 30000);
    setInterval(() => sincronizarEncerramentos(false), 5 * 60000);

    // Teste no console:  RT_DEBUG.abrir({tipo:'Sinal', relato:'teste', motivo:'teste'})
    window.RT_DEBUG = {
      versao: VERSAO_SCRIPT,
      get config() { return CONFIG; },
      tela: capturarTela,
      api: () => capturarApi(capturarTela().protocolo),
      abrir: abrirModal,
      encerramentos: dia => encerramentosDoDia(dia || isoLocal(new Date())),
      sincronizar: () => sincronizarEncerramentos(true)
    };

    logar('Projeto Retrabalho v' + VERSAO_SCRIPT + ' carregado em modo:', detectarModo());
  }

  if (document.body) iniciar();
  else window.addEventListener('DOMContentLoaded', iniciar);
})();
