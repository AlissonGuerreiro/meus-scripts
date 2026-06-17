// ==UserScript==
// @name         Osir - Assistente de Provisionamento
// @namespace    http://tampermonkey.net/
// @version      1.2.6
// @description  CORRIGIDO: Removido botão Capturar (Clipboard) que bugava o site
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
            console.log('⚠️ Slot ou Porta vazios → VLAN: XX');
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
    // FUNÇÃO PARA DEFINIR A PORTA WEB (b=8092, r=80)
    // =========================================================================
    function definirPortaWeb(tipoProvisionamento) {
        const tipo = (tipoProvisionamento || "").toLowerCase().trim();

        if (tipo === "b") {
            console.log('🔵 Bridge detectado → Porta Web: 8092');
            return "8092";
        }
        if (tipo === "r") {
            console.log('🔴 Router detectado → Porta Web: 80');
            return "80";
        }

        console.log('⚠️ Tipo não identificado → Porta Web: 80 (padrão)');
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

        // =============================================================
        // 1. CAPTURA SERIAL
        // =============================================================
        const inputSerial = document.getElementById('AuthenticationContractEquipmentSerialNumber');
        if (inputSerial && inputSerial.value) {
            dados.serial = inputSerial.value.trim().toUpperCase();
            console.log(`✅ Serial: ${dados.serial}`);
        }

        // =============================================================
        // 2. CAPTURA SPLITTER
        // =============================================================
        const inputSplitter = document.getElementById('AuthenticationSplitterPortTitle');
        if (inputSplitter && inputSplitter.value) {
            dados.splitter = inputSplitter.value.trim();
            console.log(`✅ Splitter: ${dados.splitter}`);
        }

        // =============================================================
        // 3. CAPTURA PORTA DO SPLITTER
        // =============================================================
        const inputPortaSplitter = document.getElementById('AuthenticationSplitterPortPort');
        if (inputPortaSplitter && inputPortaSplitter.value) {
            dados.portaSplitter = inputPortaSplitter.value.trim();
            console.log(`✅ Porta Splitter: ${dados.portaSplitter}`);
        }

        // =============================================================
        // 4. CAPTURA SLOT OLT
        // =============================================================
        const inputSlot = document.getElementById('AuthenticationContractSlotOlt');
        if (inputSlot && inputSlot.value && inputSlot.value.trim() !== '') {
            dados.slot = parseInt(inputSlot.value.trim(), 10).toString();
            console.log(`✅ Slot OLT: ${dados.slot}`);
        } else {
            dados.slot = "XX";
            console.log('⚠️ Slot OLT vazio → usando "XX"');
        }

        // =============================================================
        // 5. CAPTURA PORTA OLT
        // =============================================================
        const inputPorta = document.getElementById('AuthenticationContractPortOlt');
        if (inputPorta && inputPorta.value && inputPorta.value.trim() !== '') {
            dados.porta = parseInt(inputPorta.value.trim(), 10).toString();
            console.log(`✅ Porta OLT: ${dados.porta}`);
        } else {
            dados.porta = "XX";
            console.log('⚠️ Porta OLT vazia → usando "XX"');
        }

        // =============================================================
        // 6. CAPTURA ID ONU
        // =============================================================
        const inputIdOnu = document.getElementById('AuthenticationContractOltId');
        if (inputIdOnu && inputIdOnu.value !== undefined && inputIdOnu.value !== null && inputIdOnu.value !== '') {
            const idValue = parseInt(inputIdOnu.value.trim(), 10);
            if (!isNaN(idValue)) {
                dados.id = idValue.toString();
                console.log(`✅ ID ONU: ${dados.id}`);
            }
        } else {
            dados.id = "XX";
            console.log('⚠️ ID ONU vazio → usando "XX"');
        }

        // =============================================================
        // 7. CAPTURA SSID (DO FORMULÁRIO)
        // =============================================================
        const inputSsid = document.getElementById('AuthenticationContractWifiName');
        if (inputSsid && inputSsid.value) {
            dados.ssid = inputSsid.value.trim();
            console.log(`✅ SSID do formulário: ${dados.ssid}`);
        } else {
            dados.ssid = "XX";
            console.log('⚠️ SSID vazio');
        }

        // =============================================================
        // 8. CAPTURA SENHA WIFI (DO FORMULÁRIO)
        // =============================================================
        const inputSenha = document.getElementById('AuthenticationContractWifiPassword');
        if (inputSenha && inputSenha.value) {
            dados.senha = inputSenha.value.trim();
            console.log(`✅ Senha do formulário: ${dados.senha}`);
        } else {
            dados.senha = "XX";
            console.log('⚠️ Senha vazia');
        }

        // =============================================================
        // 9. CAPTURA TIPO PROVISIONAMENTO (b/r)
        // =============================================================
        const inputTipo = document.getElementById('tipoProvisionamento');
        if (inputTipo && inputTipo.value) {
            dados.tipoProvisionamento = inputTipo.value.toLowerCase().trim();
            console.log(`✅ Tipo Provisionamento: ${dados.tipoProvisionamento}`);
        } else {
            console.log('⚠️ Tipo Provisionamento não encontrado');
        }

        // =============================================================
        // 10. CAPTURA CONTRATO DA URL (FALLBACK)
        // =============================================================
        dados.contrato = extrairContratoDaURL() || "";
        console.log(`✅ Contrato (fallback): ${dados.contrato}`);

        // =============================================================
        // 11. CAPTURA PONTO DE ACESSO
        // =============================================================
        const inputPontoAcesso = document.getElementById('AuthenticationAccessPointTitle');
        if (inputPontoAcesso && inputPontoAcesso.value) {
            dados.pontoAcesso = inputPontoAcesso.value.trim();
            console.log(`✅ Ponto Acesso: ${dados.pontoAcesso}`);
        }

        // =============================================================
        // 12. CAPTURA OLT
        // =============================================================
        const inputOlt = document.getElementById('olt');
        if (inputOlt && inputOlt.value) {
            dados.olt = inputOlt.value.trim();
            console.log(`✅ OLT: ${dados.olt}`);
        }

        // =============================================================
        // 13. CAPTURA TELEFONIA
        // =============================================================
        dados.telefonia = capturarDadosTelefonia();

        // =============================================================
        // 14. CALCULA VLAN
        // =============================================================
        dados.vlan = calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);
        console.log(`✅ VLAN: ${dados.vlan}`);

        // =============================================================
        // 15. DEFINE PORTA WEB
        // =============================================================
        dados.portaWeb = definirPortaWeb(dados.tipoProvisionamento);
        console.log(`✅ Porta Web: ${dados.portaWeb}`);

        return dados;
    }

    // =========================================================================
    // DETERMINAR TIPO DE EQUIPAMENTO (CORRIGIDO - ADICIONADO 5A54)
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

    // =========================================================================
    // VERIFICA SE PRECISA DE "Autentica na ZTE"
    // =========================================================================
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
    // MONTAR COMPLEMENTO (NÃO INCLUI SSID/SENHA XX)
    // =========================================================================
    function montarComplemento(dados, tipoEquip, vlanFinal) {
        let partes = [];

        let equipamento = tipoEquip;
        if (dados.telefonia && dados.telefonia.temTelefonia) {
            equipamento += " + Telefonia";
        }
        partes.push(equipamento);
        partes.push(`SN: ${dados.serial}`);

        if (precisaAutenticacao(dados.tipoProvisionamento, dados.serial)) {
            partes.push("Autentica na ZTE");
        }

        if (dados.splitter && dados.splitter !== "XX" && dados.portaSplitter && dados.portaSplitter !== "XX") {
            partes.push(`${dados.splitter} - Porta: ${dados.portaSplitter}`);
        }

        partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${dados.porta} ID: ${dados.id}`);

        // SÓ ADICIONA SSID E SENHA SE NÃO FOREM "XX"
        if (dados.ssid !== "XX" && dados.senha !== "XX") {
            partes.push(`SSID: ${dados.ssid} - Senha: ${dados.senha}`);
        }

        if (dados.telefonia && dados.telefonia.temTelefonia) {
            let telefoniaPart = `N° ${dados.telefonia.numero}`;
            if (dados.telefonia.senha) {
                telefoniaPart += ` - Senha da Telefonia: ${dados.telefonia.senha}`;
            }
            if (dados.telefonia.ip && dados.telefonia.ip.trim() !== '') {
                telefoniaPart += ` - IP de Telefonia: ${dados.telefonia.ip}`;
            }
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
    // PREENCHER FORMULÁRIO COM DADOS DA CAIXINHA
    // =========================================================================
    function preencherFormulario(dados) {
        // Serial
        const inputSerial = document.getElementById('AuthenticationContractEquipmentSerialNumber');
        if (inputSerial && dados.serial && dados.serial !== "XX") {
            inputSerial.value = dados.serial;
            inputSerial.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Splitter
        const inputSplitter = document.getElementById('AuthenticationSplitterPortTitle');
        if (inputSplitter && dados.splitter && dados.splitter !== "XX") {
            inputSplitter.value = dados.splitter;
            inputSplitter.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Porta Splitter
        const inputPortaSplitter = document.getElementById('AuthenticationSplitterPortPort');
        if (inputPortaSplitter && dados.portaSplitter && dados.portaSplitter !== "XX") {
            inputPortaSplitter.value = dados.portaSplitter;
            inputPortaSplitter.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Slot OLT
        const inputSlot = document.getElementById('AuthenticationContractSlotOlt');
        if (inputSlot && dados.slot && dados.slot !== "XX") {
            inputSlot.value = dados.slot;
            inputSlot.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Porta OLT
        const inputPorta = document.getElementById('AuthenticationContractPortOlt');
        if (inputPorta && dados.porta && dados.porta !== "XX") {
            inputPorta.value = dados.porta;
            inputPorta.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // ID ONU - LIMPA SE FOR "XX"
        const inputIdOnu = document.getElementById('AuthenticationContractOltId');
        if (inputIdOnu && dados.id !== undefined && dados.id !== null && dados.id !== '' && dados.id !== "XX") {
            inputIdOnu.value = dados.id;
            inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (inputIdOnu) {
            inputIdOnu.value = '';
            inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // SSID
        const inputSsid = document.getElementById('AuthenticationContractWifiName');
        if (inputSsid && dados.ssid && dados.ssid !== "XX") {
            inputSsid.value = dados.ssid;
            inputSsid.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Senha
        const inputSenha = document.getElementById('AuthenticationContractWifiPassword');
        if (inputSenha && dados.senha && dados.senha !== "XX") {
            inputSenha.value = dados.senha;
            inputSenha.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // VLAN
        const inputVlan = document.getElementById('AuthenticationContractVlan');
        if (inputVlan && dados.vlan && dados.vlan !== "XX") {
            inputVlan.value = dados.vlan;
            inputVlan.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Porta Web
        const inputPortaWeb = document.getElementById('AuthenticationContractEquipmentPort');
        if (inputPortaWeb && dados.portaWeb) {
            inputPortaWeb.value = dados.portaWeb;
            inputPortaWeb.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Tipo Provisionamento
        const inputTipo = document.getElementById('tipoProvisionamento');
        if (inputTipo && dados.tipoProvisionamento) {
            inputTipo.value = dados.tipoProvisionamento;
            inputTipo.dispatchEvent(new Event('input', { bubbles: true }));
        }

        console.log('✅ Formulário preenchido com os dados da caixinha');
    }

    // =========================================================================
    // JANELA FLUTUANTE
    // =========================================================================
    function criarJanelaFlutuante(dados, contratoAtual) {
        const contratoParaExibir = dados.contrato && dados.contrato !== "Nenhum" ? dados.contrato : (contratoAtual || "???");

        const janelaExistente = document.getElementById('osir-floating-window');
        if (janelaExistente) {
            janelaExistente.remove();
        }

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
        titulo.style.cssText = `
            font-weight: bold;
            font-size: ${Math.round(estadoJanela.fonte * 1.1)}px;
            color: #1f2937;
            flex: 1;
        `;

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
    // FUNÇÃO PARA CRIAR O BOTÃO COMPLEMENTAR
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
                    // 2. CAPTURA OS DADOS DO FORMULÁRIO E DO CLIPBOARD
                    // =============================================================
                    let dados = capturarDadosDoFormulario();
                    let dadosClipboard = null;
                    let idCapturado = null;

                    try {
                        const texto = await navigator.clipboard.readText();
                        if (texto && texto.startsWith("OSIRDATA||")) {
                            const partesClip = texto.split("||");
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
                        }
                    } catch (e) {
                        console.log('⚠️ Não foi possível ler o clipboard');
                    }

                    const contratoAtual = extrairContratoDaURL();

                    if (idCapturado && idCapturado !== "") {
                        dados.contrato = idCapturado;
                        console.log(`✅ Usando ID capturado: ${dados.contrato}`);
                    } else {
                        dados.contrato = contratoAtual || "";
                        console.log(`⚠️ Usando ID da URL (fallback): ${dados.contrato}`);
                    }

                    // =============================================================
                    // 3. SSID E SENHA - PRIORIDADE: Formulário > Clipboard
                    // =============================================================
                    const inputWifiSsid = document.getElementById('AuthenticationContractWifiName');
                    const inputWifiPass = document.getElementById('AuthenticationContractWifiPassword');

                    const ssidAtual = inputWifiSsid?.value?.trim() || "";
                    const senhaAtual = inputWifiPass?.value?.trim() || "";

                    if (ssidAtual === "" && dadosClipboard && dadosClipboard.ssid && dadosClipboard.ssid !== "XX") {
                        dados.ssid = dadosClipboard.ssid;
                        if (inputWifiSsid) {
                            inputWifiSsid.value = dados.ssid;
                            inputWifiSsid.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        console.log(`✅ SSID preenchido do clipboard: ${dados.ssid}`);
                    } else if (ssidAtual !== "") {
                        dados.ssid = ssidAtual;
                        console.log(`🔒 SSID preservado (já preenchido): ${ssidAtual}`);
                    }

                    if (senhaAtual === "" && dadosClipboard && dadosClipboard.senha && dadosClipboard.senha !== "XX") {
                        dados.senha = dadosClipboard.senha;
                        if (inputWifiPass) {
                            inputWifiPass.value = dados.senha;
                            inputWifiPass.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        console.log(`✅ Senha preenchida do clipboard: ${dados.senha}`);
                    } else if (senhaAtual !== "") {
                        dados.senha = senhaAtual;
                        console.log(`🔒 Senha preservada (já preenchida): ${senhaAtual}`);
                    }

                    // =============================================================
                    // 4. SE TIVER DADOS DO CLIPBOARD, USA OS DADOS TÉCNICOS
                    // =============================================================
                    if (dadosClipboard) {
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
                        if (dadosClipboard.pontoAcesso && dadosClipboard.pontoAcesso !== "") {
                            dados.pontoAcesso = dadosClipboard.pontoAcesso;
                        }
                        if (dadosClipboard.olt && dadosClipboard.olt !== "N/A") {
                            dados.olt = dadosClipboard.olt;
                        }
                        if (dadosClipboard.tipoProvisionamento && dadosClipboard.tipoProvisionamento !== "") {
                            dados.tipoProvisionamento = dadosClipboard.tipoProvisionamento;
                        }
                        if (dadosClipboard.portaWeb && dadosClipboard.portaWeb !== "80") {
                            dados.portaWeb = dadosClipboard.portaWeb;
                        }
                        if (dadosClipboard.splitter && dadosClipboard.splitter !== "XX") {
                            dados.splitter = dadosClipboard.splitter;
                        }
                        if (dadosClipboard.portaSplitter && dadosClipboard.portaSplitter !== "XX") {
                            dados.portaSplitter = dadosClipboard.portaSplitter;
                        }
                        console.log('✅ Dados técnicos atualizados do clipboard');
                    }

                    // =============================================================
                    // 5. MONTA O NOVO COMPLEMENTO
                    // =============================================================
                    const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
                    const vlanFinal = dados.vlan || calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);
                    const portaWebCorreta = definirPortaWeb(dados.tipoProvisionamento);
                    dados.portaWeb = portaWebCorreta;

                    let novoBlocoTecnico = montarComplemento(dados, tipoEquip, vlanFinal);

                    // =============================================================
                    // 6. RECONSTRÓI O TEXTO COMPLETO
                    // =============================================================
                    let partesFinais = [];

                    if (notasInicio.length > 0) {
                        partesFinais.push(notasInicio.join(" || "));
                    }

                    partesFinais.push(novoBlocoTecnico);

                    if (notasFim.length > 0) {
                        partesFinais.push(notasFim.join(" || "));
                    }

                    const textoFinal = partesFinais.join(" || ");
                    console.log('📝 Texto final com notas preservadas:', textoFinal);

                    // =============================================================
                    // 7. PREENCHE OS CAMPOS
                    // =============================================================
                    // ✅ APAGA O MAC ADDRESS
                    const inputMac = document.getElementById('AuthenticationContractMac');
                    if (inputMac) {
                        inputMac.value = '';
                        inputMac.dispatchEvent(new Event('input', { bubbles: true }));
                        inputMac.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log('✅ MAC Address apagado');
                    } else {
                        // FALLBACK MAIS RESTRITO
                        const macInputs = document.querySelectorAll('input[name="data[AuthenticationContract][mac]"], input#AuthenticationContractMac');
                        for (let inp of macInputs) {
                            if (inp.type !== 'hidden' && inp.type !== 'submit') {
                                inp.value = '';
                                inp.dispatchEvent(new Event('input', { bubbles: true }));
                                inp.dispatchEvent(new Event('change', { bubbles: true }));
                                console.log(`✅ MAC Address apagado (campo: ${inp.id || inp.name})`);
                                break;
                            }
                        }
                    }

                    // VLAN
                    const inputVlan = document.getElementById('AuthenticationContractVlan');
                    if (inputVlan) {
                        inputVlan.value = vlanFinal;
                        inputVlan.dispatchEvent(new Event('input', { bubbles: true }));
                        inputVlan.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // ID ONU - LIMPA SE FOR "XX"
                    const inputIdOnu = document.getElementById('AuthenticationContractOltId');
                    if (inputIdOnu && dados.id !== undefined && dados.id !== null && dados.id !== '' && dados.id !== "XX") {
                        inputIdOnu.value = dados.id;
                        inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
                    } else if (inputIdOnu) {
                        inputIdOnu.value = '';
                        inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    // Porta Web
                    const inputPortaWeb = document.getElementById('AuthenticationContractEquipmentPort');
                    if (inputPortaWeb) {
                        inputPortaWeb.value = portaWebCorreta;
                        inputPortaWeb.dispatchEvent(new Event('input', { bubbles: true }));
                        inputPortaWeb.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // Splitter
                    const inputSplitter = document.getElementById('AuthenticationSplitterPortTitle');
                    if (inputSplitter && dados.splitter && dados.splitter !== "XX") {
                        inputSplitter.value = dados.splitter;
                        inputSplitter.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    // Porta Splitter
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
                        const divTopo = document.body;
                        const matchContrato = divTopo.innerText.match(/Cliente\s*-\s*(\d+)/i);
                        if (matchContrato && matchContrato[1]) {
                            dados.contrato = matchContrato[1].trim();
                            console.log(`✅ Contrato capturado da página: ${dados.contrato}`);
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

        // Tenta injetar o botão várias vezes
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
                if (texto && texto.startsWith("OSIRDATA||")) {
                    const partes = texto.split("||");
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
