// ==UserScript==
// @name         Osir - Aproprias
// @namespace    https://github.com/AlissonGuerreiro/meus-scripts
// @version      7.1
// @description  Painel com loop, play, pause - Versão Super Rápida (0.5s)
// @author       AlissonGuerreiro
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

    // ===== CONFIGURAÇÕES =====
    const DEBUG = true;
    const DELAYS = {
        APOS_SELECIONAR: 1000,
        APOS_CLICAR: 1000,
        APOS_CONFIRMAR: 1200,
        APOS_FALHA: 1500
    };
    const DELAY_ENTRE_LOOPS = 2200;
    const MAX_TENTATIVAS_POR_APROPRIACAO = 3;

    // ===== FUNÇÕES UTILITÁRIAS =====
    function log(...args) {
        if (DEBUG) console.log(...args);
    }

    function logError(...args) {
        if (DEBUG) console.error(...args);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== VARIÁVEIS DE CONTROLE =====
    let executando = false;
    let pausado = false;
    let parar = false;
    let contador = 0;
    let totalDesejado = 0;
    let painelCriado = false;

    // ===== ESTILOS COMPARTILHADOS DOS BOTÕES =====
    const ESTILO_BOTAO_BASE = {
        flex: '1',
        padding: '8px 12px',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontWeight: 'bold',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
    };

    function criarBotao(texto, corFundo, corHover) {
        const botao = document.createElement('button');
        Object.assign(botao.style, ESTILO_BOTAO_BASE, { backgroundColor: corFundo });
        botao.textContent = texto;
        botao.onmouseover = () => botao.style.backgroundColor = corHover;
        botao.onmouseout = () => botao.style.backgroundColor = corFundo;
        return botao;
    }

    function iniciarPainel() {
        // Evita criação duplicada
        if (painelCriado || document.getElementById('meu-painel-automacao')) return;
        if (!document.body) return;

        if (window.self === window.top && document.querySelectorAll('iframe').length > 0) {
            return;
        }

        const tabelaExiste = document.getElementById('assignmentTasks') || document.querySelector('td');
        if (!tabelaExiste) return;

        painelCriado = true;

        // ===== CRIA O PAINEL =====
        const painel = document.createElement('div');
        painel.id = 'meu-painel-automacao';
        Object.assign(painel.style, {
            position: 'fixed',
            bottom: '250px',
            left: '10px',
            zIndex: '9999999',
            background: 'white',
            borderRadius: '12px',
            padding: '8px 10px',
            boxShadow: '0 4px 25px rgba(0,0,0,0.3)',
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            width: '220px',
            border: '2px solid #1a237e',
            cursor: 'move',
            userSelect: 'none'
        });

        // ===== TÍTULO =====
        const titulo = document.createElement('div');
        titulo.textContent = '☰ Arraste este Painel';
        Object.assign(titulo.style, {
            fontWeight: 'bold',
            marginBottom: '12px',
            color: '#1a237e',
            fontSize: '12px',
            textAlign: 'center',
            borderBottom: '1px solid #e0e0e0',
            paddingBottom: '6px'
        });
        painel.appendChild(titulo);

        // ===== CONFIGURAÇÕES =====
        const configDiv = document.createElement('div');
        Object.assign(configDiv.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px'
        });

        const labelLoop = document.createElement('label');
        labelLoop.textContent = 'Loops:';
        Object.assign(labelLoop.style, {
            fontWeight: '600',
            fontSize: '12px',
            color: '#333',
            minWidth: '45px'
        });
        configDiv.appendChild(labelLoop);

        const inputLoop = document.createElement('input');
        inputLoop.id = 'input-loop';
        inputLoop.type = 'number';
        inputLoop.value = '1';
        inputLoop.min = '1';
        inputLoop.max = '999';
        Object.assign(inputLoop.style, {
            width: '50px',
            padding: '4px 6px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '13px'
        });
        configDiv.appendChild(inputLoop);

        const labelContador = document.createElement('label');
        labelContador.textContent = 'Feitos:';
        Object.assign(labelContador.style, {
            fontWeight: '600',
            fontSize: '12px',
            color: '#333',
            marginLeft: '10px',
            minWidth: '45px'
        });
        configDiv.appendChild(labelContador);

        const spanContador = document.createElement('span');
        spanContador.id = 'contador-feitos';
        spanContador.textContent = '0';
        Object.assign(spanContador.style, {
            fontWeight: 'bold',
            color: '#1a237e',
            fontSize: '14px'
        });
        configDiv.appendChild(spanContador);

        painel.appendChild(configDiv);

        // ===== STATUS =====
        const statusDiv = document.createElement('div');
        statusDiv.id = 'status-automacao';
        Object.assign(statusDiv.style, {
            fontSize: '11px',
            color: '#555',
            marginBottom: '10px',
            padding: '4px 8px',
            background: '#f5f5f5',
            borderRadius: '4px',
            minHeight: '18px'
        });
        statusDiv.textContent = '🟢 Pronto';
        painel.appendChild(statusDiv);

        function atualizarStatus(msg, cor = '#555') {
            statusDiv.textContent = msg;
            statusDiv.style.color = cor;
            log(`📌 ${msg}`);
        }

        // ===== BOTÕES =====
        const botoesDiv = document.createElement('div');
        Object.assign(botoesDiv.style, {
            display: 'flex',
            gap: '6px',
            marginBottom: '8px'
        });

        const btnPlay = criarBotao('▶ PLAY', '#4CAF50', '#388E3C');
        btnPlay.id = 'btn-play';
        botoesDiv.appendChild(btnPlay);

        const btnPause = criarBotao('⏸ PAUSE', '#FF9800', '#F57C00');
        btnPause.id = 'btn-pause';
        btnPause.style.opacity = '0.5';
        btnPause.disabled = true;
        botoesDiv.appendChild(btnPause);

        const btnStop = criarBotao('⏹ STOP', '#f44336', '#c62828');
        btnStop.id = 'btn-stop';
        btnStop.style.opacity = '0.5';
        btnStop.disabled = true;
        botoesDiv.appendChild(btnStop);

        painel.appendChild(botoesDiv);

        // ===== FUNÇÃO PARA EXECUTAR UMA APROPRIAÇÃO =====
        async function executarApropriacao() {
            try {
                const celulas = document.querySelectorAll('#assignmentTasks td, td');
                let itemAlvo = null;
                let linhaAlvo = null;

                // Early check para evitar regex desnecessário
                for (let el of celulas) {
                    if (!el.textContent.includes('Sem Atendente')) continue;
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
                atualizarStatus(`🔍 Tentando ID: ${id}`, '#4CAF50');

                itemAlvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await delay(200);

                document.querySelectorAll('tr.row_selected').forEach(tr => {
                    tr.classList.remove('row_selected');
                });
                linhaAlvo.classList.add('row_selected');
                linhaAlvo.click();

                itemAlvo.style.backgroundColor = '#c8e6c9';
                linhaAlvo.style.backgroundColor = '#e8f5e9';

                await delay(DELAYS.APOS_SELECIONAR);

                // ===== VERIFICA SE O BOTÃO EXISTE E ESTÁ ACESSÍVEL =====
                const btn = document.getElementById('change-responsible');
                if (!btn) {
                    atualizarStatus('❌ Botão "change-responsible" não encontrado!', '#f44336');
                    return false;
                }

                if (btn.disabled) {
                    log('⚠️ Botão estava disabled, tentando habilitar...');
                    btn.disabled = false;
                }

                btn.click();
                atualizarStatus('🔘 Aguardando confirmação...', '#ff9800');
                await delay(DELAYS.APOS_CLICAR);

                // ===== BUSCA O DIÁLOGO VISÍVEL =====
                let btnSim = null;
                const dialogVisivel = document.querySelector('.ui-dialog:not([style*="display: none"])');

                if (dialogVisivel) {
                    const botoes = dialogVisivel.querySelectorAll('.ui-dialog-buttonpane .ui-button');
                    for (const botao of botoes) {
                        if (botao.textContent.trim() === 'Sim') {
                            btnSim = botao;
                            break;
                        }
                    }
                }

                if (btnSim) {
                    btnSim.click();
                    atualizarStatus('✅ Confirmado!', '#4CAF50');
                } else {
                    // Fallback: tenta Enter
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                    atualizarStatus('⚠️ Confirmado via Enter', '#ff9800');
                }

                linhaAlvo.style.backgroundColor = '#a5d6a7';
                linhaAlvo.style.border = '2px solid green';

                await delay(DELAYS.APOS_CONFIRMAR);

                // ===== VERIFICAÇÃO DE SUCESSO =====
                // Aguarda um pouco para o sistema processar
                await delay(500);

                // Verifica se a linha ainda existe e se foi realmente apropriada
                const linhaAindaExiste = document.querySelector(`tr[data-id="${id}"]`);
                if (linhaAindaExiste) {
                    const aindaTemSemAtendente = linhaAindaExiste.textContent.includes('Sem Atendente / COP Encerramentos');
                    if (aindaTemSemAtendente) {
                        atualizarStatus('⚠️ Apropriação pode ter falhado - linha ainda consta como "Sem Atendente"', '#ff9800');
                        linhaAlvo.style.backgroundColor = '#ffebee';
                        linhaAlvo.style.border = '2px solid red';
                        return false;
                    }
                }

                // Se a linha desapareceu ou não tem mais "Sem Atendente", considera sucesso
                return true;

            } catch (erro) {
                logError('❌ Erro na apropriação:', erro);
                atualizarStatus(`❌ Erro: ${erro.message}`, '#f44336');
                return false;
            }
        }

        // ===== LOOP PRINCIPAL (COM while PARA GARANTIR SUCESSOS REAIS) =====
        async function executarLoop() {
            if (executando) return;

            totalDesejado = Math.max(1, Math.min(999, parseInt(inputLoop.value) || 1));
            inputLoop.value = totalDesejado;

            contador = 0;
            executando = true;
            pausado = false;
            parar = false;

            btnPlay.textContent = '⏳ RODANDO';
            btnPlay.style.backgroundColor = '#ff9800';
            btnPlay.disabled = true;
            btnPause.disabled = false;
            btnPause.style.opacity = '1';
            btnPause.textContent = '⏸ PAUSE';
            btnStop.disabled = false;
            btnStop.style.opacity = '1';

            document.getElementById('contador-feitos').textContent = '0';
            atualizarStatus(`▶️ Iniciando ${totalDesejado}...`, '#ff9800');

            let tentativas = 0;
            const maxTentativas = totalDesejado * MAX_TENTATIVAS_POR_APROPRIACAO;

            // Loop while: continua até atingir o número desejado de SUCESSOS
            while (contador < totalDesejado && tentativas < maxTentativas) {
                if (parar) {
                    atualizarStatus('⏹️ Parado pelo usuário', '#f44336');
                    break;
                }

                // Aguarda enquanto estiver pausado
                while (pausado && !parar) {
                    atualizarStatus('⏸️ PAUSADO', '#f44336');
                    await delay(1000);
                }
                if (parar) break;

                tentativas++;
                atualizarStatus(`🔄 Tentativa ${tentativas} - ${contador}/${totalDesejado} concluídos`, '#1a237e');

                const sucesso = await executarApropriacao();

                if (sucesso) {
                    contador++;
                    document.getElementById('contador-feitos').textContent = contador;
                    atualizarStatus(`✅ ${contador}/${totalDesejado} (${tentativas} tentativas)`, '#4CAF50');
                } else {
                    atualizarStatus(`⚠️ Falha na tentativa ${tentativas}. Nova tentativa em breve...`, '#ff9800');
                    // Pausa extra após falha para dar tempo do sistema recuperar
                    await delay(DELAYS.APOS_FALHA);
                    continue; // Não conta como sucesso, tenta novamente
                }

                // Delay entre apropriações bem-sucedidas (se ainda precisar de mais)
                if (contador < totalDesejado) {
                    await delay(DELAY_ENTRE_LOOPS);
                }
            }

            // Verifica se atingiu o limite de tentativas
            if (tentativas >= maxTentativas && contador < totalDesejado) {
                atualizarStatus(`❌ Limite de ${maxTentativas} tentativas atingido. ${contador}/${totalDesejado} concluídos.`, '#f44336');
            } else if (parar) {
                atualizarStatus(`⏹️ Parado. ${contador}/${totalDesejado} concluídos em ${tentativas} tentativas.`, '#f44336');
            } else {
                atualizarStatus(`🏁 Sucesso! ${contador}/${totalDesejado} concluídos em ${tentativas} tentativas.`, '#4CAF50');
            }

            // Reset dos botões
            executando = false;
            pausado = false;
            btnPlay.textContent = '▶ PLAY';
            btnPlay.style.backgroundColor = '#4CAF50';
            btnPlay.disabled = false;
            btnPause.disabled = true;
            btnPause.style.opacity = '0.5';
            btnPause.textContent = '⏸ PAUSE';
            btnStop.disabled = true;
            btnStop.style.opacity = '0.5';
        }

        // ===== EVENTOS DOS BOTÕES =====
        btnPlay.addEventListener('click', () => {
            if (!executando) {
                executarLoop();
            }
        });

        btnPause.addEventListener('click', () => {
            if (!executando) return;

            if (!pausado) {
                pausado = true;
                btnPause.textContent = '▶ RETOMAR';
                atualizarStatus('⏸️ PAUSADO', '#f44336');
            } else {
                pausado = false;
                btnPause.textContent = '⏸ PAUSE';
                atualizarStatus('▶️ Retomando...', '#ff9800');
            }
        });

        btnStop.addEventListener('click', () => {
            if (executando) {
                parar = true;
                pausado = false;
                atualizarStatus('⏹️ Parando...', '#f44336');
                btnPause.textContent = '⏸ PAUSE';
            }
        });

        inputLoop.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !executando) {
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

        // Adiciona o painel ao DOM
        document.body.appendChild(painel);

        log('✅ Painel Super Rápido v7.1 criado!');
        log('🔄 NOVA FUNÇÃO: Apenas conta apropriações REALMENTE bem-sucedidas');
        log(`⏱️ Delays: ${DELAYS.APOS_SELECIONAR/1000}s / ${DELAYS.APOS_CLICAR/1000}s / ${DELAYS.APOS_CONFIRMAR/1000}s`);
        log(`⏱️ Entre loops: ${DELAY_ENTRE_LOOPS/1000}s | Pós-falha: ${DELAYS.APOS_FALHA/1000}s`);
        log(`🔄 Máximo de ${MAX_TENTATIVAS_POR_APROPRIACAO} tentativas por apropriação`);
        log('📌 Configure a quantidade e clique em PLAY');
    }

    // ===== INICIALIZAÇÃO =====
    iniciarPainel();

    const observador = new MutationObserver(() => iniciarPainel());
    observador.observe(document.documentElement, { childList: true, subtree: true });

    // Cleanup para evitar memory leaks
    window.addEventListener('beforeunload', () => {
        observador.disconnect();
        parar = true;
    });

})();
