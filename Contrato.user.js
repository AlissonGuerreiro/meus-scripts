// ==UserScript==
// @name         Contrato - Janela com Controles de Tamanho
// @namespace    http://tampermonkey.net/
// @version      19.0
// @description  Janela flutuante com botões para ajustar tamanho
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
        passo: 20  // Quantos pixels aumenta/diminui
    };

    // Estado atual da janela
    let estadoJanela = {
        largura: CONFIG_JANELA.larguraPadrao,
        altura: CONFIG_JANELA.alturaPadrao,
        fonte: CONFIG_JANELA.fontePadrao
    };

    // =========================================================================
    // FUNÇÃO PARA REDIMENSIONAR A JANELA FLUTUANTE
    // =========================================================================
    function redimensionarJanela(deltaLargura, deltaAltura, deltaFonte) {
        const janela = document.getElementById('osir-floating-window');
        if (!janela) return;

        // Atualiza estado
        estadoJanela.largura = Math.max(
            CONFIG_JANELA.larguraMin,
            Math.min(CONFIG_JANELA.larguraMax, estadoJanela.largura + deltaLargura)
        );
        estadoJanela.altura = Math.max(
            CONFIG_JANELA.alturaMin,
            Math.min(CONFIG_JANELA.alturaMax, estadoJanela.altura + deltaAltura)
        );
        estadoJanela.fonte = Math.max(
            CONFIG_JANELA.fonteMin,
            Math.min(CONFIG_JANELA.fonteMax, estadoJanela.fonte + deltaFonte)
        );

        // Aplica os novos tamanhos
        janela.style.width = estadoJanela.largura + 'px';
        janela.style.maxHeight = estadoJanela.altura + 'px';
        janela.style.fontSize = estadoJanela.fonte + 'px';

        // Ajusta o tamanho da fonte dos elementos
        const previewTexto = janela.querySelector('.osir-preview-texto');
        if (previewTexto) {
            previewTexto.style.fontSize = Math.round(estadoJanela.fonte * 0.85) + 'px';
        }

        const sizeDisplay = document.getElementById('osir-size-display');
        if (sizeDisplay) {
            sizeDisplay.textContent = `${estadoJanela.largura}×${estadoJanela.altura}`;
        }

        console.log(`📐 Janela redimensionada: ${estadoJanela.largura}×${estadoJanela.altura}, fonte: ${estadoJanela.fonte}px`);
    }

    // =========================================================================
    // FUNÇÃO PARA SALVAR PREFERÊNCIAS
    // =========================================================================
    function salvarPreferencias() {
        try {
            localStorage.setItem('osir_janela_flutuante_prefs', JSON.stringify(estadoJanela));
        } catch (e) {
            console.warn('Não foi possível salvar preferências');
        }
    }

    function carregarPreferencias() {
        try {
            const dados = localStorage.getItem('osir_janela_flutuante_prefs');
            if (dados) {
                const prefs = JSON.parse(dados);
                estadoJanela.largura = prefs.largura || CONFIG_JANELA.larguraPadrao;
                estadoJanela.altura = prefs.altura || CONFIG_JANELA.alturaPadrao;
                estadoJanela.fonte = prefs.fonte || CONFIG_JANELA.fontePadrao;
                console.log('✅ Preferências carregadas:', estadoJanela);
            }
        } catch (e) {
            console.warn('Não foi possível carregar preferências');
        }
    }

    // Carrega preferências ao iniciar
    carregarPreferencias();

    // =========================================================================
    // FUNÇÃO AUXILIAR: CALCULO INTELIGENTE DE VLAN
    // =========================================================================
    function calcularVlanOsir(pontoAcesso, slotStr, portaStr) {
        const pa = (pontoAcesso || "").toUpperCase();

        if (pa.includes("STL_CE3_R") || pa.includes("STL_CE4_R") || pa.includes("TTN_LAN") || pa.includes("GAR")) {
            return "2200";
        }

        const slot = parseInt(slotStr, 10);
        const porta = parseInt(portaStr, 10);

        if (isNaN(slot) || isNaN(porta)) return "XX";

        if (slot === 0) {
            return (porta + 10).toString();
        }

        const portaFormatada = porta < 10 ? "0" + porta : porta.toString();
        return slot.toString() + portaFormatada;
    }

    // =========================================================================
    // FUNÇÃO PARA DETERMINAR TIPO DE EQUIPAMENTO
    // =========================================================================
    function determinarTipoEquipamento(tipoProvisionamento, serial) {
        const tipo = (tipoProvisionamento || "").toLowerCase().trim();
        const serialUpper = (serial || "").toUpperCase();

        if (tipo === "r") {
            if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A54")) {
                return "ZTE Router";
            } else if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) {
                return "Huawei Router";
            } else if (serialUpper.startsWith("RCMG")) {
                return "Raisecom Router";
            }
            return "Router";
        }
        
        if (tipo === "b") {
            if (serialUpper.startsWith("ZTEG") || serialUpper.startsWith("5A544") || serialUpper.startsWith("ZTEGD")) {
                return "ZTE Bridge";
            } else if (serialUpper.startsWith("4857") || serialUpper.startsWith("HWTC")) {
                return "Huawei Bridge";
            }
            return "Bridge";
        }

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
    // FUNÇÃO PARA CAPTURAR DADOS DE TELEFONIA
    // =========================================================================
    function capturarDadosTelefonia() {
        const dadosTelefonia = {
            temTelefonia: false,
            numero: '',
            senha: '',
            ip: '',
            dadosCompletos: false
        };

        const inputNumero = document.getElementById('numeroTelefone01');
        if (inputNumero && inputNumero.value && inputNumero.value.trim() !== '') {
            dadosTelefonia.temTelefonia = true;
            dadosTelefonia.numero = inputNumero.value.trim();
        }

        const inputSenha = document.getElementById('senhaTelefone');
        if (inputSenha && inputSenha.value && inputSenha.value.trim() !== '') {
            dadosTelefonia.senha = inputSenha.value.trim();
        }

        const inputIp = document.getElementById('ipGerencia');
        if (inputIp && inputIp.value && inputIp.value.trim() !== '') {
            dadosTelefonia.ip = inputIp.value.trim();
        }

        if (dadosTelefonia.temTelefonia && dadosTelefonia.numero && dadosTelefonia.senha) {
            dadosTelefonia.dadosCompletos = true;
        }

        return dadosTelefonia;
    }

    // =========================================================================
    // FUNÇÃO PARA MONTAR O COMPLEMENTO
    // =========================================================================
    function montarComplemento(dados, tipoEquip, vlanFinal) {
        let partes = [];

        let equipamento = tipoEquip;
        if (dados.telefonia && dados.telefonia.temTelefonia) {
            equipamento += " + Telefonia";
        }
        partes.push(equipamento);

        partes.push(`SN: ${dados.serial}`);
        partes.push("Autentica na ZTE");
        partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${dados.porta} ID: ${dados.id}`);
        partes.push(`SSID: ${dados.ssid} - Senha: ${dados.senha}`);

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
    // FUNÇÃO PARA CAPTURAR O TIPO PROVISIONAMENTO (b/r)
    // =========================================================================
    function capturarTipoProvisionamento() {
        let input = document.getElementById('tipoProvisionamento');
        if (input && input.value) {
            return input.value.toLowerCase().trim();
        }

        const inputsByName = document.querySelectorAll('input[name="tipoProvisionamento"]');
        for (let inp of inputsByName) {
            if (inp.value) {
                return inp.value.toLowerCase().trim();
            }
        }

        const todosInputs = document.querySelectorAll('input');
        for (let inp of todosInputs) {
            const id = (inp.id || "").toLowerCase();
            const name = (inp.name || "").toLowerCase();
            if ((id.includes('tipo') || name.includes('tipo')) && inp.value) {
                const valor = inp.value.toLowerCase().trim();
                if (valor === 'b' || valor === 'r') {
                    return valor;
                }
            }
        }

        return '';
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
        
        const textoPagina = document.body.innerText;
        const matchTexto = textoPagina.match(/Contrato\s*[#:]\s*(\d+)/i);
        if (matchTexto && matchTexto[1]) {
            return matchTexto[1].trim();
        }
        
        return null;
    }

    // =========================================================================
    // FUNÇÃO PARA CRIAR A JANELA FLUTUANTE COM CONTROLES
    // =========================================================================
    function criarJanelaFlutuante(dados, contratoAtual) {
        const contratoCopiado = dados.contrato;
        
        if (contratoCopiado && contratoAtual && contratoCopiado !== contratoAtual) {
            console.log(`🔴 Contrato diferente`);
            return;
        }

        const janelaExistente = document.getElementById('osir-floating-window');
        if (janelaExistente) {
            janelaExistente.remove();
        }

        const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
        const complementoPreview = montarComplemento(dados, tipoEquip, dados.vlan);

        // =============================================================
        // CRIA A JANELA PRINCIPAL
        // =============================================================
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

        // =============================================================
        // CABEÇALHO COM CONTROLES DE TAMANHO
        // =============================================================
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

        // Título
        const titulo = document.createElement('span');
        titulo.textContent = `📋 Contrato #${contratoCopiado || '???'}`;
        titulo.style.cssText = `
            font-weight: bold;
            font-size: ${Math.round(estadoJanela.fonte * 1.1)}px;
            color: #1f2937;
            flex: 1;
        `;

        // Grupo de controles
        const grupoControles = document.createElement('div');
        grupoControles.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
        `;

        // Botão Diminuir (-)
        const btnMenos = document.createElement('button');
        btnMenos.textContent = '−';
        btnMenos.title = 'Diminuir janela';
        btnMenos.style.cssText = `
            background: #e5e7eb;
            border: none;
            border-radius: 4px;
            padding: 2px 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 16px;
            color: #374151;
            transition: background 0.2s;
            line-height: 1.2;
        `;
        btnMenos.onmouseover = () => btnMenos.style.background = '#d1d5db';
        btnMenos.onmouseout = () => btnMenos.style.background = '#e5e7eb';
        btnMenos.onclick = () => {
            redimensionarJanela(-CONFIG_JANELA.passo, -CONFIG_JANELA.passo, -1);
            salvarPreferencias();
        };

        // Display de tamanho
        const sizeDisplay = document.createElement('span');
        sizeDisplay.id = 'osir-size-display';
        sizeDisplay.textContent = `${estadoJanela.largura}×${estadoJanela.altura}`;
        sizeDisplay.style.cssText = `
            font-size: ${Math.round(estadoJanela.fonte * 0.7)}px;
            color: #6b7280;
            padding: 0 4px;
            min-width: 55px;
            text-align: center;
            font-family: monospace;
        `;

        // Botão Aumentar (+)
        const btnMais = document.createElement('button');
        btnMais.textContent = '+';
        btnMais.title = 'Aumentar janela';
        btnMais.style.cssText = `
            background: #e5e7eb;
            border: none;
            border-radius: 4px;
            padding: 2px 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 16px;
            color: #374151;
            transition: background 0.2s;
            line-height: 1.2;
        `;
        btnMais.onmouseover = () => btnMais.style.background = '#d1d5db';
        btnMais.onmouseout = () => btnMais.style.background = '#e5e7eb';
        btnMais.onclick = () => {
            redimensionarJanela(CONFIG_JANELA.passo, CONFIG_JANELA.passo, 1);
            salvarPreferencias();
        };

        // Separador
        const sep = document.createElement('span');
        sep.textContent = '|';
        sep.style.cssText = `color: #d1d5db; padding: 0 2px;`;

        // Botão Reset
        const btnReset = document.createElement('button');
        btnReset.textContent = '↺';
        btnReset.title = 'Resetar tamanho padrão';
        btnReset.style.cssText = `
            background: #e5e7eb;
            border: none;
            border-radius: 4px;
            padding: 2px 8px;
            cursor: pointer;
            font-weight: bold;
            font-size: 16px;
            color: #374151;
            transition: background 0.2s;
            line-height: 1.2;
        `;
        btnReset.onmouseover = () => btnReset.style.background = '#d1d5db';
        btnReset.onmouseout = () => btnReset.style.background = '#e5e7eb';
        btnReset.onclick = () => {
            estadoJanela.largura = CONFIG_JANELA.larguraPadrao;
            estadoJanela.altura = CONFIG_JANELA.alturaPadrao;
            estadoJanela.fonte = CONFIG_JANELA.fontePadrao;
            redimensionarJanela(0, 0, 0);
            salvarPreferencias();
        };

        // Botão Fechar
        const btnFechar = document.createElement('button');
        btnFechar.textContent = '✕';
        btnFechar.title = 'Fechar janela';
        btnFechar.style.cssText = `
            background: #ef4444;
            border: none;
            border-radius: 4px;
            padding: 2px 10px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            color: white;
            transition: background 0.2s;
            line-height: 1.2;
        `;
        btnFechar.onmouseover = () => btnFechar.style.background = '#dc2626';
        btnFechar.onmouseout = () => btnFechar.style.background = '#ef4444';
        btnFechar.onclick = () => janela.remove();

        // Monta grupo de controles
        grupoControles.appendChild(btnMenos);
        grupoControles.appendChild(sizeDisplay);
        grupoControles.appendChild(btnMais);
        grupoControles.appendChild(sep);
        grupoControles.appendChild(btnReset);
        grupoControles.appendChild(btnFechar);

        header.appendChild(titulo);
        header.appendChild(grupoControles);
        janela.appendChild(header);

        // =============================================================
        // BADGE DE CONFIRMAÇÃO
        // =============================================================
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
        
        let badgeTexto = '✅ Contrato correspondente - Dados válidos';
        if (dados.telefonia && dados.telefonia.temTelefonia) {
            badgeTexto += ' 📞 Com Telefonia';
        }
        badge.textContent = badgeTexto;
        janela.appendChild(badge);

        // =============================================================
        // CONTEÚDO DA JANELA
        // =============================================================
        const conteudo = document.createElement('div');
        conteudo.style.cssText = `font-size: ${estadoJanela.fonte}px;`;

        // Campos
        const campos = [
            { label: '🔢 Contrato', valor: dados.contrato || 'Nenhum' },
            { label: '🔌 Serial', valor: dados.serial || 'XX' },
            { label: '📡 SSID', valor: dados.ssid || 'XX' },
            { label: '🔑 Senha', valor: dados.senha || 'XX' },
            { label: '🖥️ OLT', valor: dados.olt || 'N/A' },
            { label: '📊 Slot OLT', valor: dados.slot || 'XX' },
            { label: '🔌 Porta OLT', valor: dados.porta || 'XX' },
            { label: '🆔 ID ONU', valor: dados.id || 'XX' },
            { label: '🌐 VLAN Calculada', valor: dados.vlan || 'XX' },
            { label: '📦 Tipo Equipamento', valor: tipoEquip }
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
            label.style.cssText = `
                font-weight: 600;
                color: #4b5563;
                font-size: ${estadoJanela.fonte}px;
            `;

            const valor = document.createElement('span');
            valor.textContent = campo.valor;
            valor.style.cssText = `
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

            linha.appendChild(label);
            linha.appendChild(valor);
            conteudo.appendChild(linha);
        });

        // Preview do Complemento
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

        // Status// ==UserScript==
// @name         Contrato - Janela com Controles de Tamanho
// @namespace    http://tampermonkey.net/
// @version      13.5
// @description  Janela flutuante com botões para ajustar tamanho
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
        passo: 20  // Quantos pixels aumenta/diminui
    };

    // Estado atual da janela
    let estadoJanela = {
        largura: CONFIG_JANELA.larguraPadrao,
        altura: CONFIG_JANELA.alturaPadrao,
        fonte: CONFIG_JANELA.fontePadrao
    };

    // =========================================================================
    // FUNÇÃO PARA REDIMENSIONAR A JANELA FLUTUANTE
    // =========================================================================
    function redimensionarJanela(deltaLargura, deltaAltura, deltaFonte) {
        const janela = document.getElementById('osir-floating-window');
        if (!janela) return;

        // Atualiza estado
        estadoJanela.largura = Math.max(
            CONFIG_JANELA.larguraMin,
            Math.min(CONFIG_JANELA.larguraMax, estadoJanela.largura + deltaLargura)
        );
        estadoJanela.altura = Math.max(
            CONFIG_JANELA.alturaMin,
            Math.min(CONFIG_JANELA.alturaMax, estadoJanela.altura + deltaAltura)
        );
        estadoJanela.fonte = Math.max(
            CONFIG_JANELA.fonteMin,
            Math.min(CONFIG_JANELA.fonteMax, estadoJanela.fonte + deltaFonte)
        );

        // Aplica os novos tamanhos
        janela.style.width = estadoJanela.largura + 'px';

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

        // Botão Copiar
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
            const telefoniaStr = dados.telefonia && dados.telefonia.temTelefonia 
                ? `${dados.telefonia.numero}||${dados.telefonia.senha}||${dados.telefonia.ip || ''}`
                : '||||';
            
            const stringSecreta = `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contrato}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}||${dados.tipoProvisionamento}||${telefoniaStr}`;
            navigator.clipboard.writeText(stringSecreta).then(() => {
                btnCopiar.textContent = '✅ Copiado!';
                btnCopiar.style.background = '#10b981';
                setTimeout(() => {
                    btnCopiar.textContent = '📋 Copiar Dados Novamente';
                    btnCopiar.style.background = '#8b5cf6';
                }, 2000);
            });
        };
        
        conteudo.appendChild(btnCopiar);
        janela.appendChild(conteudo);
        document.body.appendChild(janela);

        // Auto-fechar após 5 minutos
        setTimeout(() => {
            if (document.getElementById('osir-floating-window')) {
                janela.remove();
            }
        }, 300000);
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
                btnCopiar.textContent = '💾 Capturar e Criar Complemento';
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
                            tipoProvisionamento: "",
                            telefonia: {
                                temTelefonia: false,
                                numero: '',
                                senha: '',
                                ip: '',
                                dadosCompletos: false
                            }
                        };

                        const divTopo = document.body;
                        const matchContrato = divTopo.innerText.match(/Cliente\s*-\s*(\d+)/i);
                        if (matchContrato && matchContrato[1]) {
                            dados.contrato = matchContrato[1].trim();
                        }

                        dados.tipoProvisionamento = capturarTipoProvisionamento();
                        dados.telefonia = capturarDadosTelefonia();

                        const inputPontoAcesso = document.getElementById('AuthenticationAccessPointTitle');
                        if (inputPontoAcesso && inputPontoAcesso.value) {
                            dados.pontoAcesso = inputPontoAcesso.value.trim();
                        } else {
                            const inputOlt = document.getElementById('olt');
                            if (inputOlt && inputOlt.value) {
                                dados.pontoAcesso = inputOlt.value.trim();
                            }
                        }

                        dados.ssid = document.getElementById('ssid')?.value.trim() || "XX";
                        dados.senha = document.getElementById('senhaSSID')?.value.trim() || "XX";

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

                        const inputIdOnuOlt = document.getElementById('idOnuOlt');
                        if (inputIdOnuOlt && inputIdOnuOlt.value) {
                            dados.id = parseInt(inputIdOnuOlt.value, 10).toString();
                        }

                        const todosInputs = document.querySelectorAll('input');
                        todosInputs.forEach(i => {
                            const idStr = (i.id || "").toLowerCase();
                            const val = i.value.trim();

                            if (idStr.includes('serial') && val) dados.serial = val.toUpperCase();
                            if (idStr.includes('vlan') && val) dados.vlan = val;
                        });

                        if (dados.vlan === "XX" || dados.vlan === "") {
                            dados.vlan = calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);
                        }

                        const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
                        const complementoTexto = montarComplemento(dados, tipoEquip, dados.vlan);

                        const telefoniaStr = dados.telefonia.temTelefonia 
                            ? `${dados.telefonia.numero}||${dados.telefonia.senha}||${dados.telefonia.ip || ''}`
                            : '||||';
                        
                        const stringSecreta = `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contrato}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}||${dados.tipoProvisionamento}||${telefoniaStr}||${complementoTexto}`;
                        
                        navigator.clipboard.writeText(stringSecreta).then(() => {
                            const statusTelefonia = dados.telefonia.temTelefonia ? '📞' : '';
                            btnCopiar.textContent = `✅ Pronto! ${statusTelefonia}`;
                            btnCopiar.style.backgroundColor = '#10b981';
                            
                            const notificacao = document.createElement('div');
                            notificacao.style.cssText = `
                                position: fixed;
                                bottom: 20px;
                                right: 20px;
                                background: #1f2937;
                                color: white;
                                padding: 12px 20px;
                                border-radius: 8px;
                                font-size: 12px;
                                z-index: 99999;
                                max-width: 400px;
                                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                                font-family: 'Segoe UI', Arial, sans-serif;
                            `;
                            notificacao.innerHTML = `
                                <div style="font-weight: bold; margin-bottom: 4px;">✅ Complemento gerado!</div>
                                <div style="font-size: 11px; opacity: 0.8; word-break: break-all;">${complementoTexto.substring(0, 100)}${complementoTexto.length > 100 ? '...' : ''}</div>
                            `;
                            document.body.appendChild(notificacao);
                            
                            setTimeout(() => {
                                notificacao.remove();
                                btnCopiar.textContent = '💾 Capturar e Criar Complemento';
                                btnCopiar.style.backgroundColor = '#8b5cf6';
                            }, 4000);
                        });
                    } catch (err) { 
                        console.error('Erro na captura:', err);
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
    // PARTE 2: INSERÇÃO NO ERP
    // =========================================================================
    if (window.location.href.includes(URL_CONTRATO_VOALLE)) {
        
        const contratoAtual = extrairContratoDaURL();

        async function verificarDadosNoClipboard() {
            try {
                const texto = await navigator.clipboard.readText();
                if (texto && texto.startsWith("OSIRDATA||")) {
                    const partes = texto.split("||");
                    
                    const telefoniaParts = partes[12] ? partes[12].split('||') : [];
                    const complementoPreMontado = partes[13] || '';
                    
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
                        complementoPreMontado: complementoPreMontado
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

        function preencherIdOnu(valorId) {
            const inputIdOnu = document.getElementById('AuthenticationContractOltId');
            if (inputIdOnu) {
                inputIdOnu.value = valorId;
                inputIdOnu.dispatchEvent(new Event('input', { bubbles: true }));
                inputIdOnu.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            return false;
        }

        function preencherVlan(valorVlan) {
            const inputVlan = document.getElementById('AuthenticationContractVlan');
            if (inputVlan) {
                inputVlan.value = valorVlan;
                inputVlan.dispatchEvent(new Event('input', { bubbles: true }));
                inputVlan.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
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
                                
                                const telefoniaParts = partes[12] ? partes[12].split('||') : [];
                                const complementoPreMontado = partes[13] || '';
                                
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
                                    olt: partes[10] || "N/A",
                                    tipoProvisionamento: partes[11] || "",
                                    telefonia: {
                                        temTelefonia: telefoniaParts.length >= 3 && telefoniaParts[0] && telefoniaParts[0].trim() !== '',
                                        numero: telefoniaParts[0] || '',
                                        senha: telefoniaParts[1] || '',
                                        ip: telefoniaParts[2] || '',
                                        dadosCompletos: false
                                    },
                                    complementoPreMontado: complementoPreMontado
                                };

                                if (dados.telefonia.temTelefonia && dados.telefonia.numero && dados.telefonia.senha) {
                                    dados.telefonia.dadosCompletos = true;
                                }

                                if (contratoAtual && dados.contrato && dados.contrato !== contratoAtual) {
                                    console.warn(`⚠️ Contrato diferente`);
                                    return;
                                }

                                const tipoEquip = determinarTipoEquipamento(dados.tipoProvisionamento, dados.serial);
                                const vlanFinal = calcularVlanOsir(dados.pontoAcesso, dados.slot, dados.porta);

                                preencherVlan(vlanFinal);
                                
                                if (dados.id && dados.id !== "0" && dados.id !== "XX") {
                                    preencherIdOnu(dados.id);
                                }

                                const inputWifiSsid = document.getElementById('AuthenticationContractWifiName');
                                const inputWifiPass = document.getElementById('AuthenticationContractWifiPassword');

                                if (inputWifiSsid && dados.ssid !== "XX") {
                                    inputWifiSsid.value = dados.ssid;
                                    inputWifiSsid.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                                if (inputWifiPass && dados.senha !== "XX") {
                                    inputWifiPass.value = dados.senha;
                                    inputWifiPass.dispatchEvent(new Event('input', { bubbles: true }));
                                }

                                const textareas = document.querySelectorAll('textarea, input[type="text"]');
                                let inputComplementar = null;
                                for (let el of textareas) {
                                    const idFormatado = (el.id || "").toLowerCase();
                                    if (idFormatado.includes('complement')) {
                                        inputComplementar = el;
                                        break;
                                    }
                                }

                                if (inputComplementar) {
                                    let textoFinal;
                                    
                                    if (dados.complementoPreMontado) {
                                        textoFinal = dados.complementoPreMontado;
                                        console.log(`✅ Usando complemento pré-montado`);
                                    } else {
                                        textoFinal = montarComplemento(dados, tipoEquip, vlanFinal);
                                        console.log(`✅ Montando complemento do zero`);
                                    }
                                    
                                    inputComplementar.value = textoFinal;
                                    inputComplementar.dispatchEvent(new Event('input', { bubbles: true }));
                                    inputComplementar.dispatchEvent(new Event('change', { bubbles: true }));
                                    console.log(`✅ Complemento aplicado: ${textoFinal}`);
                                }

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
                            console.error("Erro: ", err);
                        }
                    });
                }
            });
        }
        setInterval(monitorarBotaoVoalle, 1000);
    }

})();
