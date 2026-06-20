// ==UserScript==
// @name         Osir - Assistente de Provisionamento
// @namespace    http://tampermonkey.net/
// @version      4.0.0
// @description  Com janela de configuração de complemento (RB + OMADA)
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
    // CONFIGURAÇÕES DA JANELA FLUTUANTE
    // =========================================================================
    const CONFIG_JANELA = {
        larguraMin: 280,
        larguraMax: 600,
        larguraPadrao: 400,
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

    // =========================================================================
    // CAPTURAR DADOS DO PROVISIONAMENTO
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
    // JANELA FLUTUANTE DE CONFIGURAÇÃO DO COMPLEMENTO (COM MODELOS + RB + OMADA)
    // =========================================================================
    function criarJanelaConfiguracaoComplemento() {
        // Verifica se já existe
        if (document.getElementById('osir-config-complement-window')) {
            return;
        }

        // Busca o menu de contrato
        const menuContainer = document.querySelector('.panel-content .contract-menu');
        if (!menuContainer) {
            console.log('⚠️ Menu do contrato não encontrado');
            return;
        }

        // Busca o item "Voltar"
        const voltarItem = menuContainer.querySelector('li[data-url=""]');
        if (!voltarItem) {
            console.log('⚠️ Item "Voltar" não encontrado');
            return;
        }

        // Busca informações do contrato
        const contratoId = document.querySelector('.contract-menu')?.getAttribute('data-contractid') || '???';
        const nomeCliente = document.querySelector('.menu-info p')?.textContent?.trim() || 'Cliente não identificado';

        // REMOVE O BOTÃO VERMELHO SE EXISTIR
        const botaoVermelho = document.getElementById('btn-osir-complementar-manual');
        if (botaoVermelho) {
            botaoVermelho.remove();
            console.log('🗑️ Botão vermelho removido!');
        }

        // Cria a janela flutuante
        const janela = document.createElement('div');
        janela.id = 'osir-config-complement-window';
        janela.style.cssText = `
            position: relative;
            margin: 12px 0;
            width: 100%;
            max-width: 500px;
            background: #ffffff;
            border: 2px solid #8b5cf6;
            border-radius: 12px;
            box-shadow: 0 4px 16px rgba(139, 92, 246, 0.15);
            padding: 16px;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 13px;
            transition: all 0.3s ease;
        `;

        // HEADER
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #f3f4f6;
        `;

        const titulo = document.createElement('span');
        titulo.textContent = '⚙️ Configurar Complemento';
        titulo.style.cssText = 'font-weight: bold; font-size: 15px; color: #1f2937;';

        const btnFechar = document.createElement('button');
        btnFechar.textContent = '✕';
        btnFechar.style.cssText = `
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #6b7280;
            padding: 0 4px;
            transition: color 0.2s;
        `;
        btnFechar.onmouseover = () => btnFechar.style.color = '#ef4444';
        btnFechar.onmouseout = () => btnFechar.style.color = '#6b7280';
        btnFechar.onclick = () => janela.remove();

        header.appendChild(titulo);
        header.appendChild(btnFechar);
        janela.appendChild(header);

        // INFORMAÇÕES DO CONTRATO
        const infoContrato = document.createElement('div');
        infoContrato.style.cssText = `
            background: #f8fafc;
            padding: 8px 12px;
            border-radius: 6px;
            margin-bottom: 12px;
            font-size: 12px;
        `;
        infoContrato.innerHTML = `
            <div style="font-weight: 600; color: #1f2937;">📌 CONTRATO #${contratoId}</div>
            <div style="color: #4b5563; font-size: 11px;">${nomeCliente}</div>
        `;
        janela.appendChild(infoContrato);

        // MODELOS
        const modelosLabel = document.createElement('div');
        modelosLabel.style.cssText = `
            font-weight: 600;
            color: #4b5563;
            margin: 10px 0 6px 0;
            font-size: 13px;
        `;
        modelosLabel.textContent = '📋 MODELO DO EQUIPAMENTO';
        janela.appendChild(modelosLabel);

        const modelos = [
            { id: 'huawei-router', label: 'Huawei Router' },
            { id: 'huawei-bridge', label: 'Huawei Bridge' },
            { id: 'raisecom-router', label: 'Raisecom Router' },
            { id: 'raisecom-bridge', label: 'Raisecom Bridge (Desativada)' },
            { id: 'zte-bridge', label: 'ZTE Bridge' },
            { id: 'zte-router', label: 'ZTE Router' }
        ];

        const modelosContainer = document.createElement('div');
        modelosContainer.style.cssText = 'margin-bottom: 12px;';

        modelos.forEach((modelo, index) => {
            const div = document.createElement('div');
            div.style.cssText = `
                display: flex;
                align-items: center;
                padding: 4px 8px;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.2s;
                margin: 1px 0;
            `;
            div.onmouseover = () => div.style.background = '#f3f4f6';
            div.onmouseout = () => div.style.background = 'transparent';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'modelo-equipamento';
            radio.value = modelo.id;
            radio.id = `modelo-${modelo.id}`;
            radio.style.cssText = 'margin-right: 8px; accent-color: #8b5cf6;';
            if (index === 1) radio.checked = true;

            const label = document.createElement('label');
            label.htmlFor = `modelo-${modelo.id}`;
            label.textContent = modelo.label;
            label.style.cssText = 'cursor: pointer; font-size: 13px; color: #1f2937; flex: 1;';

            div.appendChild(radio);
            div.appendChild(label);
            modelosContainer.appendChild(div);

            radio.addEventListener('change', function() {
                if (this.checked) {
                    atualizarPreview();
                }
            });
        });

        janela.appendChild(modelosContainer);

        // OPÇÕES ADICIONAIS
        const opcoesLabel = document.createElement('div');
        opcoesLabel.style.cssText = `
            font-weight: 600;
            color: #4b5563;
            margin: 10px 0 6px 0;
            font-size: 13px;
        `;
        opcoesLabel.textContent = '📋 OPÇÕES ADICIONAIS';
        janela.appendChild(opcoesLabel);

        const opcoesContainer = document.createElement('div');
        opcoesContainer.style.cssText = 'margin-bottom: 12px;';

        // WiFi Pro
        const wifiProDiv = document.createElement('div');
        wifiProDiv.style.cssText = 'display: flex; align-items: center; padding: 4px 8px;';
        const wifiProCheck = document.createElement('input');
        wifiProCheck.type = 'checkbox';
        wifiProCheck.id = 'osir-wifi-pro-check';
        wifiProCheck.style.cssText = 'margin-right: 8px; accent-color: #8b5cf6;';
        wifiProCheck.checked = wifiProAtivo;
        const wifiProLabel = document.createElement('label');
        wifiProLabel.htmlFor = 'osir-wifi-pro-check';
        wifiProLabel.textContent = '📶 Cliente WiFi Pro';
        wifiProLabel.style.cssText = 'cursor: pointer; font-size: 13px; color: #1f2937;';
        wifiProDiv.appendChild(wifiProCheck);
        wifiProDiv.appendChild(wifiProLabel);
        opcoesContainer.appendChild(wifiProDiv);

        wifiProCheck.addEventListener('change', function() {
            salvarEstadoWifiPro(this.checked);
            atualizarPreview();
        });

        // Autentica ZTE
        const zteDiv = document.createElement('div');
        zteDiv.style.cssText = 'display: flex; align-items: center; padding: 4px 8px;';
        const zteCheck = document.createElement('input');
        zteCheck.type = 'checkbox';
        zteCheck.id = 'osir-autentica-zte-check';
        zteCheck.style.cssText = 'margin-right: 8px; accent-color: #8b5cf6;';
        zteCheck.checked = false;
        const zteLabel = document.createElement('label');
        zteLabel.htmlFor = 'osir-autentica-zte-check';
        zteLabel.textContent = '🔐 Autentica na ZTE';
        zteLabel.style.cssText = 'cursor: pointer; font-size: 13px; color: #1f2937;';
        zteDiv.appendChild(zteCheck);
        zteDiv.appendChild(zteLabel);
        opcoesContainer.appendChild(zteDiv);

        zteCheck.addEventListener('change', function() {
            atualizarPreview();
        });

        // Autentica em uma RB (NOVO)
        const rbDiv = document.createElement('div');
        rbDiv.style.cssText = 'display: flex; align-items: center; padding: 4px 8px;';
        const rbCheck = document.createElement('input');
        rbCheck.type = 'checkbox';
        rbCheck.id = 'osir-autentica-rb-check';
        rbCheck.style.cssText = 'margin-right: 8px; accent-color: #8b5cf6;';
        rbCheck.checked = false;
        const rbLabel = document.createElement('label');
        rbLabel.htmlFor = 'osir-autentica-rb-check';
        rbLabel.textContent = '🔄 Autentica em uma RB';
        rbLabel.style.cssText = 'cursor: pointer; font-size: 13px; color: #1f2937;';
        rbDiv.appendChild(rbCheck);
        rbDiv.appendChild(rbLabel);
        opcoesContainer.appendChild(rbDiv);

        rbCheck.addEventListener('change', function() {
            atualizarPreview();
        });

        // EAPs configurados no OMADA (NOVO)
        const omadaDiv = document.createElement('div');
        omadaDiv.style.cssText = 'display: flex; align-items: center; padding: 4px 8px;';
        const omadaCheck = document.createElement('input');
        omadaCheck.type = 'checkbox';
        omadaCheck.id = 'osir-omada-check';
        omadaCheck.style.cssText = 'margin-right: 8px; accent-color: #8b5cf6;';
        omadaCheck.checked = false;
        const omadaLabel = document.createElement('label');
        omadaLabel.htmlFor = 'osir-omada-check';
        omadaLabel.textContent = '📶 EAPs configurados no OMADA';
        omadaLabel.style.cssText = 'cursor: pointer; font-size: 13px; color: #1f2937;';
        omadaDiv.appendChild(omadaCheck);
        omadaDiv.appendChild(omadaLabel);
        opcoesContainer.appendChild(omadaDiv);

        omadaCheck.addEventListener('change', function() {
            atualizarPreview();
        });

        janela.appendChild(opcoesContainer);

        // PREVIEW
        const previewLabel = document.createElement('div');
        previewLabel.style.cssText = `
            font-weight: 600;
            color: #4b5563;
            margin: 10px 0 6px 0;
            font-size: 13px;
        `;
        previewLabel.textContent = '📝 PREVIEW DO COMPLEMENTO';
        janela.appendChild(previewLabel);

        const previewBox = document.createElement('div');
        previewBox.id = 'osir-preview-complement';
        previewBox.style.cssText = `
            background: #f3f4f6;
            padding: 10px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            color: #1f2937;
            min-height: 40px;
            word-break: break-all;
            max-height: 80px;
            overflow-y: auto;
            margin-bottom: 12px;
            border: 1px solid #e5e7eb;
        `;
        previewBox.textContent = 'Selecione um modelo e opções...';
        janela.appendChild(previewBox);

        // BOTÕES
        const botoesContainer = document.createElement('div');
        botoesContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;';

        // BOTÃO ATUALIZAR
        const btnAtualizar = document.createElement('button');
        btnAtualizar.textContent = '🔄 Atualizar';
        btnAtualizar.style.cssText = `
            flex: 1;
            padding: 8px 12px;
            background: #8b5cf6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
            transition: background 0.2s;
            min-width: 80px;
        `;
        btnAtualizar.onmouseover = () => btnAtualizar.style.background = '#7c3aed';
        btnAtualizar.onmouseout = () => btnAtualizar.style.background = '#8b5cf6';
        btnAtualizar.onclick = atualizarComplemento;

        // BOTÃO BUSCAR DADOS
        const btnBuscar = document.createElement('button');
        btnBuscar.textContent = '📥 Buscar Dados';
        btnBuscar.style.cssText = `
            flex: 1;
            padding: 8px 12px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
            transition: background 0.2s;
            min-width: 80px;
        `;
        btnBuscar.onmouseover = () => btnBuscar.style.background = '#2563eb';
        btnBuscar.onmouseout = () => btnBuscar.style.background = '#3b82f6';
        btnBuscar.onclick = buscarDados;

        // BOTÃO AUTOMÁTICO
        const btnAutomatico = document.createElement('button');
        btnAutomatico.textContent = '⚡ Automático';
        btnAutomatico.style.cssText = `
            flex: 1;
            padding: 8px 12px;
            background: #dc2626;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
            transition: background 0.2s;
            min-width: 80px;
        `;
        btnAutomatico.onmouseover = () => btnAutomatico.style.background = '#b91c1c';
        btnAutomatico.onmouseout = () => btnAutomatico.style.background = '#dc2626';
        btnAutomatico.onclick = gerarAutomatico;

        // BOTÃO LIMPAR
        const btnLimpar = document.createElement('button');
        btnLimpar.textContent = '❌ Limpar';
        btnLimpar.style.cssText = `
            flex: 1;
            padding: 8px 12px;
            background: #6b7280;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
            transition: background 0.2s;
            min-width: 80px;
        `;
        btnLimpar.onmouseover = () => btnLimpar.style.background = '#4b5563';
        btnLimpar.onmouseout = () => btnLimpar.style.background = '#6b7280';
        btnLimpar.onclick = limparComplemento;

        botoesContainer.appendChild(btnAtualizar);
        botoesContainer.appendChild(btnBuscar);
        botoesContainer.appendChild(btnAutomatico);
        botoesContainer.appendChild(btnLimpar);
        janela.appendChild(botoesContainer);

        // ATALHOS RÁPIDOS
        const atalhosLabel = document.createElement('div');
        atalhosLabel.style.cssText = `
            font-weight: 600;
            color: #4b5563;
            margin: 6px 0 6px 0;
            font-size: 12px;
        `;
        atalhosLabel.textContent = '⚡ Atalhos:';
        janela.appendChild(atalhosLabel);

        const atalhosContainer = document.createElement('div');
        atalhosContainer.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;';

        const atalhos = [
            { id: 'atalho-wifi', label: 'WiFi Pro', acao: () => {
                wifiProCheck.checked = !wifiProCheck.checked;
                salvarEstadoWifiPro(wifiProCheck.checked);
                atualizarPreview();
            }},
            { id: 'atalho-zte', label: 'ZTE', acao: () => {
                zteCheck.checked = !zteCheck.checked;
                atualizarPreview();
            }},
            { id: 'atalho-rb', label: 'RB', acao: () => {
                rbCheck.checked = !rbCheck.checked;
                atualizarPreview();
            }},
            { id: 'atalho-omada', label: 'OMADA', acao: () => {
                omadaCheck.checked = !omadaCheck.checked;
                atualizarPreview();
            }}
        ];

        atalhos.forEach(atalho => {
            const btn = document.createElement('button');
            btn.textContent = atalho.label;
            btn.style.cssText = `
                padding: 4px 12px;
                background: #e5e7eb;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                color: #374151;
                transition: background 0.2s;
                font-weight: 500;
            `;
            btn.onmouseover = () => btn.style.background = '#d1d5db';
            btn.onmouseout = () => btn.style.background = '#e5e7eb';
            btn.onclick = atalho.acao;
            atalhosContainer.appendChild(btn);
        });

        janela.appendChild(atalhosContainer);

        // Insere a janela após o menu
        menuContainer.parentNode.insertBefore(janela, menuContainer.nextSibling);

        // Atualiza o preview inicial
        setTimeout(atualizarPreview, 100);

        console.log('✅ Janela de configuração criada!');
        console.log('🗑️ Botão vermelho removido!');
    }

    // =========================================================================
    // FUNÇÕES DA JANELA DE CONFIGURAÇÃO
    // =========================================================================

    function getModeloLabel() {
        const selected = document.querySelector('input[name="modelo-equipamento"]:checked');
        if (!selected) return 'Bridge';
        const modelosMap = {
            'huawei-router': 'Huawei Router',
            'huawei-bridge': 'Huawei Bridge',
            'raisecom-router': 'Raisecom Router',
            'raisecom-bridge': 'Raisecom Bridge (Desativada)',
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

        console.log('📊 Dados do formulário:', {
            serial, slot, porta, id, ssid, senha, splitter, portaSplitter
        });

        return { serial, slot, porta, id, ssid, senha, splitter, portaSplitter };
    }

    function montarComplemento() {
        const modelo = getModeloLabel();
        const dados = getDadosDoFormulario();
        const wifiPro = document.getElementById('osir-wifi-pro-check')?.checked || false;
        const autenticaZTE = document.getElementById('osir-autentica-zte-check')?.checked || false;
        const autenticaRB = document.getElementById('osir-autentica-rb-check')?.checked || false;
        const omada = document.getElementById('osir-omada-check')?.checked || false;

        // 🔥 PEGA O COMPLEMENTO ATUAL COMPLETO
        const campoComplemento = document.getElementById('AuthenticationContractComplement');
        let complementoAtual = campoComplemento?.value || '';

        console.log('📝 Complemento atual:', complementoAtual);

        // 🔥 EXTRAI SSID E SENHA DO COMPLEMENTO ATUAL (se existirem)
        let ssidPreservado = '';
        let senhaPreservada = '';
        let outrosDados = [];

        // Divide o complemento em partes
        const partesAtuais = complementoAtual.split('||').map(p => p.trim());

        // Para cada parte, verifica o que é
        partesAtuais.forEach(parte => {
            // Verifica se é SSID
            if (parte.includes('SSID:')) {
                const match = parte.match(/SSID:\s*([^|]+?)(?:\s+Senha:|$)/);
                if (match) ssidPreservado = match[1].trim();

                // Se tiver Senha junto com SSID
                const senhaMatch = parte.match(/Senha:\s*([^|]+)/);
                if (senhaMatch) senhaPreservada = senhaMatch[1].trim();
            }
            // Verifica se é Senha (isolada)
            else if (parte.includes('Senha:') && !parte.includes('SSID:')) {
                const match = parte.match(/Senha:\s*([^|]+)/);
                if (match) senhaPreservada = match[1].trim();
            }
            // Verifica se é observação ou informação extra
            else if (!parte.includes('SN:') &&
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
                     parte !== '' &&
                     !parte.includes('XX - Porta XX')) {
                // É uma informação extra (observação, etc)
                if (parte.trim() !== '') {
                    outrosDados.push(parte.trim());
                }
            }
        });

        // Se não encontrou SSID no complemento, tenta do formulário
        if (!ssidPreservado) {
            ssidPreservado = document.getElementById('AuthenticationContractWifiName')?.value?.trim() || '';
        }

        // Se não encontrou Senha no complemento, tenta do formulário
        if (!senhaPreservada) {
            senhaPreservada = document.getElementById('AuthenticationContractWifiPassword')?.value?.trim() || '';
        }

        console.log('📝 SSID preservado:', ssidPreservado);
        console.log('📝 Senha preservada:', senhaPreservada);
        console.log('📝 Observações preservadas:', outrosDados);

        // ============================================
        // MONTA O NOVO COMPLEMENTO
        // ============================================
        let partes = [];

        // 1. WiFi Pro
        if (wifiPro) {
            partes.push('Cliente Wifi Pro');
        }

        // 2. Modelo
        partes.push(modelo);

        // 3. Serial
        if (dados.serial && dados.serial !== 'XX') {
            partes.push(`SN: ${dados.serial}`);
        }

        // 4. Autentica na ZTE
        if (autenticaZTE) {
            partes.push('Autentica na ZTE');
        }

        // 5. Autentica em uma RB
        if (autenticaRB) {
            partes.push('Autentica em uma RB');
        }

        // 6. EAPs configurados no OMADA
        if (omada) {
            partes.push('EAPs configurados no OMADA');
        }

        // 7. Splitter (com formato correto)
        if (dados.splitter && dados.splitter !== '') {
            const portaSplitter = dados.portaSplitter && dados.portaSplitter !== ''
                ? dados.portaSplitter.padStart(2, '0')
                : 'XX';
            partes.push(`Splitter: ${dados.splitter} Porta: ${portaSplitter}`);
        } else {
            partes.push('XX - Porta XX');
        }

        // 8. Slot, Porta, ID
        if (dados.slot && dados.porta && dados.id) {
            const portaFormatada = dados.porta.padStart(2, '0');
            partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${portaFormatada} ID: ${dados.id}`);
        }

        // 9. SSID (se existir)
        if (ssidPreservado && ssidPreservado !== '') {
            if (senhaPreservada && senhaPreservada !== '') {
                partes.push(`SSID: ${ssidPreservado} Senha: ${senhaPreservada}`);
            } else {
                partes.push(`SSID: ${ssidPreservado}`);
            }
        }
        // 10. Senha (se existir sem SSID)
        else if (senhaPreservada && senhaPreservada !== '') {
            partes.push(`Senha: ${senhaPreservada}`);
        }

        // 11. Observações e informações extras (preservadas)
        if (outrosDados.length > 0) {
            outrosDados.forEach(obs => {
                if (obs && obs.trim() !== '') {
                    partes.push(obs.trim());
                }
            });
        }

        // Remove duplicatas e monta o resultado
        const resultado = partes.join(' || ');

        // Limpa duplicatas de "||" e espaços extras
        const resultadoLimpo = resultado
            .replace(/\|\|\s*\|\|/g, '||')
            .replace(/^\s*\|\|\s*/, '')
            .replace(/\s*\|\|\s*$/, '')
            .trim();

        console.log('📝 Novo complemento gerado:', resultadoLimpo);

        return resultadoLimpo;
    }

    function atualizarPreview() {
        const preview = document.getElementById('osir-preview-complement');
        if (preview) {
            const complemento = montarComplemento();
            preview.textContent = complemento || 'Nenhum dado disponível';
        }
    }

    function atualizarComplemento() {
        const campoComplemento = document.getElementById('AuthenticationContractComplement');
        if (!campoComplemento) {
            alert('❌ Campo complementar não encontrado!');
            return;
        }

        const complemento = montarComplemento();
        campoComplemento.value = complemento;
        campoComplemento.dispatchEvent(new Event('input', { bubbles: true }));
        campoComplemento.dispatchEvent(new Event('change', { bubbles: true }));

        // Feedback visual
        const btn = document.querySelector('#osir-config-complement-window button:first-of-type');
        if (btn) {
            btn.textContent = '✅ Atualizado!';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.textContent = '🔄 Atualizar';
                btn.style.background = '#8b5cf6';
            }, 2000);
        }

        atualizarPreview();
        console.log('✅ Complemento atualizado!');
    }

    function buscarDados() {
        // Pega os dados atualizados do formulário
        const dados = getDadosDoFormulario();

        // Atualiza o preview
        atualizarPreview();

        // Feedback visual
        const btn = document.querySelector('#osir-config-complement-window button:nth-child(2)');
        if (btn) {
            btn.textContent = '✅ Atualizado!';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.textContent = '📥 Buscar Dados';
                btn.style.background = '#3b82f6';
            }, 2000);
        }

        console.log('📊 Dados buscados do formulário:', dados);
    }

    function gerarAutomatico() {
        // SIMULA O COMPORTAMENTO DO BOTÃO VERMELHO
        const campoComplemento = document.getElementById('AuthenticationContractComplement');
        if (!campoComplemento) {
            alert('❌ Campo complementar não encontrado!');
            return;
        }

        // Pega os dados do formulário
        const dados = getDadosDoFormulario();

        // Detecta o modelo automaticamente
        let modeloAutomatico = 'Bridge';
        const serial = dados.serial || '';
        const serialUpper = serial.toUpperCase();

        if (serialUpper.startsWith('4857') || serialUpper.startsWith('HWTC')) {
            modeloAutomatico = 'Huawei Bridge';
        } else if (serialUpper.startsWith('ZTEG') || serialUpper.startsWith('5A544') || serialUpper.startsWith('ZTEGD')) {
            modeloAutomatico = 'ZTE Bridge';
        } else if (serialUpper.startsWith('RCMG')) {
            modeloAutomatico = 'Raisecom Bridge';
        }

        // Detecta se precisa autenticar na ZTE
        const precisaZTE = serialUpper.startsWith('5A544') || serialUpper.startsWith('ZTEGD');

        // Detecta WiFi Pro (do localStorage)
        const wifiPro = wifiProAtivo;

        // NOTA: RB e OMADA NÃO são adicionados automaticamente
        // Pois dependem de decisão manual do técnico

        // 🔥 EXTRAI SSID E SENHA DO COMPLEMENTO ATUAL
        let ssidPreservado = '';
        let senhaPreservada = '';
        let complementoAtual = campoComplemento.value || '';

        // Procura por SSID no complemento atual
        const matchSSID = complementoAtual.match(/SSID:\s*([^|]+?)(?:\s+Senha:|$)/);
        if (matchSSID) {
            ssidPreservado = matchSSID[1].trim();
            const senhaMatch = complementoAtual.match(/Senha:\s*([^|]+)/);
            if (senhaMatch) senhaPreservada = senhaMatch[1].trim();
        }

        // Se não encontrou, tenta do formulário
        if (!ssidPreservado) {
            ssidPreservado = dados.ssid || '';
        }
        if (!senhaPreservada) {
            senhaPreservada = dados.senha || '';
        }

        // Monta o complemento automático
        let partes = [];

        if (wifiPro) {
            partes.push('Cliente Wifi Pro');
        }

        partes.push(modeloAutomatico);

        if (dados.serial && dados.serial !== 'XX') {
            partes.push(`SN: ${dados.serial}`);
        }

        if (precisaZTE) {
            partes.push('Autentica na ZTE');
        }

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

        // SSID e Senha (PRESERVADOS)
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

        // Atualiza o campo
        campoComplemento.value = complementoAutomatico;
        campoComplemento.dispatchEvent(new Event('input', { bubbles: true }));
        campoComplemento.dispatchEvent(new Event('change', { bubbles: true }));

        // Atualiza o preview
        atualizarPreview();

        // Feedback visual
        const btn = document.querySelector('#osir-config-complement-window button:nth-child(3)');
        if (btn) {
            btn.textContent = '✅ Gerado!';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.textContent = '⚡ Automático';
                btn.style.background = '#dc2626';
            }, 2000);
        }

        // Marca as opções correspondentes
        const wifiCheck = document.getElementById('osir-wifi-pro-check');
        const zteCheck = document.getElementById('osir-autentica-zte-check');
        if (wifiCheck) wifiCheck.checked = wifiPro;
        if (zteCheck) zteCheck.checked = precisaZTE;

        // Seleciona o modelo correspondente
        const modelosMap = {
            'Huawei Bridge': 'modelo-huawei-bridge',
            'ZTE Bridge': 'modelo-zte-bridge',
            'Raisecom Bridge': 'modelo-raisecom-bridge',
            'Huawei Router': 'modelo-huawei-router',
            'ZTE Router': 'modelo-zte-router',
            'Raisecom Router': 'modelo-raisecom-router'
        };
        const modeloId = modelosMap[modeloAutomatico];
        if (modeloId) {
            const modeloRadio = document.getElementById(modeloId);
            if (modeloRadio) modeloRadio.checked = true;
        }

        console.log('⚡ Gerado automaticamente:', complementoAutomatico);
    }

    function limparComplemento() {
        const campoComplemento = document.getElementById('AuthenticationContractComplement');
        if (campoComplemento) {
            campoComplemento.value = '';
            campoComplemento.dispatchEvent(new Event('input', { bubbles: true }));
            campoComplemento.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Limpa as opções
        const wifiCheck = document.getElementById('osir-wifi-pro-check');
        const zteCheck = document.getElementById('osir-autentica-zte-check');
        const rbCheck = document.getElementById('osir-autentica-rb-check');
        const omadaCheck = document.getElementById('osir-omada-check');

        if (wifiCheck) wifiCheck.checked = false;
        if (zteCheck) zteCheck.checked = false;
        if (rbCheck) rbCheck.checked = false;
        if (omadaCheck) omadaCheck.checked = false;

        // Reseta modelo para Huawei Bridge
        const defaultModelo = document.getElementById('modelo-huawei-bridge');
        if (defaultModelo) defaultModelo.checked = true;

        atualizarPreview();

        // Feedback
        const btn = document.querySelector('#osir-config-complement-window button:nth-child(4)');
        if (btn) {
            btn.textContent = '✅ Limpo!';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.textContent = '❌ Limpar';
                btn.style.background = '#6b7280';
            }, 2000);
        }
    }

    // =========================================================================
    // REMOVER BOTÃO VERMELHO EXISTENTE
    // =========================================================================
    function removerBotaoVermelho() {
        const botao = document.getElementById('btn-osir-complementar-manual');
        if (botao) {
            botao.remove();
            console.log('🗑️ Botão vermelho removido da tela!');
        }
    }

    // =========================================================================
    // INJEÇÃO DA JANELA NA PÁGINA DO CONTRATO
    // =========================================================================
    if (window.location.href.includes(URL_CONTRATO_VOALLE) ||
        window.location.href.includes(URL_OPERACAO)) {

        // Remove o botão vermelho se existir
        removerBotaoVermelho();

        // Tenta injetar a janela várias vezes
        let tentativas = 0;
        const maxTentativas = 15;
        const intervaloInjecao = setInterval(() => {
            tentativas++;

            // Remove o botão vermelho novamente (caso apareça)
            removerBotaoVermelho();

            // Tenta criar a janela
            const menuContainer = document.querySelector('.panel-content .contract-menu');
            if (menuContainer) {
                criarJanelaConfiguracaoComplemento();
                clearInterval(intervaloInjecao);
                console.log(`✅ Janela criada após ${tentativas} tentativas`);
            }

            if (tentativas >= maxTentativas) {
                clearInterval(intervaloInjecao);
                console.log('⚠️ Não foi possível criar a janela após várias tentativas');
            }
        }, 1000);

        // Tenta novamente após 3 e 5 segundos
        setTimeout(() => {
            removerBotaoVermelho();
            criarJanelaConfiguracaoComplemento();
        }, 3000);

        setTimeout(() => {
            removerBotaoVermelho();
            criarJanelaConfiguracaoComplemento();
        }, 5000);
    }

    // =========================================================================
    // BOTÃO NA FILA DE PROVISIONAMENTO
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
                    dados.wifiPro = wifiProAtivo;

                    const stringSecreta = montarStringOSIRDATA(dados);

                    navigator.clipboard.writeText(stringSecreta).then(() => {
                        const statusTelefonia = dados.telefonia.temTelefonia ? '📞' : '';
                        const statusWifi = wifiProAtivo ? '📶' : '';
                        const statusSinal = dados.sinal && dados.sinal !== "" ? '📡' : '';
                        btnPreparar.textContent = `✅ ${statusTelefonia} ${statusWifi} ${statusSinal}`;
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
                            <div style="font-size: 10px; opacity: 0.8;">Contrato: ${dados.contrato || "Nenhum"}</div>
                            ${dados.telefonia.temTelefonia ? '<div style="font-size: 10px; color: #34d399;">📞 Com Telefonia</div>' : ''}
                            ${wifiProAtivo ? '<div style="font-size: 10px; color: #60a5fa;">📶 WiFi Pro</div>' : ''}
                            ${dados.sinal && dados.sinal !== "" ? `<div style="font-size: 10px; color: #22c55e;">📡 Sinal: ${dados.sinal} dBm</div>` : ''}
                            <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">📋 Dados copiados para o clipboard</div>
                        `;
                        document.body.appendChild(notificacao);

                        setTimeout(() => {
                            notificacao.remove();
                            btnPreparar.textContent = '📥 Preparar Dados';
                            btnPreparar.style.backgroundColor = '#8b5cf6';
                        }, 4000);
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

    console.log('🚀 Osir Assistente v5.1.0 carregado!');
    console.log('✅ Botão vermelho removido e integrado à janela!');
    console.log('✅ SSID e Senha são PRESERVADOS automaticamente!');
    console.log('✅ Novas opções: Autentica em uma RB + EAPs no OMADA!');
    console.log('📋 Janela flutuante com todos os modelos e opções!');
})();
