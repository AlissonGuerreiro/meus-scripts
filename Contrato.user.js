// ==UserScript==
// @name         Contrato.
// @namespace    http://tampermonkey.net/
// @version      11.3
// @description  Ajuste Front-End Inteligente: Captura e aplicação automática incluindo o campo VLAN.
// @author       Alisson Guerreiro / Modo Integrado
// @homepageURL  https://github.com/AlissonGuerreiro/meus-scripts
// @updateURL    https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Contrato.user.js
// @downloadURL  https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Contrato.user.js
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
    // PARTE 1: CAPTURA COM BOTÃO ADAPTÁVEL (FILA DE PROVISIONAMENTO)
    // =========================================================================
    if (window.location.href.includes(URL_ATENDIMENTO)) {

        function injetarBotaoDinamico() {
            // Se o botão de copiar já existe na tela, não faz nada
            if (document.getElementById('btn-copiar-osir-nativo')) return;

            // Busca os elementos de referência
            const btnChecar = document.getElementById('checar');

            // Busca o botão "Conexão" caso o "Checar" não exista
            let btnConexao = null;
            const todosBotoes = document.querySelectorAll('button, input[type="button"], a');
            for (let btn of todosBotoes) {
                if (btn.textContent.trim() === "Conexão") {
                    btnConexao = btn;
                    break;
                }
            }

            // Só prossegue se encontrar pelo menos uma das duas referências na barra
            if (btnChecar || btnConexao) {

                // Cria o botão roxo com estilo compacto idêntico ao original
                const btnCopiar = document.createElement('a');
                btnCopiar.id = 'btn-copiar-osir-nativo';
                btnCopiar.type = 'button';
                btnCopiar.textContent = '💾 Copiar Dados';
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

                // Lógica de Captura dos Dados (Atualizada com VLAN)
                btnCopiar.addEventListener('click', (e) => {
                    e.preventDefault();
                    try {
                        let dados = { serial: "XX", ssid: "XX", senha: "XX",
                                      slot: "0", porta: "0", id: "0", contrato: "Nenhum", vlan: "XX" };

                        const divTopo = document.body;
                        const matchContrato = divTopo.innerText.match(/Cliente\s*-\s*(\d+)/i);
                        if (matchContrato && matchContrato[1]) {
                             dados.contract = matchContrato[1].trim();
                        }

                        dados.ssid = document.getElementById('ssid')?.value.trim() || "XX";
                        dados.senha = document.getElementById('senhaSSID')?.value.trim() || "XX";

                        const todosInputs = document.querySelectorAll('input');
                        todosInputs.forEach(i => {
                            const idStr = (i.id || "").toLowerCase();
                            const val = i.value.trim();

                            if (idStr.includes('serial') && val) dados.serial = val.toUpperCase();
                            if (idStr.includes('slot') && val) dados.slot = parseInt(val, 10).toString();
                            if (idStr.includes('porta') && !idStr.includes('olt') && val) dados.porta = parseInt(val, 10).toString();
                            if (idStr.includes('portaolt') && val) dados.porta = parseInt(val, 10).toString();
                            if (idStr.includes('idonu') || idStr.includes('id_onu')) dados.id = parseInt(val, 10).toString();
                            if (idStr.includes('vlan') && val) dados.vlan = val; // Captura o campo da VLAN
                        });

                        // Nova String Secreta incluindo a VLAN no fim
                        const stringSecreta = `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contract}||${dados.vlan}`;
                        navigator.clipboard.writeText(stringSecreta).then(() => {
                            btnCopiar.textContent = `✅ Copiado!`;
                            btnCopiar.style.backgroundColor = '#10b981';
                            setTimeout(() => {
                                 btnCopiar.textContent = '💾 Copiar Dados';
                                btnCopiar.style.backgroundColor = '#8b5cf6';
                            }, 2000);
                        });
                    } catch (err) { console.error(err); }
                });

                // 🔀 INJEÇÃO ADAPTÁVEL NO LAYOUT
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
    // PARTE 2: INSERÇÃO EM SEGUNDO PLANO (VOALLE ERP)
    // =========================================================================
    if (window.location.href.includes(URL_CONTRATO_VOALLE)) {
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
                                    serial: partes[1], ssid: partes[2], senha: partes[3],
                                    slot: partes[4], porta: partes[5], id: partes[6],
                                    contratoOriginal: partes[7] || "",
                                    vlan: partes[8] || "XX" // Recebe a VLAN vinda da área de transferência
                                };

                                 let contratoAtualVoalle = "";
                                const matchUrl = window.location.href.match(/contract_panel\/(\d+)/);
                                if (matchUrl && matchUrl[1]) {
                                    contratoAtualVoalle = matchUrl[1].trim();
                                } else {
                                    const matchTextoTopo = document.body.innerText.match(/Contrato\s*(\d+)/i);
                                    if (matchTextoTopo && matchTextoTopo[1]) {
                                        contratoAtualVoalle = matchTextoTopo[1].trim();
                                    }
                                }

                                if (dados.contratoOriginal !== "Nenhum" && contratoAtualVoalle !== "" && dados.contratoOriginal !== contratoAtualVoalle) {
                                     e.preventDefault();
                                    e.stopPropagation();
                                    alert(`❌ OPERAÇÃO BLOQUEADA POR SEGURANÇA!\n\nVocê copiou os dados do contrato [${dados.contratoOriginal}], mas está tentando aplicar na aba do contrato [${contratoAtualVoalle}].`);
                                    return;
                                }

                                const inputWifiSsid = document.getElementById('AuthenticationContractWifiName');
                                const inputWifiPass = document.getElementById('AuthenticationContractWifiPassword');

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

                                if (inputWifiSsid && dados.ssid !== "XX") {
                                       inputWifiSsid.value = dados.ssid;
                                    inputWifiSsid.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                                if (inputWifiPass && dados.senha !== "XX") {
                                    inputWifiPass.value = dados.senha;
                                    inputWifiPass.dispatchEvent(new Event('input', { bubbles: true }));
                                }

                                if (inputComplementar && inputComplementar.value.trim() === "") {
                                    let equipPrefixo = "ONU Bridge (EKtech/Huawei)";
                                    if (dados.serial.startsWith("ZTEG")) {
                                        equipPrefixo = "ZTE Router";
                                    } else if (dados.serial.startsWith("5A54")) {
                                        equipPrefixo = "Ektech Bridge";
                                    } else if (dados.serial.startsWith("4857")) {
                                        equipPrefixo = "Huawei Router";
                                    }

                                    // Texto final atualizado incluindo a VLAN de forma organizada
                                    let textoFinal = `${equipPrefixo} || SN: ${dados.serial} || Autentica na ZTE || XX - Porta XX || Slot OLT: ${dados.slot} Porta OLT: ${dados.porta} ID: ${dados.id} VLAN: ${dados.vlan} || SSID: ${dados.ssid} - Senha: ${dados.senha}`;

                                    inputComplementar.value = textoFinal;
                                    inputComplementar.dispatchEvent(new Event('input', { bubbles: true }));
                                    inputComplementar.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            }
                        } catch (err) {
                            console.error("Erro na execução silenciosa: ", err);
                        }
                    });
                }
            });
        }
        setInterval(monitorarBotaoVoalle, 1000);
    }
})();
