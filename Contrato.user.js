// ==UserScript==
// @name         Contrato - Com ID da ONU Correto
// @namespace    http://tampermonkey.net/
// @version      17.5
// @description  Captura e preenche corretamente o ID da ONU
// @author       Alisson Guerreiro / Modo Integrado
// @match        *://*.osirnet.com.br/*
// @match        *://*.osir.net.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const URL_ATENDIMENTO = "filaProvisionamento.php";
    const URL_CONTRATO_VOALLE = "authentication_contracts/contract_panel";

    // =========================================================================
    // FUNÇÃO AUXILIAR: CALCULO INTELIGENTE DE VLAN (REGRA OSIRNET)
    // =========================================================================
    function calcularVlanOsir(pontoAcesso, slotStr, portaStr) {
        const pa = (pontoAcesso || "").toUpperCase();

        // Regra de Exceção: Pontos de acesso com VLAN Fixa 2200
        if (pa.includes("STL_CE3_R") || pa.includes("STL_CE4_R") || pa.includes("TTN_LAN") || pa.includes("GAR")) {
            return "2200";
        }

        const slot = parseInt(slotStr, 10);
        const porta = parseInt(portaStr, 10);

        if (isNaN(slot) || isNaN(porta)) return "XX";

        // Regra para Slot 00 (Soma 10)
        if (slot === 0) {
            return (porta + 10).toString();
        }

        // Regra para Slots maiores que 0 (Concatenação Posicional)
        const portaFormatada = porta < 10 ? "0" + porta : porta.toString();
        return slot.toString() + portaFormatada;
    }

    // =========================================================================
    // FUNÇÃO PARA DETERMINAR TIPO DE EQUIPAMENTO BASEADO NO PONTO DE ACESSO
    // =========================================================================
    function determinarTipoEquipamento(pontoAcesso, serial) {
        const pa = (pontoAcesso || "").toUpperCase();
        const serialUpper = (serial || "").toUpperCase();

        // ✅ PRIORIDADE: Verifica o final do Ponto de Acesso (R ou B)
        if (pa.endsWith("_R")) {
            // É um Router
            if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) {
                return "ZTE Router";
            } else if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) {
                return "Huawei Router";
            } else if (serialUpper.startsWith("RCMG")) {
                return "Raisecom Router";
            }
            return "Router (Padrão)";
        }

        if (pa.endsWith("_B")) {
            // É uma Bridge
            if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A544") || serialUpper.startsWith("ZTEGD")) {
                return "ZTE Bridge";
            } else if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) {
                return "Huawei Bridge";
            }
            return "Bridge (Padrão)";
        }

        // Fallback: Se não encontrar R/B, usa a lógica antiga
        if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) {
            return "ZTE Router";
        } else if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) {
            return "Huawei Router";
        } else if (serialUpper.startsWith("RCMG")) {
            return "Raisecom Router";
        } else if (serialUpper.startsWith("5A544") || serialUpper.startsWith("ZTEGD")) {
            return "ZTE Bridge";
        } else {
            return "Equipamento Desconhecido";
        }
    }

    // =========================================================================
    // FUNÇÃO PARA EXTRAIR NÚMERO DO CONTRATO DA URL
    // =========================================================================
    function extrairContratoDaURL() {
        const url = window.location.href;
        const match = url.match(/contract_panel\/(\d+)/);
        if (match && match[1]) {
            return match[1].trim();
        }

        // Fallback: tentar encontrar na página
        const textoPagina = document.body.innerText;
        const matchTexto = textoPagina.match(/Contrato\s*[#:]\s*(\d+)/i);
        if (matchTexto && matchTexto[1]) {
            return matchTexto[1].trim();
        }

        return null;
    }

    // =========================================================================
    // JANELA FLUTUANTE - APENAS PARA PÁGINA DE CONTRATO E SE FOR O MESMO
    // =========================================================================
    function criarJanelaFlutuante(dados, contratoAtual) {
        // Verifica se o contrato copiado é o mesmo da página
        const contratoCopiado = dados.contrato;

        if (contratoCopiado && contratoAtual && contratoCopiado !== contratoAtual) {
            console.log(`🔴 Contrato diferente: Copiado=${contratoCopiado}, Atual=${contratoAtual}`);
            return;
        }

        // Remove janela existente se houver
        const janelaExistente = document.getElementById('osir-floating-window');
        if (janelaExistente) {
            janelaExistente.remove();
        }

        // Determina o tipo de equipamento baseado no Ponto de Acesso
        const tipoEquip = determinarTipoEquipamento(dados.pontoAcesso, dados.serial);

        const janela = document.createElement('div');
        janela.id = 'osir-floating-window';
        janela.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            width: 380px;
            max-height: 550px;
            background: #ffffff;
            border: 2px solid #8b5cf6;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 99999;
            font-family: 'Segoe UI', Arial, sans-serif;
            padding: 16px;
            overflow-y: auto;
            transition: all 0.3s ease;
        `;

        // Cabeçalho com botão fechar e indicação de contrato
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #f3f4f6;
        `;

        const titulo = document.createElement('h3');
        titulo.textContent = `📋 Dados do Contrato #${contratoCopiado || '???'}`;
        titulo.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: bold;
            color: #1f2937;
        `;

        const btnFechar = document.createElement('button');
        btnFechar.textContent = '✕ Fechar';
        btnFechar.style.cssText = `
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 4px 12px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
            transition: background 0.2s;
        `;
        btnFechar.onmouseover = () => btnFechar.style.background = '#dc2626';
        btnFechar.onmouseout = () => btnFechar.style.background = '#ef4444';
        btnFechar.onclick = () => janela.remove();

        header.appendChild(titulo);
        header.appendChild(btnFechar);
        janela.appendChild(header);

        // Badge de confirmação de contrato
        const badge = document.createElement('div');
        badge.style.cssText = `
            background: #d1fae5;
            color: #065f46;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 12px;
            text-align: center;
        `;
        badge.textContent = '✅ Contrato correspondente - Dados válidos';
        janela.appendChild(badge);

        // Conteúdo dos dados
        const conteudo = document.createElement('div');
        conteudo.style.cssText = 'font-size: 13px;';

        const campos = [
            { label: '🔢 Contrato', valor: dados.contrato || 'Nenhum' },
            { label: '🔌 Serial', valor: dados.serial || 'XX' },
            { label: '📡 SSID', valor: dados.ssid || 'XX' },
            { label: '🔑 Senha', valor: dados.senha || 'XX' },
            { label: '📶 Ponto Acesso', valor: dados.pontoAcesso || 'N/A' },
            { label: '📌 Tipo (R/B)', valor: dados.pontoAcesso ? (dados.pontoAcesso.endsWith('_R') ? '🔴 Router (R)' : dados.pontoAcesso.endsWith('_B') ? '🔵 Bridge (B)' : '⚠️ Indefinido') : 'N/A' },
            { label: '🖥️ OLT', valor: dados.olt || 'N/A' },
            { label: '📊 Slot OLT', valor: dados.slot || 'XX' },
            { label: '🔌 Porta OLT', valor: dados.porta || 'XX' },
            { label: '🆔 ID ONU', valor: dados.id || 'XX' },
            { label: '🌐 VLAN Calculada', valor: dados.vlan || 'XX' },
            { label: '📦 Tipo Equipamento', valor: tipoEquip }
        ];

        campos.forEach(campo => {
            const linha = document.createElement('div');
            linha.style.cssText = `
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                border-bottom: 1px solid #f3f4f6;
            `;

            const label = document.createElement('span');
            label.textContent = campo.label;
            label.style.cssText = 'font-weight: 600; color: #4b5563;';

            const valor = document.createElement('span');
            valor.textContent = campo.valor;
            valor.style.cssText = `
                color: #1f2937;
                font-family: 'Courier New', monospace;
                background: #f9fafb;
                padding: 2px 8px;
                border-radius: 4px;
                max-width: 180px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;

            // Destaque especial para o Tipo (R/B)
            if (campo.label === '📌 Tipo (R/B)') {
                if (campo.valor.includes('Router')) {
                    valor.style.background = '#fee2e2';
                    valor.style.color = '#991b1b';
                    valor.style.fontWeight = 'bold';
                } else if (campo.valor.includes('Bridge')) {
                    valor.style.background = '#dbeafe';
                    valor.style.color = '#1e40af';
                    valor.style.fontWeight = 'bold';
                }
            }

            linha.appendChild(label);
            linha.appendChild(valor);
            conteudo.appendChild(linha);
        });

        // Status da aplicação
        if (dados.aplicado) {
            const status = document.createElement('div');
            status.style.cssText = `
                margin-top: 10px;
                padding: 8px;
                background: #d1fae5;
                color: #065f46;
                border-radius: 6px;
                text-align: center;
                font-weight: bold;
                font-size: 13px;
            `;
            status.textContent = '✅ Dados aplicados com sucesso!';
            conteudo.appendChild(status);
        }

        // Botão para copiar novamente
        const btnCopiarNovamente = document.createElement('button');
        btnCopiarNovamente.textContent = '📋 Copiar Dados Novamente';
        btnCopiarNovamente.style.cssText = `
            width: 100%;
            margin-top: 12px;
            padding: 8px;
            background: #8b5cf6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
            transition: background 0.2s;
        `;
        btnCopiarNovamente.onmouseover = () => btnCopiarNovamente.style.background = '#7c3aed';
        btnCopiarNovamente.onmouseout = () => btnCopiarNovamente.style.background = '#8b5cf6';

        btnCopiarNovamente.onclick = () => {
            const stringSecreta = `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contrato}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}`;
            navigator.clipboard.writeText(stringSecreta).then(() => {
                btnCopiarNovamente.textContent = '✅ Copiado!';
                btnCopiarNovamente.style.background = '#10b981';
                setTimeout(() => {
                    btnCopiarNovamente.textContent = '📋 Copiar Dados Novamente';
                    btnCopiarNovamente.style.background = '#8b5cf6';
                }, 2000);
            });
        };

        conteudo.appendChild(btnCopiarNovamente);
        janela.appendChild(conteudo);

        document.body.appendChild(janela);

        // Auto-fechar após 5 minutos (evita poluição)
        setTimeout(() => {
            if (document.getElementById('osir-floating-window')) {
                janela.remove();
            }
        }, 300000); // 5 minutos
    }

    // =========================================================================
    // PARTE 1: CAPTURA NA FILA DE PROVISIONAMENTO
    // =========================================================================
    if (window.location.href.includes(URL_ATENDIMENTO)) {

        function injetarBotaoDinamico() {
            if (document.getElementById('btn-copiar-osir-nativo')) return;

            const btnChecar = document.getElementById('checar');

            let btnConexao = null;
            const todosBotoes = document.querySelectorAll('button, input[type="button"], a');
            for (let btn of todosBotoes) {
                if (btn.textContent.trim() === "Conexão") {
                    btnConexao = btn;
                    break;
                }
            }

            if (btnChecar || btnConexao) {

                const btnCopiar = document.createElement('a');
                btnCopiar.id = 'btn-copiar-osir-nativo';
                btnCopiar.type = 'button';
                btnCopiar.textContent = '💾 Capturar Dados';
                btnCopiar.style.cssText = `
                    display: inline-block;
                    padding: 6px 12px;
                    background-color: #8b5cf6;
                    color: #ffffff;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 12px;
                    margin-left: 6px;
                    margin-right: 6px;
                    text-decoration: none;
                    text-align: center;
                    vertical-align: middle;
                    transition: background 0.2s;
                `;

                btnCopiar.addEventListener('click', (e) => {
                    e.preventDefault();
                    try {
                        // CAPTURA COMPLETA DE TODOS OS DADOS
                        let dados = {
                            serial: "XX",
                            ssid: "XX",
                            senha: "XX",
                            slot: "0",
                            porta: "0",
                            id: "0",
                            contrato: "Nenhum",
                            vlan: "XX",
                            pontoAcesso: "",
                            olt: "N/A",
                            tipoEquipamento: "Desconhecido"
                        };

                        // Capturar contrato
                        const divTopo = document.body;
                        const matchContrato = divTopo.innerText.match(/Cliente\s*-\s*(\d+)/i);
                        if (matchContrato && matchContrato[1]) {
                            dados.contrato = matchContrato[1].trim();
                        }

                        // ✅ CAPTURA CORRETA DO PONTO DE ACESSO
                        const inputPontoAcesso = document.getElementById('AuthenticationAccessPointTitle');
                        if (inputPontoAcesso && inputPontoAcesso.value) {
                            dados.pontoAcesso = inputPontoAcesso.value.trim();
                        } else {
                            const inputOlt = document.getElementById('olt');
                            if (inputOlt && inputOlt.value) {
                                dados.pontoAcesso = inputOlt.value.trim();
                            }
                        }

                        // Capturar SSID e Senha
                        dados.ssid = document.getElementById('ssid')?.value.trim() || "XX";
                        dados.senha = document.getElementById('senhaSSID')?.value.trim() || "XX";

                        // CAPTURA ESPECÍFICA DOS CAMPOS OLT
                        const inputOlt = document.getElementById('olt');
                        if (inputOlt && inputOlt.value) {
                            dados.olt = inputOlt.value.trim();
                        }

                        const inputSlotOLT = document.getElementById('slotOLT');
                        if (inputSlotOLT && inputSlotOLT.value) {
                            dados.slot = parseInt(inputSlotOLT.value, 10).toString();
                        }

                        const inputPortaOLT = document.getElementById('portaOLT');
                        if (inputPortaOLT && inputPortaOLT.value) {
                            dados.porta = parseInt(inputPortaOLT.value, 10).toString();
                        }

                        // ✅ CAPTURA CORRETA DO ID DA ONU
                        const inputIdOnuOlt = document.getElementById('idOnuOlt');
                        if (inputIdOnuOlt && inputIdOnuOlt.value) {
                            dados.id = parseInt(inputIdOnuOlt.value, 10).toString();
                            console.log(`✅ ID ONU capturado: ${dados.id}`);
                        } else {
                            // Fallback: tenta outros campos
                            const todosInputs = document.querySelectorAll('input');
                            for (let i of todosInputs) {
                                const idStr = (i.id || "").toLowerCase();
                                if ((idStr.includes('idonu') || idStr.includes('id_onu') || idStr.includes('onu_id')) && i.value) {
                                    dados.id = parseInt(i.value, 10).toString();
                                    console.log(`✅ ID ONU capturado (fallback): ${dados.id}`);
                                    break;
                                }
                            }
                        }

                        // Capturar outros campos possíveis
                        const todosInputs = document.querySelectorAll('input');
                        todosInputs.forEach(i => {
                            const idStr = (i.id || "").toLowerCase();
                            const val = i.value.trim();

                            if (idStr.includes('serial') && val) dados.serial = val.toUpperCase();
                            if (idStr.includes('vlan') && val) dados.vlan = val;

                            // Fallback para slot/porta se não encontrados nos campos específicos
                            if (idStr.includes('slot') && !idStr.includes('olt') && val && !dados.slot) {
                                dados.slot = parseInt(val, 10).toString();
                            }
                            if (idStr.includes('porta') && !idStr.includes('olt') && val && !dados.porta) {
                                dados.porta = parseInt(val, 10).toString();
                            }
                        });

                        // Calcular VLAN se não foi capturada
                        if (dados.vlan === "XX" || dados.vlan === "") {
                            dados.vlan = calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);
                        }

                        // Gerar string para clipboard
                        const stringSecreta = `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contrato}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}`;

                        navigator.clipboard.writeText(stringSecreta).then(() => {
                            btnCopiar.textContent = `✅ Capturado! (ID: ${dados.id})`;
                            btnCopiar.style.backgroundColor = '#10b981';

                            setTimeout(() => {
                                btnCopiar.textContent = '💾 Capturar Dados';
                                btnCopiar.style.backgroundColor = '#8b5cf6';
                            }, 3000);
                        }).catch(err => {
                            console.error('Erro ao copiar:', err);
                            alert('Erro ao copiar dados. Verifique as permissões do navegador.');
                        });
                    } catch (err) {
                        console.error('Erro na captura:', err);
                        alert('Erro ao capturar dados. Veja o console para mais detalhes.');
                    }
                });

                if (btnChecar) {
                    btnChecar.insertAdjacentElement('afterend', btnCopiar);
                } else if (btnConexao) {
                    btnConexao.parentElement.insertBefore(btnCopiar, btnConexao);
                }
            }
        }
        setInterval(injetarBotaoDinamico, 800);
    }

    // =========================================================================
    // PARTE 2: INSERÇÃO NO ERP (COM VALIDAÇÃO DE CONTRATO E VLAN)
    // =========================================================================
    if (window.location.href.includes(URL_CONTRATO_VOALLE)) {

        // Extrai o contrato atual da URL
        const contratoAtual = extrairContratoDaURL();
        console.log(`📋 Contrato atual: ${contratoAtual || 'Não identificado'}`);

        // ✅ VERIFICA DADOS NO CLIPBOARD AO CARREGAR
        async function verificarDadosNoClipboard() {
            try {
                const texto = await navigator.clipboard.readText();
                if (texto && texto.startsWith("OSIRDATA||")) {
                    const partes = texto.split("||");
                    const dados = {
                        serial: partes[1] || "XX",
                        ssid: partes[2] || "XX",
                        senha: partes[3] || "XX",
                        slot: partes[4] || "0",
                        porta: partes[5] || "0",
                        id: partes[6] || "0",
                        contrato: partes[7] || "Nenhum",
                        vlan: partes[8] || "XX",
                        pontoAcesso: partes[9] || "",
                        olt: partes[10] || "N/A",
                        tipoEquipamento: "Desconhecido"
                    };

                    if (contratoAtual) {
                        criarJanelaFlutuante(dados, contratoAtual);
                    }
                }
            } catch (err) {
                console.log('Nenhum dado no clipboard ou permissão negada');
            }
        }

        setTimeout(verificarDadosNoClipboard, 2000);

        // ✅ FUNÇÃO PARA PREENCHER ID DA ONU NO CAMPO CORRETO
        function preencherIdOnu(valorId) {
            // Tenta o campo específico do ERP
            const inputIdOnu = document.getElementById('AuthenticationContractOltId');
            if (inputIdOnu) {
                inputIdOnu.value = valorId;
                inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
                inputIdOnu.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`✅ ID ONU ${valorId} preenchido em AuthenticationContractOltId`);
                return true;
            }

            // Fallback: procura por campos relacionados
            const inputs = document.querySelectorAll('input[name*="olt_id" i], input[id*="olt_id" i], input[name*="onu" i]');
            for (let input of inputs) {
                if (input.type !== 'hidden' && input.type !== 'submit') {
                    input.value = valorId;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log(`✅ ID ONU ${valorId} preenchido em campo alternativo: ${input.id || input.name}`);
                    return true;
                }
            }

            console.warn('⚠️ Campo de ID ONU não encontrado!');
            return false;
        }

        // ✅ FUNÇÃO PARA PREENCHER VLAN NO CAMPO CORRETO
        function preencherVlan(valorVlan) {
            const inputVlan = document.getElementById('AuthenticationContractVlan');
            if (inputVlan) {
                inputVlan.value = valorVlan;
                inputVlan.dispatchEvent(new Event('input', { bubbles: true }));
                inputVlan.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`✅ VLAN ${valorVlan} preenchida com sucesso!`);
                return true;
            }

            // Fallback: procura por qualquer campo que contenha 'vlan'
            const inputs = document.querySelectorAll('input[name*="vlan" i], input[id*="vlan" i]');
            for (let input of inputs) {
                if (input.type !== 'hidden' && input.type !== 'submit') {
                    input.value = valorVlan;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log(`✅ VLAN ${valorVlan} preenchida em campo alternativo!`);
                    return true;
                }
            }

            console.warn('⚠️ Campo VLAN não encontrado!');
            return false;
        }

        function monitorarBotaoVoalle() {
            const botoes = document.querySelectorAll('button, input[type="button"]');
            botoes.forEach(btn => {
                if (btn.textContent.includes("Criar/Atualizar Complementar") && !btn.classList.contains('com-gatilho-osir')) {
                    btn.classList.add('com-gatilho-osir');

                    btn.addEventListener('mousedown', async (e) => {
                        try {
                            const texto = await navigator.clipboard.readText();

                            if (texto.startsWith("OSIRDATA||")) {
                                const partes = texto.split("||");
                                const dados = {
                                    serial: partes[1] || "XX",
                                    ssid: partes[2] || "XX",
                                    senha: partes[3] || "XX",
                                    slot: partes[4] || "0",
                                    porta: partes[5] || "0",
                                    id: partes[6] || "0",
                                    contrato: partes[7] || "",
                                    vlan: partes[8] || "XX",
                                    pontoAcesso: partes[9] || "",
                                    olt: partes[10] || "N/A"
                                };

                                // ✅ VERIFICA SE O CONTRATO É O MESMO
                                if (contratoAtual && dados.contrato && dados.contrato !== contratoAtual) {
                                    console.warn(`⚠️ Contrato diferente! Copiado: ${dados.contrato}, Atual: ${contratoAtual}`);
                                    const janelaAviso = document.createElement('div');
                                    janelaAviso.id = 'osir-floating-window';
                                    janelaAviso.style.cssText = `
                                        position: fixed;
                                        top: 100px;
                                        right: 20px;
                                        width: 380px;
                                        background: #fee2e2;
                                        border: 2px solid #ef4444;
                                        border-radius: 12px;
                                        z-index: 99999;
                                        font-family: 'Segoe UI', Arial, sans-serif;
                                        padding: 16px;
                                    `;
                                    janelaAviso.innerHTML = `
                                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                                            <h3 style="margin:0;color:#991b1b;">⚠️ Contrato Incorreto</h3>
                                            <button onclick="this.closest('#osir-floating-window').remove()" style="background:#ef4444;color:white;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;">✕ Fechar</button>
                                        </div>
                                        <p style="color:#991b1b;font-weight:bold;">
                                            Dados copiados do contrato <strong>#${dados.contrato}</strong><br>
                                            Contrato atual: <strong>#${contratoAtual}</strong>
                                        </p>
                                        <p style="color:#6b7280;font-size:13px;margin-top:8px;">
                                            💡 Clique em "Capturar Dados" no contrato correto.
                                        </p>
                                    `;
                                    document.body.appendChild(janelaAviso);
                                    setTimeout(() => {
                                        if (document.getElementById('osir-floating-window')) {
                                            janelaAviso.remove();
                                        }
                                    }, 8000);
                                    return;
                                }

                                // ✅ DETERMINA O TIPO DE EQUIPAMENTO BASEADO NO PONTO DE ACESSO
                                const tipoEquip = determinarTipoEquipamento(dados.pontoAcesso, dados.serial);
                                console.log(`📦 Tipo de equipamento: ${tipoEquip}`);

                                // ✅ CALCULA VLAN
                                const vlanFinal = calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);
                                console.log(`📊 VLAN calculada: ${vlanFinal}`);

                                // ✅ PREENCHE O CAMPO VLAN
                                preencherVlan(vlanFinal);

                                // ✅ PREENCHE O CAMPO ID DA ONU
                                if (dados.id && dados.id !== "0" && dados.id !== "XX") {
                                    preencherIdOnu(dados.id);
                                    console.log(`✅ ID ONU ${dados.id} será preenchido`);
                                } else {
                                    console.warn(`⚠️ ID ONU não disponível: ${dados.id}`);
                                }

                                // Buscar campos do Voalle
                                const inputPontoAcessoVoalle = document.getElementById('AuthenticationAccessPointTitle');
                                const txtPontoAcesso = inputPontoAcessoVoalle ? inputPontoAcessoVoalle.value.trim() : dados.pontoAcesso;

                                // Preencher SSID e Senha
                                const inputWifiSsid = document.getElementById('AuthenticationContractWifiName');
                                const inputWifiPass = document.getElementById('AuthenticationContractWifiPassword');

                                if (inputWifiSsid && dados.ssid !== "XX") {
                                    inputWifiSsid.value = dados.ssid;
                                    inputWifiSsid.dispatchEvent(new Event('input', { bubbles: true }));
                                    inputWifiSsid.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                                if (inputWifiPass && dados.senha !== "XX") {
                                    inputWifiPass.value = dados.senha;
                                    inputWifiPass.dispatchEvent(new Event('input', { bubbles: true }));
                                    inputWifiPass.dispatchEvent(new Event('change', { bubbles: true }));
                                }

                                // Preencher complemento se estiver vazio
                                const textareas = document.querySelectorAll('textarea, input[type="text"]');
                                let inputComplementar = null;
                                for (let el of textareas) {
                                    const idFormatado = (el.id || "").toLowerCase();
                                    const nameFormatado = (el.name || "").toLowerCase();
                                    if (idFormatado.includes('complement') || nameFormatado.includes('complement')) {
                                        inputComplementar = el;
                                        break;
                                    }
                                }

                                if (inputComplementar && inputComplementar.value.trim() === "") {
                                    let textoFinal = `${tipoEquip} || SN: ${dados.serial} || Autentica na ZTE || ${dados.olt} - Slot OLT: ${dados.slot} Porta OLT: ${dados.porta} ID: ${dados.id} VLAN: ${vlanFinal} || SSID: ${dados.ssid} - Senha: ${dados.senha}`;

                                    inputComplementar.value = textoFinal;
                                    inputComplementar.dispatchEvent(new Event('input', { bubbles: true }));
                                    inputComplementar.dispatchEvent(new Event('change', { bubbles: true }));
                                }

                                // ✅ MOSTRA JANELA COM DADOS APLICADOS
                                if (contratoAtual && dados.contrato === contratoAtual) {
                                    criarJanelaFlutuante({
                                        ...dados,
                                        vlan: vlanFinal,
                                        tipoEquipamento: tipoEquip,
                                        aplicado: true
                                    }, contratoAtual);
                                }
                            }
                        } catch (err) {
                            console.error("Erro na execução: ", err);
                        }
                    });
                }
            });
        }
        setInterval(monitorarBotaoVoalle, 1000);
    }

})();
