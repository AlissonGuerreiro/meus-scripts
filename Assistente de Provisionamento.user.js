// ==UserScript==
// @name         Osir - Assistente de Provisionamento
// @namespace    http://tampermonkey.net/
// @version      5.0.5
// @description  CORRIGIDO: Posição correta de telefonia! Janela + Complemento + WiFi Pro + NOVA JANELA RB + OMADA + JANELA FLUTUANTE CONTRATO SALVO - VERSÃO COMPACTA
// @author       Alisson Guerreiro
// @match        *://*.osirnet.com.br/*
// @match        *://*.osir.net.br/*
// @match        *://*.atendimento.osir.net.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const URL_ATENDIMENTO = "filaProvisionamento.php";
    const URL_CONTRATO_VOALLE = "authentication_contracts/contract_panel";
    const URL_OPERACAO = "/legacy/operations/";

    // =========================================================================
    // CONFIGURAÇÕES DA JANELA FLUTUANTE (VERSÃO COMPACTA)
    // =========================================================================
    const CONFIG_JANELA = {
        larguraMin: 250,
        larguraMax: 500,
        larguraPadrao: 320,
        alturaMin: 250,
        alturaMax: 600,
        alturaPadrao: 400,
        fonteMin: 9,
        fonteMax: 16,
        fontePadrao: 11,
        passo: 15
    };

    let estadoJanela = {
        largura: CONFIG_JANELA.larguraPadrao,
        altura: CONFIG_JANELA.alturaPadrao,
        fonte: CONFIG_JANELA.fontePadrao
    };

    // =========================================================================
    // ESTADO DO WIFI PRO
    // =========================================================================
    let wifiProAtivo = false;

    try {
        const wifiProSalvo = localStorage.getItem('osir_wifi_pro_ativo');
        if (wifiProSalvo !== null) {
            wifiProAtivo = wifiProSalvo === 'true';
        }
    } catch (e) {}

    function salvarEstadoWifiPro(valor) {
        wifiProAtivo = valor;
        try {
            localStorage.setItem('osir_wifi_pro_ativo', String(valor));
        } catch (e) {}
    }

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
    // EXTRAIR DADOS DO CLIPBOARD
    // =========================================================================
    function extrairDadosDoClipboard(texto) {
        if (!texto || !texto.trim().startsWith("OSIRDATA||")) return null;

        const partes = texto.trim().split("||");

        const telNumero = partes[12] || '';
        const telSenha = partes[13] || '';
        const telIp = partes[14] || '';
        const portaWeb = partes[15] || '80';
        const sinal = partes[16] || '';
        const wifiPro = partes[17] === '1';

        const temTelefonia = telNumero && telNumero.trim() !== '';

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
            portaWeb: portaWeb,
            splitter: "XX",
            portaSplitter: "XX",
            usuarioPPPoE: "",
            senhaPPPoE: "",
            usuarioONU: "",
            senhaONU: "",
            nomeONU: "",
            sinal: sinal,
            status: "",
            nomeOLT: partes[10] || "N/A",
            wifiPro: wifiPro,
            telefonia: {
                temTelefonia: temTelefonia,
                numero: telNumero,
                senha: telSenha,
                ip: telIp
            }
        };
    }

    // =========================================================================
    // MONTAR STRING OSIRDATA
    // =========================================================================
    function montarStringOSIRDATA(dados) {
        const portaWeb = dados.portaWeb || '80';
        const sinalStr = dados.sinal || "";
        const wifiProStr = wifiProAtivo ? '1' : '0';

        return `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contrato}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}||${dados.tipoProvisionamento}||${dados.telefonia.numero || ''}||${dados.telefonia.senha || ''}||${dados.telefonia.ip || ''}||${portaWeb}||${sinalStr}||${wifiProStr}`;
    }

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

    function definirPortaWeb(tipoProvisionamento) {
        const tipo = (tipoProvisionamento || "").toLowerCase().trim();
        if (tipo === "b") return "8092";
        if (tipo === "r") return "80";
        return "80";
    }

    function determinarTipoEquipamento(tipoProvisionamento, serial) {
        const tipo = (tipoProvisionamento || "").toLowerCase().trim();
        const serialUpper = (serial || "").toUpperCase();

        if (tipo === "r") {
            if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) return "Huawei Router";
            if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) return "ZTE Bridge";
            if (serialUpper.startsWith("RCMG")) return "Raisecom Router";
            return "Router";
        }
        if (tipo === "b") {
            if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) return "Huawei Bridge";
            if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A544") || serialUpper.startsWith("ZTEGD")) return "ZTE Bridge";
            if (serialUpper.startsWith("RCMG")) return "Raisecom Router";
            return "Bridge";
        }

        if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) {
            return tipo === "b" ? "Huawei Bridge" : "Huawei Router";
        }
        if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) {
            return tipo === "b" ? "ZTE Bridge" : "ZTE Bridge";
        }
        if (serialUpper.startsWith("RCMG")) {
            return tipo === "b" ? "Raisecom Router" : "Raisecom Router";
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
    // CAPTURAR DADOS DO PROVISIONAMENTO
    // =========================================================================
    function capturarDadosDoProvisionamento() {
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
            wifiPro: wifiProAtivo,
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

        if (campos.sinal && campos.sinal.value) {
            dados.sinal = campos.sinal.value.trim();
        }

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

        return dados;
    }

    // =========================================================================
    // MONTAR COMPLEMENTO
    // =========================================================================
    function montarComplemento(dados) {
        let partes = [];

        if (wifiProAtivo) {
            partes.push("Cliente Wifi Pro");
        }

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

        const splitterDoFormulario = document.getElementById('AuthenticationSplitterPortTitle')?.value?.trim() || "";
        const portaSplitterDoFormulario = document.getElementById('AuthenticationSplitterPortPort')?.value?.trim() || "";

        if (splitterDoFormulario && splitterDoFormulario !== "") {
            const splitterText = portaSplitterDoFormulario && portaSplitterDoFormulario !== ""
                ? `${splitterDoFormulario} - Porta: ${portaSplitterDoFormulario}`
                : splitterDoFormulario;
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

        return partes.join(" || ");
    }

    // =========================================================================
    // PREENCHER FORMULÁRIO DO CONTRATO
    // =========================================================================
    function preencherFormularioContrato(dados) {
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

        const fiberMac = document.getElementById('AuthenticationContractFiberMac');
        const mac = document.getElementById('AuthenticationContractMac');

        if (fiberMac && mac) {
            const fiberMacValue = fiberMac.value?.trim() || '';
            if (fiberMacValue === '') {
                mac.value = '';
                mac.dispatchEvent(new Event('input', { bubbles: true }));
                mac.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    // =========================================================================
    // JANELA FLUTUANTE (DIREITA) - VERSÃO COMPACTA
    // =========================================================================
    function criarJanelaFlutuante(dados) {
        const contratoParaExibir = dados.contrato || "???";
        const janelaExistente = document.getElementById('osir-floating-window');
        if (janelaExistente) janelaExistente.remove();

        const temTelefonia = dados.telefonia &&
                             dados.telefonia.temTelefonia === true &&
                             dados.telefonia.numero &&
                             dados.telefonia.numero.trim() !== '';

        if (dados.wifiPro !== undefined) {
            salvarEstadoWifiPro(dados.wifiPro);
        }

        const complementoPreview = montarComplemento(dados);

        const janela = document.createElement('div');
        janela.id = 'osir-floating-window';
        janela.style.cssText = `
            position: fixed;
            top: 70px;
            right: 15px;
            width: ${estadoJanela.largura}px;
            max-height: ${estadoJanela.altura}px;
            background: #ffffff;
            border: 2px solid #8b5cf6;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.35);
            z-index: 99999;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 14px;
            overflow-y: auto;
            transition: width 0.3s ease, max-height 0.3s ease, box-shadow 0.3s ease;
            font-size: ${estadoJanela.fonte}px;
        `;

        // CABEÇALHO - Compacto
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding: 8px 10px;
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            border-radius: 8px;
            gap: 6px;
            flex-wrap: wrap;
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
            border: 1px solid #d1d5db;
        `;

        const titulo = document.createElement('span');
        titulo.textContent = `📋 Contrato #${contratoParaExibir}`;
        titulo.style.cssText = `
            font-weight: 700;
            font-size: ${Math.round(estadoJanela.fonte * 1.1)}px;
            color: #1f2937;
            flex: 1;
            letter-spacing: 0.2px;
        `;

        const grupoControles = document.createElement('div');
        grupoControles.style.cssText = `display: flex; align-items: center; gap: 4px;`;

        const btnMenos = document.createElement('button');
        btnMenos.textContent = '−';
        btnMenos.style.cssText = `
            background: #e5e7eb;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            padding: 3px 8px;
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
            color: #374151;
            transition: all 0.2s ease;
            line-height: 1.2;
        `;
        btnMenos.onclick = () => { redimensionarJanela(-CONFIG_JANELA.passo, -CONFIG_JANELA.passo, -1); salvarPreferencias(); };

        const sizeDisplay = document.createElement('span');
        sizeDisplay.id = 'osir-size-display';
        sizeDisplay.textContent = `${estadoJanela.largura}×${estadoJanela.altura}`;
        sizeDisplay.style.cssText = `
            font-size: ${Math.round(estadoJanela.fonte * 0.7)}px;
            color: #6b7280;
            padding: 2px 6px;
            min-width: 45px;
            text-align: center;
            font-family: 'Courier New', monospace;
            font-weight: 600;
            background: #ffffff;
            border-radius: 3px;
            border: 1px solid #e5e7eb;
        `;

        const btnMais = document.createElement('button');
        btnMais.textContent = '+';
        btnMais.style.cssText = `
            background: #e5e7eb;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            padding: 3px 8px;
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
            color: #374151;
            transition: all 0.2s ease;
            line-height: 1.2;
        `;
        btnMais.onclick = () => { redimensionarJanela(CONFIG_JANELA.passo, CONFIG_JANELA.passo, 1); salvarPreferencias(); };

        const sep = document.createElement('span');
        sep.textContent = '|';
        sep.style.cssText = `color: #d1d5db; padding: 0 3px; font-weight: 300;`;

        const btnReset = document.createElement('button');
        btnReset.textContent = '↺';
        btnReset.style.cssText = `
            background: #e5e7eb;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            padding: 3px 8px;
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
            color: #374151;
            transition: all 0.3s ease;
            line-height: 1.2;
        `;
        btnReset.onclick = () => {
            estadoJanela.largura = CONFIG_JANELA.larguraPadrao;
            estadoJanela.altura = CONFIG_JANELA.alturaPadrao;
            estadoJanela.fonte = CONFIG_JANELA.fontePadrao;
            redimensionarJanela(0, 0, 0);
            salvarPreferencias();
        };

        const btnFechar = document.createElement('button');
        btnFechar.textContent = '✕';
        btnFechar.style.cssText = `
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            border: 1px solid #dc2626;
            border-radius: 4px;
            padding: 3px 8px;
            cursor: pointer;
            font-weight: 700;
            font-size: 12px;
            color: white;
            transition: all 0.2s ease;
            line-height: 1.2;
            box-shadow: 0 1px 3px rgba(239,68,68,0.3);
        `;
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

        // BADGE - Compacto
        const badge = document.createElement('div');
        badge.className = 'osir-badge';
        badge.style.cssText = `
            background: ${temTelefonia ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)'};
            color: ${temTelefonia ? '#065f46' : '#1e40af'};
            padding: 6px 10px;
            border-radius: 6px;
            font-size: ${Math.round(estadoJanela.fonte * 0.9)}px;
            font-weight: 700;
            margin-bottom: 8px;
            text-align: center;
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
            letter-spacing: 0.2px;
            border: 1px solid ${temTelefonia ? '#6ee7b7' : '#93c5fd'};
        `;
        let badgeTexto = temTelefonia ? '✅ Dados do Amarelo 📞' : '✅ Dados do Amarelo';
        if (wifiProAtivo) badgeTexto += ' 📶 WiFi Pro';
        badge.textContent = badgeTexto;
        janela.appendChild(badge);

        // FONTE DOS DADOS - Compacto
        const fonteInfo = document.createElement('div');
        fonteInfo.style.cssText = `
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            color: #92400e;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: ${Math.round(estadoJanela.fonte * 0.75)}px;
            margin-bottom: 8px;
            text-align: center;
            font-weight: 600;
            border: 1px solid #fcd34d;
        `;
        fonteInfo.textContent = '🟡 Dados do Provisionamento';
        janela.appendChild(fonteInfo);

        // CONTEÚDO
        const conteudo = document.createElement('div');
        conteudo.style.cssText = `font-size: ${estadoJanela.fonte}px;`;

        // CHECKBOX WIFI PRO - Compacto
        const wifiProContainer = document.createElement('div');
        wifiProContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            margin-bottom: 6px;
            border-bottom: 1px solid #e5e7eb;
            border-radius: 4px;
            background: #f9fafb;
        `;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'osir-wifi-pro-checkbox';
        checkbox.checked = wifiProAtivo;
        checkbox.style.cssText = `
            width: 15px;
            height: 15px;
            cursor: pointer;
            accent-color: #8b5cf6;
        `;

        const label = document.createElement('label');
        label.htmlFor = 'osir-wifi-pro-checkbox';
        label.textContent = '📶 WiFi Pro';
        label.style.cssText = `
            font-weight: 700;
            color: #4b5563;
            font-size: ${estadoJanela.fonte}px;
            cursor: pointer;
            user-select: none;
        `;

        checkbox.addEventListener('change', function() {
            salvarEstadoWifiPro(this.checked);
            const badge = document.querySelector('#osir-floating-window .osir-badge');
            if (badge) {
                let texto = temTelefonia ? '✅ Dados do Amarelo 📞' : '✅ Dados do Amarelo';
                if (wifiProAtivo) texto += ' 📶 WiFi Pro';
                badge.textContent = texto;
            }
            const complementoAtualizado = montarComplemento(dados);
            const previewTexto = document.querySelector('.osir-preview-texto');
            if (previewTexto) {
                previewTexto.textContent = complementoAtualizado;
            }
        });

        wifiProContainer.appendChild(checkbox);
        wifiProContainer.appendChild(label);
        conteudo.appendChild(wifiProContainer);

        // CAMPOS - Compacto
        const campos = [];

        if (dados.nomeOLT && dados.nomeOLT !== "" && dados.nomeOLT !== "N/A") {
            campos.push({ label: '📍 PE', valor: dados.nomeOLT });
        } else if (dados.olt && dados.olt !== "" && dados.olt !== "N/A") {
            campos.push({ label: '📍 PE', valor: dados.olt });
        }

        campos.push(
            { label: '📊 Slot', valor: dados.slot || 'XX' },
            { label: '🔌 Porta', valor: dados.porta || 'XX' },
            { label: '🆔 ID', valor: dados.id || 'XX' },
            { label: '🔌 Serial', valor: dados.serial || 'XX' },
            { label: '📡 SSID', valor: dados.ssid || 'XX' },
            { label: '🔑 Senha', valor: dados.senha || 'XX' }
        );

        if (temTelefonia) {
            campos.push(
                { label: '📞 Tel', valor: dados.telefonia.numero || 'N/A' }
            );
            if (dados.telefonia.senha && dados.telefonia.senha.trim() !== '') {
                campos.push({ label: '🔑 Senha Tel', valor: dados.telefonia.senha });
            }
            if (dados.telefonia.ip && dados.telefonia.ip.trim() !== '') {
                campos.push({ label: '🌐 IP Tel', valor: dados.telefonia.ip });
            }
        }

        campos.forEach((campo) => {
            const linha = document.createElement('div');
            linha.style.cssText = `
                display: flex;
                justify-content: space-between;
                padding: 4px 6px;
                border-bottom: 1px solid #f3f4f6;
                font-size: ${estadoJanela.fonte}px;
                align-items: center;
                gap: 4px;
                border-radius: 3px;
            `;

            const label = document.createElement('span');
            label.textContent = campo.label;
            label.style.cssText = `
                font-weight: 700;
                color: #4b5563;
                font-size: ${estadoJanela.fonte}px;
                min-width: 60px;
            `;

            const valor = document.createElement('span');
            valor.textContent = campo.valor;
            valor.style.cssText = `
                color: #1f2937;
                font-family: 'Courier New', monospace;
                background: #f9fafb;
                padding: 2px 6px;
                border-radius: 3px;
                max-width: ${Math.round(estadoJanela.largura * 0.45)}px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: ${Math.round(estadoJanela.fonte * 0.9)}px;
                font-weight: 600;
                border: 1px solid #e5e7eb;
            `;

            linha.appendChild(label);
            linha.appendChild(valor);
            conteudo.appendChild(linha);
        });

        // COMPLEMENTO - Compacto
        const previewLabel = document.createElement('div');
        previewLabel.style.cssText = `
            margin-top: 10px;
            font-weight: 700;
            color: #4b5563;
            font-size: ${Math.round(estadoJanela.fonte * 0.9)}px;
        `;
        previewLabel.textContent = '📝 Complemento:';
        conteudo.appendChild(previewLabel);

        const previewTexto = document.createElement('div');
        previewTexto.className = 'osir-preview-texto';
        previewTexto.style.cssText = `
            margin-top: 4px;
            padding: 8px;
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: ${Math.round(estadoJanela.fonte * 0.8)}px;
            color: #1f2937;
            word-break: break-all;
            max-height: ${Math.round(estadoJanela.altura * 0.12)}px;
            overflow-y: auto;
            border: 1px solid #d1d5db;
            font-weight: 500;
        `;
        previewTexto.textContent = complementoPreview;
        conteudo.appendChild(previewTexto);

        // BOTÕES - Compacto
        const btnSincronizar = document.createElement('button');
        btnSincronizar.textContent = '🔄 Sincronizar';
        btnSincronizar.style.cssText = `
            width: 100%;
            margin-top: 8px;
            padding: 6px;
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: white;
            border: 1px solid #7c3aed;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 700;
            font-size: ${Math.round(estadoJanela.fonte * 0.9)}px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(139,92,246,0.25);
        `;
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
                portaWeb: dados.portaWeb,
                splitter: "XX",
                portaSplitter: "XX",
                sinal: dados.sinal || "",
                telefonia: {
                    temTelefonia: temTelefonia,
                    numero: dados.telefonia?.numero || '',
                    senha: dados.telefonia?.senha || '',
                    ip: dados.telefonia?.ip || ''
                },
                wifiPro: wifiProAtivo
            };

            const stringSecreta = montarStringOSIRDATA(dadosDaCaixinha);

            navigator.clipboard.writeText(stringSecreta).then(() => {
                btnSincronizar.textContent = '✅ OK';
                btnSincronizar.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                preencherFormularioContrato(dadosDaCaixinha);
                setTimeout(() => {
                    btnSincronizar.textContent = '🔄 Sincronizar';
                    btnSincronizar.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                }, 1500);
            });
        };
        conteudo.appendChild(btnSincronizar);

        const btnGerarComplemento = document.createElement('button');
        btnGerarComplemento.textContent = '📝 Complemento';
        btnGerarComplemento.style.cssText = `
            width: 100%;
            margin-top: 6px;
            padding: 6px;
            background: linear-gradient(135deg, #e11d48 0%, #be123c 100%);
            color: white;
            border: 1px solid #be123c;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 700;
            font-size: ${Math.round(estadoJanela.fonte * 0.9)}px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(225,29,72,0.2);
        `;
        btnGerarComplemento.onclick = function() {
            const complementoAtualizado = montarComplemento(dados);
            const inputComplementar = document.getElementById('AuthenticationContractComplement');
            if (inputComplementar) {
                inputComplementar.value = complementoAtualizado;
                inputComplementar.dispatchEvent(new Event('input', { bubbles: true }));
                inputComplementar.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const previewTexto = document.querySelector('.osir-preview-texto');
            if (previewTexto) {
                previewTexto.textContent = complementoAtualizado;
            }
            btnGerarComplemento.textContent = '✅ OK';
            btnGerarComplemento.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
            setTimeout(() => {
                btnGerarComplemento.textContent = '📝 Complemento';
                btnGerarComplemento.style.background = 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)';
            }, 1500);
        };
        conteudo.appendChild(btnGerarComplemento);

        janela.appendChild(conteudo);
        document.body.appendChild(janela);
    }

    // =========================================================================
    // VERIFICAR DADOS E MOSTRAR JANELA
    // =========================================================================
    async function verificarDadosEMostrarJanela() {
        let dadosAmarelo = null;

        try {
            const texto = await navigator.clipboard.readText();
            if (texto && texto.trim().startsWith("OSIRDATA||")) {
                dadosAmarelo = extrairDadosDoClipboard(texto);
                if (dadosAmarelo) {
                    wifiProAtivo = dadosAmarelo.wifiPro || false;
                }
            }
        } catch (e) {}

        if (!dadosAmarelo) {
            try {
                const salvos = localStorage.getItem('osir_ultimos_dados');
                if (salvos) {
                    const parsed = JSON.parse(salvos);
                    if (parsed && parsed.dados) {
                        dadosAmarelo = parsed.dados;
                        wifiProAtivo = dadosAmarelo.wifiPro || false;
                    }
                }
            } catch (e) {}
        }

        if (!dadosAmarelo || !dadosAmarelo.serial || dadosAmarelo.serial === "XX") {
            return;
        }

        criarJanelaFlutuante(dadosAmarelo);
    }

    // =========================================================================
    // JANELA DA ESQUERDA (CONFIGURAÇÃO) - VERSÃO COMPACTA
    // =========================================================================
    function getModeloLabel() {
        const selected = document.querySelector('input[name="modelo-equipamento"]:checked');
        if (!selected) return 'Bridge';
        const modelosMap = {
            'huawei-router': 'Huawei Router',
            'huawei-bridge': 'Huawei Bridge',
            'raisecom-router': 'Raisecom Router',
            'raisecom-bridge': 'Raisecom Bridge',
            'raisecom-bridge-desativada': 'Raisecom Bridge (Desativada)',
            'ektech-bridge': 'Ektech Bridge',
            'zte-bridge': 'ZTE Bridge',
            'zte-router': 'ZTE Router'
        };
        return modelosMap[selected.value] || 'Bridge';
    }

    function getDadosDoFormulario() {
        const serial = document.getElementById('AuthenticationContractEquipmentSerialNumber')?.value?.trim() || 'XX';
        const slot = document.getElementById('AuthenticationContractSlotOlt')?.value?.trim() || 'XX';
        const porta = document.getElementById('AuthenticationContractPortOlt')?.value?.trim() || 'XX';
        const id = document.getElementById('AuthenticationContractOltId')?.value?.trim() || 'XX';
        const ssid = document.getElementById('AuthenticationContractWifiName')?.value?.trim() || '';
        const senha = document.getElementById('AuthenticationContractWifiPassword')?.value?.trim() || '';
        const splitter = document.getElementById('AuthenticationSplitterPortTitle')?.value?.trim() || '';
        const portaSplitter = document.getElementById('AuthenticationSplitterPortPort')?.value?.trim() || '';

        return { serial, slot, porta, id, ssid, senha, splitter, portaSplitter };
    }

    function montarComplementoConfig() {
        const modelo = getModeloLabel();
        const dados = getDadosDoFormulario();
        const wifiPro = document.getElementById('osir-wifi-pro-check')?.checked || false;
        const autenticaZTE = document.getElementById('osir-autentica-zte-check')?.checked || false;
        const autenticaRB = document.getElementById('osir-autentica-rb-check')?.checked || false;
        const omada = document.getElementById('osir-omada-check')?.checked || false;

        const campoComplemento = document.getElementById('AuthenticationContractComplement');
        let complementoAtual = campoComplemento?.value || '';

        let ssidPreservado = '';
        let senhaPreservada = '';
        let outrosDados = [];

        const partesAtuais = complementoAtual.split('||').map(p => p.trim());

        partesAtuais.forEach(parte => {
            if (parte.includes('SSID:')) {
                const match = parte.match(/SSID:\s*([^|]+?)(?:\s+Senha:|$)/);
                if (match) ssidPreservado = match[1].trim();
                const senhaMatch = parte.match(/Senha:\s*([^|]+)/);
                if (senhaMatch) senhaPreservada = senhaMatch[1].trim();
            } else if (parte.includes('Senha:') && !parte.includes('SSID:')) {
                const match = parte.match(/Senha:\s*([^|]+)/);
                if (match) senhaPreservada = match[1].trim();
            } else if (!parte.includes('SN:') &&
                     !parte.includes('Splitter:') &&
                     !parte.includes('Slot OLT:') &&
                     !parte.includes('Cliente Wifi Pro') &&
                     !parte.includes('Autentica na ZTE') &&
                     !parte.includes('Autentica em uma RB') &&
                     !parte.includes('EAPs configurados no OMADA') &&
                     !parte.includes('Huawei') &&
                     !parte.includes('Raisecom') &&
                     !parte.includes('ZTE') &&
                     !parte.includes('Bridge') &&
                     !parte.includes('Router') &&
                     !parte.includes('Ektech') &&
                     parte !== '' &&
                     !parte.includes('XX - Porta XX')) {
                if (parte.trim() !== '') {
                    outrosDados.push(parte.trim());
                }
            }
        });

        if (!ssidPreservado) {
            ssidPreservado = document.getElementById('AuthenticationContractWifiName')?.value?.trim() || '';
        }
        if (!senhaPreservada) {
            senhaPreservada = document.getElementById('AuthenticationContractWifiPassword')?.value?.trim() || '';
        }

        let partes = [];

        if (wifiPro) partes.push('Cliente Wifi Pro');
        partes.push(modelo);
        if (autenticaZTE) partes.push('Autentica na ZTE');
        if (autenticaRB) partes.push('Autentica em uma RB');
        if (omada) partes.push('EAPs configurados no OMADA');
        if (dados.serial && dados.serial !== 'XX') partes.push(`SN: ${dados.serial}`);

        if (dados.splitter && dados.splitter !== '') {
            const portaSplitter = dados.portaSplitter && dados.portaSplitter !== ''
                ? dados.portaSplitter.padStart(2, '0')
                : 'XX';
            partes.push(`Splitter: ${dados.splitter} Porta: ${portaSplitter}`);
        } else {
            partes.push('XX - Porta XX');
        }

        if (dados.slot && dados.porta && dados.id) {
            const portaFormatada = dados.porta.padStart(2, '0');
            partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${portaFormatada} ID: ${dados.id}`);
        }

        if (ssidPreservado && ssidPreservado !== '') {
            if (senhaPreservada && senhaPreservada !== '') {
                partes.push(`SSID: ${ssidPreservado} Senha: ${senhaPreservada}`);
            } else {
                partes.push(`SSID: ${ssidPreservado}`);
            }
        } else if (senhaPreservada && senhaPreservada !== '') {
            partes.push(`Senha: ${senhaPreservada}`);
        }

        if (outrosDados.length > 0) {
            outrosDados.forEach(obs => {
                if (obs && obs.trim() !== '') {
                    partes.push(obs.trim());
                }
            });
        }

        const resultado = partes.join(' || ');
        return resultado
            .replace(/\|\|\s*\|\|/g, '||')
            .replace(/^\s*\|\|\s*/, '')
            .replace(/\s*\|\|\s*$/, '')
            .trim();
    }

    function atualizarPreviewConfig() {
        const preview = document.getElementById('osir-preview-complement');
        if (preview) {
            const complemento = montarComplementoConfig();
            preview.textContent = complemento || 'Nenhum dado disponível';
        }
    }

    function atualizarComplemento() {
        const campoComplemento = document.getElementById('AuthenticationContractComplement');
        if (!campoComplemento) return;

        const complemento = montarComplementoConfig();
        campoComplemento.value = complemento;
        campoComplemento.dispatchEvent(new Event('input', { bubbles: true }));
        campoComplemento.dispatchEvent(new Event('change', { bubbles: true }));

        const btn = document.querySelector('#osir-config-complement-window button:first-of-type');
        if (btn) {
            btn.textContent = '✅ OK';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            setTimeout(() => {
                btn.textContent = '🔄 Atualizar';
                btn.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
            }, 1500);
        }
        atualizarPreviewConfig();
    }

    function buscarDados() {
        getDadosDoFormulario();
        atualizarPreviewConfig();

        const btn = document.querySelector('#osir-config-complement-window button:nth-child(2)');
        if (btn) {
            btn.textContent = '✅ OK';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            setTimeout(() => {
                btn.textContent = '📥 Buscar';
                btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
            }, 1500);
        }
    }

    function gerarAutomatico() {
        const campoComplemento = document.getElementById('AuthenticationContractComplement');
        if (!campoComplemento) return;

        const dados = getDadosDoFormulario();
        let modeloAutomatico = 'Bridge';
        const serial = dados.serial || '';
        const serialUpper = serial.toUpperCase();

        if (serialUpper.startsWith('4857') || serialUpper.startsWith('HWTC')) {
            modeloAutomatico = 'Huawei Bridge';
        } else if (serialUpper.startsWith('ZTEG') || serialUpper.startsWith('5A544') || serialUpper.startsWith('ZTEGD')) {
            modeloAutomatico = 'ZTE Bridge';
        } else if (serialUpper.startsWith('RCMG')) {
            modeloAutomatico = 'Raisecom Router';
        }

        const precisaZTE = serialUpper.startsWith('5A544') || serialUpper.startsWith('ZTEGD');
        const wifiPro = wifiProAtivo;

        let ssidPreservado = '';
        let senhaPreservada = '';
        let complementoAtual = campoComplemento.value || '';

        const matchSSID = complementoAtual.match(/SSID:\s*([^|]+?)(?:\s+Senha:|$)/);
        if (matchSSID) {
            ssidPreservado = matchSSID[1].trim();
            const senhaMatch = complementoAtual.match(/Senha:\s*([^|]+)/);
            if (senhaMatch) senhaPreservada = senhaMatch[1].trim();
        }

        if (!ssidPreservado) ssidPreservado = dados.ssid || '';
        if (!senhaPreservada) senhaPreservada = dados.senha || '';

        let partes = [];

        if (wifiPro) partes.push('Cliente Wifi Pro');
        partes.push(modeloAutomatico);
        if (precisaZTE) partes.push('Autentica na ZTE');
        if (dados.serial && dados.serial !== 'XX') partes.push(`SN: ${dados.serial}`);

        if (dados.splitter && dados.splitter !== '') {
            const portaSplitter = dados.portaSplitter && dados.portaSplitter !== ''
                ? dados.portaSplitter.padStart(2, '0')
                : 'XX';
            partes.push(`Splitter: ${dados.splitter} Porta: ${portaSplitter}`);
        } else {
            partes.push('XX - Porta XX');
        }

        if (dados.slot && dados.porta && dados.id) {
            const portaFormatada = dados.porta.padStart(2, '0');
            partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${portaFormatada} ID: ${dados.id}`);
        }

        if (ssidPreservado && ssidPreservado !== '') {
            if (senhaPreservada && senhaPreservada !== '') {
                partes.push(`SSID: ${ssidPreservado} Senha: ${senhaPreservada}`);
            } else {
                partes.push(`SSID: ${ssidPreservado}`);
            }
        } else if (senhaPreservada && senhaPreservada !== '') {
            partes.push(`Senha: ${senhaPreservada}`);
        }

        const complementoAutomatico = partes.join(' || ');

        campoComplemento.value = complementoAutomatico;
        campoComplemento.dispatchEvent(new Event('input', { bubbles: true }));
        campoComplemento.dispatchEvent(new Event('change', { bubbles: true }));

        atualizarPreviewConfig();

        const btn = document.querySelector('#osir-config-complement-window button:nth-child(3)');
        if (btn) {
            btn.textContent = '✅ OK';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            setTimeout(() => {
                btn.textContent = '⚡ Auto';
                btn.style.background = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
            }, 1500);
        }

        const wifiCheck = document.getElementById('osir-wifi-pro-check');
        const zteCheck = document.getElementById('osir-autentica-zte-check');
        if (wifiCheck) wifiCheck.checked = wifiPro;
        if (zteCheck) zteCheck.checked = precisaZTE;

        const modelosMap = {
            'Huawei Bridge': 'modelo-huawei-bridge',
            'ZTE Bridge': 'modelo-zte-bridge',
            'Raisecom Router': 'modelo-raisecom-router',
            'Raisecom Bridge': 'modelo-raisecom-bridge',
            'Raisecom Bridge (Desativada)': 'modelo-raisecom-bridge-desativada',
            'Ektech Bridge': 'modelo-ektech-bridge',
            'Huawei Router': 'modelo-huawei-router',
            'ZTE Router': 'modelo-zte-router'
        };
        const modeloId = modelosMap[modeloAutomatico];
        if (modeloId) {
            const modeloRadio = document.getElementById(modeloId);
            if (modeloRadio) modeloRadio.checked = true;
        }
    }

    function limparComplemento() {
        const campoComplemento = document.getElementById('AuthenticationContractComplement');
        if (campoComplemento) {
            campoComplemento.value = '';
            campoComplemento.dispatchEvent(new Event('input', { bubbles: true }));
            campoComplemento.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const wifiCheck = document.getElementById('osir-wifi-pro-check');
        const zteCheck = document.getElementById('osir-autentica-zte-check');
        const rbCheck = document.getElementById('osir-autentica-rb-check');
        const omadaCheck = document.getElementById('osir-omada-check');

        if (wifiCheck) wifiCheck.checked = false;
        if (zteCheck) zteCheck.checked = false;
        if (rbCheck) rbCheck.checked = false;
        if (omadaCheck) omadaCheck.checked = false;

        const defaultModelo = document.getElementById('modelo-huawei-bridge');
        if (defaultModelo) defaultModelo.checked = true;

        atualizarPreviewConfig();

        const btn = document.querySelector('#osir-config-complement-window button:nth-child(4)');
        if (btn) {
            btn.textContent = '✅ OK';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            setTimeout(() => {
                btn.textContent = '❌ Limpar';
                btn.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
            }, 1500);
        }
    }

    function criarJanelaConfiguracaoComplemento() {
        if (document.getElementById('osir-config-complement-window')) return;

        const menuContainer = document.querySelector('.panel-content .contract-menu');
        if (!menuContainer) return;

        const contratoId = document.querySelector('.contract-menu')?.getAttribute('data-contractid') || '???';
        const nomeCliente = document.querySelector('.menu-info p')?.textContent?.trim() || 'Cliente';

        const janela = document.createElement('div');
        janela.id = 'osir-config-complement-window';
        janela.style.cssText = `
            position: relative;
            margin: 10px 0;
            width: 100%;
            max-width: 380px;
            background: #ffffff;
            border: 2px solid #8b5cf6;
            border-radius: 10px;
            box-shadow: 0 6px 24px rgba(139, 92, 246, 0.15);
            padding: 14px;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 11px;
            transition: all 0.3s ease;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e5e7eb;
        `;

        const titulo = document.createElement('span');
        titulo.textContent = '⚙️ Complemento';
        titulo.style.cssText = `
            font-weight: 700;
            font-size: 13px;
            color: #1f2937;
            letter-spacing: 0.2px;
        `;

        const btnFechar = document.createElement('button');
        btnFechar.textContent = '✕';
        btnFechar.style.cssText = `
            background: none;
            border: none;
            font-size: 15px;
            cursor: pointer;
            color: #6b7280;
            padding: 0 4px;
            transition: all 0.2s ease;
            font-weight: 700;
        `;
        btnFechar.onclick = () => janela.remove();

        header.appendChild(titulo);
        header.appendChild(btnFechar);
        janela.appendChild(header);

        const infoContrato = document.createElement('div');
        infoContrato.style.cssText = `
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            padding: 6px 10px;
            border-radius: 6px;
            margin-bottom: 10px;
            font-size: 10px;
            border: 1px solid #e2e8f0;
        `;
        infoContrato.innerHTML = `
            <div style="font-weight: 700; color: #1f2937;">📌 #${contratoId}</div>
            <div style="color: #4b5563; font-size: 10px;">${nomeCliente}</div>
        `;
        janela.appendChild(infoContrato);

        const modelosLabel = document.createElement('div');
        modelosLabel.style.cssText = `
            font-weight: 700;
            color: #4b5563;
            margin: 8px 0 4px 0;
            font-size: 10px;
            text-transform: uppercase;
        `;
        modelosLabel.textContent = '📋 Modelo';
        janela.appendChild(modelosLabel);

        const modelos = [
            { id: 'huawei-router', label: 'Huawei Router' },
            { id: 'huawei-bridge', label: 'Huawei Bridge' },
            { id: 'raisecom-router', label: 'Raisecom Router' },
            { id: 'raisecom-bridge', label: 'Raisecom Bridge' },
            { id: 'raisecom-bridge-desativada', label: 'Raisecom Bridge (Des.)' },
            { id: 'ektech-bridge', label: 'Ektech Bridge' },
            { id: 'zte-bridge', label: 'ZTE Bridge' },
            { id: 'zte-router', label: 'ZTE Router' }
        ];

        const modelosContainer = document.createElement('div');
        modelosContainer.style.cssText = 'margin-bottom: 8px; background: #f9fafb; padding: 6px; border-radius: 6px; border: 1px solid #e5e7eb;';

        modelos.forEach((modelo, index) => {
            const div = document.createElement('div');
            div.style.cssText = `
                display: flex;
                align-items: center;
                padding: 3px 6px;
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.2s ease;
                margin: 1px 0;
            `;

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'modelo-equipamento';
            radio.value = modelo.id;
            radio.id = `modelo-${modelo.id}`;
            radio.style.cssText = `
                margin-right: 6px;
                accent-color: #8b5cf6;
                cursor: pointer;
                width: 13px;
                height: 13px;
            `;
            if (index === 1) radio.checked = true;

            const label = document.createElement('label');
            label.htmlFor = `modelo-${modelo.id}`;
            label.textContent = modelo.label;
            label.style.cssText = `
                cursor: pointer;
                font-size: 10px;
                color: #1f2937;
                flex: 1;
                font-weight: 500;
                user-select: none;
            `;

            div.appendChild(radio);
            div.appendChild(label);
            modelosContainer.appendChild(div);

            radio.addEventListener('change', function() {
                if (this.checked) atualizarPreviewConfig();
            });
        });

        janela.appendChild(modelosContainer);

        const opcoesLabel = document.createElement('div');
        opcoesLabel.style.cssText = `
            font-weight: 700;
            color: #4b5563;
            margin: 6px 0 4px 0;
            font-size: 10px;
            text-transform: uppercase;
        `;
        opcoesLabel.textContent = '📋 Opções';
        janela.appendChild(opcoesLabel);

        const opcoesContainer = document.createElement('div');
        opcoesContainer.style.cssText = 'margin-bottom: 8px; background: #f9fafb; padding: 6px; border-radius: 6px; border: 1px solid #e5e7eb;';

        const opcoes = [
            { id: 'osir-wifi-pro-check', label: '📶 WiFi Pro', checked: wifiProAtivo },
            { id: 'osir-autentica-zte-check', label: '🔐 ZTE', checked: false },
            { id: 'osir-autentica-rb-check', label: '🔄 RB', checked: false },
            { id: 'osir-omada-check', label: '📶 OMADA', checked: false }
        ];

        opcoes.forEach((opcao) => {
            const div = document.createElement('div');
            div.style.cssText = `
                display: flex;
                align-items: center;
                padding: 3px 6px;
                border-radius: 4px;
                transition: all 0.2s ease;
                margin: 1px 0;
            `;

            const check = document.createElement('input');
            check.type = 'checkbox';
            check.id = opcao.id;
            check.checked = opcao.checked;
            check.style.cssText = `
                margin-right: 6px;
                accent-color: #8b5cf6;
                cursor: pointer;
                width: 13px;
                height: 13px;
            `;

            const label = document.createElement('label');
            label.htmlFor = opcao.id;
            label.textContent = opcao.label;
            label.style.cssText = `
                cursor: pointer;
                font-size: 10px;
                color: #1f2937;
                font-weight: 500;
                user-select: none;
            `;

            div.appendChild(check);
            div.appendChild(label);
            opcoesContainer.appendChild(div);

            check.addEventListener('change', function() {
                if (opcao.id === 'osir-wifi-pro-check') {
                    salvarEstadoWifiPro(this.checked);
                }
                atualizarPreviewConfig();
            });
        });

        janela.appendChild(opcoesContainer);

        const previewLabel = document.createElement('div');
        previewLabel.style.cssText = `
            font-weight: 700;
            color: #4b5563;
            margin: 6px 0 4px 0;
            font-size: 10px;
            text-transform: uppercase;
        `;
        previewLabel.textContent = '📝 Preview';
        janela.appendChild(previewLabel);

        const previewBox = document.createElement('div');
        previewBox.id = 'osir-preview-complement';
        previewBox.style.cssText = `
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            padding: 8px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            color: #1f2937;
            min-height: 30px;
            word-break: break-all;
            max-height: 60px;
            overflow-y: auto;
            margin-bottom: 10px;
            border: 1px solid #d1d5db;
            font-weight: 500;
        `;
        previewBox.textContent = 'Selecione um modelo...';
        janela.appendChild(previewBox);

        const botoesContainer = document.createElement('div');
        botoesContainer.style.cssText = 'display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;';

        const botoes = [
            { id: 'btn-atualizar', label: '🔄', cor: '#8b5cf6', acao: atualizarComplemento },
            { id: 'btn-buscar', label: '📥', cor: '#3b82f6', acao: buscarDados },
            { id: 'btn-auto', label: '⚡', cor: '#dc2626', acao: gerarAutomatico },
            { id: 'btn-limpar', label: '❌', cor: '#6b7280', acao: limparComplemento }
        ];

        botoes.forEach((btn) => {
            const button = document.createElement('button');
            button.textContent = btn.label;
            button.style.cssText = `
                flex: 1;
                padding: 4px 6px;
                background: linear-gradient(135deg, ${btn.cor} 0%, ${btn.cor}cc 100%);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 700;
                font-size: 11px;
                transition: all 0.2s ease;
                min-width: 30px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.1);
            `;
            button.onclick = btn.acao;
            botoesContainer.appendChild(button);
        });

        janela.appendChild(botoesContainer);

        const atalhosLabel = document.createElement('div');
        atalhosLabel.style.cssText = `
            font-weight: 700;
            color: #4b5563;
            margin: 4px 0 4px 0;
            font-size: 9px;
            text-transform: uppercase;
        `;
        atalhosLabel.textContent = '⚡ Atalhos:';
        janela.appendChild(atalhosLabel);

        const atalhosContainer = document.createElement('div');
        atalhosContainer.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';

        const atalhos = [
            { label: 'WiFi', acao: () => {
                const check = document.getElementById('osir-wifi-pro-check');
                if (check) { check.checked = !check.checked; salvarEstadoWifiPro(check.checked); atualizarPreviewConfig(); }
            }},
            { label: 'ZTE', acao: () => {
                const check = document.getElementById('osir-autentica-zte-check');
                if (check) { check.checked = !check.checked; atualizarPreviewConfig(); }
            }},
            { label: 'RB', acao: () => {
                const check = document.getElementById('osir-autentica-rb-check');
                if (check) { check.checked = !check.checked; atualizarPreviewConfig(); }
            }},
            { label: 'OMADA', acao: () => {
                const check = document.getElementById('osir-omada-check');
                if (check) { check.checked = !check.checked; atualizarPreviewConfig(); }
            }}
        ];

        atalhos.forEach(atalho => {
            const btn = document.createElement('button');
            btn.textContent = atalho.label;
            btn.style.cssText = `
                padding: 3px 8px;
                background: #e5e7eb;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                cursor: pointer;
                font-size: 9px;
                color: #374151;
                transition: all 0.2s ease;
                font-weight: 600;
            `;
            btn.onclick = atalho.acao;
            atalhosContainer.appendChild(btn);
        });

        janela.appendChild(atalhosContainer);

        menuContainer.parentNode.insertBefore(janela, menuContainer.nextSibling);
        setTimeout(atualizarPreviewConfig, 100);
    }

    // =========================================================================
    // JANELA FLUTUANTE DE CONTRATO SALVO - VERSÃO COMPACTA
    // =========================================================================
    function exibirJanelaContratoSalvo(contratoId, data) {
        if (document.getElementById('osir-alerta-salvo')) return;

        const dataFormatada = data.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const alerta = document.createElement('div');
        alerta.id = 'osir-alerta-salvo';
        alerta.style.cssText = `
            position: fixed;
            bottom: 75px;
            right: 15px;
            width: 320px;
            background: #ffffff;
            border: 2px solid #10b981;
            border-radius: 10px;
            box-shadow: 0 8px 32px rgba(16, 185, 129, 0.25);
            z-index: 99999;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            overflow: hidden;
            animation: osirFadeIn 0.4s ease;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            padding: 8px 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <span style="color: white; font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 14px;">✅</span>
                CONTRATO SALVO
            </span>
            <button onclick="this.closest('#osir-alerta-salvo').remove()" style="
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 700;
                font-size: 13px;
            ">✕</button>
        `;
        alerta.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = `
            padding: 12px 14px 14px 14px;
        `;
        body.innerHTML = `
            <div style="font-size: 12px; color: #1f2937; font-weight: 600;">
                Contrato #${contratoId} salvo com sucesso!
            </div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 10px;">
                📅 ${dataFormatada}
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button onclick="this.closest('#osir-alerta-salvo').remove()" style="
                    padding: 4px 16px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 700;
                    font-size: 11px;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 6px rgba(16,185,129,0.25);
                " onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">
                    OK
                </button>
            </div>
        `;
        alerta.appendChild(body);

        if (!document.getElementById('osir-animation-style')) {
            const style = document.createElement('style');
            style.id = 'osir-animation-style';
            style.textContent = `
                @keyframes osirFadeIn {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(alerta);

        // Auto-fechar após 5 minutos
        setTimeout(() => {
            const el = document.getElementById('osir-alerta-salvo');
            if (el) {
                el.style.opacity = '0';
                el.style.transform = 'translateY(20px)';
                setTimeout(() => el.remove(), 400);
            }
        }, 300000);
    }

    // =========================================================================
    // INJEÇÃO DO BOTÃO NA FILA DE PROVISIONAMENTO
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
            if (!referencia) return;

            const btnPreparar = document.createElement('a');
            btnPreparar.id = 'btn-copiar-osir-nativo';
            btnPreparar.type = 'button';
            btnPreparar.textContent = '📥 Preparar Dados';
            btnPreparar.title = 'Preparar dados da fila para o contrato';
            btnPreparar.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 4px 10px;
                background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
                color: #ffffff;
                border: 1px solid #7c3aed;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 700;
                font-size: 10px;
                margin: 0 3px;
                text-decoration: none;
                text-align: center;
                vertical-align: middle;
                transition: all 0.3s ease;
                line-height: 1.4;
                height: 24px;
                min-width: 60px;
                box-shadow: 0 2px 6px rgba(139,92,246,0.25);
            `;
            btnPreparar.onmouseover = () => {
                btnPreparar.style.background = 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)';
                btnPreparar.style.transform = 'translateY(-1px)';
                btnPreparar.style.boxShadow = '0 4px 10px rgba(139,92,246,0.35)';
            };
            btnPreparar.onmouseout = () => {
                btnPreparar.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                btnPreparar.style.transform = 'translateY(0)';
                btnPreparar.style.boxShadow = '0 2px 6px rgba(139,92,246,0.25)';
            };

            btnPreparar.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                try {
                    const dados = capturarDadosDoProvisionamento();
                    dados.wifiPro = wifiProAtivo;

                    const stringSecreta = montarStringOSIRDATA(dados);

                    navigator.clipboard.writeText(stringSecreta).then(() => {
                        btnPreparar.textContent = '✅ OK';
                        btnPreparar.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                        btnPreparar.style.boxShadow = '0 2px 6px rgba(16,185,129,0.25)';

                        setTimeout(() => {
                            btnPreparar.textContent = '📥 Preparar Dados';
                            btnPreparar.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                            btnPreparar.style.boxShadow = '0 2px 6px rgba(139,92,246,0.25)';
                        }, 2000);
                    });
                } catch (err) {
                    console.error('Erro na captura:', err);
                }
            });

            referencia.parentNode.replaceChild(btnPreparar, referencia);
        }

        setInterval(injetarBotaoDinamico, 800);
        setTimeout(injetarBotaoDinamico, 100);
        setTimeout(injetarBotaoDinamico, 3000);
    }

    // =========================================================================
    // PÁGINA DO CONTRATO
    // =========================================================================
    if (window.location.href.includes(URL_CONTRATO_VOALLE) ||
        window.location.href.includes(URL_OPERACAO)) {

        setTimeout(verificarDadosEMostrarJanela, 2000);
        setTimeout(verificarDadosEMostrarJanela, 4000);

        // INJEÇÃO DA JANELA DA ESQUERDA
        let tentativasJanelaEsquerda = 0;
        const maxTentativasJanelaEsquerda = 15;
        const intervaloInjecaoJanelaEsquerda = setInterval(() => {
            tentativasJanelaEsquerda++;

            const menuContainer = document.querySelector('.panel-content .contract-menu');
            if (menuContainer && !document.getElementById('osir-config-complement-window')) {
                criarJanelaConfiguracaoComplemento();
                clearInterval(intervaloInjecaoJanelaEsquerda);
            }

            if (tentativasJanelaEsquerda >= maxTentativasJanelaEsquerda) {
                clearInterval(intervaloInjecaoJanelaEsquerda);
            }
        }, 1000);

        // =========================================================================
        // DETECÇÃO DE SALVAMENTO E EXIBIÇÃO DA JANELA FLUTUANTE
        // =========================================================================
        function obterIdContratoAtual() {
            const menu = document.querySelector('.contract-menu');
            if (menu) {
                const id = menu.getAttribute('data-contractid');
                if (id) return id;
            }

            const titulo = document.querySelector('.pagetitle h1');
            if (titulo) {
                const match = titulo.textContent.match(/Contrato\s*(\d+)/i);
                if (match) return match[1];
            }

            const urlMatch = window.location.href.match(/contract[\/_]?(\d+)/i);
            if (urlMatch) return urlMatch[1];

            return null;
        }

        function marcarContratoComoSalvo() {
            const contratoId = obterIdContratoAtual();
            if (!contratoId) return;

            const dados = {
                salvoEm: new Date().toISOString(),
                status: 'SALVO'
            };

            try {
                localStorage.setItem(`osir_contrato_salvo_${contratoId}`, JSON.stringify(dados));
                exibirJanelaContratoSalvo(contratoId, new Date());
            } catch (e) {}
        }

        function iniciarMonitoramentoSalvamento() {
            const observer = new MutationObserver(() => {
                const growler = document.getElementById('neo-growler');
                if (growler) {
                    const isVisible = growler.dataset.visible === '1';
                    const hasContent = growler.querySelector('#neo-growler-content .growl-box');

                    if (isVisible && hasContent) {
                        const mensagem = hasContent.textContent || '';
                        if (mensagem.includes('salvo') || mensagem.includes('sucesso') || mensagem.includes('atualizado')) {
                            marcarContratoComoSalvo();
                        }
                    }
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-visible', 'style']
            });
        }

        // Iniciar monitoramento
        setTimeout(iniciarMonitoramentoSalvamento, 2000);

        // Verificar marcação pendente ao carregar a página
        setTimeout(() => {
            const contratoId = obterIdContratoAtual();
            if (contratoId) {
                try {
                    const dadosStr = localStorage.getItem(`osir_contrato_salvo_${contratoId}`);
                    if (dadosStr) {
                        const dados = JSON.parse(dadosStr);
                        const dataSalvo = new Date(dados.salvoEm);
                        const agora = new Date();
                        const diffHoras = (agora - dataSalvo) / (1000 * 60 * 60);

                        if (diffHoras < 24 && !document.getElementById('osir-alerta-salvo')) {
                            exibirJanelaContratoSalvo(contratoId, dataSalvo);
                        }
                    }
                } catch (e) {}
            }
        }, 3000);
    }

    console.log('🚀 Osir Assistente v5.0.5 - VERSÃO COMPACTA carregado!');
    console.log('📐 Todas as janelas com dimensões reduzidas');

})();
