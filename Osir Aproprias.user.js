// ==UserScript==
// @name         Osir - Aproprias
// @namespace    https://github.com/AlissonGuerreiro/meus-scripts
// @version      8.5
// @description  Painel com loop, play, pause - Versão Super Rápida (0.5s)
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

    // ===== CONFIGURAÇÕES SUPER RÁPIDAS =====
    const DELAYS = {
        APOS_SELECIONAR: 1100,
        APOS_CLICAR: 1100,
        APOS_CONFIRMAR: 1300
    };
    const DELAY_ENTRE_LOOPS = 2300;

    // ===== VARIÁVEIS DE CONTROLE =====
    let executando = false;
    let pausado = false;
    let parar = false;
    let contador = 0;
    let totalDesejado = 0;

    function iniciarPainel() {
        if (document.getElementById('meu-painel-automacao')) return;
        if (!document.body) return;

        if (window.self === window.top && document.querySelectorAll('iframe').length > 0) {
            return;
        }

        const tabelaExiste = document.getElementById('assignmentTasks') || document.querySelector('td');
        if (!tabelaExiste) return;

        // ===== CRIA O PAINEL =====
        const painel = document.createElement('div');
        painel.id = 'meu-painel-automacao';
        painel.style.position = 'fixed';
        painel.style.bottom = '250px';
        painel.style.left = '10px';
        painel.style.zIndex = '9999999';
        painel.style.background = 'white';
        painel.style.borderRadius = '12px';
        painel.style.padding = '8px 10px';
        painel.style.boxShadow = '0 4px 25px rgba(0,0,0,0.3)';
        painel.style.fontFamily = 'Arial, sans-serif';
        painel.style.fontSize = '13px';
        painel.style.width = '220px';
        painel.style.border = '2px solid #1a237e';
        painel.style.cursor = 'move';
        painel.style.userSelect = 'none';

        // ===== TÍTULO =====
        const titulo = document.createElement('div');
        titulo.innerText = '☰ Arraste este Painel';
        titulo.style.fontWeight = 'bold';
        titulo.style.marginBottom = '12px';
        titulo.style.color = '#1a237e';
        titulo.style.fontSize = '12px';
        titulo.style.textAlign = 'center';
        titulo.style.borderBottom = '1px solid #e0e0e0';
        titulo.style.paddingBottom = '6px';
        painel.appendChild(titulo);

        // ===== CONFIGURAÇÕES =====
        const configDiv = document.createElement('div');
        configDiv.style.display = 'flex';
        configDiv.style.alignItems = 'center';
        configDiv.style.gap = '8px';
        configDiv.style.marginBottom = '10px';

        const labelLoop = document.createElement('label');
        labelLoop.innerText = 'Loops:';
        labelLoop.style.fontWeight = '600';
        labelLoop.style.fontSize = '12px';
        labelLoop.style.color = '#333';
        labelLoop.style.minWidth = '45px';
        configDiv.appendChild(labelLoop);

        const inputLoop = document.createElement('input');
        inputLoop.id = 'input-loop';
        inputLoop.type = 'number';
        inputLoop.value = '1';
        inputLoop.min = '1';
        inputLoop.max = '999';
        inputLoop.style.width = '50px';
        inputLoop.style.padding = '4px 6px';
        inputLoop.style.border = '1px solid #ccc';
        inputLoop.style.borderRadius = '4px';
        inputLoop.style.fontSize = '13px';
        configDiv.appendChild(inputLoop);

        const labelContador = document.createElement('label');
        labelContador.innerText = 'Feitos:';
        labelContador.style.fontWeight = '600';
        labelContador.style.fontSize = '12px';
        labelContador.style.color = '#333';
        labelContador.style.marginLeft = '10px';
        labelContador.style.minWidth = '45px';
        configDiv.appendChild(labelContador);

        const spanContador = document.createElement('span');
        spanContador.id = 'contador-feitos';
        spanContador.innerText = '0';
        spanContador.style.fontWeight = 'bold';
        spanContador.style.color = '#1a237e';
        spanContador.style.fontSize = '14px';
        configDiv.appendChild(spanContador);

        painel.appendChild(configDiv);

        // ===== STATUS =====
        const statusDiv = document.createElement('div');
        statusDiv.id = 'status-automacao';
        statusDiv.style.fontSize = '11px';
        statusDiv.style.color = '#555';
        statusDiv.style.marginBottom = '10px';
        statusDiv.style.padding = '4px 8px';
        statusDiv.style.background = '#f5f5f5';
        statusDiv.style.borderRadius = '4px';
        statusDiv.style.minHeight = '18px';
        statusDiv.innerText = '🟢 Pronto';
        painel.appendChild(statusDiv);

        function atualizarStatus(msg, cor = '#555') {
            statusDiv.innerText = msg;
            statusDiv.style.color = cor;
            console.log(`📌 ${msg}`);
        }

        // ===== BOTÕES =====
        const botoesDiv = document.createElement('div');
        botoesDiv.style.display = 'flex';
        botoesDiv.style.gap = '6px';
        botoesDiv.style.marginBottom = '8px';

        // Botão PLAY
        const btnPlay = document.createElement('button');
        btnPlay.id = 'btn-play';
        btnPlay.innerText = '▶ PLAY';
        btnPlay.style.flex = '1';
        btnPlay.style.padding = '8px 12px';
        btnPlay.style.backgroundColor = '#4CAF50';
        btnPlay.style.color = 'white';
        btnPlay.style.border = 'none';
        btnPlay.style.borderRadius = '6px';
        btnPlay.style.fontWeight = 'bold';
        btnPlay.style.fontSize = '12px';
        btnPlay.style.cursor = 'pointer';
        btnPlay.style.transition = 'all 0.3s ease';
        btnPlay.onmouseover = () => btnPlay.style.backgroundColor = '#388E3C';
        btnPlay.onmouseout = () => btnPlay.style.backgroundColor = '#4CAF50';
        botoesDiv.appendChild(btnPlay);

        // Botão PAUSE
        const btnPause = document.createElement('button');
        btnPause.id = 'btn-pause';
        btnPause.innerText = '⏸ PAUSE';
        btnPause.style.flex = '1';
        btnPause.style.padding = '8px 12px';
        btnPause.style.backgroundColor = '#FF9800';
        btnPause.style.color = 'white';
        btnPause.style.border = 'none';
        btnPause.style.borderRadius = '6px';
        btnPause.style.fontWeight = 'bold';
        btnPause.style.fontSize = '12px';
        btnPause.style.cursor = 'pointer';
        btnPause.style.transition = 'all 0.3s ease';
        btnPause.style.opacity = '0.5';
        btnPause.disabled = true;
        btnPause.onmouseover = () => btnPause.style.backgroundColor = '#F57C00';
        btnPause.onmouseout = () => btnPause.style.backgroundColor = '#FF9800';
        botoesDiv.appendChild(btnPause);

        // Botão STOP
        const btnStop = document.createElement('button');
        btnStop.id = 'btn-stop';
        btnStop.innerText = '⏹ STOP';
        btnStop.style.flex = '1';
        btnStop.style.padding = '8px 12px';
        btnStop.style.backgroundColor = '#f44336';
        btnStop.style.color = 'white';
        btnStop.style.border = 'none';
        btnStop.style.borderRadius = '6px';
        btnStop.style.fontWeight = 'bold';
        btnStop.style.fontSize = '12px';
        btnStop.style.cursor = 'pointer';
        btnStop.style.transition = 'all 0.3s ease';
        btnStop.style.opacity = '0.5';
        btnStop.disabled = true;
        btnStop.onmouseover = () => btnStop.style.backgroundColor = '#c62828';
        btnStop.onmouseout = () => btnStop.style.backgroundColor = '#f44336';
        botoesDiv.appendChild(btnStop);

        painel.appendChild(botoesDiv);

        // ===== FUNÇÃO DE DELAY =====
        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // ===== FUNÇÃO PARA EXECUTAR UMA APROPRIAÇÃO =====
        async function executarApropriacao() {
            const celulas = document.querySelectorAll('td');
            let itemAlvo = null;
            let linhaAlvo = null;

            for (let el of celulas) {
                const textoLimpo = el.textContent.replace(/\s+/g, ' ').trim();
                if (textoLimpo.includes('Sem Atendente / COP Encerramentos')) {
                    itemAlvo = el;
                    linhaAlvo = el.closest('tr');
                    break;
                }
            }

            if (!itemAlvo || !linhaAlvo) {
                atualizarStatus('❌ Nenhum "Sem Atendente" encontrado!', '#f44336');
                return false;
            }

            const id = linhaAlvo.getAttribute('data-id');
            atualizarStatus(`✅ ID: ${id}`, '#4CAF50');

            itemAlvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
            await delay(200);

            document.querySelectorAll('tr.row_selected').forEach(tr => {
                tr.classList.remove('row_selected');
            });
            linhaAlvo.classList.add('row_selected');

            ['mousedown', 'mouseup', 'click'].forEach(tipo => {
                const evt = new MouseEvent(tipo, { view: window, bubbles: true, cancelable: true });
                linhaAlvo.dispatchEvent(evt);
            });
            const primeiraCelula = linhaAlvo.querySelector('td');
            if (primeiraCelula) {
                primeiraCelula.dispatchEvent(new Event('click', { bubbles: true }));
            }

            itemAlvo.style.backgroundColor = '#c8e6c9';
            linhaAlvo.style.backgroundColor = '#e8f5e9';

            await delay(DELAYS.APOS_SELECIONAR);

            const btn = document.getElementById('change-responsible');
            if (!btn) {
                atualizarStatus('❌ Botão não encontrado!', '#f44336');
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
                const evt = new MouseEvent(tipo, { view: window, bubbles: true, cancelable: true });
                btn.dispatchEvent(evt);
            });
            const icone = btn.querySelector('i');
            if (icone) icone.click();

            atualizarStatus('🔘 Apropriar', '#ff9800');
            await delay(DELAYS.APOS_CLICAR);

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
                atualizarStatus('✅ OK', '#4CAF50');
            } else {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
                atualizarStatus('⚠️ Enter', '#ff9800');
            }

            linhaAlvo.style.backgroundColor = '#a5d6a7';
            linhaAlvo.style.border = '2px solid green';

            await delay(DELAYS.APOS_CONFIRMAR);
            return true;
        }

        // ===== LOOP PRINCIPAL =====
        async function executarLoop() {
            if (executando) return;

            const inputLoop = document.getElementById('input-loop');
            totalDesejado = parseInt(inputLoop.value) || 1;
            contador = 0;
            executando = true;
            pausado = false;
            parar = false;

            btnPlay.innerText = '⏳ RODANDO';
            btnPlay.style.backgroundColor = '#ff9800';
            btnPlay.disabled = true;
            btnPause.disabled = false;
            btnPause.style.opacity = '1';
            btnPause.innerText = '⏸ PAUSE';
            btnStop.disabled = false;
            btnStop.style.opacity = '1';

            document.getElementById('contador-feitos').innerText = '0';
            atualizarStatus(`▶️ Iniciando ${totalDesejado}...`, '#ff9800');

            for (let i = 0; i < totalDesejado; i++) {
                if (parar) {
                    atualizarStatus('⏹️ Parado', '#f44336');
                    break;
                }

                while (pausado) {
                    atualizarStatus('⏸️ PAUSADO', '#f44336');
                    await delay(1000);
                    if (parar) break;
                }
                if (parar) break;

                const sucesso = await executarApropriacao();
                if (sucesso) {
                    contador++;
                    document.getElementById('contador-feitos').innerText = contador;
                    atualizarStatus(`✅ ${contador}/${totalDesejado}`, '#4CAF50');
                } else {
                    atualizarStatus('❌ Falha', '#f44336');
                    break;
                }

                if (i < totalDesejado - 1) {
                    await delay(DELAY_ENTRE_LOOPS);
                }
            }

            executando = false;
            pausado = false;
            btnPlay.innerText = '▶ PLAY';
            btnPlay.style.backgroundColor = '#4CAF50';
            btnPlay.disabled = false;
            btnPause.disabled = true;
            btnPause.style.opacity = '0.5';
            btnPause.innerText = '⏸ PAUSE';
            btnStop.disabled = true;
            btnStop.style.opacity = '0.5';

            if (!parar) {
                atualizarStatus(`🏁 ${contador} concluídos!`, '#4CAF50');
            }
        }

        // ===== EVENTOS DOS BOTÕES =====
        btnPlay.addEventListener('click', () => {
            if (!executando) {
                executarLoop();
            }
        });

        btnPause.addEventListener('click', () => {
            if (executando && !pausado) {
                pausado = true;
                btnPause.innerText = '▶ RETOMAR';
                atualizarStatus('⏸️ PAUSADO', '#f44336');
            } else if (executando && pausado) {
                pausado = false;
                btnPause.innerText = '⏸ PAUSE';
                atualizarStatus('▶️ Retomando...', '#ff9800');
            }
        });

        btnStop.addEventListener('click', () => {
            if (executando) {
                parar = true;
                pausado = false;
                atualizarStatus('⏹️ Parando...', '#f44336');
                btnPause.innerText = '⏸ PAUSE';
            }
        });

        inputLoop.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                btnPlay.click();
            }
        });

        // ===== LÓGICA DE ARRASTAR =====
        let arrastando = false;
        let cliqueX = 0, cliqueY = 0;

        painel.addEventListener('mousedown', (e) => {
            if (e.target === btnPlay || e.target === btnPause || e.target === btnStop) return;
            if (e.target.tagName === 'INPUT') return;
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

        document.addEventListener('mouseup', () => {
            arrastando = false;
        });

        painel.appendChild(botoesDiv);
        document.body.appendChild(painel);
        console.log('✅ Painel Super Rápido criado!');
        console.log(`⏱️ Delays: ${DELAYS.APOS_SELECIONAR/1000}s / ${DELAYS.APOS_CLICAR/1000}s / ${DELAYS.APOS_CONFIRMAR/1000}s`);
        console.log(`⏱️ Entre loops: ${DELAY_ENTRE_LOOPS/1000}s`);
        console.log('📌 Configure a quantidade e clique em PLAY');
    }

    // ===== INICIALIZA =====
    iniciarPainel();
    const observador = new MutationObserver(() => iniciarPainel());
    observador.observe(document.documentElement, { childList: true, subtree: true });

})();
