// ==UserScript==
// @name         Projeto Retrabalho
// @namespace    https://erp.osirnet.com.br/
// @version      1.5.0
// @description  Botão para registrar retrabalhos no ERP Osirnet
// @author       Equipe
// @match        https://erp.osirnet.com.br/ui/*
// @grant        GM_addStyle
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/SEU_USUARIO/projeto-retrabalho/main/projeto-retrabalho.user.js
// @updateURL    https://raw.githubusercontent.com/SEU_USUARIO/projeto-retrabalho/main/projeto-retrabalho.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // 0. GUARDA: só rodar na PÁGINA PAI (não dentro de iframes)
  // ============================================================
  if (window.top !== window.self) return;

  // ============================================================
  // 1. CONFIGURAÇÃO
  // ============================================================
  const API_URL   = 'https://script.google.com/macros/s/AKfycbwbzUOFp8iZkM1Rq04LPnEPWiL3_ixgZAP4N3Ugs-FLOG22FIoiYB1P2vbxe5TzjjU1uQ/exec';
  const API_TOKEN = 'ddc8394b-7d80-489e-8ba1-c665d78ded3b';

  const VERSAO_SCRIPT = '1.5.0';

  const TIPOS_RETRABALHO = [
    'Provisionamento',
    'Alteração',
    'Suporte',
    'Instalação',
    'Configuração',
    'Falha',
    'Outros'
  ];

  const NAVBAR_ID = 'navbar-menu-buttons';

  // ============================================================
  // 2. SELETORES DE CAPTURA
  // ============================================================
  const SELETORES = {
    usuario: [
      { tipo: 'atributo', sel: 'p.username[aria-label]', attr: 'aria-label' }
    ],
    protocolo: [
      { tipo: 'rotuloIrmaoLink', rotulo: 'Protocolo' }
    ],
    cliente: [
      { tipo: 'rotuloIrmaoLink', rotulo: 'Cliente' }
    ],
    categoria: [
      { tipo: 'value', sel: '#serviceCategoryId1' },
      { tipo: 'value', sel: 'input[name="serviceCategoryId1"]' }
    ]
  };

  // ============================================================
  // 3. UTILITÁRIOS
  // ============================================================
  function logar(...args) {
    console.log('%c[Retrabalho]', 'color:#6c1fab;font-weight:bold;', ...args);
  }

  function agora() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function escaparHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ============================================================
  // 4. COLETA DE DOCUMENTOS (atual + iframes aninhados)
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
        } catch (e) { /* cross-origin */ }
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
        }

        if (valor) return valor;
      } catch (e) { /* segue */ }
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
      display: inline-flex;
      align-items: center;
      height: 30px;
      padding: 0 14px;
      margin-right: 12px;
      border: none;
      border-radius: 6px;
      background: #6c1fab;
      color: #fff;
      font-family: Roboto, Arial, sans-serif;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background .15s, box-shadow .15s;
      box-shadow: 0 1px 3px rgba(0,0,0,.2);
    }
    #rt-btn-flutuante:hover {
      background: #5a1890;
      box-shadow: 0 2px 6px rgba(0,0,0,.3);
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
    .rt-header h2 { font-size: 16px; font-weight: 600; margin: 0; color: #222; }
    .rt-close {
      background: none; border: none; font-size: 22px; cursor: pointer;
      color: #888; line-height: 1; padding: 0 4px;
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
    .rt-field textarea:focus { border-color: #6c1fab; }
    .rt-field input[readonly] {
      background: #f5f5f5; color: #666; cursor: not-allowed;
    }
    .rt-field.rt-falha input {
      border-color: #e6a700; background: #fffbe6;
    }
    .rt-field textarea { min-height: 110px; resize: vertical; }
    .rt-aviso { font-size: 11px; color: #b07b00; margin-top: 3px; }

    .rt-checkbox {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #fafafa;
      cursor: pointer;
      user-select: none;
      transition: background .15s, border-color .15s;
    }
    .rt-checkbox:hover {
      background: #f2f2f2;
      border-color: #ccc;
    }
    .rt-checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: #6c1fab;
      margin: 0;
      flex-shrink: 0;
    }
    .rt-checkbox label {
      font-size: 14px;
      font-weight: 500;
      color: #333;
      text-transform: none;
      letter-spacing: 0;
      cursor: pointer;
      margin: 0;
    }

    .rt-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 14px 20px; border-top: 1px solid #eee;
    }
    .rt-btn {
      padding: 9px 18px; border-radius: 6px; border: none;
      font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;
    }
    .rt-btn-cancelar { background: #eee; color: #333; }
    .rt-btn-cancelar:hover { background: #ddd; }
    .rt-btn-enviar { background: #6c1fab; color: #fff; }
    .rt-btn-enviar:hover { background: #5a1890; }
    .rt-btn-enviar:disabled { background: #bbb; cursor: not-allowed; }

    #rt-toast {
      position: fixed; bottom: 100px; right: 25px;
      z-index: 2147483001; padding: 12px 18px;
      border-radius: 8px; font-family: Roboto, Arial, sans-serif;
      font-size: 14px; color: #fff;
      box-shadow: 0 6px 18px rgba(0,0,0,.3);
      opacity: 0; transform: translateY(10px);
      transition: opacity .25s, transform .25s;
      pointer-events: none;
    }
    #rt-toast.rt-show { opacity: 1; transform: translateY(0); }
    #rt-toast.rt-ok   { background: #2e7d32; }
    #rt-toast.rt-erro { background: #c62828; }
  `;

  // ============================================================
  // 7. NAVBAR
  // ============================================================
  function injetarNaNavbar() {
    const navbar = document.getElementById(NAVBAR_ID);
    if (!navbar) return false;

    let btn = document.getElementById('rt-btn-flutuante');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'rt-btn-flutuante';
      btn.type = 'button';
      btn.textContent = '📝 Registrar retrabalho';
      btn.addEventListener('click', abrirModal);
    }

    if (btn.parentElement === navbar) return true;

    navbar.insertBefore(btn, navbar.firstChild);
    logar('Botão injetado na navbar');
    return true;
  }

  // ============================================================
  // 8. MODAL
  // ============================================================
  function abrirModal() {
    if (document.getElementById('rt-overlay')) return;

    const capturado = capturarTudo();

    const overlay = document.createElement('div');
    overlay.id = 'rt-overlay';

    const modal = document.createElement('div');
    modal.id = 'rt-modal';

    modal.innerHTML = `
      <div class="rt-header">
        <h2>Registrar retrabalho</h2>
        <button class="rt-close" type="button" aria-label="Fechar">✕</button>
      </div>
      <div class="rt-body">
        <div class="rt-row rt-row-2">
          <div class="rt-field ${capturado.protocolo ? '' : 'rt-falha'}" data-campo="protocolo">
            <label for="rt-protocolo">Protocolo *</label>
            <input id="rt-protocolo" type="text" value="${escaparHtml(capturado.protocolo)}" placeholder="Digite o protocolo">
            ${capturado.protocolo ? '' : '<div class="rt-aviso">⚠ Não capturado — preencha manualmente</div>'}
          </div>
          <div class="rt-field ${capturado.categoria ? '' : 'rt-falha'}" data-campo="categoria">
            <label for="rt-categoria">Categoria ERP</label>
            <input id="rt-categoria" type="text" value="${escaparHtml(capturado.categoria)}" placeholder="Ex.: Fibra - Manutenção">
            ${capturado.categoria ? '' : '<div class="rt-aviso">⚠ Não capturado — preencha se aplicável</div>'}
          </div>
        </div>

        <div class="rt-field ${capturado.cliente ? '' : 'rt-falha'}" data-campo="cliente">
          <label for="rt-cliente">Cliente *</label>
          <input id="rt-cliente" type="text" value="${escaparHtml(capturado.cliente)}" placeholder="Nome do cliente">
          ${capturado.cliente ? '' : '<div class="rt-aviso">⚠ Não capturado — preencha manualmente</div>'}
        </div>

        <div class="rt-row rt-row-2">
          <div class="rt-field">
            <label for="rt-usuario">Atendente</label>
            <input id="rt-usuario" type="text" value="${escaparHtml(capturado.usuario)}" placeholder="Seu nome" ${capturado.usuario ? 'readonly' : ''}>
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
          <textarea id="rt-relato" placeholder="Descreva o retrabalho..."></textarea>
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

  function escutarEsc(ev) { if (ev.key === 'Escape') fecharModal(); }

  function fecharModal() {
    const overlay = document.getElementById('rt-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', escutarEsc);
  }

  // ============================================================
  // 9. ENVIO
  // ============================================================
  function enviar() {
    const btn = document.querySelector('#rt-modal .rt-btn-enviar');
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
      origem: 'erp.osirnet.com.br',
      versao: VERSAO_SCRIPT
    };

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then((r) => r.json())
      .then((resp) => {
        if (resp && resp.success) {
          mostrarToast('✅ Registro enviado: ' + resp.id, 'ok');
          fecharModal();
        } else {
          mostrarToast('❌ ' + ((resp && resp.message) || 'Erro desconhecido'), 'erro');
          btn.disabled = false;
          btn.textContent = 'Enviar';
        }
      })
      .catch((err) => {
        console.error('[Retrabalho] Erro no envio:', err);
        mostrarToast('❌ Falha de rede. Tente novamente.', 'erro');
        btn.disabled = false;
        btn.textContent = 'Enviar';
      });
  }

  // ============================================================
  // 10. TOAST
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
    }, 3500);
  }

  // ============================================================
  // 11. INICIALIZAÇÃO
  // ============================================================
  function iniciar() {
    GM_addStyle(CSS);

    injetarNaNavbar();

    const observer = new MutationObserver(() => {
      injetarNaNavbar();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    let tentativas = 0;
    const tentarNavbar = setInterval(() => {
      if (injetarNaNavbar() || ++tentativas > 30) clearInterval(tentarNavbar);
    }, 500);

    logar('Projeto Retrabalho v' + VERSAO_SCRIPT + ' carregado');
  }

  if (document.body) iniciar();
  else window.addEventListener('DOMContentLoaded', iniciar);

})();
