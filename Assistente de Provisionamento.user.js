// ==UserScript==
// @name         Osir - Assistente de Provisionamento
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Janela SÓ com dados do Amarelo, Splitter do Contrato, Ordem Definida
// @author       Alisson Guerreiro
// @match        *://*.osirnet.com.br/*
// @match        *://*.osir.net.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const URL_ATENDIMENTO = "filaProvisionamento.php";
    const URL_CONTRATO_VOALLE = "authentication_contracts/contract_panel";
    const URL_OPERACAO = "/legacy/operations/";

    // =========================================================================
    // CONFIGURAÇÕES DA JANELA FLUTUANTE
    // =========================================================================
    const CONFIG_JANELA = {
        larguraMin: 280,
        larguraMax: 600,
        larguraPadrao: 400,
        alturaMin: 300,
        alturaMax: 800,
        alturaPadrao: 500,
        fonteMin: 9,
        fonteMax: 18,
        fontePadrao: 13,
        passo: 20
    };

    let estadoJanela = {
        largura: CONFIG_JANELA.larguraPadrao,
        altura: CONFIG_JANELA.alturaPadrao,
        fonte: CONFIG_JANELA.fontePadrao
    };

    // =========================================================================
    // FUNÇÕES DA JANELA
    // =========================================================================
    function redimensionarJanela(deltaLargura, deltaAltura, deltaFonte) {
        const janela = document.getElementById('osir-floating-window');
        if (!janela) return;

        estadoJanela.largura = Math.max(CONFIG_JANELA.larguraMin, Math.min(CONFIG_JANELA.larguraMax, estadoJanela.largura + deltaLargura));
        estadoJanela.altura = Math.max(CONFIG_JANELA.alturaMin, Math.min(CONFIG_JANELA.alturaMax, estadoJanela.altura + deltaAltura));
        estadoJanela.fonte = Math.max(CONFIG_JANELA.fonteMin, Math.min(CONFIG_JANELA.fonteMax, estadoJanela.fonte + deltaFonte));

        janela.style.width = estadoJanela.largura + 'px';
        janela.style.maxHeight = estadoJanela.altura + 'px';
        janela.style.fontSize = estadoJanela.fonte + 'px';

        const previewTexto = janela.querySelector('.osir-preview-texto');
        if (previewTexto) {
            previewTexto.style.fontSize = Math.round(estadoJanela.fonte * 0.85) + 'px';
        }

        const sizeDisplay = document.getElementById('osir-size-display');
        if (sizeDisplay) {
            sizeDisplay.textContent = `${estadoJanela.largura}×${estadoJanela.altura}`;
        }
    }

    function salvarPreferencias() {
        try {
            localStorage.setItem('osir_janela_flutuante_prefs', JSON.stringify(estadoJanela));
        } catch (e) {}
    }

    function carregarPreferencias() {
        try {
            const dados = localStorage.getItem('osir_janela_flutuante_prefs');
            if (dados) {
                const prefs = JSON.parse(dados);
                estadoJanela.largura = prefs.largura || CONFIG_JANELA.larguraPadrao;
                estadoJanela.altura = prefs.altura || CONFIG_JANELA.alturaPadrao;
                estadoJanela.fonte = prefs.fonte || CONFIG_JANELA.fontePadrao;
            }
        } catch (e) {}
    }
    carregarPreferencias();

    // =========================================================================
    // CÁLCULO VLAN
    // =========================================================================
    function calcularVlanOsir(pontoAcesso, slotStr, portaStr) {
        const pa = (pontoAcesso || "").toUpperCase();

        if (pa.includes("STL_CE3_R") || pa.includes("STL_CE4_R") || pa.includes("TTN_LAN") || pa.includes("GAR")) {
            return "2200";
        }

        const slotTrim = (slotStr || "").trim();
        const portaTrim = (portaStr || "").trim();

        if (slotTrim === "XX" || portaTrim === "XX" || slotTrim === "" || portaTrim === "") {
            return "XX";
        }

        const slot = parseInt(slotTrim, 10);
        const porta = parseInt(portaTrim, 10);

        if (isNaN(slot) || isNaN(porta)) return "XX";

        if (slot === 0) {
            return (porta + 10).toString();
        }

        const portaFormatada = porta < 10 ? "0" + porta : porta.toString();
        return slot.toString() + portaFormatada;
    }

    // =========================================================================
    // FUNÇÃO PARA DEFINIR A PORTA WEB (Bridge=8092, Router=80)
    // =========================================================================
    function definirPortaWeb(tipoProvisionamento) {
        const tipo = (tipoProvisionamento || "").toLowerCase().trim();
        if (tipo === "b") return "8092";
        if (tipo === "r") return "80";
        return "80";
    }

    // =========================================================================
    // DETERMINAR TIPO DE EQUIPAMENTO
    // =========================================================================
    function determinarTipoEquipamento(tipoProvisionamento, serial) {
        const tipo = (tipoProvisionamento || "").toLowerCase().trim();
        const serialUpper = (serial || "").toUpperCase();

        if (tipo === "r") {
            if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) return "Huawei Router";
            if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) return "ZTE Router";
            if (serialUpper.startsWith("RCMG")) return "Raisecom Router";
            return "Router";
        }
        if (tipo === "b") {
            if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) return "Huawei Bridge";
            if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A544") || serialUpper.startsWith("ZTEGD")) return "ZTE Bridge";
            if (serialUpper.startsWith("RCMG")) return "Raisecom Bridge";
            return "Bridge";
        }

        if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) {
            return tipo === "b" ? "Huawei Bridge" : "Huawei Router";
        }
        if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) {
            return tipo === "b" ? "ZTE Bridge" : "ZTE Router";
        }
        if (serialUpper.startsWith("RCMG")) {
            return tipo === "b" ? "Raisecom Bridge" : "Raisecom Router";
        }
        if (serialUpper.startsWith("5A544") || serialUpper.startsWith("ZTEGD")) return "ZTE Bridge";
        return "Equipamento Desconhecido";
    }

    function precisaAutenticacao(tipoProvisionamento, serial) {
        const tipo = (tipoProvisionamento || "").toLowerCase().trim();
        const serialUpper = (serial || "").toUpperCase();
        if (tipo === "b") return true;
        if (tipo === "r") return false;
        if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) return false;
        if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) return false;
        if (serialUpper.startsWith("RCMG")) return false;
        if (serialUpper.startsWith("5A544") || serialUpper.startsWith("ZTEGD")) return true;
        return false;
    }

    // =========================================================================
    // CAPTURAR DADOS DO PROVISIONAMENTO (AMARELO)
    // =========================================================================
    function capturarDadosDoProvisionamento() {
        console.log('🟡 CAPTURANDO DADOS DO PROVISIONAMENTO...');

        const dados = {
            serial: "XX",
            ssid: "XX",
            senha: "XX",
            slot: "XX",
            porta: "XX",
            id: "XX",
            contrato: "",
            vlan: "XX",
            pontoAcesso: "",
            olt: "N/A",
            splitter: "XX",
            portaSplitter: "XX",
            tipoProvisionamento: "",
            portaWeb: "80",
            usuarioPPPoE: "",
            senhaPPPoE: "",
            usuarioONU: "",
            senhaONU: "",
            nomeONU: "",
            sinal: "",
            status: "",
            nomeOLT: "",
            telefonia: { temTelefonia: false, numero: '', senha: '', ip: '' }
        };

        const campos = {
            serial: document.getElementById('serialEquipamentoSynsuite'),
            ssid: document.getElementById('ssid'),
            senha: document.getElementById('senhaSSID'),
            usuarioPPPoE: document.getElementById('pppoe'),
            senhaPPPoE: document.getElementById('senhaPPPOE'),
            usuarioONU: document.getElementById('usuarioEquip'),
            senhaONU: document.getElementById('senhaEquip'),
            telefone01: document.getElementById('numeroTelefone01'),
            telefone02: document.getElementById('numeroTelefone02'),
            senhaTelefone: document.getElementById('senhaTelefone'),
            ipGerencia: document.getElementById('ipGerencia'),
            tipoProvisionamento: document.getElementById('tipoProvisionamento'),
            nomeONU: document.getElementById('nomeONU'),
            sinal: document.getElementById('sinal'),
            status: document.getElementById('status'),
            olt: document.getElementById('olt'),
            slotOLT: document.getElementById('slotOLT'),
            portaOLT: document.getElementById('portaOLT'),
            idOnuOlt: document.getElementById('idOnuOlt')
        };

        if (campos.serial && campos.serial.value) dados.serial = campos.serial.value.trim().toUpperCase();
        if (campos.ssid && campos.ssid.value) dados.ssid = campos.ssid.value.trim();
        if (campos.senha && campos.senha.value) dados.senha = campos.senha.value.trim();
        if (campos.usuarioPPPoE && campos.usuarioPPPoE.value) dados.usuarioPPPoE = campos.usuarioPPPoE.value.trim();
        if (campos.senhaPPPoE && campos.senhaPPPoE.value) dados.senhaPPPoE = campos.senhaPPPoE.value.trim();
        if (campos.usuarioONU && campos.usuarioONU.value) dados.usuarioONU = campos.usuarioONU.value.trim();
        if (campos.senhaONU && campos.senhaONU.value) dados.senhaONU = campos.senhaONU.value.trim();
        if (campos.tipoProvisionamento && campos.tipoProvisionamento.value) {
            dados.tipoProvisionamento = campos.tipoProvisionamento.value.toLowerCase().trim();
        }
        if (campos.nomeONU && campos.nomeONU.value) dados.nomeONU = campos.nomeONU.value.trim();
        if (campos.sinal && campos.sinal.value) dados.sinal = campos.sinal.value.trim();
        if (campos.status && campos.status.value) dados.status = campos.status.value.trim();
        if (campos.olt && campos.olt.value) {
            dados.olt = campos.olt.value.trim();
            dados.nomeOLT = campos.olt.value.trim();
        }
        if (campos.slotOLT && campos.slotOLT.value) dados.slot = campos.slotOLT.value.trim();
        if (campos.portaOLT && campos.portaOLT.value) dados.porta = campos.portaOLT.value.trim();
        if (campos.idOnuOlt && campos.idOnuOlt.value) dados.id = campos.idOnuOlt.value.trim();

        if (campos.telefone01 && campos.telefone01.value && campos.telefone01.value.trim() !== '') {
            dados.telefonia.temTelefonia = true;
            dados.telefonia.numero = campos.telefone01.value.trim();
        }
        if (campos.senhaTelefone && campos.senhaTelefone.value && campos.senhaTelefone.value.trim() !== '') {
            dados.telefonia.senha = campos.senhaTelefone.value.trim();
        }
        if (campos.ipGerencia && campos.ipGerencia.value && campos.ipGerencia.value.trim() !== '') {
            dados.telefonia.ip = campos.ipGerencia.value.trim();
        }

        const tituloModal = document.querySelector('#nomeClienteModal');
        if (tituloModal) {
            const match = tituloModal.innerText.match(/(\d+)/);
            if (match) dados.contrato = match[1].trim();
        }

        dados.vlan = calcularVlanOsir(dados.olt, dados.slot, dados.porta);
        dados.portaWeb = definirPortaWeb(dados.tipoProvisionamento);

        if (dados.nomeOLT) {
            const partes = dados.nomeOLT.split(' - ');
            if (partes.length >= 3) {
                dados.pontoAcesso = partes[partes.length - 1].trim();
            }
        }

        console.log('📊 Dados do provisionamento:', dados);
        return dados;
    }

    // =========================================================================
    // EXTRAIR DADOS DO CLIPBOARD
    // =========================================================================
    function extrairDadosDoClipboard(texto) {
        if (!texto || !texto.trim().startsWith("OSIRDATA||")) return null;

        const partes = texto.trim().split("||");
        const telParts = partes[12] ? partes[12].split('||') : [];

        return {
            serial: partes[1] || "XX",
            ssid: partes[2] || "XX",
            senha: partes[3] || "XX",
            slot: partes[4] || "XX",
            porta: partes[5] || "XX",
            id: partes[6] || "XX",
            contrato: partes[7] || "",
            vlan: partes[8] || "XX",
            pontoAcesso: partes[9] || "",
            olt: partes[10] || "N/A",
            tipoProvisionamento: partes[11] || "",
            portaWeb: partes[13] || "80",
            splitter: "XX",
            portaSplitter: "XX",
            usuarioPPPoE: "",
            senhaPPPoE: "",
            usuarioONU: "",
            senhaONU: "",
            nomeONU: "",
            sinal: "",
            status: "",
            nomeOLT: partes[10] || "N/A",
            telefonia: {
                temTelefonia: telParts.length >= 1 && telParts[0] && telParts[0].trim() !== '',
                numero: telParts[0] || '',
                senha: telParts[1] || '',
                ip: telParts[2] || ''
            }
        };
    }

    // =========================================================================
    // MONTAR COMPLEMENTO - USA SPLITTER DO CONTRATO
    // =========================================================================
    function montarComplemento(dados) {
        console.log('📝 MONTANDO COMPLEMENTO...');
        console.log('📞 Dados de telefonia:', dados.telefonia);

        let partes = [];

        const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
        const temTelefonia = dados.telefonia &&
                             dados.telefonia.temTelefonia === true &&
                             dados.telefonia.numero &&
                             dados.telefonia.numero.trim() !== '';

        let equipamento = tipoEquip;
        if (temTelefonia) {
            equipamento += " + Telefonia";
        }
        partes.push(equipamento);

        partes.push(`SN: ${dados.serial}`);

        if (precisaAutenticacao(dados.tipoProvisionamento, dados.serial)) {
            partes.push("Autentica na ZTE");
        }

        // SPLITTER - USA O QUE VOCÊ SELECIONOU NO CONTRATO
        const splitterDoFormulario = document.getElementById('AuthenticationSplitterPortTitle')?.value?.trim() || "";
        const portaSplitterDoFormulario = document.getElementById('AuthenticationSplitterPortPort')?.value?.trim() || "";

        if (splitterDoFormulario && splitterDoFormulario !== "") {
            const splitterText = portaSplitterDoFormulario && portaSplitterDoFormulario !== ""
                ? `${splitterDoFormulario} - Porta: ${portaSplitterDoFormulario}`
                : splitterDoFormulario;
            partes.push(splitterText);
            console.log('✅ Splitter do contrato:', splitterText);
        } else {
            partes.push(`XX - Porta XX`);
            console.log('⚠️ Sem splitter no contrato, usando XX - Porta XX');
        }

        partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${dados.porta} ID: ${dados.id}`);

        if (dados.ssid !== "XX" && dados.senha !== "XX") {
            partes.push(`SSID: ${dados.ssid} - Senha: ${dados.senha}`);
        } else if (dados.ssid !== "XX") {
            partes.push(`SSID: ${dados.ssid}`);
        } else if (dados.senha !== "XX") {
            partes.push(`Senha: ${dados.senha}`);
        }

        if (temTelefonia) {
            if (dados.telefonia.numero && dados.telefonia.numero.trim() !== '') {
                partes.push(`Nº: ${dados.telefonia.numero}`);
            }
            if (dados.telefonia.senha && dados.telefonia.senha.trim() !== '') {
                partes.push(`Senha da Telefonia: ${dados.telefonia.senha}`);
            }
            if (dados.telefonia.ip && dados.telefonia.ip.trim() !== '') {
                partes.push(`IP de Telefonia: ${dados.telefonia.ip}`);
            }
        }

        const resultado = partes.join(" || ");
        console.log('📝 Complemento final:', resultado);
        return resultado;
    }

    // =========================================================================
    // MONTAR STRING OSIRDATA
    // =========================================================================
    function montarStringOSIRDATA(dados) {
        const telefoniaStr = dados.telefonia && dados.telefonia.temTelefonia
            ? `${dados.telefonia.numero}||${dados.telefonia.senha}||${dados.telefonia.ip || ''}`
            : '||||';

        const portaWeb = dados.portaWeb || '80';

        return `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contrato}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}||${dados.tipoProvisionamento}||${telefoniaStr}||${portaWeb}`;
    }

    // =========================================================================
    // PREENCHER FORMULÁRIO DO CONTRATO - NÃO ALTERA SPLITTER
    // =========================================================================
    function preencherFormularioContrato(dados) {
        console.log('📝 PREENCHENDO FORMULÁRIO...');

        // ⚠️ NÃO ALTERA SPLITTER - VOCÊ JÁ SELECIONOU MANUALMENTE
        const mapeamento = [
            { id: 'AuthenticationContractEquipmentSerialNumber', valor: dados.serial },
            { id: 'AuthenticationContractWifiName', valor: dados.ssid },
            { id: 'AuthenticationContractWifiPassword', valor: dados.senha },
            { id: 'AuthenticationContractSlotOlt', valor: dados.slot },
            { id: 'AuthenticationContractPortOlt', valor: dados.porta },
            { id: 'AuthenticationContractOltId', valor: dados.id },
            { id: 'AuthenticationContractVlan', valor: dados.vlan },
            { id: 'AuthenticationContractEquipmentPort', valor: dados.portaWeb },
            { id: 'tipoProvisionamento', valor: dados.tipoProvisionamento },
            { id: 'AuthenticationContractEquipmentUser', valor: dados.usuarioONU },
            { id: 'AuthenticationContractEquipmentPassword', valor: dados.senhaONU }
        ];

        mapeamento.forEach(({ id, valor }) => {
            const el = document.getElementById(id);
            if (el && valor && valor !== "XX" && valor !== "") {
                el.value = valor;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        if (dados.telefonia && dados.telefonia.temTelefonia) {
            const numTel = document.getElementById('numeroTelefone01');
            if (numTel && dados.telefonia.numero) {
                numTel.value = dados.telefonia.numero;
                numTel.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const senhaTel = document.getElementById('senhaTelefone');
            if (senhaTel && dados.telefonia.senha) {
                senhaTel.value = dados.telefonia.senha;
                senhaTel.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const ipTel = document.getElementById('ipGerencia');
            if (ipTel && dados.telefonia.ip) {
                ipTel.value = dados.telefonia.ip;
                ipTel.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        console.log('✅ Formulário preenchido! (Splitter NÃO foi alterado)');
    }

    // =========================================================================
    // JANELA FLUTUANTE - SÓ DADOS DO AMARELO
    // =========================================================================
    function criarJanelaFlutuante(dados) {
        console.log('🪟 CRIANDO JANELA FLUTUANTE (SÓ AMARELO)...');
        console.log('📊 Dados do Amarelo:', dados);

        const contratoParaExibir = dados.contrato || "???";
        const janelaExistente = document.getElementById('osir-floating-window');
        if (janelaExistente) janelaExistente.remove();

        const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
        const temTelefonia = dados.telefonia &&
                             dados.telefonia.temTelefonia === true &&
                             dados.telefonia.numero &&
                             dados.telefonia.numero.trim() !== '';
        const complementoPreview = montarComplemento(dados);

        window.__osir_complemento_atual = complementoPreview;

        const janela = document.createElement('div');
        janela.id = 'osir-floating-window';
        janela.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            width: ${estadoJanela.largura}px;
            max-height: ${estadoJanela.altura}px;
            background: #ffffff;
            border: 2px solid #8b5cf6;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 99999;
            font-family: 'Segoe UI', Arial, sans-serif;
            padding: 16px;
            overflow-y: auto;
            transition: width 0.3s ease, max-height 0.3s ease;
            font-size: ${estadoJanela.fonte}px;
        `;

        // CABEÇALHO
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding: 6px 10px;
            background: #f3f4f6;
            border-radius: 8px;
            gap: 8px;
            flex-wrap: wrap;
        `;

        const titulo = document.createElement('span');
        titulo.textContent = `📋 Contrato #${contratoParaExibir}`;
        titulo.style.cssText = `font-weight: bold; font-size: ${Math.round(estadoJanela.fonte * 1.1)}px; color: #1f2937; flex: 1;`;

        const grupoControles = document.createElement('div');
        grupoControles.style.cssText = `display: flex; align-items: center; gap: 4px;`;

        const btnMenos = document.createElement('button');
        btnMenos.textContent = '−';
        btnMenos.title = 'Diminuir janela';
        btnMenos.style.cssText = `background: #e5e7eb; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-weight: bold; font-size: 16px; color: #374151; transition: background 0.2s; line-height: 1.2;`;
        btnMenos.onmouseover = () => btnMenos.style.background = '#d1d5db';
        btnMenos.onmouseout = () => btnMenos.style.background = '#e5e7eb';
        btnMenos.onclick = () => { redimensionarJanela(-CONFIG_JANELA.passo, -CONFIG_JANELA.passo, -1); salvarPreferencias(); };

        const sizeDisplay = document.createElement('span');
        sizeDisplay.id = 'osir-size-display';
        sizeDisplay.textContent = `${estadoJanela.largura}×${estadoJanela.altura}`;
        sizeDisplay.style.cssText = `font-size: ${Math.round(estadoJanela.fonte * 0.7)}px; color: #6b7280; padding: 0 4px; min-width: 55px; text-align: center; font-family: monospace;`;

        const btnMais = document.createElement('button');
        btnMais.textContent = '+';
        btnMais.title = 'Aumentar janela';
        btnMais.style.cssText = `background: #e5e7eb; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-weight: bold; font-size: 16px; color: #374151; transition: background 0.2s; line-height: 1.2;`;
        btnMais.onmouseover = () => btnMais.style.background = '#d1d5db';
        btnMais.onmouseout = () => btnMais.style.background = '#e5e7eb';
        btnMais.onclick = () => { redimensionarJanela(CONFIG_JANELA.passo, CONFIG_JANELA.passo, 1); salvarPreferencias(); };

        const sep = document.createElement('span');
        sep.textContent = '|';
        sep.style.cssText = `color: #d1d5db; padding: 0 2px;`;

        const btnReset = document.createElement('button');
        btnReset.textContent = '↺';
        btnReset.title = 'Resetar tamanho padrão';
        btnReset.style.cssText = `background: #e5e7eb; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-weight: bold; font-size: 16px; color: #374151; transition: background 0.2s; line-height: 1.2;`;
        btnReset.onmouseover = () => btnReset.style.background = '#d1d5db';
        btnReset.onmouseout = () => btnReset.style.background = '#e5e7eb';
        btnReset.onclick = () => {
            estadoJanela.largura = CONFIG_JANELA.larguraPadrao;
            estadoJanela.altura = CONFIG_JANELA.alturaPadrao;
            estadoJanela.fonte = CONFIG_JANELA.fontePadrao;
            redimensionarJanela(0, 0, 0);
            salvarPreferencias();
        };

        const btnFechar = document.createElement('button');
        btnFechar.textContent = '✕';
        btnFechar.title = 'Fechar janela';
        btnFechar.style.cssText = `background: #ef4444; border: none; border-radius: 4px; padding: 2px 10px; cursor: pointer; font-weight: bold; font-size: 14px; color: white; transition: background 0.2s; line-height: 1.2;`;
        btnFechar.onmouseover = () => btnFechar.style.background = '#dc2626';
        btnFechar.onmouseout = () => btnFechar.style.background = '#ef4444';
        btnFechar.onclick = () => janela.remove();

        grupoControles.appendChild(btnMenos);
        grupoControles.appendChild(sizeDisplay);
        grupoControles.appendChild(btnMais);
        grupoControles.appendChild(sep);
        grupoControles.appendChild(btnReset);
        grupoControles.appendChild(btnFechar);

        header.appendChild(titulo);
        header.appendChild(grupoControles);
        janela.appendChild(header);

        // BADGE
        const badge = document.createElement('div');
        badge.style.cssText = `
            background: ${temTelefonia ? '#d1fae5' : '#dbeafe'};
            color: ${temTelefonia ? '#065f46' : '#1e40af'};
            padding: 6px 12px;
            border-radius: 6px;
            font-size: ${Math.round(estadoJanela.fonte * 0.9)}px;
            font-weight: 600;
            margin-bottom: 12px;
            text-align: center;
        `;
        badge.textContent = temTelefonia ? '✅ Dados do Amarelo 📞 Com Telefonia' : '✅ Dados do Amarelo';
        janela.appendChild(badge);

        // FONTE DOS DADOS
        const fonteInfo = document.createElement('div');
        fonteInfo.style.cssText = `
            background: #fef3c7;
            color: #92400e;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: ${Math.round(estadoJanela.fonte * 0.7)}px;
            margin-bottom: 10px;
            text-align: center;
        `;
        fonteInfo.textContent = '🟡 Dados do Provisionamento (Amarelo)';
        janela.appendChild(fonteInfo);

        // CONTEÚDO - ORDEM DEFINITIVA
        const conteudo = document.createElement('div');
        conteudo.style.cssText = `font-size: ${estadoJanela.fonte}px;`;

        const campos = [];

        // 1. PONTO DE ACESSO (NOME OLT)
        if (dados.nomeOLT && dados.nomeOLT !== "" && dados.nomeOLT !== "N/A") {
            campos.push({ label: '📍 Ponto Acesso', valor: dados.nomeOLT });
        } else if (dados.olt && dados.olt !== "" && dados.olt !== "N/A") {
            campos.push({ label: '📍 Ponto Acesso', valor: dados.olt });
        }

        // 2. SLOT OLT
        campos.push({ label: '📊 Slot OLT', valor: dados.slot || 'XX' });

        // 3. PORTA OLT
        campos.push({ label: '🔌 Porta OLT', valor: dados.porta || 'XX' });

        // 4. ID ONU
        campos.push({ label: '🆔 ID ONU', valor: dados.id || 'XX' });

        // 5. SERIAL
        campos.push({ label: '🔌 Serial', valor: dados.serial || 'XX' });

        // 6. SSID
        campos.push({ label: '📡 SSID', valor: dados.ssid || 'XX' });

        // 7. SENHA
        campos.push({ label: '🔑 Senha', valor: dados.senha || 'XX' });

        // 8-10. TELEFONIA (se tiver)
        if (temTelefonia) {
            campos.push(
                { label: '📞 Número Telefone', valor: dados.telefonia.numero || 'N/A' },
                { label: '🔑 Senha Telefonia', valor: dados.telefonia.senha || 'N/A' },
                { label: '🌐 IP Telefonia', valor: dados.telefonia.ip || 'N/A' }
            );
        }

        campos.forEach(campo => {
            const linha = document.createElement('div');
            linha.style.cssText = `
                display: flex;
                justify-content: space-between;
                padding: 4px 0;
                border-bottom: 1px solid #f3f4f6;
                font-size: ${estadoJanela.fonte}px;
                align-items: center;
            `;

            const label = document.createElement('span');
            label.textContent = campo.label;
            label.style.cssText = `font-weight: 600; color: #4b5563; font-size: ${estadoJanela.fonte}px;`;

            let valorStyle = `
                color: #1f2937;
                font-family: 'Courier New', monospace;
                background: #f9fafb;
                padding: 2px 6px;
                border-radius: 4px;
                max-width: ${Math.round(estadoJanela.largura * 0.45)}px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: ${Math.round(estadoJanela.fonte * 0.95)}px;
            `;

            const valor = document.createElement('span');
            valor.textContent = campo.valor;
            valor.style.cssText = valorStyle;

            linha.appendChild(label);
            linha.appendChild(valor);
            conteudo.appendChild(linha);
        });

        // COMPLEMENTO
        const previewLabel = document.createElement('div');
        previewLabel.style.cssText = `
            margin-top: 12px;
            font-weight: 600;
            color: #4b5563;
            font-size: ${Math.round(estadoJanela.fonte * 0.95)}px;
        `;
        previewLabel.textContent = '📝 Complemento:';
        conteudo.appendChild(previewLabel);

        const previewTexto = document.createElement('div');
        previewTexto.className = 'osir-preview-texto';
        previewTexto.style.cssText = `
            margin-top: 4px;
            padding: 8px;
            background: #f3f4f6;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: ${Math.round(estadoJanela.fonte * 0.85)}px;
            color: #1f2937;
            word-break: break-all;
            max-height: ${Math.round(estadoJanela.altura * 0.15)}px;
            overflow-y: auto;
        `;
        previewTexto.textContent = complementoPreview;
        conteudo.appendChild(previewTexto);

        // BOTÃO 1: "🔄 SINCRONIZAR CONTRATO"
        const btnSincronizar = document.createElement('button');
        btnSincronizar.textContent = '🔄 Sincronizar Contrato';
        btnSincronizar.style.cssText = `
            width: 100%;
            margin-top: 8px;
            padding: 8px;
            background: #8b5cf6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: ${Math.round(estadoJanela.fonte * 0.95)}px;
            transition: background 0.2s;
        `;
        btnSincronizar.onmouseover = () => btnSincronizar.style.background = '#7c3aed';
        btnSincronizar.onmouseout = () => btnSincronizar.style.background = '#8b5cf6';

        btnSincronizar.onclick = () => {
            const dadosDaCaixinha = {
                serial: dados.serial || "XX",
                ssid: dados.ssid || "XX",
                senha: dados.senha || "XX",
                slot: dados.slot || "XX",
                porta: dados.porta || "XX",
                id: dados.id || "XX",
                contrato: dados.contrato || "Nenhum",
                vlan: dados.vlan || "XX",
                pontoAcesso: dados.pontoAcesso || "",
                olt: dados.olt || "N/A",
                tipoProvisionamento: dados.tipoProvisionamento || "",
                portaWeb: dados.tipoProvisionamento === 'b' ? '8092' : '80',
                splitter: "XX",
                portaSplitter: "XX",
                telefonia: {
                    temTelefonia: temTelefonia,
                    numero: dados.telefonia?.numero || '',
                    senha: dados.telefonia?.senha || '',
                    ip: dados.telefonia?.ip || ''
                }
            };

            const stringSecreta = montarStringOSIRDATA(dadosDaCaixinha);
            console.log('📋 String sincronizada (Amarelo):', stringSecreta);

            navigator.clipboard.writeText(stringSecreta).then(() => {
                btnSincronizar.textContent = '✅ Sincronizado!';
                btnSincronizar.style.background = '#10b981';
                preencherFormularioContrato(dadosDaCaixinha);
                setTimeout(() => {
                    btnSincronizar.textContent = '🔄 Sincronizar Contrato';
                    btnSincronizar.style.background = '#8b5cf6';
                }, 2000);
            });
        };

        conteudo.appendChild(btnSincronizar);

        // BOTÃO 2: "📝 GERAR COMPLEMENTO"
        const btnGerarComplemento = document.createElement('button');
        btnGerarComplemento.textContent = '📝 Gerar Complemento';
        btnGerarComplemento.style.cssText = `
            width: 100%;
            margin-top: 8px;
            padding: 8px;
            background: #e11d48;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: ${Math.round(estadoJanela.fonte * 0.95)}px;
            transition: background 0.2s;
        `;
        btnGerarComplemento.onmouseover = () => btnGerarComplemento.style.background = '#be123c';
        btnGerarComplemento.onmouseout = () => btnGerarComplemento.style.background = '#e11d48';

        btnGerarComplemento.onclick = function() {
            const complementoAtualizado = montarComplemento(dados);
            window.__osir_complemento_atual = complementoAtualizado;

            const inputComplementar = document.getElementById('AuthenticationContractComplement');
            if (!inputComplementar) {
                alert('❌ Campo complementar não encontrado!');
                return;
            }

            inputComplementar.value = complementoAtualizado;
            inputComplementar.dispatchEvent(new Event('input', { bubbles: true }));
            inputComplementar.dispatchEvent(new Event('change', { bubbles: true }));

            const previewTexto = document.querySelector('.osir-preview-texto');
            if (previewTexto) {
                previewTexto.textContent = complementoAtualizado;
            }

            btnGerarComplemento.textContent = '✅ Complemento Gerado!';
            btnGerarComplemento.style.background = '#22c55e';
            setTimeout(() => {
                btnGerarComplemento.textContent = '📝 Gerar Complemento';
                btnGerarComplemento.style.background = '#e11d48';
            }, 2000);
        };

        conteudo.appendChild(btnGerarComplemento);
        janela.appendChild(conteudo);
        document.body.appendChild(janela);

        setTimeout(() => {
            if (document.getElementById('osir-floating-window')) janela.remove();
        }, 300000);
    }

    // =========================================================================
    // FUNÇÃO PARA BUSCAR CAMPO COMPLEMENTAR
    // =========================================================================
    function buscarCampoComplementar() {
        let el = document.getElementById('AuthenticationContractComplement');
        if (el) return el;
        el = document.querySelector('input[name="data[AuthenticationContract][complement]"]');
        if (el) return el;
        const selectors = [
            'input[id*="Complement"]',
            'input[name*="complement"]',
            'textarea[id*="Complement"]',
            'textarea[name*="complement"]'
        ];
        for (let selector of selectors) {
            el = document.querySelector(selector);
            if (el) return el;
        }
        const frames = document.querySelectorAll('iframe');
        for (let frame of frames) {
            try {
                const doc = frame.contentDocument || frame.contentWindow.document;
                el = doc.getElementById('AuthenticationContractComplement');
                if (el) return el;
                el = doc.querySelector('input[name="data[AuthenticationContract][complement]"]');
                if (el) return el;
            } catch (e) {}
        }
        return null;
    }

    // =========================================================================
    // FUNÇÃO PARA CRIAR O BOTÃO "📝 CRIAR COMPLEMENTAR (MANUAL)"
    // =========================================================================
    function injetarBotaoComplementar() {
        try {
            if (document.getElementById('btn-osir-complementar')) {
                return;
            }

            const inputComplementar = buscarCampoComplementar();
            if (!inputComplementar) {
                console.log('⚠️ Campo complementar não encontrado. Tentando novamente...');
                return;
            }

            const pai = inputComplementar.parentNode;
            if (!pai) {
                console.log('⚠️ Pai do campo complementar não encontrado.');
                return;
            }

            let container = pai;
            if (pai.classList && pai.classList.contains('controls')) {
                container = pai;
            } else {
                container = document.createElement('div');
                container.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';
                pai.insertBefore(container, inputComplementar);
                container.appendChild(inputComplementar);
            }

            const botao = document.createElement('button');
            botao.id = 'btn-osir-complementar';
            botao.type = 'button';
            botao.textContent = '📝 Criar Complementar (Manual)';
            botao.style.cssText = `
                padding: 5px 14px;
                background-color: #e11d48;
                color: #ffffff;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                font-size: 12px;
                white-space: nowrap;
                box-shadow: 0 2px 4px rgba(0,0,0,0.15);
                transition: background 0.2s;
                flex-shrink: 0;
            `;
            botao.onmouseover = () => botao.style.backgroundColor = '#be123c';
            botao.onmouseout = () => botao.style.backgroundColor = '#e11d48';

            botao.addEventListener('click', async function() {
                try {
                    const dados = capturarDadosDoContratoManual();
                    const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
                    const complemento = montarComplementoManual(dados, tipoEquip);

                    inputComplementar.value = complemento;
                    inputComplementar.dispatchEvent(new Event('input', { bubbles: true }));
                    inputComplementar.dispatchEvent(new Event('change', { bubbles: true }));

                    botao.textContent = '✅ Criado!';
                    botao.style.backgroundColor = '#22c55e';
                    setTimeout(() => {
                        botao.textContent = '📝 Criar Complementar (Manual)';
                        botao.style.backgroundColor = '#e11d48';
                    }, 2000);

                } catch (err) {
                    console.error('Erro:', err);
                    alert('❌ Erro ao criar complementar: ' + err.message);
                }
            });

            container.appendChild(botao);
            console.log('✅ Botão "Criar Complementar (Manual)" adicionado!');

        } catch (err) {
            console.error('Erro ao injetar botão complementar:', err);
        }
    }

    // =========================================================================
    // CAPTURAR DADOS DO CONTRATO (MANUAL - SEM AMARELO)
    // =========================================================================
    function capturarDadosDoContratoManual() {
        console.log('📋 CAPTURANDO DADOS DO CONTRATO (MANUAL)...');

        const dados = {
            serial: document.getElementById('AuthenticationContractEquipmentSerialNumber')?.value?.trim() || "XX",
            ssid: document.getElementById('AuthenticationContractWifiName')?.value?.trim() || "XX",
            senha: document.getElementById('AuthenticationContractWifiPassword')?.value?.trim() || "XX",
            slot: document.getElementById('AuthenticationContractSlotOlt')?.value?.trim() || "XX",
            porta: document.getElementById('AuthenticationContractPortOlt')?.value?.trim() || "XX",
            id: document.getElementById('AuthenticationContractOltId')?.value?.trim() || "XX",
            vlan: document.getElementById('AuthenticationContractVlan')?.value?.trim() || "XX",
            splitter: document.getElementById('AuthenticationSplitterPortTitle')?.value?.trim() || "XX",
            portaSplitter: document.getElementById('AuthenticationSplitterPortPort')?.value?.trim() || "XX",
            pontoAcesso: document.getElementById('AuthenticationAccessPointTitle')?.value?.trim() || "",
            tipoProvisionamento: document.getElementById('tipoProvisionamento')?.value?.trim()?.toLowerCase() || "r",
            portaWeb: document.getElementById('AuthenticationContractEquipmentPort')?.value?.trim() || "80",
            usuarioONU: document.getElementById('AuthenticationContractEquipmentUser')?.value?.trim() || "",
            senhaONU: document.getElementById('AuthenticationContractEquipmentPassword')?.value?.trim() || "",
            contrato: document.getElementById('AuthenticationContractContractId')?.value?.trim() || "",
            telefonia: { temTelefonia: false, numero: '', senha: '', ip: '' }
        };

        const numTel = document.getElementById('numeroTelefone01');
        if (numTel && numTel.value && numTel.value.trim() !== '') {
            dados.telefonia.temTelefonia = true;
            dados.telefonia.numero = numTel.value.trim();
        }
        const senhaTel = document.getElementById('senhaTelefone');
        if (senhaTel && senhaTel.value && senhaTel.value.trim() !== '') {
            dados.telefonia.senha = senhaTel.value.trim();
        }
        const ipTel = document.getElementById('ipGerencia');
        if (ipTel && ipTel.value && ipTel.value.trim() !== '') {
            dados.telefonia.ip = ipTel.value.trim();
        }

        console.log('📋 Dados do contrato (manual):', dados);
        return dados;
    }

    // =========================================================================
    // MONTAR COMPLEMENTO MANUAL (USANDO DADOS DO CONTRATO)
    // =========================================================================
    function montarComplementoManual(dados, tipoEquip) {
        console.log('📝 MONTANDO COMPLEMENTO MANUAL...');

        let partes = [];

        const temTelefonia = dados.telefonia &&
                             dados.telefonia.temTelefonia === true &&
                             dados.telefonia.numero &&
                             dados.telefonia.numero.trim() !== '';

        let equipamento = tipoEquip;
        if (temTelefonia) {
            equipamento += " + Telefonia";
        }
        partes.push(equipamento);

        partes.push(`SN: ${dados.serial}`);

        if (precisaAutenticacao(dados.tipoProvisionamento, dados.serial)) {
            partes.push("Autentica na ZTE");
        }

        if (dados.splitter && dados.splitter !== "XX" && dados.splitter !== "") {
            const splitterText = dados.portaSplitter && dados.portaSplitter !== "XX" && dados.portaSplitter !== ""
                ? `${dados.splitter} - Porta: ${dados.portaSplitter}`
                : dados.splitter;
            partes.push(splitterText);
        } else {
            partes.push(`XX - Porta XX`);
        }

        partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${dados.porta} ID: ${dados.id}`);

        if (dados.ssid !== "XX" && dados.senha !== "XX") {
            partes.push(`SSID: ${dados.ssid} - Senha: ${dados.senha}`);
        } else if (dados.ssid !== "XX") {
            partes.push(`SSID: ${dados.ssid}`);
        } else if (dados.senha !== "XX") {
            partes.push(`Senha: ${dados.senha}`);
        }

        if (temTelefonia) {
            if (dados.telefonia.numero && dados.telefonia.numero.trim() !== '') {
                partes.push(`Nº: ${dados.telefonia.numero}`);
            }
            if (dados.telefonia.senha && dados.telefonia.senha.trim() !== '') {
                partes.push(`Senha da Telefonia: ${dados.telefonia.senha}`);
            }
            if (dados.telefonia.ip && dados.telefonia.ip.trim() !== '') {
                partes.push(`IP de Telefonia: ${dados.telefonia.ip}`);
            }
        }

        const resultado = partes.join(" || ");
        console.log('📝 Complemento manual:', resultado);
        return resultado;
    }

    // =========================================================================
    // VERIFICAR DADOS E MOSTRAR JANELA - SÓ AMARELO (PRIORIZA CLIPBOARD)
    // =========================================================================
    async function verificarDadosEMostrarJanela() {
        console.log('🔍 VERIFICANDO DADOS DO AMARELO...');

        let dadosAmarelo = null;

        // PRIORIDADE: CLIPBOARD
        try {
            const texto = await navigator.clipboard.readText();
            if (texto && texto.trim().startsWith("OSIRDATA||")) {
                dadosAmarelo = extrairDadosDoClipboard(texto);
                if (dadosAmarelo) {
                    console.log('✅ Dados do AMARELO (CLIPBOARD):', dadosAmarelo);
                    console.log('📞 Telefonia:', dadosAmarelo.telefonia);
                }
            }
        } catch (e) {
            console.log('⚠️ Não foi possível ler o clipboard');
        }

        // FALLBACK: localStorage
        if (!dadosAmarelo) {
            try {
                const salvos = localStorage.getItem('osir_ultimos_dados');
                if (salvos) {
                    const parsed = JSON.parse(salvos);
                    if (parsed && parsed.dados) {
                        dadosAmarelo = parsed.dados;
                        console.log('📦 Dados do localStorage (fallback):', dadosAmarelo);
                    }
                }
            } catch (e) {}
        }

        if (!dadosAmarelo || !dadosAmarelo.serial || dadosAmarelo.serial === "XX") {
            console.log('⚠️ Nenhum dado do Amarelo encontrado');
            return;
        }

        criarJanelaFlutuante(dadosAmarelo);
    }

    // =========================================================================
    // PARTE 1: BOTÃO "📥 PREPARAR DADOS" NA FILA DE PROVISIONAMENTO
    // =========================================================================
    if (window.location.href.includes(URL_ATENDIMENTO)) {

        function injetarBotaoDinamico() {
            if (document.getElementById('btn-copiar-osir-nativo')) return;

            let btnChamado = null;
            let btnConexao = null;
            const todosBotoes = document.querySelectorAll('button, input[type="button"], a, .btn, [role="button"]');

            for (let btn of todosBotoes) {
                const texto = btn.textContent?.trim() || '';
                const id = btn.id || '';
                const href = btn.href || '';

                if (texto === "Chamado" || id === "linkChamado" || href.includes('new_solicitations')) {
                    btnChamado = btn;
                    break;
                }
                if (texto === "Conexão" || texto === "Conexao") {
                    btnConexao = btn;
                }
            }

            const referencia = btnChamado || btnConexao;
            if (!referencia) {
                console.log('⚠️ Nenhum botão de referência encontrado');
                return;
            }

            const btnPreparar = document.createElement('a');
            btnPreparar.id = 'btn-copiar-osir-nativo';
            btnPreparar.type = 'button';
            btnPreparar.textContent = '📥 Preparar Dados';
            btnPreparar.title = 'Preparar dados da fila para o contrato';
            btnPreparar.style.cssText = `
                display: inline-block;
                padding: 4px 10px;
                background-color: #8b5cf6;
                color: #ffffff;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                font-size: 11px;
                margin: 0 4px;
                text-decoration: none;
                text-align: center;
                vertical-align: middle;
                transition: background 0.2s;
                line-height: 1.4;
                height: 28px;
                min-width: 70px;
            `;
            btnPreparar.onmouseover = () => btnPreparar.style.backgroundColor = '#7c3aed';
            btnPreparar.onmouseout = () => btnPreparar.style.backgroundColor = '#8b5cf6';

            btnPreparar.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                try {
                    const dados = capturarDadosDoProvisionamento();

                    if (dados.serial === "XX") {
                        const divTopo = document.body;
                        const matchContrato = divTopo.innerText.match(/Cliente\s*-\s*(\d+)/i);
                        if (matchContrato && matchContrato[1]) {
                            dados.contrato = matchContrato[1].trim();
                        }
                        dados.ssid = document.getElementById('ssid')?.value?.trim() || "XX";
                        dados.senha = document.getElementById('senhaSSID')?.value?.trim() || "XX";

                        const inputOlt = document.getElementById('olt');
                        if (inputOlt && inputOlt.value) dados.olt = inputOlt.value.trim();

                        const inputSlotOLT = document.getElementById('slotOLT');
                        if (inputSlotOLT && inputSlotOLT.value && inputSlotOLT.value.trim() !== '') {
                            dados.slot = parseInt(inputSlotOLT.value.trim(), 10).toString();
                        }

                        const inputPortaOLT = document.getElementById('portaOLT');
                        if (inputPortaOLT && inputPortaOLT.value && inputPortaOLT.value.trim() !== '') {
                            dados.porta = parseInt(inputPortaOLT.value.trim(), 10).toString();
                        }

                        const inputIdOnuOlt = document.getElementById('idOnuOlt');
                        if (inputIdOnuOlt && inputIdOnuOlt.value !== undefined && inputIdOnuOlt.value !== null && inputIdOnuOlt.value !== '') {
                            const idValue = parseInt(inputIdOnuOlt.value.trim(), 10);
                            if (!isNaN(idValue)) {
                                dados.id = idValue.toString();
                            }
                        }

                        const todosInputs = document.querySelectorAll('input');
                        for (let inp of todosInputs) {
                            const id = (inp.id || "").toLowerCase();
                            if (id.includes('serial') && inp.value) {
                                dados.serial = inp.value.trim().toUpperCase();
                                break;
                            }
                            if (id.includes('tipo') && inp.value) {
                                const val = inp.value.toLowerCase().trim();
                                if (val === 'b' || val === 'r') {
                                    dados.tipoProvisionamento = val;
                                }
                            }
                        }
                    }

                    const inputNumero = document.getElementById('numeroTelefone01');
                    const inputSenhaTel = document.getElementById('senhaTelefone');
                    const inputIp = document.getElementById('ipGerencia');

                    if (inputNumero && inputNumero.value && inputNumero.value.trim() !== '') {
                        dados.telefonia.temTelefonia = true;
                        dados.telefonia.numero = inputNumero.value.trim();
                        console.log(`✅ Telefonia capturada: ${dados.telefonia.numero}`);
                    }
                    if (inputSenhaTel && inputSenhaTel.value && inputSenhaTel.value.trim() !== '') {
                        dados.telefonia.senha = inputSenhaTel.value.trim();
                    }
                    if (inputIp && inputIp.value && inputIp.value.trim() !== '') {
                        dados.telefonia.ip = inputIp.value.trim();
                    }

                    dados.vlan = calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);
                    dados.portaWeb = definirPortaWeb(dados.tipoProvisionamento);

                    const complementoTexto = montarComplemento(dados);

                    const telefoniaStr = dados.telefonia.temTelefonia
                        ? `${dados.telefonia.numero}||${dados.telefonia.senha}||${dados.telefonia.ip || ''}`
                        : '||||';

                    const contratoParaClipboard = dados.contrato || "Nenhum";
                    const stringSecreta = `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${contratoParaClipboard}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}||${dados.tipoProvisionamento}||${telefoniaStr}||${dados.portaWeb}`;

                    try {
                        localStorage.setItem('osir_ultimos_dados', JSON.stringify({
                            dados: dados,
                            timestamp: Date.now()
                        }));
                    } catch (e) {}

                    navigator.clipboard.writeText(stringSecreta).then(() => {
                        const statusTelefonia = dados.telefonia.temTelefonia ? '📞' : '';
                        btnPreparar.textContent = `✅ ${statusTelefonia}`;
                        btnPreparar.style.backgroundColor = '#10b981';

                        const notificacao = document.createElement('div');
                        notificacao.style.cssText = `
                            position: fixed;
                            bottom: 20px;
                            right: 20px;
                            background: #1f2937;
                            color: white;
                            padding: 10px 16px;
                            border-radius: 8px;
                            font-size: 11px;
                            z-index: 99999;
                            max-width: 350px;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                            font-family: 'Segoe UI', Arial, sans-serif;
                        `;
                        notificacao.innerHTML = `
                            <div style="font-weight: bold; margin-bottom: 3px;">✅ Dados preparados!</div>
                            <div style="font-size: 10px; opacity: 0.8;">Contrato: ${contratoParaClipboard}</div>
                            ${dados.telefonia.temTelefonia ? '<div style="font-size: 10px; color: #34d399;">📞 Com Telefonia</div>' : ''}
                        `;
                        document.body.appendChild(notificacao);

                        setTimeout(() => {
                            notificacao.remove();
                            btnPreparar.textContent = '📥 Preparar Dados';
                            btnPreparar.style.backgroundColor = '#8b5cf6';
                        }, 3500);
                    });
                } catch (err) {
                    console.error('Erro na captura:', err);
                }
            });

            referencia.parentNode.replaceChild(btnPreparar, referencia);
            console.log('✅ Botão "Preparar Dados" adicionado!');
        }

        setInterval(injetarBotaoDinamico, 800);
        setTimeout(injetarBotaoDinamico, 100);
        setTimeout(injetarBotaoDinamico, 3000);
    }

    // =========================================================================
    // PARTE 2: BOTÃO "📝 CRIAR COMPLEMENTAR (MANUAL)" NA PÁGINA DO CONTRATO
    // =========================================================================
    if (window.location.href.includes(URL_CONTRATO_VOALLE) ||
        window.location.href.includes(URL_OPERACAO)) {

        let tentativas = 0;
        const maxTentativas = 10;
        const intervaloInjecao = setInterval(() => {
            tentativas++;
            injetarBotaoComplementar();
            if (document.getElementById('btn-osir-complementar') || tentativas >= maxTentativas) {
                clearInterval(intervaloInjecao);
                console.log(`✅ Botão injetado após ${tentativas} tentativas`);
            }
        }, 1500);

        setTimeout(verificarDadosEMostrarJanela, 2000);
        setTimeout(verificarDadosEMostrarJanela, 4000);
    }

    console.log('🚀 Osir Assistente v2.0.0 carregado!');
    console.log('📋 Janela flutuante = SÓ DADOS DO AMARELO');
    console.log('📦 Splitter = DO CONTRATO (você seleciona manualmente)');
    console.log('📞 Telefonia: SENHA e IP preservados!');
    console.log('📌 Ordem dos campos: Ponto Acesso, Slot, Porta OLT, ID, Serial, SSID, Senha, Telefonia');
})();
