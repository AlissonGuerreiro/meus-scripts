// ==UserScript==
// @name         Projeto Retrabalho
// @namespace    https://erp.osirnet.com.br/
// @version      1.8.1
// @description  Botão para registrar retrabalhos no ERP Osirnet
// @author       Alisson Guerreiro
// @match        https://erp.osirnet.com.br/ui/*
// @match        https://erp.osirnet.com.br/attendance*
// @grant        GM_addStyle
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/projeto-retrabalho.user.js
// @updateURL    https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/projeto-retrabalho.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // 0. GUARDA: só rodar na PÁGINA PAI
  // ============================================================
  if (window.top !== window.self) return;

  // ============================================================
  // 1. CONFIGURAÇÃO
  // ============================================================
  const API_URL = 'https://script.google.com/macros/s/AKfycbwbzUOFp8iZkM1Rq04LPnEPWiL3_ixgZAP4N3Ugs-FLOG22FIoiYB1P2vbxe5TzjjU1uQ/exec';
  const API_TOKEN = 'ddc8394b-7d80-489e-8ba1-c665d78ded3b';

  const VERSAO_SCRIPT = '1.8.1';

  const TIPOS_RETRABALHO = [
    'Provisionamento',
    'Etiqueta',
    'Suporte',
    'Instalação',
    'Material/Equipamento',
    'Sinal',
    'Chip',
    'Wifi-Pro',
    'Terceiros',
    'Outros'
  ];

  // Mesmos limites do servidor (Code.gs → LIMITES). Se mudar lá, mude aqui.
  const LIMITES = {
    cliente:   120,
    protocolo:  30,
    categoria: 120,
    relato:   2000,
    usuario:   120
  };

  // Tempo máximo esperando o servidor responder
  const TIMEOUT_ENVIO_MS = 20000;

  const NAVBAR_ID = 'navbar-menu-buttons';

  // Distância (px) entre o botão e a borda esquerda do stepper
  const DISTANCIA_DO_STEPPER = 300;

  // ============================================================
  // 1.1 DETECÇÃO DE MODO
  // ============================================================
  function detectarModo() {
    if (location.pathname.startsWith('/attendance')) return 'attendance';
    if (location.pathname.startsWith('/ui/')) return 'ui';
    return 'desconhecido';
  }

  // ============================================================
  // 2. SELETORES DE CAPTURA
  // ============================================================
  const SELETORES = {
    usuario: [
      { tipo: 'atributo', sel: 'p.username[aria-label]', attr: 'aria-label' },
      { tipo: 'rotuloIrmaoP', rotulo: 'Atendente' }
    ],
    protocolo: [{ tipo: 'rotuloIrmaoLink', rotulo: 'Protocolo' }],
    cliente:   [{ tipo: 'rotuloIrmaoLink', rotulo: 'Cliente' }],
    categoria: [
      { tipo: 'value', sel: '#serviceCategoryId1' },
      { tipo: 'value', sel: 'input[name="serviceCategoryId1"]' }
    ]
  };

  // ============================================================
  // 3. UTILITÁRIOS
  // ============================================================
  function logar(...args) {
    console.log('%c[Retrabalho]', 'color:#1c2064;font-weight:bold;', ...args);
  }

  function agora() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
      `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

  function escaparHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Protocolos já enviados nesta aba (evita registro duplicado por engano)
  const CHAVE_ENVIADOS = 'rt_protocolos_enviados';

  function jaEnviouProtocolo(protocolo) {
    try {
      const lista = JSON.parse(sessionStorage.getItem(CHAVE_ENVIADOS) || '[]');
      return lista.indexOf(protocolo) !== -1;
    } catch (e) {
      return false;
    }
  }

  function marcarProtocoloEnviado(protocolo) {
    try {
      const lista = JSON.parse(sessionStorage.getItem(CHAVE_ENVIADOS) || '[]');
      if (lista.indexOf(protocolo) === -1) lista.push(protocolo);
      sessionStorage.setItem(CHAVE_ENVIADOS, JSON.stringify(lista));
    } catch (e) {}
  }

  // ============================================================
  // 4. COLETA DE DOCUMENTOS
  // ============================================================
  function coletarDocumentos() {
    const docs = [document];
    const visitados = new Set([document]);

    function varrer(doc) {
      let iframes;
      try { iframes = doc.querySelectorAll('iframe'); } catch { return; }
      iframes.forEach((ifr) => {
        try {
          const d = ifr.contentDocument;
          if (d && !visitados.has(d)) {
            visitados.add(d);
            docs.push(d);
            varrer(d);
          }
        } catch (e) {}
      });
    }
    varrer(document);
    return docs;
  }

  // ============================================================
  // 5. CAPTURA
  // ============================================================
  function capturarEmDoc(doc, regras) {
    for (const regra of regras) {
      try {
        let valor = '';

        if (regra.tipo === 'atributo') {
          const el = doc.querySelector(regra.sel);
          if (el) valor = (el.getAttribute(regra.attr) || '').trim();

        } else if (regra.tipo === 'value') {
          const el = doc.querySelector(regra.sel);
          if (el && typeof el.value === 'string') valor = el.value.trim();

        } else if (regra.tipo === 'rotuloIrmaoLink') {
          const spans = doc.querySelectorAll('span.MuiTypography-root');
          for (const sp of spans) {
            if (sp.textContent.trim() !== regra.rotulo) continue;
            if (sp.offsetParent === null) continue;
            const a = sp.nextElementSibling;
            if (a && a.tagName === 'A') {
              const txt = (a.textContent || '').trim();
              if (txt) { valor = txt; break; }
            }
          }

        } else if (regra.tipo === 'rotuloIrmaoP') {
          const ps = doc.querySelectorAll('p.MuiTypography-root');
          for (const pRotulo of ps) {
            if (pRotulo.textContent.trim() !== regra.rotulo) continue;
            if (pRotulo.offsetParent === null) continue;
            const paiRotulo = pRotulo.parentElement;
            if (!paiRotulo) continue;
            const container = paiRotulo.parentElement;
            if (!container) continue;
            const candidatos = container.querySelectorAll('p.MuiTypography-root.MuiTypography-body1.MuiTypography-colorPrimary');
            for (const pValor of candidatos) {
              const txt = (pValor.textContent || '').trim();
              if (txt && txt !== regra.rotulo) { valor = txt; break; }
            }
            if (valor) break;
          }
        }

        if (valor) return valor;
      } catch (e) {}
    }
    return '';
  }

  function capturar(regras) {
    for (const doc of coletarDocumentos()) {
      const v = capturarEmDoc(doc, regras);
      if (v) return v;
    }
    return '';
  }

  function capturarTudo() {
    const dados = {
      usuario:   capturar(SELETORES.usuario),
      protocolo: capturar(SELETORES.protocolo),
      cliente:   capturar(SELETORES.cliente),
      categoria: capturar(SELETORES.categoria)
    };
    logar('Capturado:', dados);
    return dados;
  }

  // ============================================================
  // 6. CSS
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
    .rt-checkbox label {
      font-size: 14px; font-weight: 500; color: #333;
      text-transform: none; letter-spacing: 0; cursor: pointer; margin: 0;
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
    #rt-toast.rt-erro { background: #c62828; }
  `;

  // ============================================================
  // 7. CONTROLE DE EXIBIÇÃO
  // ============================================================
  function elementoEstaAtivo(el) {
    if (!el || !el.isConnected) return false;
    if (el.hidden) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;

    try {
      const win = el.ownerDocument.defaultView;
      if (!win) return false;
      const estilo = win.getComputedStyle(el);
      if (estilo.display === 'none') return false;
      if (estilo.visibility === 'hidden' || estilo.visibility === 'collapse') return false;
      if (Number.parseFloat(estilo.opacity || '1') === 0) return false;
      if (el.getClientRects().length === 0) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function possuiPresentationAtiva() {
    for (const doc of coletarDocumentos()) {
      try {
        const presentations = doc.querySelectorAll('div[role="presentation"]');
        for (const el of presentations) {
          if (elementoEstaAtivo(el)) return true;
        }
      } catch (e) {}
    }
    return false;
  }

  function removerBotao() {
    const btn = document.getElementById('rt-btn-flutuante');
    if (btn) {
      btn.remove();
      logar('Botão removido');
    }
  }

  // ============================================================
  // 8. CRIAÇÃO DO BOTÃO
  // ============================================================
  function criarBotao() {
    let btn = document.getElementById('rt-btn-flutuante');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'rt-btn-flutuante';
      btn.type = 'button';
      btn.innerHTML = `
        <svg class="rt-btn-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>Registrar Retrabalho</span>
      `;
      btn.addEventListener('click', abrirModal);
    }
    return btn;
  }

  // ============================================================
  // 9. MODO UI (ERP antigo): injetar na navbar
  // ============================================================
  function injetarNaNavbar() {
    if (!possuiPresentationAtiva()) {
      removerBotao();
      return false;
    }

    const navbar = document.getElementById(NAVBAR_ID);
    if (!navbar) {
      removerBotao();
      return false;
    }

    const btn = criarBotao();
    btn.classList.add('rt-modo-navbar');

    if (btn.parentElement === navbar) return true;

    navbar.insertBefore(btn, navbar.firstChild);
    logar('Botão injetado na navbar (modo ui)');
    return true;
  }

  // ============================================================
  // 10. MODO ATTENDANCE: botão flutuante à esquerda do stepper
  // ============================================================
  function acharStepper() {
    for (const doc of coletarDocumentos()) {
      try {
        const spans = doc.querySelectorAll('span');
        for (const sp of spans) {
          if (sp.textContent.trim() === 'Dados Iniciais' && sp.offsetParent !== null) {
            let el = sp;
            while (el && !(el.classList && el.classList.contains('MuiStepper-root'))) {
              el = el.parentElement;
            }
            if (el) return el;
          }
        }
      } catch (e) {}
    }
    return null;
  }

  function posicionarBotaoFlutuante() {
    const btn = document.getElementById('rt-btn-flutuante');
    if (!btn || !btn.classList.contains('rt-modo-navbar')) {
      // Se está em modo navbar, não mexe na posição
      if (btn && btn.classList.contains('rt-modo-navbar')) return;
    }

    // Se está em modo attendance (não tem a classe navbar), posiciona
    if (!btn) return;
    if (btn.classList.contains('rt-modo-navbar')) return;

    const stepper = acharStepper();
    if (!stepper) return;

    const rectStepper = stepper.getBoundingClientRect();
    const alturaBotao = btn.offsetHeight || 40;
    const larguraBotao = btn.offsetWidth || 160;

    const topo = rectStepper.top + (rectStepper.height - alturaBotao) / 2;
    let esquerda = rectStepper.left - larguraBotao - DISTANCIA_DO_STEPPER;

    if (esquerda < 8) esquerda = 8;

    btn.style.position = 'fixed';
    btn.style.top = topo + 'px';
    btn.style.left = esquerda + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  }

  function injetarNaBarraAtendimento() {
    const stepper = acharStepper();
    if (!stepper) {
      removerBotao();
      return false;
    }

    const btn = criarBotao();
    btn.classList.remove('rt-modo-navbar');

    // Sempre anexa ao body (para position:fixed funcionar corretamente)
    if (btn.parentElement !== document.body) {
      document.body.appendChild(btn);
    }

    // Posiciona após o próximo frame para garantir que o layout está pronto
    requestAnimationFrame(() => {
      posicionarBotaoFlutuante();
    });

    logar('Botão posicionado à esquerda do stepper (modo attendance)');
    return true;
  }

  // ============================================================
  // 11. INJEÇÃO (dispatch por modo)
  // ============================================================
  function injetar() {
    const modo = detectarModo();

    if (modo === 'ui') return injetarNaNavbar();
    if (modo === 'attendance') return injetarNaBarraAtendimento();

    removerBotao();
    return false;
  }

  // ============================================================
  // 12. MODAL
  // ============================================================
  function abrirModal() {
    if (document.getElementById('rt-overlay')) return;

    const capturado = capturarTudo();
    const modo = detectarModo();
    const usuarioEhReadonly = capturado.usuario && modo === 'ui';

    const overlay = document.createElement('div');
    overlay.id = 'rt-overlay';

    const modal = document.createElement('div');
    modal.id = 'rt-modal';

    modal.innerHTML = `
      <div class="rt-header">
        <h2>Registrar Retrabalho</h2>
        <button class="rt-close" type="button" aria-label="Fechar">✕</button>
      </div>

      <div class="rt-body">
        <div class="rt-row rt-row-2">
          <div class="rt-field ${capturado.protocolo ? '' : 'rt-falha'}" data-campo="protocolo">
            <label for="rt-protocolo">Protocolo *</label>
            <input id="rt-protocolo" type="text" maxlength="${LIMITES.protocolo}" value="${escaparHtml(capturado.protocolo)}" placeholder="Digite o protocolo">
            ${capturado.protocolo ? '' : '<div class="rt-aviso">⚠ Não capturado — preencha manualmente</div>'}
          </div>
          <div class="rt-field ${capturado.categoria ? '' : 'rt-falha'}" data-campo="categoria">
            <label for="rt-categoria">Categoria ERP</label>
            <input id="rt-categoria" type="text" maxlength="${LIMITES.categoria}" value="${escaparHtml(capturado.categoria)}" placeholder="Ex.: Fibra - Manutenção">
            ${capturado.categoria ? '' : '<div class="rt-aviso">⚠ Não capturado — preencha se aplicável</div>'}
          </div>
        </div>

        <div class="rt-field ${capturado.cliente ? '' : 'rt-falha'}" data-campo="cliente">
          <label for="rt-cliente">Cliente *</label>
          <input id="rt-cliente" type="text" maxlength="${LIMITES.cliente}" value="${escaparHtml(capturado.cliente)}" placeholder="Nome do cliente">
          ${capturado.cliente ? '' : '<div class="rt-aviso">⚠ Não capturado — preencha manualmente</div>'}
        </div>

        <div class="rt-row rt-row-2">
          <div class="rt-field">
            <label for="rt-usuario">Atendente</label>
            <input id="rt-usuario" type="text" maxlength="${LIMITES.usuario}" value="${escaparHtml(capturado.usuario)}" placeholder="Seu nome" ${usuarioEhReadonly ? 'readonly' : ''}>
            ${capturado.usuario ? '' : '<div class="rt-aviso">⚠ Não capturado — preencha</div>'}
          </div>
          <div class="rt-field">
            <label for="rt-datahora">Data/Hora</label>
            <input id="rt-datahora" type="text" value="${escaparHtml(agora())}" readonly>
          </div>
        </div>

        <div class="rt-checkbox" onclick="if(event.target.tagName!=='INPUT'&&event.target.tagName!=='LABEL'){this.querySelector('input').click();}">
          <input id="rt-devolvido" type="checkbox">
          <label for="rt-devolvido">Protocolo foi devolvido?</label>
        </div>

        <div class="rt-field">
          <label for="rt-tipo">Tipo de retrabalho *</label>
          <select id="rt-tipo">
            <option value="">Selecione...</option>
            ${TIPOS_RETRABALHO.map(t => `<option value="${escaparHtml(t)}">${escaparHtml(t)}</option>`).join('')}
          </select>
        </div>

        <div class="rt-field">
          <label for="rt-relato">Relato *</label>
          <textarea id="rt-relato" maxlength="${LIMITES.relato}" placeholder="Descreva o retrabalho..."></textarea>
          <div class="rt-contador" id="rt-contador">0 / ${LIMITES.relato}</div>
        </div>
      </div>

      <div class="rt-footer">
        <button class="rt-btn rt-btn-cancelar" type="button">Cancelar</button>
        <button class="rt-btn rt-btn-enviar" type="button">Enviar</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('.rt-close').addEventListener('click', fecharModal);
    modal.querySelector('.rt-btn-cancelar').addEventListener('click', fecharModal);
    modal.querySelector('.rt-btn-enviar').addEventListener('click', enviar);

    // Contador de caracteres do Relato
    const relatoEl = modal.querySelector('#rt-relato');
    const contadorEl = modal.querySelector('#rt-contador');
    relatoEl.addEventListener('input', () => {
      const n = relatoEl.value.length;
      contadorEl.textContent = n + ' / ' + LIMITES.relato;
      contadorEl.classList.toggle('rt-limite', n >= LIMITES.relato);
    });

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) fecharModal();
    });

    document.addEventListener('keydown', escutarEsc);

    let focoId = 'rt-tipo';
    if (!capturado.protocolo) focoId = 'rt-protocolo';
    else if (!capturado.cliente) focoId = 'rt-cliente';

    setTimeout(() => {
      const el = document.getElementById(focoId);
      if (el) el.focus();
    }, 50);
  }

  function escutarEsc(ev) {
    if (ev.key === 'Escape') fecharModal();
  }

  function fecharModal() {
    const overlay = document.getElementById('rt-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', escutarEsc);
  }

  // ============================================================
  // 13. ENVIO
  // ============================================================
  function enviar() {
    const btn = document.querySelector('#rt-modal .rt-btn-enviar');
    if (btn.disabled) return;

    const protocolo = document.getElementById('rt-protocolo').value.trim();
    const categoria = document.getElementById('rt-categoria').value.trim();
    const cliente   = document.getElementById('rt-cliente').value.trim();
    const usuario   = document.getElementById('rt-usuario').value.trim();
    const tipo      = document.getElementById('rt-tipo').value;
    const relato    = document.getElementById('rt-relato').value.trim();
    const devolvido = document.getElementById('rt-devolvido').checked ? 'Sim' : 'Não';

    const faltando = [];
    if (!protocolo) faltando.push('Protocolo');
    if (!cliente)   faltando.push('Cliente');
    if (!usuario)   faltando.push('Atendente');
    if (!tipo)      faltando.push('Tipo de retrabalho');
    if (!relato)    faltando.push('Relato');

    if (faltando.length) {
      mostrarToast('Preencha: ' + faltando.join(', '), 'erro');
      return;
    }

    // Mesmo protocolo já enviado nesta aba? Pede confirmação.
    if (jaEnviouProtocolo(protocolo)) {
      const seguir = window.confirm(
        'O protocolo ' + protocolo + ' já foi registrado nesta sessão.\n\n' +
        'Registrar de novo mesmo assim?'
      );
      if (!seguir) return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const payload = {
      token: API_TOKEN,
      usuario: usuario,
      cliente: cliente,
      protocolo: protocolo,
      categoria: categoria,
      tipo: tipo,
      relato: relato,
      devolvido: devolvido,
      origem: 'erp.osirnet.com.br/' + detectarModo(),
      versao: VERSAO_SCRIPT
    };

    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), TIMEOUT_ENVIO_MS);

    function liberarBotao() {
      btn.disabled = false;
      btn.textContent = 'Enviar';
    }

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controlador.signal
    })
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((resp) => {
        if (resp && resp.success) {
          marcarProtocoloEnviado(protocolo);
          mostrarToast('✅ Registro enviado: ' + resp.id, 'ok');
          fecharModal();
        } else {
          mostrarToast('❌ ' + ((resp && resp.message) || 'Erro desconhecido'), 'erro');
          liberarBotao();
        }
      })
      .catch((err) => {
        console.error('[Retrabalho] Erro no envio:', err);
        if (err && err.name === 'AbortError') {
          mostrarToast('❌ Tempo esgotado. O registro pode ter sido gravado: confira na planilha antes de reenviar.', 'erro');
        } else if (err && err.name === 'SyntaxError') {
          mostrarToast('❌ Resposta inválida do servidor. Confira na planilha antes de reenviar.', 'erro');
        } else {
          mostrarToast('❌ Falha de rede. Tente novamente.', 'erro');
        }
        liberarBotao();
      })
      .finally(() => clearTimeout(timer));
  }

  // ============================================================
  // 14. TOAST
  // ============================================================
  let toastTimer = null;

  function mostrarToast(mensagem, tipo) {
    let toast = document.getElementById('rt-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rt-toast';
      document.body.appendChild(toast);
    }
    toast.className = 'rt-show ' + (tipo === 'ok' ? 'rt-ok' : 'rt-erro');
    toast.textContent = mensagem;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.className = tipo === 'ok' ? 'rt-ok' : 'rt-erro';
    }, tipo === 'ok' ? 3500 : 6000);
  }

  // ============================================================
  // 15. INICIALIZAÇÃO
  // ============================================================
  function iniciar() {
    GM_addStyle(CSS);

    injetar();

    let atualizacaoAgendada = false;

    function agendarAtualizacao() {
      if (atualizacaoAgendada) return;
      atualizacaoAgendada = true;
      requestAnimationFrame(() => {
        atualizacaoAgendada = false;
        injetar();
        posicionarBotaoFlutuante();
      });
    }

    const observer = new MutationObserver(agendarAtualizacao);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'class', 'style', 'hidden', 'aria-hidden']
    });

    window.addEventListener('scroll', posicionarBotaoFlutuante, { passive: true });
    window.addEventListener('resize', posicionarBotaoFlutuante, { passive: true });

    setInterval(() => {
      injetar();
      posicionarBotaoFlutuante();
    }, 750);

    logar('Projeto Retrabalho v' + VERSAO_SCRIPT + ' carregado em modo:', detectarModo());
  }

  if (document.body) iniciar();
  else window.addEventListener('DOMContentLoaded', iniciar);

})();
