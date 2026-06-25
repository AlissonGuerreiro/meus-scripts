// ==UserScript==
// @name         Monitor de Técnicos - Osir
// @namespace    https://github.com/seuusuario
// @version      4.5
// @description  Alerta quando um técnico aparece na aba ATIVOS (com auto-switch)
// @author       Seu Nome
// @match        *://*.osirnet.com.br/*
// @match        *://osirnet.chatlabs.com.br/*
// @grant        GM_notification
// @grant        unsafeWindow
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/seuusuario/seurepositorio/main/Monitor-Tecnicos-Osir.user.js
// @downloadURL  https://raw.githubusercontent.com/seuusuario/seurepositorio/main/Monitor-Tecnicos-Osir.user.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.__monitorOsirFinal) return;
    window.__monitorOsirFinal = true;

    console.log('%c🟢 MONITOR OSIR v4.5 - CARREGADO COM SUCESSO', 'color:#62C455; font-size:18px; font-weight:bold');

    let tecnicosNotificados = new Set();
    let contadorNovos = 0;

    // ==================== BADGE FLUTUANTE ====================
    function criarBadge() {
        let badge = document.getElementById('tecnicos-badge');
        if (badge) return badge;

        badge = document.createElement('div');
        badge.id = 'tecnicos-badge';
        badge.style.cssText = `
            position:fixed;top:20px;right:20px;z-index:2147483647;
            background:linear-gradient(135deg,#62C455,#3EB34A); color:white;
            font-weight:bold; font-size:17px; padding:10px 18px; border-radius:50px;
            box-shadow:0 5px 15px rgba(98,196,85,0.6); display:none; align-items:center;
            gap:8px; cursor:pointer; font-family:Arial,sans-serif;
        `;
        badge.innerHTML = `👤 <span id="badge-count">0</span>`;
        badge.onclick = () => { contadorNovos = 0; atualizarBadge(); window.focus(); };
        document.body.appendChild(badge);
        return badge;
    }

    function atualizarBadge() {
        const badge = document.getElementById('tecnicos-badge') || criarBadge();
        document.getElementById('badge-count').textContent = contadorNovos;
        badge.style.display = contadorNovos > 0 ? 'flex' : 'none';
    }

    // ==================== ALERTA ====================
    function alertarTecnico(nome) {
        nome = (nome || '').trim();
        if (!nome) return;

        contadorNovos++;
        atualizarBadge();

        console.log(`%c 🔔 NOVO TÉCNICO: ${nome} `, 'background:#62C455;color:white;font-size:20px;padding:12px 20px;border-radius:8px;font-weight:bold');

        try {
            GM_notification({
                title: '🔴 TÉCNICO NA FILA!',
                text: `${nome} apareceu na aba ATIVOS`,
                timeout: 25000
            });
        } catch(e) {}

        try {
            new Notification('🔴 NOVO TÉCNICO!', { body: `${nome} está aguardando` });
        } catch(e) {}

        try {
            new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3').play();
        } catch(e) {}

        piscarTitulo(nome);
    }

    function piscarTitulo(nome) {
        const original = document.title;
        let count = 0;
        if (window._piscar) clearInterval(window._piscar);

        window._piscar = setInterval(() => {
            document.title = (count++ % 2 === 0) ? `🔴 TÉCNICO (${contadorNovos})` : `👤 ${nome}`;
            if (count > 22) {
                clearInterval(window._piscar);
                document.title = original;
            }
        }, 450);
    }

    // ==================== FUNÇÕES DE DETECÇÃO ====================
    function irParaAbaAtivos() {
        document.querySelectorAll('button[role="tab"]').forEach(tab => {
            if (tab.textContent.includes('Ativos')) tab.click();
        });
    }

    function capturarTecnicos() {
        irParaAbaAtivos();

        const container = document.querySelector('#chat-listing-active');
        if (!container) return [];

        const tecnicos = [];
        container.querySelectorAll('div').forEach(item => {
            const texto = item.textContent || '';
            if (!/t[ée]cnico| Técnico/i.test(texto) || /cliente|client/i.test(texto)) return;

            let nome = texto.split('\n')[0].trim();
            nome = nome.replace(/[^\w\sáéíóúãõç]/gi, '').trim();
            if (nome.length < 4) return;

            const id = nome.toLowerCase().replace(/\s+/g, '_');
            tecnicos.push({nome, id});
        });

        return tecnicos;
    }

    function verificarTecnicos() {
        const tecnicos = capturarTecnicos();
        tecnicos.forEach(t => {
            if (!tecnicosNotificados.has(t.id)) {
                tecnicosNotificados.add(t.id);
                alertarTecnico(t.nome);
            }
        });
    }

    // ==================== INICIALIZAÇÃO ====================
    if (Notification.permission === 'default') Notification.requestPermission();

    setTimeout(irParaAbaAtivos, 1500);
    setTimeout(verificarTecnicos, 3000);
    setInterval(verificarTecnicos, 2500);
    setInterval(irParaAbaAtivos, 30000);

    new MutationObserver(verificarTecnicos).observe(document.body, { childList: true, subtree: true });

    // Comandos globais
    window.alertar = window.alertarTecnico = alertarTecnico;
    window.limparTecnicos = () => {
        tecnicosNotificados.clear();
        contadorNovos = 0;
        localStorage.removeItem('tecnicosOsir');
        atualizarBadge();
        console.log('🧹 Lista de técnicos limpa!');
    };

    console.log('%c✅ Comandos: alertar("Nome") ou limparTecnicos()', 'color:#62C455; font-weight:bold');
})();
