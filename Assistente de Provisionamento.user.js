// ==UserScript==
// @name         Osir - Assistente de Provisionamento
// @namespace    http://tampermonkey.net/
// @version      5.3.0
// @description  CORRIGIDO: VLAN 2200 (STL_CE_3/4, TTN_LAN, GAR, ROS) + Normalização STLDC→DC, PTN_NOVA→PTN + Botão 📋 Copiar PE+Slot+Porta + Remoção Complementar + Preparar Dados no lugar do Chamado + VLAN e Porta Web preenchem campos do contrato
// @author       Alisson Guerreiro
// @match        *://*.osirnet.com.br/*
// @match        *://*.osir.net.br/*
// @match        *://*.atendimento.osir.net.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // CONFIGURAÇÕES GERAIS
    // =========================================================================
    const DEBUG = true;
    const SCRIPT_VERSION = '5.3.0';

    const URL_ATENDIMENTO = "filaProvisionamento.php";
    const URL_CONTRATO_VOALLE = "authentication_contracts/contract_panel";
    const URL_OPERACAO = "/legacy/operations/";

    const TIMINGS = {
        INJECAO_BOTAO_INTERVAL: 800,
        INJECAO_BOTAO_DELAY_1: 100,
        INJECAO_BOTAO_DELAY_2: 3000,
        VERIFICAR_DADOS_DELAY_1: 2000,
        VERIFICAR_DADOS_DELAY_2: 4000,
        MAX_TENTATIVAS_JANELA_ESQUERDA: 15,
        INTERVALO_JANELA_ESQUERDA: 1000,
        MONITORAMENTO_SALVAMENTO_DELAY: 2000,
        ALERTA_SALVO_TIMEOUT: 300000,
        FEEDBACK_BOTAO_TIMEOUT: 1500
    };

    // =========================================================================
    // FUNÇÕES UTILITÁRIAS
    // =========================================================================
    function log(...args) {
        if (DEBUG) console.log(...args);
    }

    function logError(...args) {
        if (DEBUG) console.error(...args);
    }

    // Wrapper seguro para localStorage
    const storage = {
        get(key) {
            try { return localStorage.getItem(key); } catch (e) { return null; }
        },
        set(key, value) {
            try { localStorage.setItem(key, value); } catch (e) {}
        },
        remove(key) {
            try { localStorage.removeItem(key); } catch (e) {}
        },
        getJSON(key) {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : null;
            } catch (e) { return null; }
        },
        setJSON(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
        }
    };

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // =========================================================================
    // CACHE DE ELEMENTOS DO DOM
    // =========================================================================
    const DOM_CACHE = new Map();
    const DOM_CACHE_TTL = 5000; // 5 segundos

    function getCachedElement(id) {
        const cached = DOM_CACHE.get(id);
        if (cached && cached.timestamp > Date.now() - DOM_CACHE_TTL) {
            return cached.element;
        }
        const element = document.getElementById(id);
        if (element) {
            DOM_CACHE.set(id, { element, timestamp: Date.now() });
        }
        return element;
    }

    function clearDOMCache() {
        DOM_CACHE.clear();
    }

    // =========================================================================
    // FUNÇÃO DE NORMALIZAÇÃO DE NOMES DE PE (CENTRALIZADA)
    // =========================================================================
    function normalizarNomePE(nomePE) {
        if (!nomePE) return "";
        let normalizado = nomePE.toUpperCase().trim();
        normalizado = normalizado.replace(/STLDC\s*0?1/, "DC 1");
        normalizado = normalizado.replace(/STLDC\s*0?2/, "DC 2");
        normalizado = normalizado.replace(/PTN[_\s]*NOVA/, "PTN");
        return normalizado;
    }

    // =========================================================================
    // CONFIGURAÇÕES DA JANELA FLUTUANTE
    // =========================================================================
    const CONFIG_JANELA = {
        larguraMin: 250,
        larguraMax: 500,
        larguraPadrao: 350,
        alturaMin: 250,
        alturaMax: 600,
        alturaPadrao: 550,
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
    // ESTADO DO WIFI PRO (COM SINCRONIZAÇÃO AUTOMÁTICA)
    // =========================================================================
    const wifiProState = {
        _ativo: false,
        get ativo() { return this._ativo; },
        set ativo(valor) {
            this._ativo = Boolean(valor);
            storage.set('osir_wifi_pro_ativo', String(this._ativo));
        }
    };

    // Inicializa do localStorage
    const wifiProSalvo = storage.get('osir_wifi_pro_ativo');
    if (wifiProSalvo !== null) {
        wifiProState._ativo = wifiProSalvo === 'true';
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
        storage.setJSON('osir_janela_flutuante_prefs', estadoJanela);
    }

    function carregarPreferencias() {
        const dados = storage.getJSON('osir_janela_flutuante_prefs');
        if (dados) {
            estadoJanela.largura = dados.largura || CONFIG_JANELA.larguraPadrao;
            estadoJanela.altura = dados.altura || CONFIG_JANELA.alturaPadrao;
            estadoJanela.fonte = dados.fonte || CONFIG_JANELA.fontePadrao;
        }
    }
    carregarPreferencias();

    // =========================================================================
    // FUNÇÃO PARA TORNAR A JANELA ARRASTÁVEL
    // =========================================================================
    function tornarJanelaArrastavel(janela) {
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        let xOffset = 0;
        let yOffset = 0;

        const posicaoSalva = storage.getJSON('osir_janela_posicao');
        if (posicaoSalva && posicaoSalva.x !== undefined && posicaoSalva.y !== undefined) {
            const maxX = window.innerWidth - 320 - 10;
            const maxY = window.innerHeight - 400 - 10;
            const x = Math.max(10, Math.min(posicaoSalva.x, maxX));
            const y = Math.max(10, Math.min(posicaoSalva.y, maxY));

            janela.style.top = y + 'px';
            janela.style.left = x + 'px';
            janela.style.right = 'auto';
            janela.style.bottom = 'auto';
            xOffset = x;
            yOffset = y;
            currentX = x;
            currentY = y;
        }

        function dragStart(e) {
            if (e.target.closest('.osir-no-drag')) return;

            const touch = e.type === 'touchstart' ? e.touches[0] : e;
            initialX = touch.clientX - xOffset;
            initialY = touch.clientY - yOffset;

            if (e.target.closest('.osir-header-drag')) {
                isDragging = true;
                janela.style.cursor = 'grabbing';
                janela.style.transition = 'none';
                janela.style.boxShadow = '0 12px 48px rgba(0,0,0,0.4)';
            }
        }

        function dragEnd() {
            if (isDragging) {
                isDragging = false;
                janela.style.cursor = 'default';
                janela.style.transition = 'width 0.3s ease, max-height 0.3s ease, box-shadow 0.3s ease';
                janela.style.boxShadow = '0 8px 32px rgba(0,0,0,0.35)';

                storage.setJSON('osir_janela_posicao', { x: xOffset, y: yOffset });
            }
        }

        function drag(e) {
            if (!isDragging) return;
            e.preventDefault();

            const touch = e.type === 'touchmove' ? e.touches[0] : e;
            currentX = touch.clientX - initialX;
            currentY = touch.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            const rect = janela.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width - 10;
            const maxY = window.innerHeight - rect.height - 10;

            currentX = Math.max(10, Math.min(currentX, maxX));
            currentY = Math.max(10, Math.min(currentY, maxY));

            janela.style.top = currentY + 'px';
            janela.style.left = currentX + 'px';
            janela.style.right = 'auto';
            janela.style.bottom = 'auto';
        }

        janela.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        janela.addEventListener('touchstart', dragStart, { passive: true });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', dragEnd);

        window.addEventListener('resize', () => {
            const rect = janela.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width - 10;
            const maxY = window.innerHeight - rect.height - 10;

            if (rect.left > maxX || rect.top > maxY) {
                currentX = Math.min(currentX, maxX);
                currentY = Math.min(currentY, maxY);
                janela.style.left = currentX + 'px';
                janela.style.top = currentY + 'px';
                xOffset = currentX;
                yOffset = currentY;

                storage.setJSON('osir_janela_posicao', { x: currentX, y: currentY });
            }
        });

        janela.resetPosition = function() {
            storage.remove('osir_janela_posicao');
            janela.style.top = '70px';
            janela.style.right = '15px';
            janela.style.left = 'auto';
            janela.style.bottom = 'auto';
            xOffset = 0;
            yOffset = 0;
            currentX = 0;
            currentY = 0;
        };
    }

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
        const wifiProStr = wifiProState.ativo ? '1' : '0';

        return `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contrato}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}||${dados.tipoProvisionamento}||${dados.telefonia.numero || ''}||${dados.telefonia.senha || ''}||${dados.telefonia.ip || ''}||${portaWeb}||${sinalStr}||${wifiProStr}`;
    }

    // =========================================================================
    // CÁLCULO VLAN (REFATORADO)
    // =========================================================================
    function calcularVlanEspecial(pontoAcesso) {
        const pa = normalizarNomePE(pontoAcesso);

        if (pa.includes("STL_CE3_R") || pa.includes("STL_CE4_R") ||
            pa.includes("STL_CE_3") || pa.includes("STL_CE_4") ||
            pa.includes("TTN_LAN") ||
            pa.includes("GAR") ||
            pa.includes("ROS")) {
            return "2200";
        }

        return null;
    }

    function calcularVlanPadrao(slotStr, portaStr) {
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

    function calcularVlanOsir(pontoAcesso, slotStr, portaStr) {
        // Primeiro verifica se é VLAN especial (2200)
        const vlanEspecial = calcularVlanEspecial(pontoAcesso);
        if (vlanEspecial) return vlanEspecial;

        // Caso contrário, cálculo padrão
        return calcularVlanPadrao(slotStr, portaStr);
    }

    function definirPortaWeb(tipoProvisionamento) {
        const tipo = (tipoProvisionamento || "").toLowerCase().trim();
        if (tipo === "b") return "8092";
        if (tipo === "r") return "80";
        return "80";
    }

    function determinarTipoEquipamento(tipoProvisionamento, serial) {
        const tipoLower = (tipoProvisionamento || "").toLowerCase().trim();
        const serialUpper = (serial || "").toUpperCase();

        // Determinar fabricante pelo serial
        let fabricante = '';
        if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) {
            fabricante = 'Huawei';
        } else if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) {
            fabricante = 'ZTE';
        } else if (serialUpper.startsWith("RCMG")) {
            fabricante = 'Raisecom';
        } else if (serialUpper.startsWith("5A544") || serialUpper.startsWith("ZTEGD")) {
            return 'ZTE Bridge';
        } else {
            return 'Equipamento Desconhecido';
        }

        // Raisecom sempre retorna Router
        if (fabricante === 'Raisecom') return 'Raisecom Router';

        // ZTE (exceto variantes específicas) retorna Bridge
        if (fabricante === 'ZTE') return 'ZTE Bridge';

        // Huawei: depende do tipo
        if (fabricante === 'Huawei') {
            return tipoLower === 'b' ? 'Huawei Bridge' : 'Huawei Router';
        }

        return 'Equipamento Desconhecido';
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
    // FORMATAR PE + SLOT + PORTA
    // =========================================================================
    function formatarPESlotPorta(dados) {
        let pe = dados.pontoAcesso || dados.olt || '';

        // Extrai o nome do PE se estiver no formato "REG XX - CIDADE - PE"
        if (pe.includes(' - ')) {
            const partes = pe.split(' - ');
            pe = partes[partes.length - 1].trim();
        }

        // Normaliza o nome do PE
        pe = normalizarNomePE(pe);

        // Remove prefixos e underscores para exibição
        if (pe.includes('STL_CE_')) {
            pe = pe.replace('STL_', '').replace('_', ' ');
        } else if (pe.includes('JUN_')) {
            pe = pe.replace('_', ' ');
        } else if (pe.includes('_')) {
            pe = pe.replace('_', ' ');
        }

        let slot = dados.slot || '0';
        let porta = dados.porta || '0';

        // Formata apenas se for numérico
        if (/^\d+$/.test(slot)) {
            slot = String(slot).padStart(2, '0');
        }
        if (/^\d+$/.test(porta)) {
            porta = String(porta).padStart(2, '0');
        }

        return `${pe} ${slot} ${porta}`;
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
            wifiPro: wifiProState.ativo,
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
            const match = tituloModal.textContent.match(/(\d+)/);
            if (match) dados.contrato = match[1].trim();
        }

        // Extrai o pontoAcesso do nomeOLT
        if (dados.nomeOLT) {
            const partes = dados.nomeOLT.split(' - ');
            if (partes.length >= 3) {
                dados.pontoAcesso = partes[partes.length - 1].trim();
            }
        }

        dados.vlan = calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);
        dados.portaWeb = definirPortaWeb(dados.tipoProvisionamento);

        return dados;
    }

    // =========================================================================
    // MONTAR COMPLEMENTO (FUNÇÃO UNIFICADA)
    // =========================================================================
    function montarComplementoBase(opcoes) {
        const {
            wifiPro = false,
            modelo = '',
            serial = '',
            autenticaZTE = false,
            autenticaRB = false,
            omada = false,
            splitter = '',
            portaSplitter = '',
            slot = '',
            porta = '',
            id = '',
            ssid = '',
            senha = '',
            telefonia = null
        } = opcoes;

        let partes = [];

        if (wifiPro) partes.push("Cliente Wifi Pro");

        if (modelo) partes.push(modelo);

        if (serial && serial !== 'XX' && serial !== '') {
            partes.push(`SN: ${serial}`);
        }

        if (autenticaZTE) partes.push("Autentica na ZTE");
        if (autenticaRB) partes.push("Autentica em uma RB");
        if (omada) partes.push("EAPs configurados no OMADA");

        if (splitter && splitter !== '') {
            const portaSplitterFormatada = portaSplitter && portaSplitter !== ''
                ? (/^\d+$/.test(portaSplitter) ? portaSplitter.padStart(2, '0') : portaSplitter)
                : 'XX';
            partes.push(`Splitter: ${splitter} Porta: ${portaSplitterFormatada}`);
        } else {
            partes.push("XX - Porta XX");
        }

        if (slot && porta && id) {
            const portaFormatada = /^\d+$/.test(porta) ? porta.padStart(2, '0') : porta;
            partes.push(`Slot OLT: ${slot} Porta OLT: ${portaFormatada} ID: ${id}`);
        }

        if (ssid && ssid !== '' && ssid !== 'XX') {
            if (senha && senha !== '' && senha !== 'XX') {
                partes.push(`SSID: ${ssid} Senha: ${senha}`);
            } else {
                partes.push(`SSID: ${ssid}`);
            }
        } else if (senha && senha !== '' && senha !== 'XX') {
            partes.push(`Senha: ${senha}`);
        }

        if (telefonia && telefonia.temTelefonia) {
            if (telefonia.numero && telefonia.numero.trim() !== '') {
                partes.push(`Nº: ${telefonia.numero}`);
            }
            if (telefonia.senha && telefonia.senha.trim() !== '') {
                partes.push(`Senha da Telefonia: ${telefonia.senha}`);
            }
            if (telefonia.ip && telefonia.ip.trim() !== '') {
                partes.push(`IP de Telefonia: ${telefonia.ip}`);
            }
        }

        return partes.join(" || ")
            .replace(/\|\|\s*\|\|/g, '||')
            .replace(/^\s*\|\|\s*/, '')
            .replace(/\s*\|\|\s*$/, '')
            .trim();
    }

    // Função para montar complemento da janela flutuante (usa dados do provisionamento)
    function montarComplemento(dados) {
        const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
        const temTelefonia = dados.telefonia && dados.telefonia.temTelefonia === true;

        let modelo = tipoEquip;
        if (temTelefonia) modelo += " + Telefonia";

        return montarComplementoBase({
            wifiPro: wifiProState.ativo,
            modelo: modelo,
            serial: dados.serial,
            autenticaZTE: precisaAutenticacao(dados.tipoProvisionamento, dados.serial),
            splitter: dados.splitter || '',
            portaSplitter: dados.portaSplitter || '',
            slot: dados.slot,
            porta: dados.porta,
            id: dados.id,
            ssid: dados.ssid,
            senha: dados.senha,
            telefonia: temTelefonia ? dados.telefonia : null
        });
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
            const el = getCachedElement(id);
            if (el && valor && valor !== "XX" && valor !== "") {
                el.value = valor;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        if (dados.telefonia && dados.telefonia.temTelefonia) {
            const numTel = getCachedElement('numeroTelefone01');
            if (numTel && dados.telefonia.numero) {
                numTel.value = dados.telefonia.numero;
                numTel.dispatchEvent(new Event('input', { bubbles: true }));
            }

            const senhaTel = getCachedElement('senhaTelefone');
            if (senhaTel && dados.telefonia.senha) {
                senhaTel.value = dados.telefonia.senha;
                senhaTel.dispatchEvent(new Event('input', { bubbles: true }));
            }

            const ipTel = getCachedElement('ipGerencia');
            if (ipTel && dados.telefonia.ip) {
                ipTel.value = dados.telefonia.ip;
                ipTel.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    // =========================================================================
    // FUNÇÃO PARA CRIAR BOTÃO ESTILIZADO (REUTILIZÁVEL)
    // =========================================================================
    function criarBotaoEstilizado(texto, cor, onClick, extras = {}) {
        const btn = document.createElement('button');
        btn.textContent = texto;
        btn.style.cssText = `
            padding: 6px 12px;
            background: linear-gradient(135deg, ${cor} 0%, ${cor}cc 100%);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 700;
            font-size: 11px;
            transition: all 0.2s ease;
            box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        `;
        Object.assign(btn.style, extras);
        btn.onclick = onClick;
        return btn;
    }

    // =========================================================================
    // JANELA FLUTUANTE (DIREITA)
    // =========================================================================
    let currentJanelaFlutuanteDados = null;

    function criarJanelaFlutuante(dados) {
        currentJanelaFlutuanteDados = dados;

        const contratoParaExibir = dados.contrato || "???";
        const janelaExistente = document.getElementById('osir-floating-window');

        const temTelefonia = dados.telefonia && dados.telefonia.temTelefonia === true;

        if (dados.wifiPro !== undefined) {
            wifiProState.ativo = dados.wifiPro;
        }

        const complementoPreview = montarComplemento(dados);

        // Se a janela já existe, apenas atualiza o conteúdo
        if (janelaExistente) {
            atualizarConteudoJanelaFlutuante(janelaExistente, dados, temTelefonia, complementoPreview);
            return;
        }

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
            user-select: none;
        `;

        construirConteudoJanelaFlutuante(janela, dados, temTelefonia, complementoPreview);
        document.body.appendChild(janela);
        tornarJanelaArrastavel(janela);
    }

    function construirConteudoJanelaFlutuante(janela, dados, temTelefonia, complementoPreview) {
        // Limpa conteúdo existente
        janela.innerHTML = '';

        // CABEÇALHO
        const header = document.createElement('div');
        header.className = 'osir-header-drag';
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
            cursor: grab;
            user-select: none;
        `;

        const titulo = document.createElement('span');
        titulo.textContent = `📋 Contrato #${dados.contrato || "???"}`;
        titulo.style.cssText = `
            font-weight: 700;
            font-size: ${Math.round(estadoJanela.fonte * 1.1)}px;
            color: #1f2937;
            flex: 1;
            letter-spacing: 0.2px;
            user-select: none;
            pointer-events: none;
        `;

        const grupoControles = document.createElement('div');
        grupoControles.className = 'osir-no-drag';
        grupoControles.style.cssText = `display: flex; align-items: center; gap: 4px;`;

        // Botão -
        const btnMenos = criarBotaoEstilizado('−', '#e5e7eb', () => {
            redimensionarJanela(-CONFIG_JANELA.passo, -CONFIG_JANELA.passo, -1);
            salvarPreferencias();
        }, { color: '#374151', border: '1px solid #d1d5db', padding: '3px 8px', fontSize: '13px', lineHeight: '1.2' });

        // Size display
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

        // Botão +
        const btnMais = criarBotaoEstilizado('+', '#e5e7eb', () => {
            redimensionarJanela(CONFIG_JANELA.passo, CONFIG_JANELA.passo, 1);
            salvarPreferencias();
        }, { color: '#374151', border: '1px solid #d1d5db', padding: '3px 8px', fontSize: '13px', lineHeight: '1.2' });

        // Separador
        const sep = document.createElement('span');
        sep.textContent = '|';
        sep.style.cssText = `color: #d1d5db; padding: 0 3px; font-weight: 300;`;

        // Botão reset
        const btnReset = criarBotaoEstilizado('↺', '#e5e7eb', () => {
            estadoJanela.largura = CONFIG_JANELA.larguraPadrao;
            estadoJanela.altura = CONFIG_JANELA.alturaPadrao;
            estadoJanela.fonte = CONFIG_JANELA.fontePadrao;
            redimensionarJanela(0, 0, 0);
            salvarPreferencias();
            if (janela.resetPosition) janela.resetPosition();
        }, { color: '#374151', border: '1px solid #d1d5db', padding: '3px 8px', fontSize: '13px', lineHeight: '1.2' });

        // Botão fechar
        const btnFechar = criarBotaoEstilizado('✕', '#ef4444', () => {
            janela.remove();
            currentJanelaFlutuanteDados = null;
        }, { background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '1px solid #dc2626', padding: '3px 8px', fontSize: '12px', lineHeight: '1.2', boxShadow: '0 1px 3px rgba(239,68,68,0.3)' });

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
        if (wifiProState.ativo) badgeTexto += ' 📶 WiFi Pro';
        badge.textContent = badgeTexto;
        janela.appendChild(badge);

        // FONTE DOS DADOS
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

        // CHECKBOX WIFI PRO
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
        checkbox.checked = wifiProState.ativo;
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
            wifiProState.ativo = this.checked;
            const badge = janela.querySelector('.osir-badge');
            if (badge) {
                let texto = temTelefonia ? '✅ Dados do Amarelo 📞' : '✅ Dados do Amarelo';
                if (wifiProState.ativo) texto += ' 📶 WiFi Pro';
                badge.textContent = texto;
            }
            if (currentJanelaFlutuanteDados) {
                const complementoAtualizado = montarComplemento(currentJanelaFlutuanteDados);
                const previewTexto = janela.querySelector('.osir-preview-texto');
                if (previewTexto) previewTexto.textContent = complementoAtualizado;
            }
        });

        wifiProContainer.appendChild(checkbox);
        wifiProContainer.appendChild(label);
        conteudo.appendChild(wifiProContainer);

        // CAMPOS
        function criarLinhaCampo(labelText, valorText, comBotaoCopiar = false) {
            const linha = document.createElement('div');
            linha.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 6px;
                border-bottom: 1px solid #f3f4f6;
                font-size: ${estadoJanela.fonte}px;
                gap: 4px;
                border-radius: 3px;
            `;

            const labelCampo = document.createElement('span');
            labelCampo.textContent = labelText;
            labelCampo.style.cssText = `
                font-weight: 700;
                color: #4b5563;
                font-size: ${estadoJanela.fonte}px;
                min-width: 60px;
                flex-shrink: 0;
            `;

            const valorSpan = document.createElement('span');
            valorSpan.textContent = valorText;
            valorSpan.style.cssText = `
                color: #1f2937;
                font-family: 'Courier New', monospace;
                background: #f9fafb;
                padding: 2px 6px;
                border-radius: 3px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: ${Math.round(estadoJanela.fonte * 0.9)}px;
                font-weight: 600;
                border: 1px solid #e5e7eb;
                flex: 1;
                min-width: 0;
            `;

            if (!comBotaoCopiar) {
                linha.appendChild(labelCampo);
                linha.appendChild(valorSpan);
                return linha;
            }

            const container = document.createElement('div');
            container.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
                flex: 1;
                min-width: 0;
            `;

            valorSpan.style.flex = '1';
            valorSpan.style.minWidth = '0';
            container.appendChild(valorSpan);

            const btnCopiar = criarBotaoEstilizado('📋', '#8b5cf6', function() {
                const textoParaCopiar = formatarPESlotPorta(dados);
                navigator.clipboard.writeText(textoParaCopiar).then(() => {
                    this.textContent = '✅';
                    this.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                    this.style.borderColor = '#059669';
                    setTimeout(() => {
                        this.textContent = '📋';
                        this.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                        this.style.borderColor = '#7c3aed';
                    }, TIMINGS.FEEDBACK_BOTAO_TIMEOUT);
                }).catch(() => {
                    this.textContent = '❌';
                    setTimeout(() => this.textContent = '📋', TIMINGS.FEEDBACK_BOTAO_TIMEOUT);
                });
            }, { padding: '2px 6px', fontSize: `${Math.round(estadoJanela.fonte * 0.8)}px`, lineHeight: '1.2', border: '1px solid #7c3aed', flexShrink: '0' });

            container.appendChild(valorSpan);
            container.appendChild(btnCopiar);
            linha.appendChild(labelCampo);
            linha.appendChild(container);
            return linha;
        }

        let peExibicao = dados.nomeOLT || dados.olt || "N/A";
        if (peExibicao === "N/A" && dados.pontoAcesso) {
            peExibicao = dados.pontoAcesso;
        }

        conteudo.appendChild(criarLinhaCampo('📍 PE', peExibicao, true));

        const camposSimples = [
            { label: '📊 Slot', valor: dados.slot || 'XX' },
            { label: '🔌 Porta', valor: dados.porta || 'XX' },
            { label: '🆔 ID', valor: dados.id || 'XX' },
            { label: '🔌 Serial', valor: dados.serial || 'XX' },
            { label: '📡 SSID', valor: dados.ssid || 'XX' },
            { label: '🔑 Senha', valor: dados.senha || 'XX' }
        ];

        camposSimples.forEach((campo) => {
            conteudo.appendChild(criarLinhaCampo(campo.label, campo.valor, false));
        });

        if (temTelefonia) {
            conteudo.appendChild(criarLinhaCampo('📞 Tel', dados.telefonia.numero || 'N/A', false));
            if (dados.telefonia.senha && dados.telefonia.senha.trim() !== '') {
                conteudo.appendChild(criarLinhaCampo('🔑 Senha Tel', dados.telefonia.senha, false));
            }
            if (dados.telefonia.ip && dados.telefonia.ip.trim() !== '') {
                conteudo.appendChild(criarLinhaCampo('🌐 IP Tel', dados.telefonia.ip, false));
            }
        }

        // COMPLEMENTO
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

        // BOTÕES
        const btnSincronizar = criarBotaoEstilizado('🔄 Sincronizar', '#8b5cf6', function() {
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
                wifiPro: wifiProState.ativo
            };

            const stringSecreta = montarStringOSIRDATA(dadosDaCaixinha);

            navigator.clipboard.writeText(stringSecreta).then(() => {
                this.textContent = '✅ OK';
                this.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                preencherFormularioContrato(dadosDaCaixinha);
                setTimeout(() => {
                    this.textContent = '🔄 Sincronizar';
                    this.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                }, TIMINGS.FEEDBACK_BOTAO_TIMEOUT);
            });
        }, { width: '100%', marginTop: '8px', fontSize: `${Math.round(estadoJanela.fonte * 0.9)}px`, border: '1px solid #7c3aed' });
        conteudo.appendChild(btnSincronizar);

        const btnGerarComplemento = criarBotaoEstilizado('📝 Complemento', '#e11d48', function() {
            const complementoAtualizado = montarComplemento(dados);
            const inputComplementar = getCachedElement('AuthenticationContractComplement');
            if (inputComplementar) {
                inputComplementar.value = complementoAtualizado;
                inputComplementar.dispatchEvent(new Event('input', { bubbles: true }));
                inputComplementar.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const previewTexto = janela.querySelector('.osir-preview-texto');
            if (previewTexto) previewTexto.textContent = complementoAtualizado;

            this.textContent = '✅ OK';
            this.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
            setTimeout(() => {
                this.textContent = '📝 Complemento';
                this.style.background = 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)';
            }, TIMINGS.FEEDBACK_BOTAO_TIMEOUT);
        }, { width: '100%', marginTop: '6px', fontSize: `${Math.round(estadoJanela.fonte * 0.9)}px`, border: '1px solid #be123c', boxShadow: '0 2px 8px rgba(225,29,72,0.2)' });
        conteudo.appendChild(btnGerarComplemento);

        janela.appendChild(conteudo);
    }

    function atualizarConteudoJanelaFlutuante(janela, dados, temTelefonia, complementoPreview) {
        // Apenas reconstrói o conteúdo, mantendo a posição
        construirConteudoJanelaFlutuante(janela, dados, temTelefonia, complementoPreview);
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
                    wifiProState.ativo = dadosAmarelo.wifiPro || false;
                }
            }
        } catch (e) {}

        if (!dadosAmarelo) {
            const salvos = storage.getJSON('osir_ultimos_dados');
            if (salvos && salvos.dados) {
                dadosAmarelo = salvos.dados;
                wifiProState.ativo = dadosAmarelo.wifiPro || false;
            }
        }

        if (!dadosAmarelo || !dadosAmarelo.serial || dadosAmarelo.serial === "XX") {
            return;
        }

        criarJanelaFlutuante(dadosAmarelo);
    }

    // =========================================================================
    // JANELA DA ESQUERDA (CONFIGURAÇÃO) - REFATORADA
    // =========================================================================

    function getTipoProvisionamentoPorModelo(modeloLabel) {
        const modelosBridge = [
            'Huawei Bridge', 'ZTE Bridge', 'Raisecom Bridge',
            'Raisecom Bridge (Des.)', 'Ektech Bridge'
        ];
        const modelosRouter = [
            'Huawei Router', 'Raisecom Router', 'ZTE Router'
        ];

        if (modelosBridge.includes(modeloLabel)) return 'b';
        if (modelosRouter.includes(modeloLabel)) return 'r';
        return 'b';
    }

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
        return {
            serial: getCachedElement('AuthenticationContractEquipmentSerialNumber')?.value?.trim() || 'XX',
            slot: getCachedElement('AuthenticationContractSlotOlt')?.value?.trim() || 'XX',
            porta: getCachedElement('AuthenticationContractPortOlt')?.value?.trim() || 'XX',
            id: getCachedElement('AuthenticationContractOltId')?.value?.trim() || 'XX',
            ssid: getCachedElement('AuthenticationContractWifiName')?.value?.trim() || '',
            senha: getCachedElement('AuthenticationContractWifiPassword')?.value?.trim() || '',
            splitter: getCachedElement('AuthenticationSplitterPortTitle')?.value?.trim() || '',
            portaSplitter: getCachedElement('AuthenticationSplitterPortPort')?.value?.trim() || ''
        };
    }

    function montarComplementoConfig() {
        const modelo = getModeloLabel();
        const dados = getDadosDoFormulario();

        return montarComplementoBase({
            wifiPro: document.getElementById('osir-wifi-pro-check')?.checked || false,
            modelo: modelo,
            serial: dados.serial,
            autenticaZTE: document.getElementById('osir-autentica-zte-check')?.checked || false,
            autenticaRB: document.getElementById('osir-autentica-rb-check')?.checked || false,
            omada: document.getElementById('osir-omada-check')?.checked || false,
            splitter: dados.splitter,
            portaSplitter: dados.portaSplitter,
            slot: dados.slot,
            porta: dados.porta,
            id: dados.id,
            ssid: dados.ssid,
            senha: dados.senha
        });
    }

    function preencherVlanEPortaWeb() {
        const dados = getDadosDoFormulario();
        const modelo = getModeloLabel();
        const tipoProv = getTipoProvisionamentoPorModelo(modelo);

        const vlan = calcularVlanOsir('', dados.slot, dados.porta);
        const portaWeb = definirPortaWeb(tipoProv);

        const campoVlan = getCachedElement('AuthenticationContractVlan');
        if (campoVlan && vlan && vlan !== "XX") {
            campoVlan.value = vlan;
            campoVlan.dispatchEvent(new Event('input', { bubbles: true }));
            campoVlan.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const campoPortaWeb = getCachedElement('AuthenticationContractEquipmentPort');
        if (campoPortaWeb && portaWeb) {
            campoPortaWeb.value = portaWeb;
            campoPortaWeb.dispatchEvent(new Event('input', { bubbles: true }));
            campoPortaWeb.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function preencherComplementoNoFormulario() {
        const campoComplemento = getCachedElement('AuthenticationContractComplement');
        if (!campoComplemento) return;

        const complemento = montarComplementoConfig();
        campoComplemento.value = complemento;
        campoComplemento.dispatchEvent(new Event('input', { bubbles: true }));
        campoComplemento.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function atualizarPreviewConfig() {
        const preview = document.getElementById('osir-preview-complement');
        if (preview) {
            preview.textContent = montarComplementoConfig() || 'Nenhum dado disponível';
        }

        const vlanDisplay = document.getElementById('osir-vlan-display');
        const portaDisplay = document.getElementById('osir-portaweb-display');

        if (vlanDisplay || portaDisplay) {
            const dados = getDadosDoFormulario();
            const modelo = getModeloLabel();
            const tipo = getTipoProvisionamentoPorModelo(modelo);
            const vlan = calcularVlanOsir('', dados.slot, dados.porta);
            const portaWeb = definirPortaWeb(tipo);

            if (vlanDisplay) vlanDisplay.textContent = vlan || '---';
            if (portaDisplay) portaDisplay.textContent = portaWeb || '80';
        }
    }

    function atualizarComplemento() {
        preencherVlanEPortaWeb();
        preencherComplementoNoFormulario();
        atualizarPreviewConfig();

        const btn = document.querySelector('#osir-config-complement-window button:first-of-type');
        if (btn) {
            btn.textContent = '✅ OK';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            setTimeout(() => {
                btn.textContent = '🔄 Atualizar';
                btn.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
            }, TIMINGS.FEEDBACK_BOTAO_TIMEOUT);
        }
    }

    function buscarDados() {
        preencherVlanEPortaWeb();
        preencherComplementoNoFormulario();
        atualizarPreviewConfig();

        const btn = document.querySelector('#osir-config-complement-window button:nth-child(2)');
        if (btn) {
            btn.textContent = '✅ OK';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            setTimeout(() => {
                btn.textContent = '📥 Buscar';
                btn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
            }, TIMINGS.FEEDBACK_BOTAO_TIMEOUT);
        }
    }

    function gerarAutomatico() {
        const dados = getDadosDoFormulario();
        const serialUpper = (dados.serial || '').toUpperCase();

        let modeloAutomatico = 'Bridge';
        if (serialUpper.startsWith('4857') || serialUpper.startsWith('HWTC')) {
            modeloAutomatico = 'Huawei Bridge';
        } else if (serialUpper.startsWith('ZTEG') || serialUpper.startsWith('5A544') || serialUpper.startsWith('ZTEGD')) {
            modeloAutomatico = 'ZTE Bridge';
        } else if (serialUpper.startsWith('RCMG')) {
            modeloAutomatico = 'Raisecom Router';
        }

        const precisaZTE = serialUpper.startsWith('5A544') || serialUpper.startsWith('ZTEGD');

        preencherVlanEPortaWeb();
        preencherComplementoNoFormulario();
        atualizarPreviewConfig();

        // Feedback visual
        const btn = document.querySelector('#osir-config-complement-window button:nth-child(3)');
        if (btn) {
            btn.textContent = '✅ OK';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            setTimeout(() => {
                btn.textContent = '⚡ Auto';
                btn.style.background = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
            }, TIMINGS.FEEDBACK_BOTAO_TIMEOUT);
        }

        // Atualizar checkboxes
        const wifiCheck = document.getElementById('osir-wifi-pro-check');
        const zteCheck = document.getElementById('osir-autentica-zte-check');
        if (wifiCheck) wifiCheck.checked = wifiProState.ativo;
        if (zteCheck) zteCheck.checked = precisaZTE;

        // Atualizar modelo selecionado
        const modelosMap = {
            'Huawei Bridge': 'modelo-huawei-bridge',
            'ZTE Bridge': 'modelo-zte-bridge',
            'Raisecom Router': 'modelo-raisecom-router'
        };
        const modeloId = modelosMap[modeloAutomatico];
        if (modeloId) {
            const modeloRadio = document.getElementById(modeloId);
            if (modeloRadio) modeloRadio.checked = true;
        }
    }

    function limparComplemento() {
        const campoComplemento = getCachedElement('AuthenticationContractComplement');
        if (campoComplemento) {
            campoComplemento.value = '';
            campoComplemento.dispatchEvent(new Event('input', { bubbles: true }));
            campoComplemento.dispatchEvent(new Event('change', { bubbles: true }));
        }

        ['osir-wifi-pro-check', 'osir-autentica-zte-check', 'osir-autentica-rb-check', 'osir-omada-check'].forEach(id => {
            const check = document.getElementById(id);
            if (check) check.checked = false;
        });

        const defaultModelo = document.getElementById('modelo-huawei-bridge');
        if (defaultModelo) defaultModelo.checked = true;

        const preview = document.getElementById('osir-preview-complement');
        if (preview) preview.textContent = 'Selecione um modelo...';

        const vlanDisplay = document.getElementById('osir-vlan-display');
        const portaDisplay = document.getElementById('osir-portaweb-display');
        if (vlanDisplay) vlanDisplay.textContent = '---';
        if (portaDisplay) portaDisplay.textContent = '80';

        const campoVlan = getCachedElement('AuthenticationContractVlan');
        const campoPortaWeb = getCachedElement('AuthenticationContractEquipmentPort');
        if (campoVlan) campoVlan.value = '';
        if (campoPortaWeb) campoPortaWeb.value = '';

        const btn = document.querySelector('#osir-config-complement-window button:nth-child(4)');
        if (btn) {
            btn.textContent = '✅ OK';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            setTimeout(() => {
                btn.textContent = '❌ Limpar';
                btn.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
            }, TIMINGS.FEEDBACK_BOTAO_TIMEOUT);
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

        // Header
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
        btnFechar.addEventListener('click', () => janela.remove());

        header.appendChild(titulo);
        header.appendChild(btnFechar);
        janela.appendChild(header);

        // Info do contrato
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

        // Modelos
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

        // Opções
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
            { id: 'osir-wifi-pro-check', label: '📶 WiFi Pro', checked: wifiProState.ativo },
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
                    wifiProState.ativo = this.checked;
                }
                atualizarPreviewConfig();
            });
        });

        janela.appendChild(opcoesContainer);

        // Info VLAN e Porta Web
        const infoContainer = document.createElement('div');
        infoContainer.style.cssText = `
            background: #f0f4ff;
            padding: 6px 10px;
            border-radius: 4px;
            margin: 6px 0;
            font-size: 10px;
            border: 1px solid #d1d5db;
            display: flex;
            justify-content: space-between;
        `;
        infoContainer.innerHTML = `
            <span>VLAN: <strong id="osir-vlan-display">---</strong></span>
            <span>Porta Web: <strong id="osir-portaweb-display">80</strong></span>
        `;
        janela.appendChild(infoContainer);

        // Preview
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

        // Botões
        const botoesContainer = document.createElement('div');
        botoesContainer.style.cssText = 'display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;';

        const botoes = [
            { label: '🔄', cor: '#8b5cf6', acao: atualizarComplemento },
            { label: '📥', cor: '#3b82f6', acao: buscarDados },
            { label: '⚡', cor: '#dc2626', acao: gerarAutomatico },
            { label: '❌', cor: '#6b7280', acao: limparComplemento }
        ];

        botoes.forEach((btn) => {
            const button = criarBotaoEstilizado(btn.label, btn.cor, btn.acao, { flex: '1', minWidth: '30px' });
            botoesContainer.appendChild(button);
        });

        janela.appendChild(botoesContainer);

        // Atalhos
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
                if (check) { check.checked = !check.checked; wifiProState.ativo = check.checked; atualizarPreviewConfig(); }
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
            const btn = criarBotaoEstilizado(atalho.label, '#e5e7eb', atalho.acao, {
                padding: '3px 8px',
                border: '1px solid #d1d5db',
                fontSize: '9px',
                color: '#374151',
                fontWeight: '600'
            });
            atalhosContainer.appendChild(btn);
        });

        janela.appendChild(atalhosContainer);

        menuContainer.parentNode.insertBefore(janela, menuContainer.nextSibling);
        setTimeout(atualizarPreviewConfig, 100);
    }

    // =========================================================================
    // FILA DE PROVISIONAMENTO - INJEÇÃO DO BOTÃO E REMOÇÃO DO COMPLEMENTAR
    // =========================================================================
    if (window.location.href.includes(URL_ATENDIMENTO)) {

        function removerBotaoComplementar() {
            const botoes = document.querySelectorAll('button');
            for (let btn of botoes) {
                if (btn.textContent?.trim() === 'Complementar') {
                    btn.remove();
                    log('✅ Botão Complementar removido');
                    return true;
                }
            }
            return false;
        }

        function injetarBotaoDinamico() {
            removerBotaoComplementar();

            if (document.getElementById('btn-copiar-osir-nativo')) return;

            let btnChamado = null;
            const todosBotoes = document.querySelectorAll('button, input[type="button"], a, .btn, [role="button"]');

            for (let btn of todosBotoes) {
                const texto = btn.textContent?.trim() || '';
                const id = btn.id || '';
                const href = btn.href || '';

                if (texto === "Chamado" || id === "linkChamado" || href?.includes('new_solicitations')) {
                    btnChamado = btn;
                    break;
                }
            }

            if (!btnChamado) {
                log('⚠️ Botão Chamado não encontrado');
                return;
            }

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
                height: 31px;
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
                    dados.wifiPro = wifiProState.ativo;

                    const stringSecreta = montarStringOSIRDATA(dados);

                    navigator.clipboard.writeText(stringSecreta).then(() => {
                        this.textContent = '✅ OK';
                        this.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                        this.style.boxShadow = '0 2px 6px rgba(16,185,129,0.25)';

                        setTimeout(() => {
                            this.textContent = '📥 Preparar Dados';
                            this.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                            this.style.boxShadow = '0 2px 6px rgba(139,92,246,0.25)';
                        }, 2000);
                    });
                } catch (err) {
                    logError('Erro na captura:', err);
                }
            });

            btnChamado.parentNode.replaceChild(btnPreparar, btnChamado);
            log('✅ Botão Preparar Dados substituiu o Chamado');
        }

        const intervaloInjecao = setInterval(injetarBotaoDinamico, TIMINGS.INJECAO_BOTAO_INTERVAL);
        setTimeout(injetarBotaoDinamico, TIMINGS.INJECAO_BOTAO_DELAY_1);
        setTimeout(injetarBotaoDinamico, TIMINGS.INJECAO_BOTAO_DELAY_2);

        window.addEventListener('beforeunload', () => clearInterval(intervaloInjecao));
    }

    // =========================================================================
    // PÁGINA DO CONTRATO
    // =========================================================================
    if (window.location.href.includes(URL_CONTRATO_VOALLE) ||
        window.location.href.includes(URL_OPERACAO)) {

        setTimeout(verificarDadosEMostrarJanela, TIMINGS.VERIFICAR_DADOS_DELAY_1);
        setTimeout(verificarDadosEMostrarJanela, TIMINGS.VERIFICAR_DADOS_DELAY_2);

        let tentativasJanelaEsquerda = 0;
        const intervaloInjecaoJanelaEsquerda = setInterval(() => {
            tentativasJanelaEsquerda++;

            const menuContainer = document.querySelector('.panel-content .contract-menu');
            if (menuContainer && !document.getElementById('osir-config-complement-window')) {
                criarJanelaConfiguracaoComplemento();
                clearInterval(intervaloInjecaoJanelaEsquerda);
            }

            if (tentativasJanelaEsquerda >= TIMINGS.MAX_TENTATIVAS_JANELA_ESQUERDA) {
                clearInterval(intervaloInjecaoJanelaEsquerda);
            }
        }, TIMINGS.INTERVALO_JANELA_ESQUERDA);

        window.addEventListener('beforeunload', () => clearInterval(intervaloInjecaoJanelaEsquerda));

        // DETECÇÃO DE SALVAMENTO
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

            storage.setJSON(`osir_contrato_salvo_${contratoId}`, {
                salvoEm: new Date().toISOString(),
                status: 'SALVO'
            });

            exibirJanelaContratoSalvo(contratoId, new Date());
        }

        let observerSalvamento = null;

        function iniciarMonitoramentoSalvamento() {
            observerSalvamento = new MutationObserver(() => {
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

            observerSalvamento.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-visible', 'style']
            });
        }

        setTimeout(iniciarMonitoramentoSalvamento, TIMINGS.MONITORAMENTO_SALVAMENTO_DELAY);

        setTimeout(() => {
            const contratoId = obterIdContratoAtual();
            if (contratoId) {
                const dados = storage.getJSON(`osir_contrato_salvo_${contratoId}`);
                if (dados) {
                    const dataSalvo = new Date(dados.salvoEm);
                    const agora = new Date();
                    const diffHoras = (agora - dataSalvo) / (1000 * 60 * 60);

                    if (diffHoras < 24 && !document.getElementById('osir-alerta-salvo')) {
                        exibirJanelaContratoSalvo(contratoId, dataSalvo);
                    }
                }
            }
        }, 3000);

        window.addEventListener('beforeunload', () => {
            if (observerSalvamento) observerSalvamento.disconnect();
        });
    }

    // =========================================================================
    // JANELA DE ALERTA CONTRATO SALVO
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
        `;

        const btnFecharAlerta = document.createElement('button');
        btnFecharAlerta.textContent = '✕';
        btnFecharAlerta.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
        `;
        btnFecharAlerta.addEventListener('click', () => alerta.remove());
        header.appendChild(btnFecharAlerta);

        alerta.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = `padding: 12px 14px 14px 14px;`;
        body.innerHTML = `
            <div style="font-size: 12px; color: #1f2937; font-weight: 600;">
                Contrato #${contratoId} salvo com sucesso!
            </div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 10px;">
                📅 ${dataFormatada}
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
            </div>
        `;

        const btnOk = document.createElement('button');
        btnOk.textContent = 'OK';
        btnOk.style.cssText = `
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
        `;
        btnOk.addEventListener('click', () => alerta.remove());
        btnOk.onmouseover = () => btnOk.style.transform = 'scale(1.04)';
        btnOk.onmouseout = () => btnOk.style.transform = 'scale(1)';

        body.querySelector('div:last-child').appendChild(btnOk);
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

        setTimeout(() => {
            const el = document.getElementById('osir-alerta-salvo');
            if (el) {
                el.style.transition = 'all 0.4s ease';
                el.style.opacity = '0';
                el.style.transform = 'translateY(20px)';
                setTimeout(() => el.remove(), 400);
            }
        }, TIMINGS.ALERTA_SALVO_TIMEOUT);
    }

    // =========================================================================
    // CLEANUP GERAL
    // =========================================================================
    window.addEventListener('beforeunload', () => {
        clearDOMCache();
    });

    // =========================================================================
    // LOGS DE INICIALIZAÇÃO
    // =========================================================================
    log(`🚀 Osir Assistente v${SCRIPT_VERSION}`);
    log('✅ VLAN 2200 para STL_CE_3/4, TTN_LAN, GAR, ROS');
    log('✅ Normalização: STLDC 01→DC 1, STLDC 02→DC 2, PTN_NOVA→PTN');
    log('✅ Botão 📋 para copiar PE+Slot+Porta');
    log('✅ Botão Complementar removido');
    log('✅ Botão Preparar Dados substituiu o Chamado');
    log('✅ VLAN e Porta Web preenchem campos do contrato na janela esquerda');
    log('✅ Cache de DOM, storage seguro, funções unificadas');
    log('✅ Cleanup de intervals/observers no beforeunload');

})();
