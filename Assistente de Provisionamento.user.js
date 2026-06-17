// ==UserScript==
// @name         Osir - Assistente de Provisionamento
// @namespace    http://tampermonkey.net/
// @version      1.2.9
// @description  CORRIGIDO: Força Bridge -> 8092 e Router -> 80
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
        larguraPadrao: 420,
        alturaMin: 300,
        alturaMax: 800,
        alturaPadrao: 550,
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
    // CÁLCULO VLAN (TRATA ESPAÇOS)
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
    // FUNÇÃO PARA DEFINIR A PORTA WEB (REGRRA ABSOLUTA: b=8092, r=80)
    // =========================================================================
    function definirPortaWeb(tipoProvisionamento) {
        const tipo = (tipoProvisionamento || "").toLowerCase().trim();

        // ✅ REGRA ABSOLUTA
        if (tipo === "b") {
            console.log('🔵 [PORTA WEB] Bridge detectado → 8092');
            return "8092";
        }
        if (tipo === "r") {
            console.log('🔴 [PORTA WEB] Router detectado → 80');
            return "80";
        }

        console.log('⚠️ [PORTA WEB] Tipo não identificado → 80 (padrão)');
        return "80";
    }

    // =========================================================================
    // FUNÇÃO PRINCIPAL: CAPTURAR DADOS DO FORMULÁRIO
    // =========================================================================
    function capturarDadosDoFormulario() {
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
            telefonia: { temTelefonia: false, numero: '', senha: '', ip: '' }
        };

        const isAtendimento = window.location.href.includes(URL_ATENDIMENTO);

        // =============================================================
        // 1. CAPTURA CONTRATO
        // =============================================================
        if (isAtendimento) {
            const tituloModal = document.querySelector('.modal-title');
            if (tituloModal) {
                const match = tituloModal.innerText.match(/(\d+)/);
                if (match) dados.contrato = match[1].trim();
            }
        }
        if (dados.contrato === "") {
            dados.contrato = extrairContratoDaURL() || "";
        }

        // =============================================================
        // 2. CAPTURA SERIAL
        // =============================================================
        if (isAtendimento) {
            const el = document.getElementById('serialEquipamentoSynsuite');
            if (el && el.value) dados.serial = el.value.trim().toUpperCase();
        }
        if (dados.serial === "XX") {
            const el = document.getElementById('AuthenticationContractEquipmentSerialNumber');
            if (el && el.value) dados.serial = el.value.trim().toUpperCase();
        }
        if (dados.serial === "XX") {
            document.querySelectorAll('input').forEach(inp => {
                if ((inp.id || "").toLowerCase().includes('serial') && inp.value) {
                    dados.serial = inp.value.trim().toUpperCase();
                }
            });
        }

        // =============================================================
        // 3. SSID E SENHA
        // =============================================================
        if (isAtendimento) {
            const el = document.getElementById('ssid');
            if (el && el.value) dados.ssid = el.value.trim();
            const el2 = document.getElementById('senhaSSID');
            if (el2 && el2.value) dados.senha = el2.value.trim();
        }
        if (dados.ssid === "XX") {
            const el = document.getElementById('AuthenticationContractWifiName');
            if (el && el.value) dados.ssid = el.value.trim();
        }
        if (dados.senha === "XX") {
            const el = document.getElementById('AuthenticationContractWifiPassword');
            if (el && el.value) dados.senha = el.value.trim();
        }

        // =============================================================
        // 4. TIPO PROVISIONAMENTO (b/r)
        // =============================================================
        const inputTipo = document.getElementById('tipoProvisionamento');
        if (inputTipo && inputTipo.value) {
            dados.tipoProvisionamento = inputTipo.value.toLowerCase().trim();
        }

        // =============================================================
        // 5. OLT, SPLITTER, SLOT, PORTA, ID
        // =============================================================
        const inputOlt = document.getElementById('olt');
        if (inputOlt && inputOlt.value) dados.olt = inputOlt.value.trim();

        const inputSplitter = document.getElementById('AuthenticationSplitterPortTitle');
        if (inputSplitter && inputSplitter.value) dados.splitter = inputSplitter.value.trim();
        const inputPortaSplitter = document.getElementById('AuthenticationSplitterPortPort');
        if (inputPortaSplitter && inputPortaSplitter.value) dados.portaSplitter = inputPortaSplitter.value.trim();

        if (isAtendimento) {
            const el = document.getElementById('slotOLT');
            if (el && el.value) dados.slot = parseInt(el.value.trim(), 10).toString();
            const el2 = document.getElementById('portaOLT');
            if (el2 && el2.value) dados.porta = parseInt(el2.value.trim(), 10).toString();
            const el3 = document.getElementById('idOnuOlt');
            if (el3 && el3.value) {
                const id = parseInt(el3.value.trim(), 10);
                if (!isNaN(id)) dados.id = id.toString();
            }
        }
        if (dados.slot === "XX") {
            const el = document.getElementById('AuthenticationContractSlotOlt');
            if (el && el.value) dados.slot = parseInt(el.value.trim(), 10).toString();
        }
        if (dados.porta === "XX") {
            const el = document.getElementById('AuthenticationContractPortOlt');
            if (el && el.value) dados.porta = parseInt(el.value.trim(), 10).toString();
        }
        if (dados.id === "XX") {
            const el = document.getElementById('AuthenticationContractOltId');
            if (el && el.value) {
                const id = parseInt(el.value.trim(), 10);
                if (!isNaN(id)) dados.id = id.toString();
            }
        }

        // =============================================================
        // 6. PONTO DE ACESSO E TELEFONIA
        // =============================================================
        const inputPontoAcesso = document.getElementById('AuthenticationAccessPointTitle');
        if (inputPontoAcesso && inputPontoAcesso.value) dados.pontoAcesso = inputPontoAcesso.value.trim();

        dados.telefonia = capturarDadosTelefonia();

        // =============================================================
        // 7. CALCULA VLAN E PORTA WEB
        // =============================================================
        dados.vlan = calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);
        dados.portaWeb = definirPortaWeb(dados.tipoProvisionamento);

        return dados;
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
            return "Bridge";
        }
        // Fallback
        if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) return "Huawei Router";
        if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) return "ZTE Router";
        if (serialUpper.startsWith("RCMG")) return "Raisecom Router";
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
    // CAPTURAR DADOS DE TELEFONIA
    // =========================================================================
    function capturarDadosTelefonia() {
        const dados = { temTelefonia: false, numero: '', senha: '', ip: '', dadosCompletos: false };
        const inputNumero = document.getElementById('numeroTelefone01');
        if (inputNumero && inputNumero.value && inputNumero.value.trim() !== '') {
            dados.temTelefonia = true;
            dados.numero = inputNumero.value.trim();
        }
        const inputSenha = document.getElementById('senhaTelefone');
        if (inputSenha && inputSenha.value && inputSenha.value.trim() !== '') {
            dados.senha = inputSenha.value.trim();
        }
        const inputIp = document.getElementById('ipGerencia');
        if (inputIp && inputIp.value && inputIp.value.trim() !== '') {
            dados.ip = inputIp.value.trim();
        }
        if (dados.temTelefonia && dados.numero && dados.senha) {
            dados.dadosCompletos = true;
        }
        return dados;
    }

    // =========================================================================
    // MONTAR COMPLEMENTO
    // =========================================================================
    function montarComplemento(dados, tipoEquip, vlanFinal) {
        let partes = [];
        let equipamento = tipoEquip;
        if (dados.telefonia && dados.telefonia.temTelefonia) equipamento += " + Telefonia";
        partes.push(equipamento);
        partes.push(`SN: ${dados.serial}`);
        if (precisaAutenticacao(dados.tipoProvisionamento, dados.serial)) {
            partes.push("Autentica na ZTE");
        }
        if (dados.splitter && dados.splitter !== "XX" && dados.portaSplitter && dados.portaSplitter !== "XX") {
            partes.push(`${dados.splitter} - Porta: ${dados.portaSplitter}`);
        }
        partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${dados.porta} ID: ${dados.id}`);
        if (dados.ssid !== "XX" && dados.senha !== "XX") {
            partes.push(`SSID: ${dados.ssid} - Senha: ${dados.senha}`);
        }
        if (dados.telefonia && dados.telefonia.temTelefonia) {
            let telefoniaPart = `N° ${dados.telefonia.numero}`;
            if (dados.telefonia.senha) telefoniaPart += ` - Senha da Telefonia: ${dados.telefonia.senha}`;
            if (dados.telefonia.ip && dados.telefonia.ip.trim() !== '') telefoniaPart += ` - IP de Telefonia: ${dados.telefonia.ip}`;
            partes.push(telefoniaPart);
        }
        return partes.join(" || ");
    }

    // =========================================================================
    // EXTRAIR CONTRATO DA URL
    // =========================================================================
    function extrairContratoDaURL() {
        const url = window.location.href;
        const match = url.match(/contract_panel\/(\d+)/);
        if (match && match[1]) return match[1].trim();
        const textoPagina = document.body.innerText;
        const matchTexto = textoPagina.match(/Contrato\s*[#:]\s*(\d+)/i);
        if (matchTexto && matchTexto[1]) return matchTexto[1].trim();
        return null;
    }

    // =========================================================================
    // MONTAR STRING OSIRDATA
    // =========================================================================
    function montarStringOSIRDATA(dados) {
        const telefoniaStr = dados.telefonia && dados.telefonia.temTelefonia
            ? `${dados.telefonia.numero}||${dados.telefonia.senha}||${dados.telefonia.ip || ''}`
            : '||||';
        return `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contrato}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}||${dados.tipoProvisionamento}||${telefoniaStr}||${dados.portaWeb}`;
    }

    // =========================================================================
    // PREENCHER FORMULÁRIO
    // =========================================================================
    function preencherFormulario(dados) {
        const inputSerial = document.getElementById('AuthenticationContractEquipmentSerialNumber');
        if (inputSerial && dados.serial && dados.serial !== "XX") {
            inputSerial.value = dados.serial;
            inputSerial.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const inputSplitter = document.getElementById('AuthenticationSplitterPortTitle');
        if (inputSplitter && dados.splitter && dados.splitter !== "XX") {
            inputSplitter.value = dados.splitter;
            inputSplitter.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const inputPortaSplitter = document.getElementById('AuthenticationSplitterPortPort');
        if (inputPortaSplitter && dados.portaSplitter && dados.portaSplitter !== "XX") {
            inputPortaSplitter.value = dados.portaSplitter;
            inputPortaSplitter.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const inputSlot = document.getElementById('AuthenticationContractSlotOlt');
        if (inputSlot && dados.slot && dados.slot !== "XX") {
            inputSlot.value = dados.slot;
            inputSlot.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const inputPorta = document.getElementById('AuthenticationContractPortOlt');
        if (inputPorta && dados.porta && dados.porta !== "XX") {
            inputPorta.value = dados.porta;
            inputPorta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const inputIdOnu = document.getElementById('AuthenticationContractOltId');
        if (inputIdOnu && dados.id !== undefined && dados.id !== null && dados.id !== '' && dados.id !== "XX") {
            inputIdOnu.value = dados.id;
            inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (inputIdOnu) {
            inputIdOnu.value = '';
            inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const inputSsid = document.getElementById('AuthenticationContractWifiName');
        if (inputSsid && dados.ssid && dados.ssid !== "XX") {
            inputSsid.value = dados.ssid;
            inputSsid.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const inputSenha = document.getElementById('AuthenticationContractWifiPassword');
        if (inputSenha && dados.senha && dados.senha !== "XX") {
            inputSenha.value = dados.senha;
            inputSenha.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const inputVlan = document.getElementById('AuthenticationContractVlan');
        if (inputVlan && dados.vlan && dados.vlan !== "XX") {
            inputVlan.value = dados.vlan;
            inputVlan.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // ✅ CORREÇÃO CRÍTICA: SEMPRE FORÇA A PORTA WEB PELO TIPO
        const inputPortaWeb = document.getElementById('AuthenticationContractEquipmentPort');
        if (inputPortaWeb && dados.portaWeb) {
            inputPortaWeb.value = dados.portaWeb;
            inputPortaWeb.dispatchEvent(new Event('input', { bubbles: true }));
            inputPortaWeb.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`✅ [PORTA WEB] Campo preenchido com: ${dados.portaWeb}`);
        }
        const inputTipo = document.getElementById('tipoProvisionamento');
        if (inputTipo && dados.tipoProvisionamento) {
            inputTipo.value = dados.tipoProvisionamento;
            inputTipo.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // =========================================================================
    // JANELA FLUTUANTE
    // =========================================================================
    function criarJanelaFlutuante(dados, contratoAtual) {
        const contratoParaExibir = dados.contrato && dados.contrato !== "Nenhum" ? dados.contrato : (contratoAtual || "???");
        const janelaExistente = document.getElementById('osir-floating-window');
        if (janelaExistente) janelaExistente.remove();

        const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
        const complementoPreview = montarComplemento(dados, tipoEquip, dados.vlan);

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

        const badge = document.createElement('div');
        badge.style.cssText = `
            background: #d1fae5;
            color: #065f46;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: ${Math.round(estadoJanela.fonte * 0.9)}px;
            font-weight: 600;
            margin-bottom: 12px;
            text-align: center;
        `;
        let badgeTexto = '✅ Dados válidos';
        if (dados.telefonia && dados.telefonia.temTelefonia) badgeTexto += ' 📞 Com Telefonia';
        badge.textContent = badgeTexto;
        janela.appendChild(badge);

        const conteudo = document.createElement('div');
        conteudo.style.cssText = `font-size: ${estadoJanela.fonte}px;`;

        const campos = [
            { label: '🔢 Contrato', valor: dados.contrato || 'Nenhum' },
            { label: '🔌 Serial', valor: dados.serial || 'XX' },
            { label: '📡 SSID', valor: dados.ssid || 'XX' },
            { label: '🔑 Senha', valor: dados.senha || 'XX' },
            { label: '🖥️ OLT', valor: dados.olt || 'N/A' },
            { label: '📊 Slot OLT', valor: dados.slot || 'XX' },
            { label: '🔌 Porta OLT', valor: dados.porta || 'XX' },
            { label: '🆔 ID ONU', valor: dados.id !== undefined && dados.id !== null ? dados.id : 'XX' },
            { label: '🌐 VLAN Calculada', valor: dados.vlan || 'XX' },
            { label: '📦 Tipo Equipamento', valor: tipoEquip },
            { label: '🔌 Porta Web', valor: dados.portaWeb || '80' }
        ];

        if (dados.telefonia && dados.telefonia.temTelefonia) {
            campos.push(
                { label: '📞 Número Telefone', valor: dados.telefonia.numero || 'N/A' },
                { label: '🔑 Senha Telefonia', valor: dados.telefonia.senha || 'N/A' }
            );
            if (dados.telefonia.ip && dados.telefonia.ip.trim() !== '') {
                campos.push({ label: '🌐 IP Telefonia', valor: dados.telefonia.ip });
            }
        }

        campos.forEach(campo => {
            const linha = document.createElement('div');
            linha.style.cssText = `
                display: flex;
                justify-content: space-between;
                padding: 4px 0;
                border-bottom: 1px solid #f3f4f6;
                font-size: ${estadoJanela.fonte}px;
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
                max-width: ${Math.round(estadoJanela.largura * 0.4)}px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: ${Math.round(estadoJanela.fonte * 0.95)}px;
            `;

            if (campo.label === '🔌 Porta Web') {
                if (campo.valor === '8092') {
                    valorStyle += ' background: #fee2e2; color: #991b1b; font-weight: bold;';
                } else if (campo.valor === '80') {
                    valorStyle += ' background: #dbeafe; color: #1e40af; font-weight: bold;';
                }
            }

            const valor = document.createElement('span');
            valor.textContent = campo.valor;
            valor.style.cssText = valorStyle;

            linha.appendChild(label);
            linha.appendChild(valor);
            conteudo.appendChild(linha);
        });

        const previewLabel = document.createElement('div');
        previewLabel.style.cssText = `
            margin-top: 12px;
            font-weight: 600;
            color: #4b5563;
            font-size: ${Math.round(estadoJanela.fonte * 0.95)}px;
        `;
        previewLabel.textContent = '📝 Complemento Gerado:';
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
                font-size: ${Math.round(estadoJanela.fonte * 0.95)}px;
            `;
            status.textContent = '✅ Dados aplicados com sucesso!';
            conteudo.appendChild(status);
        }

        // =============================================================
        // BOTÃO "COPIAR DADOS NOVAMENTE"
        // =============================================================
        const btnCopiar = document.createElement('button');
        btnCopiar.textContent = '📋 Copiar Dados Novamente';
        btnCopiar.style.cssText = `
            width: 100%;
            margin-top: 12px;
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
        btnCopiar.onmouseover = () => btnCopiar.style.background = '#7c3aed';
        btnCopiar.onmouseout = () => btnCopiar.style.background = '#8b5cf6';

        btnCopiar.onclick = () => {
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
                portaWeb: dados.portaWeb || "80",
                splitter: dados.splitter || "XX",
                portaSplitter: dados.portaSplitter || "XX",
                telefonia: dados.telefonia || { temTelefonia: false, numero: '', senha: '', ip: '' }
            };

            const stringSecreta = montarStringOSIRDATA(dadosDaCaixinha);
            navigator.clipboard.writeText(stringSecreta).then(() => {
                btnCopiar.textContent = '✅ Copiado!';
                btnCopiar.style.background = '#10b981';
                preencherFormulario(dadosDaCaixinha);
                setTimeout(() => {
                    btnCopiar.textContent = '📋 Copiar Dados Novamente';
                    btnCopiar.style.background = '#8b5cf6';
                }, 2000);
            });
        };

        conteudo.appendChild(btnCopiar);
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
    // FUNÇÃO PARA CRIAR O BOTÃO COMPLEMENTAR (CORRIGIDA)
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
            botao.textContent = '⚡ Criar/Atualizar Complementar';
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
                    // =============================================================
                    // 1. PRESERVA AS NOTAS MANUAIS
                    // =============================================================
                    const textoAtual = inputComplementar.value || "";
                    let notasInicio = [];
                    let notasFim = [];
                    let blocoTecnico = "";

                    const partes = textoAtual.split('||').map(p => p.trim()).filter(p => p !== "");

                    const termosTecnicos = [
                        "bridge", "router", "onu", "ektech", "huawei", "zte", "raisecom",
                        "sn:", "serial:", "slot olt:", "porta olt:", "id:",
                        "ssid:", "senha:", "autentica na", "vlan:",
                        "xx - porta xx", "equipamento desconhecido", "roteador mesh"
                    ];

                    partes.forEach(p => {
                        const pLower = p.toLowerCase();
                        const isTecnico = termosTecnicos.some(termo => pLower.includes(termo));

                        if (!isTecnico && notasInicio.length === 0 && !blocoTecnico) {
                            notasInicio.push(p);
                        }
                        else if (isTecnico && !blocoTecnico) {
                            blocoTecnico = p;
                        }
                        else if (!isTecnico && blocoTecnico) {
                            notasFim.push(p);
                        }
                        else if (isTecnico && blocoTecnico) {
                            blocoTecnico += " || " + p;
                        }
                        else if (!isTecnico && blocoTecnico) {
                            notasFim.push(p);
                        }
                    });

                    // =============================================================
                    // 2. CAPTURA DADOS DO FORMULÁRIO E DO CLIPBOARD
                    // =============================================================
                    let dados = capturarDadosDoFormulario();
                    let dadosClipboard = null;
                    let idCapturado = null;

                    try {
                        const texto = await navigator.clipboard.readText();
                        // ✅ LIMPA O TEXTO PARA EVITAR FALHAS
                        const textoLimpo = texto ? texto.trim() : '';

                        if (textoLimpo && textoLimpo.startsWith("OSIRDATA||")) {
                            const partesClip = textoLimpo.split("||");
                            const telefoniaParts = partesClip[12] ? partesClip[12].split('||') : [];
                            const portaWeb = partesClip[13] || '80';

                            dadosClipboard = {
                                serial: partesClip[1] || "XX",
                                ssid: partesClip[2] || "XX",
                                senha: partesClip[3] || "XX",
                                slot: partesClip[4] || "XX",
                                porta: partesClip[5] || "XX",
                                id: partesClip[6] || "XX",
                                contrato: partesClip[7] || "",
                                vlan: partesClip[8] || "XX",
                                pontoAcesso: partesClip[9] || "",
                                olt: partesClip[10] || "N/A",
                                tipoProvisionamento: partesClip[11] || "",
                                telefonia: {
                                    temTelefonia: telefoniaParts.length >= 3 && telefoniaParts[0] && telefoniaParts[0].trim() !== '',
                                    numero: telefoniaParts[0] || '',
                                    senha: telefoniaParts[1] || '',
                                    ip: telefoniaParts[2] || '',
                                    dadosCompletos: false
                                },
                                portaWeb: portaWeb,
                                splitter: "XX",
                                portaSplitter: "XX"
                            };

                            idCapturado = dadosClipboard.contrato;
                            console.log(`✅ ID capturado do clipboard: ${idCapturado}`);
                            console.log(`✅ Tipo do clipboard: ${dadosClipboard.tipoProvisionamento}`);
                        }
                    } catch (e) {
                        console.log('⚠️ Não foi possível ler o clipboard');
                    }

                    const contratoAtual = extrairContratoDaURL();

                    // ✅ PRIORIDADE MÁXIMA: DADOS DO CLIPBOARD SOBRESCREVEM O FORMULÁRIO
                    if (dadosClipboard) {
                        if (dadosClipboard.tipoProvisionamento) {
                            dados.tipoProvisionamento = dadosClipboard.tipoProvisionamento;
                            console.log(`📌 [FIX] Tipo forçado pelo clipboard: ${dados.tipoProvisionamento}`);
                        }
                        if (dadosClipboard.contrato) {
                            dados.contrato = dadosClipboard.contrato;
                        }
                        if (dadosClipboard.serial && dadosClipboard.serial !== "XX") {
                            dados.serial = dadosClipboard.serial;
                        }
                        if (dadosClipboard.slot && dadosClipboard.slot !== "XX") {
                            dados.slot = dadosClipboard.slot;
                        }
                        if (dadosClipboard.porta && dadosClipboard.porta !== "XX") {
                            dados.porta = dadosClipboard.porta;
                        }
                        if (dadosClipboard.id && dadosClipboard.id !== "XX") {
                            dados.id = dadosClipboard.id;
                        }
                        if (dadosClipboard.vlan && dadosClipboard.vlan !== "XX") {
                            dados.vlan = dadosClipboard.vlan;
                        }
                        if (dadosClipboard.pontoAcesso) {
                            dados.pontoAcesso = dadosClipboard.pontoAcesso;
                        }
                        if (dadosClipboard.olt && dadosClipboard.olt !== "N/A") {
                            dados.olt = dadosClipboard.olt;
                        }
                        if (dadosClipboard.splitter && dadosClipboard.splitter !== "XX") {
                            dados.splitter = dadosClipboard.splitter;
                        }
                        if (dadosClipboard.portaSplitter && dadosClipboard.portaSplitter !== "XX") {
                            dados.portaSplitter = dadosClipboard.portaSplitter;
                        }
                        if (dadosClipboard.ssid && dadosClipboard.ssid !== "XX") {
                            dados.ssid = dadosClipboard.ssid;
                        }
                        if (dadosClipboard.senha && dadosClipboard.senha !== "XX") {
                            dados.senha = dadosClipboard.senha;
                        }
                        if (dadosClipboard.portaWeb && dadosClipboard.portaWeb !== "80") {
                            dados.portaWeb = dadosClipboard.portaWeb;
                        }
                    }

                    // =============================================================
                    // 3. SSID E SENHA - Formulário (preferência do cliente) > Clipboard
                    // =============================================================
                    const inputWifiSsid = document.getElementById('AuthenticationContractWifiName');
                    const inputWifiPass = document.getElementById('AuthenticationContractWifiPassword');
                    const ssidAtual = inputWifiSsid?.value?.trim() || "";
                    const senhaAtual = inputWifiPass?.value?.trim() || "";

                    if (ssidAtual === "" && dados.ssid && dados.ssid !== "XX") {
                        if (inputWifiSsid) {
                            inputWifiSsid.value = dados.ssid;
                            inputWifiSsid.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    } else if (ssidAtual !== "") {
                        dados.ssid = ssidAtual;
                    }

                    if (senhaAtual === "" && dados.senha && dados.senha !== "XX") {
                        if (inputWifiPass) {
                            inputWifiPass.value = dados.senha;
                            inputWifiPass.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    } else if (senhaAtual !== "") {
                        dados.senha = senhaAtual;
                    }

                    // =============================================================
                    // 4. CALCULA VLAN E PORTA WEB (FORÇADO)
                    // =============================================================
                    const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
                    const vlanFinal = dados.vlan || calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);

                    // ✅ FORÇA A PORTA WEB PELO TIPO (REGRRA ABSOLUTA)
                    const portaWebCorreta = definirPortaWeb(dados.tipoProvisionamento);
                    dados.portaWeb = portaWebCorreta;
                    console.log(`🔧 [FIX] Porta Web final definida: ${dados.portaWeb} (Baseado em: ${dados.tipoProvisionamento})`);

                    // =============================================================
                    // 5. MONTA O COMPLEMENTO
                    // =============================================================
                    let novoBlocoTecnico = montarComplemento(dados, tipoEquip, vlanFinal);

                    let partesFinais = [];
                    if (notasInicio.length > 0) partesFinais.push(notasInicio.join(" || "));
                    partesFinais.push(novoBlocoTecnico);
                    if (notasFim.length > 0) partesFinais.push(notasFim.join(" || "));
                    const textoFinal = partesFinais.join(" || ");

                    // =============================================================
                    // 6. PREENCHE OS CAMPOS
                    // =============================================================
                    // MAC
                    const inputMac = document.getElementById('AuthenticationContractMac');
                    if (inputMac) {
                        inputMac.value = '';
                        inputMac.dispatchEvent(new Event('input', { bubbles: true }));
                        inputMac.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // VLAN
                    const inputVlan = document.getElementById('AuthenticationContractVlan');
                    if (inputVlan) {
                        inputVlan.value = vlanFinal;
                        inputVlan.dispatchEvent(new Event('input', { bubbles: true }));
                        inputVlan.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // ID ONU
                    const inputIdOnu = document.getElementById('AuthenticationContractOltId');
                    if (inputIdOnu && dados.id !== undefined && dados.id !== null && dados.id !== '' && dados.id !== "XX") {
                        inputIdOnu.value = dados.id;
                        inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
                    } else if (inputIdOnu) {
                        inputIdOnu.value = '';
                        inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    // ✅ PORTA WEB (FORÇADO)
                    const inputPortaWeb = document.getElementById('AuthenticationContractEquipmentPort');
                    if (inputPortaWeb) {
                        inputPortaWeb.value = portaWebCorreta;
                        inputPortaWeb.dispatchEvent(new Event('input', { bubbles: true }));
                        inputPortaWeb.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`✅ [CAMPO] Porta Web setada para: ${portaWebCorreta}`);
                    }

                    // Splitter
                    const inputSplitter = document.getElementById('AuthenticationSplitterPortTitle');
                    if (inputSplitter && dados.splitter && dados.splitter !== "XX") {
                        inputSplitter.value = dados.splitter;
                        inputSplitter.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    const inputPortaSplitter = document.getElementById('AuthenticationSplitterPortPort');
                    if (inputPortaSplitter && dados.portaSplitter && dados.portaSplitter !== "XX") {
                        inputPortaSplitter.value = dados.portaSplitter;
                        inputPortaSplitter.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    // Complemento
                    inputComplementar.value = textoFinal;
                    inputComplementar.dispatchEvent(new Event('input', { bubbles: true }));
                    inputComplementar.dispatchEvent(new Event('change', { bubbles: true }));

                    botao.textContent = '✅ Aplicado!';
                    botao.style.backgroundColor = '#22c55e';
                    setTimeout(() => {
                        botao.textContent = '⚡ Criar/Atualizar Complementar';
                        botao.style.backgroundColor = '#e11d48';
                    }, 2000);

                    criarJanelaFlutuante({
                        ...dados,
                        vlan: vlanFinal,
                        tipoEquipamento: tipoEquip,
                        portaWeb: portaWebCorreta,
                        aplicado: true
                    }, dados.contrato || contratoAtual);

                } catch (err) {
                    console.error('Erro ao aplicar complemento:', err);
                    alert('❌ Erro ao aplicar complemento: ' + err.message);
                }
            });

            container.appendChild(botao);
            console.log('✅ Botão "Criar/Atualizar Complementar" adicionado!');

        } catch (err) {
            console.error('Erro ao injetar botão complementar:', err);
        }
    }

    // =========================================================================
    // PARTE 1: CAPTURA NA FILA DE PROVISIONAMENTO
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

            const btnCopiar = document.createElement('a');
            btnCopiar.id = 'btn-copiar-osir-nativo';
            btnCopiar.type = 'button';
            btnCopiar.textContent = '💾 Capturar';
            btnCopiar.title = 'Capturar dados e criar complemento';
            btnCopiar.style.cssText = `
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
            btnCopiar.onmouseover = () => btnCopiar.style.backgroundColor = '#7c3aed';
            btnCopiar.onmouseout = () => btnCopiar.style.backgroundColor = '#8b5cf6';

            btnCopiar.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                try {
                    const dados = capturarDadosDoFormulario();

                    if (dados.serial === "XX") {
                        // Fallback para capturar da modal
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
                        } else {
                            dados.slot = "XX";
                        }

                        const inputPortaOLT = document.getElementById('portaOLT');
                        if (inputPortaOLT && inputPortaOLT.value && inputPortaOLT.value.trim() !== '') {
                            dados.porta = parseInt(inputPortaOLT.value.trim(), 10).toString();
                        } else {
                            dados.porta = "XX";
                        }

                        const inputIdOnuOlt = document.getElementById('idOnuOlt');
                        if (inputIdOnuOlt && inputIdOnuOlt.value !== undefined && inputIdOnuOlt.value !== null && inputIdOnuOlt.value !== '') {
                            const idValue = parseInt(inputIdOnuOlt.value.trim(), 10);
                            if (!isNaN(idValue)) {
                                dados.id = idValue.toString();
                            }
                        } else {
                            dados.id = "XX";
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
                            if (id.includes('splitter') && id.includes('title') && inp.value) {
                                dados.splitter = inp.value.trim();
                            }
                            if (id.includes('splitter') && id.includes('port') && inp.value) {
                                dados.portaSplitter = inp.value.trim();
                            }
                        }
                    }

                    dados.vlan = calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);
                    dados.portaWeb = definirPortaWeb(dados.tipoProvisionamento);

                    const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
                    const complementoTexto = montarComplemento(dados, tipoEquip, dados.vlan);

                    const telefoniaStr = dados.telefonia.temTelefonia
                        ? `${dados.telefonia.numero}||${dados.telefonia.senha}||${dados.telefonia.ip || ''}`
                        : '||||';

                    const contratoParaClipboard = dados.contrato || "Nenhum";
                    const stringSecreta = `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${contratoParaClipboard}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}||${dados.tipoProvisionamento}||${telefoniaStr}||${dados.portaWeb}`;

                    navigator.clipboard.writeText(stringSecreta).then(() => {
                        const statusTelefonia = dados.telefonia.temTelefonia ? '📞' : '';
                        btnCopiar.textContent = `✅ ${statusTelefonia}`;
                        btnCopiar.style.backgroundColor = '#10b981';

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
                            <div style="font-weight: bold; margin-bottom: 3px;">✅ Dados capturados!</div>
                            <div style="font-size: 10px; opacity: 0.8;">Contrato: ${contratoParaClipboard}</div>
                        `;
                        document.body.appendChild(notificacao);

                        setTimeout(() => {
                            notificacao.remove();
                            btnCopiar.textContent = '💾 Capturar';
                            btnCopiar.style.backgroundColor = '#8b5cf6';
                        }, 3500);
                    });
                } catch (err) {
                    console.error('Erro na captura:', err);
                }
            });

            referencia.parentNode.replaceChild(btnCopiar, referencia);
            console.log('✅ Botão "Chamado" substituído pelo "Capturar"!');
        }

        setInterval(injetarBotaoDinamico, 800);
        setTimeout(injetarBotaoDinamico, 100);
        setTimeout(injetarBotaoDinamico, 3000);
    }

    // =========================================================================
    // PARTE 2: INSERÇÃO NO ERP
    // =========================================================================
    if (window.location.href.includes(URL_CONTRATO_VOALLE) ||
        window.location.href.includes(URL_OPERACAO)) {

        const contratoAtual = extrairContratoDaURL();

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

        // Verifica dados no clipboard ao carregar
        async function verificarDadosNoClipboard() {
            try {
                const texto = await navigator.clipboard.readText();
                if (texto && texto.trim().startsWith("OSIRDATA||")) {
                    const partes = texto.trim().split("||");
                    const telefoniaParts = partes[12] ? partes[12].split('||') : [];
                    const portaWeb = partes[13] || '80';

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
                        tipoProvisionamento: partes[11] || "",
                        telefonia: {
                            temTelefonia: telefoniaParts.length >= 3 && telefoniaParts[0] && telefoniaParts[0].trim() !== '',
                            numero: telefoniaParts[0] || '',
                            senha: telefoniaParts[1] || '',
                            ip: telefoniaParts[2] || '',
                            dadosCompletos: false
                        },
                        portaWeb: portaWeb
                    };

                    if (dados.telefonia.temTelefonia && dados.telefonia.numero && dados.telefonia.senha) {
                        dados.telefonia.dadosCompletos = true;
                    }

                    if (contratoAtual) {
                        criarJanelaFlutuante(dados, contratoAtual);
                    }
                }
            } catch (err) {
                console.log('Nenhum dado no clipboard');
            }
        }

        setTimeout(verificarDadosNoClipboard, 2000);
    }

})();
