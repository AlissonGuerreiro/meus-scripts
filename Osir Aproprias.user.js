// ==UserScript==
// @name         Osir - Aproprias (Rústico)
// @namespace    https://github.com/AlissonGuerreiro/meus-scripts
// @version      8.0.0
// @description  Painel com loop, play, pause - Versão Rústica
// @author       AlissonGuerreiro
// @match        https://erp.osirnet.com.br/ui/*/legacy/operations/*
// @match        https://erp.osirnet.com.br/legacy/operations/*
// @match        *://*.osirnet.com.br/ui/*/legacy/operations/*
// @match        *://*.osirnet.com.br/*
// @grant        none
// @run-at       document-end
// @homepage     https://github.com/AlissonGuerreiro/meus-scripts
// @supportURL   https://github.com/AlissonGuerreiro/meus-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Osir%20Aproprias.user.js
// @updateURL    https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Osir%20Aproprias.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============ CONFIG ============
    const CFG = {
        DELAY_SELECIONAR: 1100,
        DELAY_CLICAR: 1100,
        DELAY_CONFIRMAR: 1300,
        DELAY_ENTRE_LOOPS: 2300,
        MAX_TENTATIVAS: 20,
        INTERVALO: 1000
    };

    // ============ ESTADO ============
    let estado = {
        executando: false,
        pausado: false,
        parar: false,
        contador: 0,
        total: 0
    };

    let elementos = {};

    // ============ UTILITÁRIOS ============
    function log(msg) {
        console.log('[Aproprias]', msg);
    }

    function getEl(id) {
        return document.getElementById(id);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============ ATUALIZAR STATUS ============
    function setStatus(msg, cor = '#555') {
        const el = getEl('status-automacao');
        if (el) {
            el.innerText = msg;
            el.style.color = cor;
        }
        log(msg);
    }

    // ============ ATUALIZAR BOTÕES ============
    function atualizarBotoes() {
        const { executando, pausado } = estado;
        const play = getEl('btn-play');
        const pause = getEl('btn-pause');
        const stop = getEl('btn-stop');

        if (play) {
            play.innerText = executando ? '⏳ RODANDO' : '▶ PLAY';
            play.style.backgroundColor = executando ? '#ff9800' : '#4CAF50';
            play.disabled = executando;
        }

        if (pause) {
            pause.innerText = (executando && pausado) ? '▶ RETOMAR' : '⏸ PAUSE';
            pause.style.backgroundColor = '#FF9800';
            pause.disabled = !executando;
            pause.style.opacity = executando ? '1' : '0.5';
        }

        if (stop) {
            stop.disabled = !executando;
            stop.style.opacity = executando ? '1' : '0.5';
        }
    }

    function atualizarContador() {
        const el = getEl('contador-feitos');
        if (el) el.innerText = estado.contador;
    }

    // ============ EXECUTAR UMA APROPRIAÇÃO ============
    async function executarApropriacao() {
        const celulas = document.querySelectorAll('td');
        let alvo = null;
        let linha = null;

        for (const el of celulas) {
            const texto = el.textContent.replace(/\s+/g, ' ').trim();
            if (texto.includes('Sem Atendente / COP Encerramentos')) {
                alvo = el;
                linha = el.closest('tr');
                break;
            }
        }

        if (!alvo || !linha) {
            setStatus('❌ Nenhum "Sem Atendente" encontrado!', '#f44336');
            return false;
        }

        const id = linha.getAttribute('data-id');
        setStatus(`✅ ID: ${id}`, '#4CAF50');

        alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await delay(200);

        document.querySelectorAll('tr.row_selected').forEach(tr => tr.classList.remove('row_selected'));
        linha.classList.add('row_selected');

        ['mousedown', 'mouseup', 'click'].forEach(tipo => {
            linha.dispatchEvent(new MouseEvent(tipo, { view: window, bubbles: true, cancelable: true }));
        });

        const primeiraCelula = linha.querySelector('td');
        if (primeiraCelula) primeiraCelula.dispatchEvent(new Event('click', { bubbles: true }));

        alvo.style.backgroundColor = '#c8e6c9';
        linha.style.backgroundColor = '#e8f5e9';

        await delay(CFG.DELAY_SELECIONAR);

        const btn = getEl('change-responsible');
        if (!btn) {
            setStatus('❌ Botão não encontrado!', '#f44336');
            return false;
        }

        if (btn.disabled) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.removeAttribute('disabled');
            btn.classList.remove('disabled');
        }

        btn.click();
        ['mousedown', 'mouseup', 'click'].forEach(tipo => {
            btn.dispatchEvent(new MouseEvent(tipo, { view: window, bubbles: true, cancelable: true }));
        });

        const icone = btn.querySelector('i');
        if (icone) icone.click();

        setStatus('🔘 Apropriar', '#ff9800');
        await delay(CFG.DELAY_CLICAR);

        let btnSim = null;
        const dialogs = document.querySelectorAll('.ui-dialog');
        for (const dialog of dialogs) {
            if (dialog.style.display !== 'none' && dialog.offsetParent !== null) {
                const botoes = dialog.querySelectorAll('.ui-dialog-buttonpane .ui-button');
                for (const botao of botoes) {
                    if (botao.textContent.trim() === 'Sim') {
                        btnSim = botao;
                        break;
                    }
                }
                if (btnSim) break;
            }
        }

        if (btnSim) {
            btnSim.click();
            setStatus('✅ OK', '#4CAF50');
        } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
            setStatus('⚠️ Enter', '#ff9800');
        }

        linha.style.backgroundColor = '#a5d6a7';
        linha.style.border = '2px solid green';

        await delay(CFG.DELAY_CONFIRMAR);
        return true;
    }

    // ============ LOOP PRINCIPAL ============
    async function loopPrincipal() {
        if (estado.executando) return;

        const input = getEl('input-loop');
        estado.total = parseInt(input?.value) || 1;
        estado.contador = 0;
        estado.executando = true;
        estado.pausado = false;
        estado.parar = false;

        atualizarBotoes();
        atualizarContador();
        setStatus(`▶️ Iniciando ${estado.total}...`, '#ff9800');

        for (let i = 0; i < estado.total; i++) {
            if (estado.parar) {
                setStatus('⏹️ Parado', '#f44336');
                break;
            }

            while (estado.pausado) {
                setStatus('⏸️ PAUSADO', '#f44336');
                await delay(1000);
                if (estado.parar) break;
            }
            if (estado.parar) break;

            const sucesso = await executarApropriacao();
            if (sucesso) {
                estado.contador++;
                atualizarContador();
                setStatus(`✅ ${estado.contador}/${estado.total}`, '#4CAF50');
            } else {
                setStatus('❌ Falha', '#f44336');
                break;
            }

            if (i < estado.total - 1) {
                await delay(CFG.DELAY_ENTRE_LOOPS);
            }
        }

        estado.executando = false;
        estado.pausado = false;
        atualizarBotoes();

        if (!estado.parar) {
            setStatus(`🏁 ${estado.contador} concluídos!`, '#4CAF50');
        }
    }

    // ============ FUNÇÕES DOS BOTÕES ============
    function onPlay() {
        if (!estado.executando) loopPrincipal();
    }

    function onPause() {
        if (estado.executando && !estado.pausado) {
            estado.pausado = true;
            setStatus('⏸️ PAUSADO', '#f44336');
            atualizarBotoes();
        } else if (estado.executando && estado.pausado) {
            estado.pausado = false;
            setStatus('▶️ Retomando...', '#ff9800');
            atualizarBotoes();
        }
    }

    function onStop() {
        if (estado.executando) {
            estado.parar = true;
            estado.pausado = false;
            setStatus('⏹️ Parando...', '#f44336');
            atualizarBotoes();
        }
    }

    // ============ CRIAR PAINEL ============
    function criarPainel() {
        if (getEl('meu-painel-automacao')) return;
        if (!document.body) return;

        if (window.self === window.top && document.querySelectorAll('iframe').length > 0) return;
        if (!document.getElementById('assignmentTasks') && !document.querySelector('td')) return;

        const painel = document.createElement('div');
        painel.id = 'meu-painel-automacao';
        painel.style.cssText = `
            position:fixed;bottom:250px;left:10px;z-index:9999999;
            background:white;border-radius:12px;padding:8px 10px;
            box-shadow:0 4px 25px rgba(0,0,0,0.3);
            font-family:Arial,sans-serif;font-size:13px;
            width:220px;border:2px solid #1a237e;
            cursor:move;user-select:none;
        `;

        // Título
        const titulo = document.createElement('div');
        titulo.innerText = '☰ Arraste este Painel';
        titulo.style.cssText = `
            font-weight:bold;margin-bottom:12px;color:#1a237e;
            font-size:12px;text-align:center;border-bottom:1px solid #e0e0e0;
            padding-bottom:6px;
        `;
        painel.appendChild(titulo);

        // Configurações
        const config = document.createElement('div');
        config.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;';

        const labelLoop = document.createElement('label');
        labelLoop.innerText = 'Loops:';
        labelLoop.style.cssText = 'font-weight:600;font-size:12px;color:#333;min-width:45px;';
        config.appendChild(labelLoop);

        const inputLoop = document.createElement('input');
        inputLoop.id = 'input-loop';
        inputLoop.type = 'number';
        inputLoop.value = '1';
        inputLoop.min = '1';
        inputLoop.max = '999';
        inputLoop.style.cssText = 'width:50px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:13px;';
        config.appendChild(inputLoop);

        const labelContador = document.createElement('label');
        labelContador.innerText = 'Feitos:';
        labelContador.style.cssText = 'font-weight:600;font-size:12px;color:#333;margin-left:10px;min-width:45px;';
        config.appendChild(labelContador);

        const spanContador = document.createElement('span');
        spanContador.id = 'contador-feitos';
        spanContador.innerText = '0';
        spanContador.style.cssText = 'font-weight:bold;color:#1a237e;font-size:14px;';
        config.appendChild(spanContador);

        painel.appendChild(config);

        // Status
        const status = document.createElement('div');
        status.id = 'status-automacao';
        status.style.cssText = `
            font-size:11px;color:#555;margin-bottom:10px;padding:4px 8px;
            background:#f5f5f5;border-radius:4px;min-height:18px;
        `;
        status.innerText = '🟢 Pronto';
        painel.appendChild(status);

        // Botões
        const botoes = document.createElement('div');
        botoes.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';

        const botoesConfig = [
            ['btn-play', '▶ PLAY', '#4CAF50', onPlay],
            ['btn-pause', '⏸ PAUSE', '#FF9800', onPause],
            ['btn-stop', '⏹ STOP', '#f44336', onStop]
        ];

        botoesConfig.forEach(([id, label, cor, fn]) => {
            const btn = document.createElement('button');
            btn.id = id;
            btn.innerText = label;
            btn.style.cssText = `
                flex:1;padding:8px 12px;background:${cor};color:white;
                border:none;border-radius:6px;font-weight:bold;font-size:12px;
                cursor:pointer;transition:all 0.3s ease;
            `;
            if (id !== 'btn-play') {
                btn.style.opacity = '0.5';
                btn.disabled = true;
            }
            btn.onclick = fn;
            btn.onmouseover = () => {
                if (!btn.disabled) btn.style.filter = 'brightness(0.9)';
            };
            btn.onmouseout = () => {
                if (!btn.disabled) btn.style.filter = 'brightness(1)';
            };
            botoes.appendChild(btn);
        });

        painel.appendChild(botoes);

        // Arrastar
        let arrastando = false;
        let cliqueX = 0, cliqueY = 0;

        painel.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            arrastando = true;
            cliqueX = e.clientX - painel.offsetLeft;
            cliqueY = e.clientY - painel.offsetTop;
        });

        document.addEventListener('mousemove', (e) => {
            if (!arrastando) return;
            painel.style.left = (e.clientX - cliqueX) + 'px';
            painel.style.top = (e.clientY - cliqueY) + 'px';
            painel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => { arrastando = false; });

        document.body.appendChild(painel);
        log('✅ Painel criado');
    }

    // ============ INICIAR ============
    function iniciar() {
        let tentativas = 0;
        const interval = setInterval(() => {
            tentativas++;
            const tabela = document.getElementById('assignmentTasks') || document.querySelector('td');
            if (tabela && !getEl('meu-painel-automacao')) {
                criarPainel();
                clearInterval(interval);
            }
            if (tentativas >= CFG.MAX_TENTATIVAS) {
                clearInterval(interval);
                log('⚠️ Tempo esgotado');
            }
        }, CFG.INTERVALO);
    }

    // ============ EXECUTAR ============
    if (location.href.includes('legacy/operations') || location.href.includes('ui/')) {
        setTimeout(iniciar, 1500);

        const observer = new MutationObserver(() => {
            if (!getEl('meu-painel-automacao')) {
                const tabela = document.getElementById('assignmentTasks') || document.querySelector('td');
                if (tabela) criarPainel();
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        log('✅ Script Aproprias Rústico iniciado');
    }

})();
