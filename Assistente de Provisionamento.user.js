// ==UserScript==
// @name         Osir - Assistente de Provisionamento
// @namespace    http://tampermonkey.net/
// @version      8.5.0
// @description  Provisionamento - Fila e Contrato (Versão Rústica)
// @author       Alisson Guerreiro
// @match        https://atendimento.osir.net.br/inviabilidade/huawei/filaProvisionamento.php
// @match        https://erp.osirnet.com.br/authentication_contracts/contract_panel/*
// @grant        none
// @run-at       document-end
// @homepage     https://github.com/AlissonGuerreiro/meus-scripts
// @supportURL   https://github.com/AlissonGuerreiro/meus-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Assistente%20de%20Provisionamento.user.js
// @updateURL    https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Assistente%20de%20Provisionamento.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============ CONFIG ============
    const CFG = {
        DEBUG: true,
        VERSAO: '8.4.0',
        URL_ATENDIMENTO: 'filaProvisionamento.php',
        URL_CONTRATO: 'authentication_contracts/contract_panel',
        URL_OPERACAO: '/legacy/operations/',
        TIMINGS: {
            INJECAO_BOTAO: 800,
            DELAY_1: 100,
            DELAY_2: 3000,
            VERIFICAR_1: 2000,
            VERIFICAR_2: 4000,
            MAX_TENTATIVAS: 15,
            INTERVALO: 1000,
            MONITORAMENTO: 2000,
            ALERTA_TIMEOUT: 300000,
            FEEDBACK: 1500
        },
        JANELA: {
            larguraMin: 250,
            larguraMax: 500,
            larguraPadrao: 350,
            alturaMin: 250,
            alturaMax: 750,
            alturaPadrao: 750,
            fonteMin: 16,
            fonteMax: 30,
            fontePadrao: 14,
            passo: 15
        }
    };

    // ============ ESTADO ============
    let estado = {
        janela: {
            largura: CFG.JANELA.larguraPadrao,
            altura: CFG.JANELA.alturaPadrao,
            fonte: CFG.JANELA.fontePadrao
        },
        wifiPro: false,
        dadosAtuais: null,
        partes: [],
        proximoId: 1
    };

    let currentJanelaFlutuanteDados = null;

    // ============ UTILITÁRIOS ============
    function log(...args) {
        if (CFG.DEBUG) console.log('[Provisionamento]', ...args);
    }

    function getEl(id) {
        return document.getElementById(id);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    const storage = {
        get(k) { try { return localStorage.getItem(k); } catch(e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch(e) {} },
        remove(k) { try { localStorage.removeItem(k); } catch(e) {} },
        getJSON(k) { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : null; } catch(e) { return null; } },
        setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }
    };

    // ============ PREFERÊNCIAS ============
    function carregarPreferencias() {
        const prefs = storage.getJSON('osir_janela_flutuante_prefs');
        if (prefs) {
            estado.janela.largura = prefs.largura || CFG.JANELA.larguraPadrao;
            estado.janela.altura = prefs.altura || CFG.JANELA.alturaPadrao;
            estado.janela.fonte = prefs.fonte || CFG.JANELA.fontePadrao;
        }
        const wifi = storage.get('osir_wifi_pro_ativo');
        if (wifi !== null) estado.wifiPro = wifi === 'true';
    }
    carregarPreferencias();

    // ============ FUNÇÕES DE CÁLCULO ============
    function normalizarNomePE(nome) {
        if (!nome) return '';
        return nome.toUpperCase().trim()
            .replace(/STLDC\s*0?1/, 'DC 1')
            .replace(/STLDC\s*0?2/, 'DC 2')
            .replace(/PTN[_\s]*NOVA/, 'PTN');
    }

    function calcularVlan(pontoAcesso, slot, porta) {
        const pa = normalizarNomePE(pontoAcesso);
        if (pa.includes('STL_CE3_R') || pa.includes('STL_CE4_R') ||
            pa.includes('STL_CE_3') || pa.includes('STL_CE_4') ||
            pa.includes('TTN_LAN') || pa.includes('GAR') || pa.includes('ROS')) {
            return '2200';
        }

        const s = parseInt(slot, 10);
        const p = parseInt(porta, 10);
        if (isNaN(s) || isNaN(p)) return 'XX';
        if (s === 0) return (p + 10).toString();
        return s.toString() + (p < 10 ? '0' + p : p.toString());
    }

    function definirPortaWeb(tipo) {
        const t = (tipo || '').toLowerCase().trim();
        if (t === 'b') return '8092';
        if (t === 'r') return '80';
        return '80';
    }

    function determinarModelo(serial, tipo) {
        const s = (serial || '').toUpperCase();
        const t = (tipo || '').toLowerCase().trim();

        const excecoes = {
            '5A544547D97A26F4': 'ZTE Bridge',
            'ZTEGD97A60FE': 'ZTE Bridge',
            '52434D47199888E8': 'Raisecom Bridge',
            'RCMG19891CC9': 'Raisecom Bridge',
            'RCMG39891CC9': 'Raisecom Router',
            '53484C4E052687B0': 'Ektech Bridge',
            '485754432C9F2CAA': 'Huawei Router'
        };
        if (excecoes[s]) return excecoes[s];

        if (s.startsWith('5A544') || s.startsWith('ZTEGD')) return 'ZTE Bridge';
        if (s.startsWith('RCMG1') || s.startsWith('52434')) return 'Raisecom Bridge';
        if (s.startsWith('RCMG3')) return 'Raisecom Router';
        if (s.startsWith('RCMG')) return 'Raisecom Router';
        if (s.startsWith('4857') || s.startsWith('HWTC')) {
            return t === 'b' ? 'Huawei Bridge' : 'Huawei Router';
        }
        if (s.startsWith('53484') || s.startsWith('48575')) return 'Ektech Bridge';
        if (s.startsWith('ZTEG') || s.startsWith('5A54')) return 'ZTE Bridge';
        return 'Equipamento Desconhecido';
    }

    function precisaAutenticar(serial, tipo) {
        const s = (serial || '').toUpperCase();
        const t = (tipo || '').toLowerCase().trim();
        if (t === 'b') return true;
        if (t === 'r') return false;
        if (s.startsWith('5A544') || s.startsWith('ZTEGD')) return true;
        if (s.startsWith('RCMG1')) return true;
        if (s.startsWith('RCMG3')) return false;
        if (s.startsWith('RCMG')) return false;
        if (s.startsWith('4857') || s.startsWith('HWTC')) return t === 'b';
        return false;
    }

    function formatarPESlotPorta(dados) {
        let pe = dados.pontoAcesso || dados.olt || '';
        if (pe.includes(' - ')) {
            const partes = pe.split(' - ');
            pe = partes[partes.length - 1].trim();
        }
        pe = normalizarNomePE(pe);
        if (pe.includes('STL_CE_')) pe = pe.replace('STL_', '').replace('_', ' ');
        else if (pe.includes('JUN_')) pe = pe.replace('_', ' ');
        else if (pe.includes('_')) pe = pe.replace('_', ' ');

        let slot = dados.slot || '0';
        let porta = dados.porta || '0';
        if (/^\d+$/.test(slot)) slot = String(slot).padStart(2, '0');
        if (/^\d+$/.test(porta)) porta = String(porta).padStart(2, '0');
        return `${pe} ${slot} ${porta}`;
    }

    // ============ GET TIPO PROVISIONAMENTO POR MODELO ============
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

    // ============ PREENCHER VLAN E PORTA WEB ============
    function preencherVlanEPortaWeb() {
        const dados = getDadosContrato();
        const modelo = getModeloSelecionado();
        const tipoProv = getTipoProvisionamentoPorModelo(modelo);

        const vlan = calcularVlan('', dados.slot, dados.porta);
        const portaWeb = definirPortaWeb(tipoProv);

        const campoVlan = getEl('AuthenticationContractVlan');
        if (campoVlan && vlan && vlan !== 'XX') {
            campoVlan.value = vlan;
            campoVlan.dispatchEvent(new Event('input', { bubbles: true }));
            campoVlan.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const campoPortaWeb = getEl('AuthenticationContractEquipmentPort');
        if (campoPortaWeb && portaWeb) {
            campoPortaWeb.value = portaWeb;
            campoPortaWeb.dispatchEvent(new Event('input', { bubbles: true }));
            campoPortaWeb.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const vlanDisplay = getEl('osir-vlan-display');
        const portaDisplay = getEl('osir-portaweb-display');
        if (vlanDisplay) vlanDisplay.textContent = vlan || '---';
        if (portaDisplay) portaDisplay.textContent = portaWeb || '80';
    }

    // ============ MONTAR COMPLEMENTO ============
    function montarComplemento(dados) {
        const modelo = determinarModelo(dados.serial, dados.tipoProvisionamento);
        const temTel = dados.telefonia && dados.telefonia.temTelefonia;
        const modeloFinal = temTel ? modelo + ' + Telefonia' : modelo;

        let partes = [];
        if (estado.wifiPro) partes.push('Cliente Wifi Pro');
        if (modeloFinal) partes.push(modeloFinal);
        if (dados.serial && dados.serial !== 'XX') partes.push(`SN: ${dados.serial}`);
        if (precisaAutenticar(dados.serial, dados.tipoProvisionamento)) partes.push('Autentica na ZTE');

        const splitter = dados.splitter || 'XX';
        const portaSplit = dados.portaSplitter || 'XX';
        partes.push(`Splitter: ${splitter} Porta: ${portaSplit}`);

        if (dados.slot && dados.porta && dados.id) {
            const p = dados.porta.length === 1 ? '0' + dados.porta : dados.porta;
            partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${p} ID: ${dados.id}`);
        }

        // SSID E SENHA SEMPRE JUNTOS (UMA ÚNICA PARTE)
        if (dados.ssid || dados.senha) {
            let parte = '';
            if (dados.ssid && dados.ssid !== 'XX') parte += `SSID: ${dados.ssid}`;
            if (dados.senha && dados.senha !== 'XX') parte += ` Senha: ${dados.senha}`;
            if (parte) partes.push(parte.trim());
        }

        if (temTel) {
            if (dados.telefonia.numero) partes.push(`Nº: ${dados.telefonia.numero}`);
            if (dados.telefonia.senha) partes.push(`Senha da Telefonia: ${dados.telefonia.senha}`);
            if (dados.telefonia.ip) partes.push(`IP de Telefonia: ${dados.telefonia.ip}`);
        }

        return partes.join(' || ');
    }

    function montarStringOSIRDATA(dados) {
        const wifi = estado.wifiPro ? '1' : '0';
        return [
            'OSIRDATA',
            dados.serial || 'XX',
            dados.ssid || 'XX',
            dados.senha || 'XX',
            dados.slot || 'XX',
            dados.porta || 'XX',
            dados.id || 'XX',
            dados.contrato || '',
            dados.vlan || 'XX',
            dados.pontoAcesso || '',
            dados.olt || 'N/A',
            dados.tipoProvisionamento || '',
            dados.telefonia?.numero || '',
            dados.telefonia?.senha || '',
            dados.telefonia?.ip || '',
            dados.portaWeb || '80',
            dados.sinal || '',
            wifi
        ].join('||');
    }

    // ============ CAPTURAR DADOS ============
    function capturarDadosProvisionamento() {
        const dados = {
            serial: 'XX', ssid: 'XX', senha: 'XX',
            slot: 'XX', porta: 'XX', id: 'XX',
            contrato: '', vlan: 'XX', pontoAcesso: '', olt: 'N/A',
            tipoProvisionamento: '', portaWeb: '80',
            sinal: '', status: '', nomeOLT: '',
            wifiPro: estado.wifiPro,
            telefonia: { temTelefonia: false, numero: '', senha: '', ip: '' }
        };

        const campos = {
            serial: getEl('serialEquipamentoSynsuite'),
            ssid: getEl('ssid'),
            senha: getEl('senhaSSID'),
            tipo: getEl('tipoProvisionamento'),
            nomeONU: getEl('nomeONU'),
            sinal: getEl('sinal'),
            status: getEl('status'),
            olt: getEl('olt'),
            slotOLT: getEl('slotOLT'),
            portaOLT: getEl('portaOLT'),
            idOnu: getEl('idOnuOlt'),
            tel1: getEl('numeroTelefone01'),
            senhaTel: getEl('senhaTelefone'),
            ipGer: getEl('ipGerencia')
        };

        if (campos.serial?.value) dados.serial = campos.serial.value.trim().toUpperCase();
        if (campos.ssid?.value) dados.ssid = campos.ssid.value.trim();
        if (campos.senha?.value) dados.senha = campos.senha.value.trim();
        if (campos.tipo?.value) dados.tipoProvisionamento = campos.tipo.value.toLowerCase().trim();
        if (campos.sinal?.value) dados.sinal = campos.sinal.value.trim();
        if (campos.status?.value) dados.status = campos.status.value.trim();
        if (campos.olt?.value) {
            dados.olt = campos.olt.value.trim();
            dados.nomeOLT = campos.olt.value.trim();
            const partes = dados.olt.split(' - ');
            if (partes.length >= 3) dados.pontoAcesso = partes[partes.length - 1].trim();
        }
        if (campos.slotOLT?.value) dados.slot = campos.slotOLT.value.trim();
        if (campos.portaOLT?.value) dados.porta = campos.portaOLT.value.trim();
        if (campos.idOnu?.value) dados.id = campos.idOnu.value.trim();

        if (campos.tel1?.value?.trim()) {
            dados.telefonia.temTelefonia = true;
            dados.telefonia.numero = campos.tel1.value.trim();
        }
        if (campos.senhaTel?.value?.trim()) dados.telefonia.senha = campos.senhaTel.value.trim();
        if (campos.ipGer?.value?.trim()) dados.telefonia.ip = campos.ipGer.value.trim();

        const titulo = document.querySelector('#nomeClienteModal');
        if (titulo) {
            const match = titulo.textContent.match(/(\d+)/);
            if (match) dados.contrato = match[1].trim();
        }

        dados.vlan = calcularVlan(dados.pontoAcesso, dados.slot, dados.porta);
        dados.portaWeb = definirPortaWeb(dados.tipoProvisionamento);

        return dados;
    }

    function extrairDadosClipboard(texto) {
        if (!texto || !texto.trim().startsWith('OSIRDATA||')) return null;
        const p = texto.trim().split('||');
        const temTel = p[12] && p[12].trim() !== '';
        return {
            serial: p[1] || 'XX',
            ssid: p[2] || 'XX',
            senha: p[3] || 'XX',
            slot: p[4] || 'XX',
            porta: p[5] || 'XX',
            id: p[6] || 'XX',
            contrato: p[7] || '',
            vlan: p[8] || 'XX',
            pontoAcesso: p[9] || '',
            olt: p[10] || 'N/A',
            tipoProvisionamento: p[11] || '',
            portaWeb: p[15] || '80',
            sinal: p[16] || '',
            wifiPro: p[17] === '1',
            telefonia: {
                temTelefonia: temTel,
                numero: p[12] || '',
                senha: p[13] || '',
                ip: p[14] || ''
            }
        };
    }

    // ============ PREENCHER FORMULÁRIO ============
    function preencherFormulario(dados) {
        const mapeamento = [
            ['AuthenticationContractEquipmentSerialNumber', dados.serial],
            ['AuthenticationContractWifiName', dados.ssid],
            ['AuthenticationContractWifiPassword', dados.senha],
            ['AuthenticationContractSlotOlt', dados.slot],
            ['AuthenticationContractPortOlt', dados.porta],
            ['AuthenticationContractOltId', dados.id],
            ['AuthenticationContractVlan', dados.vlan],
            ['AuthenticationContractEquipmentPort', dados.portaWeb],
            ['tipoProvisionamento', dados.tipoProvisionamento],
            ['AuthenticationContractEquipmentUser', dados.usuarioONU || ''],
            ['AuthenticationContractEquipmentPassword', dados.senhaONU || ''],
            ['AuthenticationSplitterPortTitle', dados.splitter || 'XX'],
            ['AuthenticationSplitterPortPort', dados.portaSplitter || 'XX']
        ];

        mapeamento.forEach(([id, valor]) => {
            const el = getEl(id);
            if (el && valor && valor !== 'XX' && valor !== '') {
                el.value = valor;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        if (dados.telefonia?.temTelefonia) {
            const campos = [
                ['numeroTelefone01', dados.telefonia.numero],
                ['senhaTelefone', dados.telefonia.senha],
                ['ipGerencia', dados.telefonia.ip]
            ];
            campos.forEach(([id, val]) => {
                const el = getEl(id);
                if (el && val) {
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        }

        limparMac();
    }

    function limparMac() {
        const el = getEl('AuthenticationContractMac');
        if (el?.value?.trim()) {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
    }

    // ============ JANELA FLUTUANTE (DIREITA) - RÚSTICA ============
    function redimensionarJanela(dLargura, dAltura, dFonte) {
        const janela = getEl('osir-floating-window');
        if (!janela) return;

        estado.janela.largura = Math.max(CFG.JANELA.larguraMin, Math.min(CFG.JANELA.larguraMax, estado.janela.largura + dLargura));
        estado.janela.altura = Math.max(CFG.JANELA.alturaMin, Math.min(CFG.JANELA.alturaMax, estado.janela.altura + dAltura));
        estado.janela.fonte = Math.max(CFG.JANELA.fonteMin, Math.min(CFG.JANELA.fonteMax, estado.janela.fonte + dFonte));

        janela.style.width = estado.janela.largura + 'px';
        janela.style.maxHeight = estado.janela.altura + 'px';
        janela.style.fontSize = estado.janela.fonte + 'px';

        const sizeDisplay = getEl('osir-size-display');
        if (sizeDisplay) sizeDisplay.textContent = `${estado.janela.largura}×${estado.janela.altura}`;

        storage.setJSON('osir_janela_flutuante_prefs', estado.janela);
    }

    function tornarJanelaArrastavel(janela) {
        let isDragging = false, xOffset = 0, yOffset = 0, currentX = 0, currentY = 0;

        const pos = storage.getJSON('osir_janela_posicao');
        if (pos?.x !== undefined && pos?.y !== undefined) {
            const maxX = window.innerWidth - 320 - 10;
            const maxY = window.innerHeight - 400 - 10;
            const x = Math.max(10, Math.min(pos.x, maxX));
            const y = Math.max(10, Math.min(pos.y, maxY));
            janela.style.top = y + 'px';
            janela.style.left = x + 'px';
            janela.style.right = 'auto';
            janela.style.bottom = 'auto';
            xOffset = x; yOffset = y; currentX = x; currentY = y;
        }

        function dragStart(e) {
            if (e.target.closest('.osir-no-drag')) return;
            const touch = e.type === 'touchstart' ? e.touches[0] : e;
            if (e.target.closest('.osir-header-drag')) {
                isDragging = true;
                janela.style.cursor = 'grabbing';
                janela.style.transition = 'none';
            }
        }

        function dragEnd() {
            if (isDragging) {
                isDragging = false;
                janela.style.cursor = 'default';
                janela.style.transition = 'width 0.3s ease, max-height 0.3s ease';
                storage.setJSON('osir_janela_posicao', { x: xOffset, y: yOffset });
            }
        }

        function drag(e) {
            if (!isDragging) return;
            e.preventDefault();
            const touch = e.type === 'touchmove' ? e.touches[0] : e;
            currentX = touch.clientX - xOffset;
            currentY = touch.clientY - yOffset;
            xOffset = currentX; yOffset = currentY;
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

        janela.resetPosition = function() {
            storage.remove('osir_janela_posicao');
            janela.style.top = '70px';
            janela.style.right = '15px';
            janela.style.left = 'auto';
            janela.style.bottom = 'auto';
            xOffset = 0; yOffset = 0; currentX = 0; currentY = 0;
        };
    }

    function criarJanelaFlutuante(dados) {
        currentJanelaFlutuanteDados = dados;
        if (getEl('osir-floating-window')) return;
        if (dados.wifiPro !== undefined) estado.wifiPro = dados.wifiPro;

        const temTelefonia = dados.telefonia?.temTelefonia || false;
        const complementoPreview = montarComplemento(dados);

        const janela = document.createElement('div');
        janela.id = 'osir-floating-window';
        janela.style.cssText = `
            position:fixed;top:70px;right:15px;
            width:${estado.janela.largura}px;max-height:${estado.janela.altura}px;
            background:#fff;border:2px solid #7c3aed;border-radius:6px;
            box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:99999;
            font-family:Arial,sans-serif;padding:10px;overflow-y:auto;
            font-size:${estado.janela.fonte}px;user-select:none;
        `;

        // HEADER (simples)
        const header = document.createElement('div');
        header.className = 'osir-header-drag';
        header.style.cssText = `
            display:flex;justify-content:space-between;align-items:center;
            margin-bottom:8px;padding:6px 8px;
            background:#e5e7eb;border-radius:4px;border:1px solid #d1d5db;
            cursor:grab;gap:4px;flex-wrap:wrap;
        `;

        const titulo = document.createElement('span');
        titulo.textContent = `📋 Contrato #${dados.contrato || '???'}`;
        titulo.style.cssText = `font-weight:700;font-size:${Math.round(estado.janela.fonte * 1.1)}px;color:#1f2937;flex:1;`;

        const grupoControles = document.createElement('div');
        grupoControles.className = 'osir-no-drag';
        grupoControles.style.cssText = 'display:flex;align-items:center;gap:3px;';

        function btnSimples(texto, cor, fn, extra = '') {
            const b = document.createElement('button');
            b.textContent = texto;
            b.style.cssText = `
                padding:2px 6px;background:${cor};color:#fff;border:1px solid ${cor};
                border-radius:3px;cursor:pointer;font-size:11px;font-weight:700;${extra}
            `;
            b.onclick = fn;
            return b;
        }

        const sizeDisplay = document.createElement('span');
        sizeDisplay.id = 'osir-size-display';
        sizeDisplay.textContent = `${estado.janela.largura}×${estado.janela.altura}`;
        sizeDisplay.style.cssText = `
            font-size:10px;color:#6b7280;padding:1px 4px;
            font-family:monospace;font-weight:600;background:#fff;border:1px solid #d1d5db;border-radius:2px;
        `;

        grupoControles.appendChild(btnSimples('−', '#6b7280', () => {
            redimensionarJanela(-CFG.JANELA.passo, -CFG.JANELA.passo, -1);
        }));
        grupoControles.appendChild(sizeDisplay);
        grupoControles.appendChild(btnSimples('+', '#6b7280', () => {
            redimensionarJanela(CFG.JANELA.passo, CFG.JANELA.passo, 1);
        }));
        grupoControles.appendChild(btnSimples('↺', '#6b7280', () => {
            estado.janela.largura = CFG.JANELA.larguraPadrao;
            estado.janela.altura = CFG.JANELA.alturaPadrao;
            estado.janela.fonte = CFG.JANELA.fontePadrao;
            redimensionarJanela(0, 0, 0);
            if (janela.resetPosition) janela.resetPosition();
        }));
        grupoControles.appendChild(btnSimples('✕', '#dc2626', () => {
            janela.remove();
            currentJanelaFlutuanteDados = null;
        }));

        header.appendChild(titulo);
        header.appendChild(grupoControles);
        janela.appendChild(header);

        // BADGE (simples)
        const badge = document.createElement('div');
        badge.className = 'osir-badge';
        badge.style.cssText = `
            padding:4px 8px;border-radius:4px;text-align:center;font-weight:700;margin-bottom:6px;
            background:${temTelefonia ? '#d1fae5' : '#dbeafe'};
            color:${temTelefonia ? '#065f46' : '#1e40af'};
            font-size:${Math.round(estado.janela.fonte * 0.85)}px;
        `;
        let badgeTexto = temTelefonia ? '✅ Dados do Amarelo 📞' : '✅ Dados do Amarelo';
        if (estado.wifiPro) badgeTexto += ' 📶 WiFi Pro';
        badge.textContent = badgeTexto;
        janela.appendChild(badge);

        // WIFI PRO CHECKBOX (sem fundo)
        const wifiProContainer = document.createElement('div');
        wifiProContainer.style.cssText = `
            display:flex;align-items:center;gap:6px;padding:4px 4px;margin-bottom:4px;
        `;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'osir-wifi-pro-checkbox';
        checkbox.checked = estado.wifiPro;
        checkbox.style.cssText = 'width:14px;height:14px;cursor:pointer;accent-color:#7c3aed;';
        const label = document.createElement('label');
        label.htmlFor = 'osir-wifi-pro-checkbox';
        label.textContent = '📶 WiFi Pro';
        label.style.cssText = `font-weight:700;color:#4b5563;font-size:${estado.janela.fonte}px;cursor:pointer;`;
        checkbox.addEventListener('change', function() {
            estado.wifiPro = this.checked;
            const b = janela.querySelector('.osir-badge');
            if (b) {
                let texto = temTelefonia ? '✅ Dados do Amarelo 📞' : '✅ Dados do Amarelo';
                if (estado.wifiPro) texto += ' 📶 WiFi Pro';
                b.textContent = texto;
            }
            if (currentJanelaFlutuanteDados) {
                const comp = montarComplemento(currentJanelaFlutuanteDados);
                const p = janela.querySelector('.osir-preview-texto');
                if (p) p.textContent = comp;
            }
        });
        wifiProContainer.appendChild(checkbox);
        wifiProContainer.appendChild(label);
        janela.appendChild(wifiProContainer);

        // CONTEÚDO
        const conteudo = document.createElement('div');

        function criarLinhaCampo(labelText, valorText, comBotaoCopiar = false) {
            const linha = document.createElement('div');
            linha.style.cssText = `
                display:flex;justify-content:space-between;align-items:center;
                padding:3px 4px;border-bottom:1px solid #f3f4f6;
                font-size:${estado.janela.fonte}px;gap:4px;
            `;
            const labelCampo = document.createElement('span');
            labelCampo.textContent = labelText;
            labelCampo.style.cssText = `
                font-weight:700;color:#4b5563;font-size:${estado.janela.fonte}px;
                min-width:50px;flex-shrink:0;
            `;
            const valorSpan = document.createElement('span');
            valorSpan.textContent = valorText;
            valorSpan.style.cssText = `
                color:#1f2937;font-family:monospace;
                font-size:${Math.round(estado.janela.fonte * 0.9)}px;font-weight:600;
                flex:1;min-width:0;word-break:break-all;
            `;

            if (!comBotaoCopiar) {
                linha.appendChild(labelCampo);
                linha.appendChild(valorSpan);
                return linha;
            }

            const container = document.createElement('div');
            container.style.cssText = 'display:flex;align-items:center;gap:4px;flex:1;min-width:0;';
            valorSpan.style.flex = '1';
            container.appendChild(valorSpan);

            const btnCopiar = document.createElement('button');
            btnCopiar.textContent = '📋';
            btnCopiar.style.cssText = `
                padding:1px 4px;background:#7c3aed;color:#fff;border:1px solid #7c3aed;
                border-radius:3px;cursor:pointer;font-size:10px;flex-shrink:0;
            `;
            btnCopiar.onclick = function() {
                const texto = formatarPESlotPorta(dados);
                navigator.clipboard.writeText(texto).then(() => {
                    this.textContent = '✅';
                    this.style.background = '#10b981';
                    setTimeout(() => {
                        this.textContent = '📋';
                        this.style.background = '#7c3aed';
                    }, CFG.TIMINGS.FEEDBACK);
                });
            };
            container.appendChild(btnCopiar);
            linha.appendChild(labelCampo);
            linha.appendChild(container);
            return linha;
        }

        let peExibicao = dados.nomeOLT || dados.olt || 'N/A';
        if (peExibicao === 'N/A' && dados.pontoAcesso) peExibicao = dados.pontoAcesso;

        conteudo.appendChild(criarLinhaCampo('📍 PE', peExibicao, true));

        const camposSimples = [
            ['📊 Slot', dados.slot || 'XX'],
            ['🔌 Porta', dados.porta || 'XX'],
            ['🆔 ID', dados.id || 'XX'],
            ['🔌 Serial', dados.serial || 'XX'],
            ['📡 SSID', dados.ssid || 'XX'],
            ['🔑 Senha', dados.senha || 'XX']
        ];

        camposSimples.forEach(([label, valor]) => {
            conteudo.appendChild(criarLinhaCampo(label, valor, false));
        });

        if (temTelefonia) {
            conteudo.appendChild(criarLinhaCampo('📞 Tel', dados.telefonia.numero || 'N/A', false));
            if (dados.telefonia.senha?.trim()) {
                conteudo.appendChild(criarLinhaCampo('🔑 Senha Tel', dados.telefonia.senha, false));
            }
            if (dados.telefonia.ip?.trim()) {
                conteudo.appendChild(criarLinhaCampo('🌐 IP Tel', dados.telefonia.ip, false));
            }
        }

        // PREVIEW (simples)
        const previewLabel = document.createElement('div');
        previewLabel.style.cssText = `
            margin-top:8px;font-weight:700;color:#4b5563;
            font-size:${Math.round(estado.janela.fonte * 0.85)}px;
        `;
        previewLabel.textContent = '📝 Complemento:';
        conteudo.appendChild(previewLabel);

        const previewTexto = document.createElement('div');
        previewTexto.className = 'osir-preview-texto';
        previewTexto.style.cssText = `
            margin-top:3px;padding:6px;
            background:#f3f4f6;border-radius:4px;
            font-family:monospace;font-size:${Math.round(estado.janela.fonte * 0.75)}px;
            color:#1f2937;word-break:break-all;border:1px solid #d1d5db;
            max-height:${Math.round(estado.janela.altura * 0.1)}px;overflow-y:auto;
        `;
        previewTexto.textContent = complementoPreview;
        conteudo.appendChild(previewTexto);

        // BOTÕES (simples, sem gradiente)
        const btnSinc = document.createElement('button');
        btnSinc.textContent = '🔄 Sincronizar';
        btnSinc.style.cssText = `
            width:100%;margin-top:6px;padding:5px 10px;
            background:#7c3aed;color:#fff;border:1px solid #7c3aed;
            border-radius:4px;cursor:pointer;font-weight:700;
            font-size:${Math.round(estado.janela.fonte * 0.85)}px;
        `;
        btnSinc.onclick = function() {
            const dadosDaCaixinha = {
                serial: dados.serial || 'XX',
                ssid: dados.ssid || 'XX',
                senha: dados.senha || 'XX',
                slot: dados.slot || 'XX',
                porta: dados.porta || 'XX',
                id: dados.id || 'XX',
                contrato: dados.contrato || '',
                vlan: dados.vlan || 'XX',
                pontoAcesso: dados.pontoAcesso || '',
                olt: dados.olt || 'N/A',
                tipoProvisionamento: dados.tipoProvisionamento || '',
                portaWeb: dados.portaWeb || '80',
                sinal: dados.sinal || '',
                usuarioONU: dados.usuarioONU || '',
                senhaONU: dados.senhaONU || '',
                telefonia: {
                    temTelefonia: temTelefonia,
                    numero: dados.telefonia?.numero || '',
                    senha: dados.telefonia?.senha || '',
                    ip: dados.telefonia?.ip || ''
                },
                wifiPro: estado.wifiPro,
                splitter: getEl('AuthenticationSplitterPortTitle')?.value?.trim() || 'XX',
                portaSplitter: getEl('AuthenticationSplitterPortPort')?.value?.trim() || 'XX'
            };

            const string = montarStringOSIRDATA(dadosDaCaixinha);
            navigator.clipboard.writeText(string).then(() => {
                preencherFormulario(dadosDaCaixinha);
                limparMac();
                this.textContent = '✅ OK';
                this.style.background = '#10b981';
                setTimeout(() => {
                    this.textContent = '🔄 Sincronizar';
                    this.style.background = '#7c3aed';
                }, CFG.TIMINGS.FEEDBACK);
            }).catch(() => {
                preencherFormulario(dadosDaCaixinha);
                limparMac();
                this.textContent = '⚠️ Erro';
                setTimeout(() => {
                    this.textContent = '🔄 Sincronizar';
                    this.style.background = '#7c3aed';
                }, CFG.TIMINGS.FEEDBACK);
            });
        };
        conteudo.appendChild(btnSinc);

        const btnComp = document.createElement('button');
        btnComp.textContent = '📝 Complemento';
        btnComp.style.cssText = `
            width:100%;margin-top:4px;padding:5px 10px;
            background:#dc2626;color:#fff;border:1px solid #dc2626;
            border-radius:4px;cursor:pointer;font-weight:700;
            font-size:${Math.round(estado.janela.fonte * 0.85)}px;
        `;
        btnComp.onclick = function() {
            const dadosAtuais = currentJanelaFlutuanteDados || dados;
            dadosAtuais.splitter = getEl('AuthenticationSplitterPortTitle')?.value?.trim() || 'XX';
            dadosAtuais.portaSplitter = getEl('AuthenticationSplitterPortPort')?.value?.trim() || 'XX';
            const comp = montarComplemento(dadosAtuais);
            const campo = getEl('AuthenticationContractComplement');
            if (campo) {
                campo.value = comp;
                campo.dispatchEvent(new Event('input', { bubbles: true }));
                campo.dispatchEvent(new Event('change', { bubbles: true }));
            }
            previewTexto.textContent = comp;
            this.textContent = '✅ OK';
            this.style.background = '#22c55e';
            setTimeout(() => {
                this.textContent = '📝 Complemento';
                this.style.background = '#dc2626';
            }, CFG.TIMINGS.FEEDBACK);
        };
        conteudo.appendChild(btnComp);

        janela.appendChild(conteudo);
        document.body.appendChild(janela);
        tornarJanelaArrastavel(janela);
    }

    window.fecharJanelaFlutuante = function() {
        const el = getEl('osir-floating-window');
        if (el) el.remove();
    };

    // ============ JANELA ESQUERDA (COMPLEMENTO) ============
    function criarJanelaEsquerda() {
        if (getEl('osir-config-complement-window')) return;

        const menu = document.querySelector('.panel-content .contract-menu');
        if (!menu) return;

        const contratoId = menu?.getAttribute('data-contractid') || '???';
        const cliente = document.querySelector('.menu-info p')?.textContent?.trim() || 'Cliente';

        const janela = document.createElement('div');
        janela.id = 'osir-config-complement-window';
        janela.style.cssText = `
            margin:10px 0;padding:12px;background:#fff;
            border:2px solid #7c3aed;border-radius:8px;
            max-width:400px;font-family:Arial,sans-serif;font-size:12px;
        `;

        // Título
        const titulo = document.createElement('div');
        titulo.textContent = '⚙️ Complemento';
        titulo.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:8px;';
        janela.appendChild(titulo);

        // Info contrato
        const info = document.createElement('div');
        info.style.cssText = 'background:#f8fafc;padding:6px 10px;border-radius:6px;margin-bottom:10px;border:1px solid #e2e8f0;';
        info.innerHTML = `
            <div style="font-weight:700;color:#1f2937;">📌 #${contratoId}</div>
            <div style="color:#4b5563;font-size:10px;">${cliente}</div>
        `;
        janela.appendChild(info);

        // Modelos
        const modelos = [
            ['huawei-router', 'Huawei Router'],
            ['huawei-bridge', 'Huawei Bridge'],
            ['ektech-bridge', 'Ektech Bridge'],
            ['raisecom-router', 'Raisecom Router'],
            ['raisecom-bridge', 'Raisecom Bridge'],
            ['raisecom-bridge-desativada', 'Raisecom Bridge (Des.)'],
            ['zte-bridge', 'ZTE Bridge'],
            ['zte-router', 'ZTE Router']
        ];

        const modelosDiv = document.createElement('div');
        modelosDiv.style.cssText = 'margin:6px 0;padding:6px;background:#f9fafb;border-radius:4px;';
        modelosDiv.innerHTML = '<div style="font-weight:700;font-size:10px;color:#666;margin-bottom:4px;">MODELO</div>';
        modelos.forEach(([id, label], i) => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;padding:2px 4px;';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'modelo-equipamento';
            radio.value = id;
            radio.id = id;
            if (i === 1) radio.checked = true;
            const labelEl = document.createElement('label');
            labelEl.htmlFor = id;
            labelEl.textContent = label;
            labelEl.style.cssText = 'font-size:11px;cursor:pointer;';
            div.appendChild(radio);
            div.appendChild(labelEl);
            modelosDiv.appendChild(div);
        });
        janela.appendChild(modelosDiv);

        // Opções
        const opcoesDiv = document.createElement('div');
        opcoesDiv.style.cssText = 'margin:6px 0;padding:6px;background:#f9fafb;border-radius:4px;';
        opcoesDiv.innerHTML = '<div style="font-weight:700;font-size:10px;color:#666;margin-bottom:4px;">OPÇÕES</div>';

        const opcoes = [
            ['osir-wifi-pro-check', '📶 WiFi Pro'],
            ['osir-autentica-zte-check', '🔐 ZTE'],
            ['osir-autentica-rb-check', '🔄 RB'],
            ['osir-omada-check', '📶 OMADA']
        ];

        opcoes.forEach(([id, label]) => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;padding:2px 4px;';
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.id = id;
            check.style.cssText = 'margin-right:6px;';
            const labelEl = document.createElement('label');
            labelEl.htmlFor = id;
            labelEl.textContent = label;
            labelEl.style.cssText = 'font-size:11px;cursor:pointer;';
            div.appendChild(check);
            div.appendChild(labelEl);
            opcoesDiv.appendChild(div);
        });

        // Telefonia
        const telDiv = document.createElement('div');
        telDiv.style.cssText = 'display:flex;align-items:center;padding:2px 4px;margin-top:4px;';
        const telCheck = document.createElement('input');
        telCheck.type = 'checkbox';
        telCheck.id = 'osir-telefonia-check';
        telCheck.style.cssText = 'margin-right:6px;';
        const telLabel = document.createElement('label');
        telLabel.htmlFor = 'osir-telefonia-check';
        telLabel.textContent = '📞 Telefonia';
        telLabel.style.cssText = 'font-size:11px;cursor:pointer;';
        telDiv.appendChild(telCheck);
        telDiv.appendChild(telLabel);

        const telCampos = document.createElement('div');
        telCampos.id = 'osir-telefonia-campos';
        telCampos.style.cssText = 'display:none;padding-left:20px;margin-top:4px;';
        telCampos.innerHTML = `
            <div style="margin:2px 0;"><input id="osir-ip-telefonia" placeholder="IP" style="width:100%;padding:2px;font-size:11px;border:1px solid #ccc;border-radius:3px;"></div>
            <div style="margin:2px 0;"><input id="osir-numero-telefonia" placeholder="Nº" style="width:100%;padding:2px;font-size:11px;border:1px solid #ccc;border-radius:3px;"></div>
            <div style="margin:2px 0;"><input id="osir-senha-telefonia" placeholder="Senha" style="width:100%;padding:2px;font-size:11px;border:1px solid #ccc;border-radius:3px;"></div>
        `;

        telCheck.addEventListener('change', function() {
            telCampos.style.display = this.checked ? 'block' : 'none';
        });

        opcoesDiv.appendChild(telDiv);
        opcoesDiv.appendChild(telCampos);
        janela.appendChild(opcoesDiv);

        // Botões
        const botoesDiv = document.createElement('div');
        botoesDiv.style.cssText = 'display:flex;gap:4px;margin:6px 0;flex-wrap:wrap;';

        const botoes = [
            ['📥 Complementar', '#7c3aed', complementar],
            ['🔄 Atualizar', '#7c3aed', atualizarMesclar],
            ['❌ Limpar', '#6b7280', limparComplemento],
            ['📋 Copiar', '#6b7280', copiarComplemento]
        ];

        botoes.forEach(([label, cor, fn]) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = `
                padding:4px 10px;background:${cor};color:#fff;border:none;
                border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;
                flex:1;min-width:50px;
            `;
            btn.onclick = fn;
            botoesDiv.appendChild(btn);
        });

        janela.appendChild(botoesDiv);

        // VLAN e Porta Web
        const infoContainer = document.createElement('div');
        infoContainer.style.cssText = `
            background:#f0f4ff;padding:6px 10px;border-radius:4px;margin:6px 0;
            font-size:10px;border:1px solid #d1d5db;display:flex;justify-content:space-between;
        `;
        infoContainer.innerHTML = `
            <span>VLAN: <strong id="osir-vlan-display">---</strong></span>
            <span>Porta Web: <strong id="osir-portaweb-display">80</strong></span>
        `;
        janela.appendChild(infoContainer);

        // Preview Config
        const previewConfigLabel = document.createElement('div');
        previewConfigLabel.style.cssText = `
            font-weight:700;color:#4b5563;margin:6px 0 4px 0;
            font-size:10px;text-transform:uppercase;
        `;
        previewConfigLabel.textContent = '📝 Preview Config';
        janela.appendChild(previewConfigLabel);

        const previewConfig = document.createElement('div');
        previewConfig.id = 'osir-preview-complement';
        previewConfig.style.cssText = `
            background:linear-gradient(135deg,#f3f4f6,#e5e7eb);
            padding:6px 8px;border-radius:4px;font-family:'Courier New',monospace;
            font-size:9px;color:#1f2937;min-height:20px;word-break:break-all;
            max-height:40px;overflow-y:auto;margin-bottom:8px;
            border:1px solid #d1d5db;font-weight:500;
        `;
        previewConfig.textContent = 'Selecione um modelo...';
        janela.appendChild(previewConfig);

        // Lista de partes
        const listaDiv = document.createElement('div');
        listaDiv.style.cssText = 'margin:6px 0;';
        listaDiv.innerHTML = `
            <div style="display:flex;justify-content:space-between;font-weight:700;font-size:10px;color:#666;margin-bottom:4px;">
                <span>📋 PARTES</span>
                <span id="osir-contador">0/0</span>
            </div>
            <div id="osir-lista" style="background:#f9fafb;padding:6px;border-radius:4px;max-height:150px;overflow-y:auto;border:1px solid #e5e7eb;font-size:11px;">
                Nenhum complemento carregado
            </div>
        `;
        janela.appendChild(listaDiv);

        // Adicionar parte
        const addDiv = document.createElement('div');
        addDiv.style.cssText = 'display:flex;gap:4px;margin:6px 0;';
        addDiv.innerHTML = `
            <input id="osir-nova-parte" placeholder="Digite nova parte..." style="flex:1;padding:4px;font-size:11px;border:1px solid #ccc;border-radius:3px;">
            <button onclick="window.adicionarParte()" style="padding:4px 12px;background:#22c55e;color:#fff;border:none;border-radius:3px;cursor:pointer;font-weight:700;font-size:11px;">➕</button>
        `;
        janela.appendChild(addDiv);

        // Preview novo complemento
        const previewDiv = document.createElement('div');
        previewDiv.style.cssText = 'margin:6px 0;';
        previewDiv.innerHTML = `
            <div style="font-weight:700;font-size:10px;color:#666;margin-bottom:4px;">📝 NOVO COMPLEMENTO</div>
            <div id="osir-preview-novo" style="background:#f0fdf4;padding:6px;border-radius:4px;font-family:monospace;font-size:10px;word-break:break-all;border:1px solid #bbf7d0;min-height:20px;">
                (vazio)
            </div>
        `;
        janela.appendChild(previewDiv);

        menu.parentNode.insertBefore(janela, menu.nextSibling);
        setTimeout(atualizarPreviewConfig, 100);
        log('✅ Janela da esquerda criada');
    }

    // ============ FUNÇÕES DA JANELA ESQUERDA ============
    function identificarTipo(texto) {
        const modelos = ['Huawei Bridge', 'ZTE Bridge', 'Raisecom Bridge', 'Huawei Router', 'ZTE Router', 'Ektech Bridge'];
        if (modelos.some(m => texto.includes(m))) return 'modelo';
        if (texto.startsWith('SN:')) return 'serial';
        if (texto.includes('Cliente Wifi Pro')) return 'wifi_pro';
        if (texto.includes('Autentica na ZTE')) return 'autentica_zte';
        if (texto.includes('Autentica em uma RB')) return 'autentica_rb';
        if (texto.includes('OMADA')) return 'omada';
        if (texto.includes('Splitter:') || texto.includes('Porta:')) return 'splitter';
        if (texto.includes('Slot OLT:') && texto.includes('Porta OLT:')) return 'dados_olt';
        // SSID e Senha são SEMPRE uma coisa só (NUNCA separar)
        if (texto.includes('SSID:') || texto.includes('Senha:')) return 'ssid';
        if (texto.startsWith('IP Tel.:')) return 'ip_telefonia';
        if (texto.startsWith('Nº:')) return 'numero_telefonia';
        if (texto.startsWith('Senha Tel.:')) return 'senha_telefonia';
        return 'desconhecido';
    }

    function getModeloSelecionado() {
        const radio = document.querySelector('input[name="modelo-equipamento"]:checked');
        if (!radio) return 'Huawei Bridge';
        const map = {
            'huawei-router': 'Huawei Router',
            'huawei-bridge': 'Huawei Bridge',
            'ektech-bridge': 'Ektech Bridge',
            'raisecom-router': 'Raisecom Router',
            'raisecom-bridge': 'Raisecom Bridge',
            'raisecom-bridge-desativada': 'Raisecom Bridge (Des.)',
            'zte-bridge': 'ZTE Bridge',
            'zte-router': 'ZTE Router'
        };
        return map[radio.value] || 'Huawei Bridge';
    }

    function getDadosContrato() {
        return {
            serial: getEl('AuthenticationContractEquipmentSerialNumber')?.value?.trim() || 'XX',
            slot: getEl('AuthenticationContractSlotOlt')?.value?.trim() || 'XX',
            porta: getEl('AuthenticationContractPortOlt')?.value?.trim() || 'XX',
            id: getEl('AuthenticationContractOltId')?.value?.trim() || 'XX',
            ssid: getEl('AuthenticationContractWifiName')?.value?.trim() || '',
            senha: getEl('AuthenticationContractWifiPassword')?.value?.trim() || '',
            splitter: getEl('AuthenticationSplitterPortTitle')?.value?.trim() || '',
            portaSplitter: getEl('AuthenticationSplitterPortPort')?.value?.trim() || ''
        };
    }

    function montarBase() {
        const dados = getDadosContrato();
        const modelo = getModeloSelecionado();
        const tipo = (modelo.includes('Bridge') || modelo.includes('Ektech')) ? 'b' : 'r';
        const portaWeb = tipo === 'b' ? '8092' : '80';
        const vlan = calcularVlan('', dados.slot, dados.porta);

        // Atualizar VLAN e Porta Web no formulário
        const campoVlan = getEl('AuthenticationContractVlan');
        if (campoVlan && vlan !== 'XX') {
            campoVlan.value = vlan;
            campoVlan.dispatchEvent(new Event('input', { bubbles: true }));
            campoVlan.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const campoPorta = getEl('AuthenticationContractEquipmentPort');
        if (campoPorta) {
            campoPorta.value = portaWeb;
            campoPorta.dispatchEvent(new Event('input', { bubbles: true }));
            campoPorta.dispatchEvent(new Event('change', { bubbles: true }));
        }

        let partes = [];
        if (getEl('osir-wifi-pro-check')?.checked) partes.push('Cliente Wifi Pro');
        partes.push(modelo);
        if (dados.serial && dados.serial !== 'XX') partes.push(`SN: ${dados.serial}`);
        if (getEl('osir-autentica-zte-check')?.checked) partes.push('Autentica na ZTE');
        if (getEl('osir-autentica-rb-check')?.checked) partes.push('Autentica em uma RB');
        if (getEl('osir-omada-check')?.checked) partes.push('EAPs configurados no OMADA');

        if (dados.splitter && dados.splitter !== 'XX') {
            const ps = dados.portaSplitter && dados.portaSplitter !== 'XX' ? dados.portaSplitter : 'XX';
            partes.push(`Splitter: ${dados.splitter} Porta: ${ps}`);
        } else {
            partes.push('XX - Porta XX');
        }

        if (dados.slot && dados.porta && dados.id) {
            const p = dados.porta.length === 1 ? '0' + dados.porta : dados.porta;
            partes.push(`Slot OLT: ${dados.slot} Porta OLT: ${p} ID: ${dados.id}`);
        }

        // SSID E SENHA SEMPRE JUNTOS (UMA ÚNICA PARTE)
        if (dados.ssid || dados.senha) {
            let parte = '';
            if (dados.ssid) parte += `SSID: ${dados.ssid}`;
            if (dados.senha) parte += ` Senha: ${dados.senha}`;
            if (parte) partes.push(parte.trim());
        }

        // Telefonia
        const temTel = getEl('osir-telefonia-check')?.checked;
        if (temTel) {
            const ip = getEl('osir-ip-telefonia')?.value?.trim();
            const num = getEl('osir-numero-telefonia')?.value?.trim();
            const senhaTel = getEl('osir-senha-telefonia')?.value?.trim();
            if (ip) partes.push(`IP Tel.: ${ip}`);
            if (num) partes.push(`Nº: ${num}`);
            if (senhaTel) partes.push(`Senha Tel.: ${senhaTel}`);
        }

        return partes.join(' || ');
    }

    function atualizarPreviewConfig() {
        const preview = getEl('osir-preview-complement');
        if (preview) {
            preview.textContent = montarBase() || 'Nenhum dado disponível';
        }

        const dados = getDadosContrato();
        const modelo = getModeloSelecionado();
        const tipo = (modelo.includes('Bridge') || modelo.includes('Ektech')) ? 'b' : 'r';
        const vlan = calcularVlan('', dados.slot, dados.porta);
        const portaWeb = tipo === 'b' ? '8092' : '80';

        const vlanDisplay = getEl('osir-vlan-display');
        const portaDisplay = getEl('osir-portaweb-display');
        if (vlanDisplay) vlanDisplay.textContent = vlan || '---';
        if (portaDisplay) portaDisplay.textContent = portaWeb || '80';
    }

    // ============ COMPLEMENTAR (Extrair + Marcar Opções) ============
    function complementar() {
        log('📥 Complementar - Extraindo...');
        const campo = getEl('AuthenticationContractComplement');
        if (!campo?.value?.trim()) {
            alert('Nenhum complemento encontrado!');
            estado.partes = [];
            atualizarLista();
            return;
        }

        const textoCompleto = campo.value;
        const items = textoCompleto.split('||').map(p => p.trim()).filter(p => p.length);
        estado.partes = items.map(t => ({
            id: estado.proximoId++,
            texto: t,
            manter: false,
            tipo: identificarTipo(t)
        }));

        atualizarLista();

        // ===== MARCAR OPÇÕES AUTOMATICAMENTE =====

        // 1. Detectar Modelo
        const modelosMap = {
            'Huawei Router': 'modelo-huawei-router',
            'Huawei Bridge': 'modelo-huawei-bridge',
            'Ektech Bridge': 'modelo-ektech-bridge',
            'Raisecom Router': 'modelo-raisecom-router',
            'Raisecom Bridge': 'modelo-raisecom-bridge',
            'Raisecom Bridge (Des.)': 'modelo-raisecom-bridge-desativada',
            'ZTE Bridge': 'modelo-zte-bridge',
            'ZTE Router': 'modelo-zte-router'
        };

        let modeloEncontrado = false;
        for (const [nome, id] of Object.entries(modelosMap)) {
            if (textoCompleto.includes(nome)) {
                const radio = document.getElementById(id);
                if (radio) {
                    radio.checked = true;
                    modeloEncontrado = true;
                    log(`✅ Modelo detectado: ${nome}`);
                }
                break;
            }
        }
        if (!modeloEncontrado) {
            log('ℹ️ Nenhum modelo encontrado no complemento');
        }

        // 2. Detectar Autentica na ZTE
        if (textoCompleto.includes('Autentica na ZTE')) {
            const check = getEl('osir-autentica-zte-check');
            if (check) {
                check.checked = true;
                log('✅ Autentica na ZTE detectado');
            }
        }

        // 3. Detectar WiFi Pro
        if (textoCompleto.includes('Cliente Wifi Pro')) {
            const check = getEl('osir-wifi-pro-check');
            if (check) {
                check.checked = true;
                log('✅ WiFi Pro detectado');
            }
        }

        // 4. Detectar Autentica em RB
        if (textoCompleto.includes('Autentica em uma RB')) {
            const check = getEl('osir-autentica-rb-check');
            if (check) {
                check.checked = true;
                log('✅ Autentica em RB detectado');
            }
        }

        // 5. Detectar OMADA
        if (textoCompleto.includes('EAPs configurados no OMADA')) {
            const check = getEl('osir-omada-check');
            if (check) {
                check.checked = true;
                log('✅ OMADA detectado');
            }
        }

        // 6. Detectar Telefonia
        if (textoCompleto.includes('Telefonia') ||
            textoCompleto.includes('Nº:') ||
            textoCompleto.includes('IP Tel.:') ||
            textoCompleto.includes('Senha Tel.:')) {
            const check = getEl('osir-telefonia-check');
            if (check) {
                check.checked = true;
                const campos = getEl('osir-telefonia-campos');
                if (campos) campos.style.display = 'block';

                // Extrair dados de telefonia
                const ipMatch = textoCompleto.match(/IP Tel\.:\s*([^\s||]+)/);
                const numMatch = textoCompleto.match(/Nº:\s*([^\s||]+)/);
                const senhaMatch = textoCompleto.match(/Senha Tel\.:\s*([^\s||]+)/);

                if (ipMatch) {
                    const input = getEl('osir-ip-telefonia');
                    if (input) input.value = ipMatch[1];
                }
                if (numMatch) {
                    const input = getEl('osir-numero-telefonia');
                    if (input) input.value = numMatch[1];
                }
                if (senhaMatch) {
                    const input = getEl('osir-senha-telefonia');
                    if (input) input.value = senhaMatch[1];
                }

                log('✅ Telefonia detectado');
            }
        }

        // Atualizar preview após marcar opções
        atualizarPreviewConfig();

        log(`✅ ${estado.partes.length} partes extraídas e opções marcadas`);
    }

    // ============ ATUALIZAR (MESCLAR) - CORRIGIDO ============
    function atualizarMesclar() {
        // Primeiro, atualizar VLAN e Porta Web com os dados do contrato
        preencherVlanEPortaWeb();

        // Se não houver partes carregadas, apenas preencher o complemento base
        if (!estado.partes.length) {
            const base = montarBase();
            const campo = getEl('AuthenticationContractComplement');
            if (campo) {
                campo.value = base;
                campo.dispatchEvent(new Event('input', { bubbles: true }));
                campo.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ Complemento base preenchido (sem partes)');

                // Atualizar preview
                const preview = getEl('osir-preview-novo');
                if (preview) preview.textContent = base;

                // Feedback visual
                const btn = document.querySelector('#osir-config-complement-window .btn-atualizar');
                if (btn) {
                    btn.textContent = '✅ OK';
                    btn.style.background = '#10b981';
                    setTimeout(() => {
                        btn.textContent = '🔄 Atualizar';
                        btn.style.background = '#7c3aed';
                    }, CFG.TIMINGS.FEEDBACK);
                }
            }
            return;
        }

        log('🔄 Mesclando partes mantidas + dados do contrato...');

        const mantidas = estado.partes.filter(p => p.manter).map(p => p.texto);
        const base = montarBase();
        const itensBase = base.split('||').map(p => p.trim()).filter(p => p.length);

        if (itensBase.length === 0 && mantidas.length === 0) {
            alert('Nenhum dado para gerar o complemento!');
            return;
        }

        // Mapear base por tipo
        const mapaBase = {};
        itensBase.forEach(item => {
            const tipo = identificarTipo(item);
            if (tipo !== 'desconhecido') mapaBase[tipo] = item;
        });

        // Sobrescrever com mantidas
        mantidas.forEach(item => {
            const tipo = identificarTipo(item);
            if (tipo !== 'desconhecido') mapaBase[tipo] = item;
        });

        const resultado = Object.values(mapaBase);
        const final = resultado.filter((v, i) => resultado.indexOf(v) === i);
        const novo = final.length ? final.join(' || ') : '';

        const campo = getEl('AuthenticationContractComplement');
        if (campo) {
            campo.value = novo;
            campo.dispatchEvent(new Event('input', { bubbles: true }));
            campo.dispatchEvent(new Event('change', { bubbles: true }));
            log('✅ Campo atualizado:', novo);
        }

        // Recarregar partes
        complementar();
        const preview = getEl('osir-preview-novo');
        if (preview) preview.textContent = novo || '(vazio)';

        // Feedback visual
        const btn = document.querySelector('#osir-config-complement-window .btn-atualizar');
        if (btn) {
            btn.textContent = '✅ OK';
            btn.style.background = '#10b981';
            setTimeout(() => {
                btn.textContent = '🔄 Atualizar';
                btn.style.background = '#7c3aed';
            }, CFG.TIMINGS.FEEDBACK);
        }
    }

    // ============ LIMPAR ============
    function limparComplemento() {
        const campo = getEl('AuthenticationContractComplement');
        if (campo) {
            campo.value = '';
            campo.dispatchEvent(new Event('input', { bubbles: true }));
        }
        estado.partes = [];
        atualizarLista();
        const preview = getEl('osir-preview-novo');
        if (preview) preview.textContent = '(vazio)';
        log('✅ Limpo');
    }

    // ============ COPIAR ============
    function copiarComplemento() {
        const preview = getEl('osir-preview-novo');
        if (!preview?.textContent || preview.textContent === '(vazio)') {
            alert('Nada para copiar!');
            return;
        }
        navigator.clipboard.writeText(preview.textContent).then(() => {
            log('✅ Copiado!');
        }).catch(() => alert('Erro ao copiar'));
    }

    // ============ ATUALIZAR LISTA ============
    function atualizarLista() {
        const container = getEl('osir-lista');
        if (!container) return;

        if (!estado.partes.length) {
            container.innerHTML = '<div style="padding:8px;color:#666;">Nenhum complemento carregado</div>';
            return;
        }

        let html = '';
        estado.partes.forEach((p, i) => {
            const icone = {
                'modelo': '📋', 'serial': '🔑', 'ssid': '📡',
                'splitter': '📍', 'dados_olt': '🖥️',
                'autentica_zte': '🔐', 'wifi_pro': '📶'
            }[p.tipo] || '📄';

            html += `
                <div style="display:flex;align-items:center;padding:4px;margin:2px 0;
                    background:${p.manter ? '#e8f5e9' : '#f5f5f5'};
                    border-left:3px solid ${p.manter ? '#4caf50' : '#ccc'};">
                    <input type="checkbox" ${p.manter ? 'checked' : ''}
                           onchange="window.toggleManter(${p.id})" style="margin-right:6px;">
                    <span style="margin-right:4px;">${icone}</span>
                    <span style="flex:1;font-size:11px;font-family:monospace;word-break:break-all;">${p.texto}</span>
                    <button onclick="window.removerParte(${p.id})"
                            style="background:#f44336;color:#fff;border:none;border-radius:3px;padding:0 6px;cursor:pointer;">✕</button>
                </div>
            `;
        });

        container.innerHTML = html;
        const contador = getEl('osir-contador');
        if (contador) {
            const ativas = estado.partes.filter(p => p.manter).length;
            contador.textContent = `${ativas}/${estado.partes.length}`;
        }
    }

    // ============ FUNÇÕES GLOBAIS ============
    window.toggleManter = function(id) {
        const p = estado.partes.find(item => item.id === id);
        if (p) {
            p.manter = !p.manter;
            atualizarLista();
        }
    };

    window.removerParte = function(id) {
        if (confirm('Remover esta parte?')) {
            estado.partes = estado.partes.filter(p => p.id !== id);
            atualizarLista();
        }
    };

    window.adicionarParte = function() {
        const input = getEl('osir-nova-parte');
        if (!input?.value?.trim()) {
            alert('Digite um texto');
            return;
        }
        estado.partes.push({
            id: estado.proximoId++,
            texto: input.value.trim(),
            manter: true,
            tipo: identificarTipo(input.value.trim())
        });
        input.value = '';
        atualizarLista();
    };

    // ============ BOTÃO NA FILA ============
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

    function injetarBotaoFila() {
        removerBotaoComplementar();
        if (getEl('btn-copiar-osir-nativo')) return;

        let btnChamado = null;
        const todos = document.querySelectorAll('button, input[type="button"], a, .btn');
        for (const btn of todos) {
            const texto = btn.textContent?.trim() || '';
            if (texto === 'Chamado' || btn.id === 'linkChamado' || btn.href?.includes('new_solicitations')) {
                btnChamado = btn;
                break;
            }
        }

        if (!btnChamado) return;

        const novo = document.createElement('a');
        novo.id = 'btn-copiar-osir-nativo';
        novo.textContent = '📥 Preparar Dados';
        novo.style.cssText = `
            display:inline-flex;align-items:center;justify-content:center;
            padding:4px 10px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);
            color:#fff;border:1px solid #7c3aed;border-radius:4px;cursor:pointer;
            font-weight:700;font-size:10px;text-decoration:none;height:31px;min-width:60px;
        `;
        novo.onclick = function(e) {
            e.preventDefault();
            try {
                const dados = capturarDadosProvisionamento();
                dados.wifiPro = estado.wifiPro;
                const string = montarStringOSIRDATA(dados);
                navigator.clipboard.writeText(string).then(() => {
                    this.textContent = '✅ OK';
                    this.style.background = '#10b981';
                    setTimeout(() => {
                        this.textContent = '📥 Preparar Dados';
                        this.style.background = 'linear-gradient(135deg,#8b5cf6,#7c3aed)';
                    }, 2000);
                });
            } catch(err) {
                console.error(err);
            }
        };
        btnChamado.parentNode.replaceChild(novo, btnChamado);
        log('✅ Botão Preparar Dados substituiu o Chamado');
    }

    // ============ ALERTA SALVO ============
    function exibirAlertaSalvo(contratoId, data) {
        if (getEl('osir-alerta-salvo')) return;

        const dataStr = data.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const alerta = document.createElement('div');
        alerta.id = 'osir-alerta-salvo';
        alerta.style.cssText = `
            position:fixed;bottom:75px;right:15px;width:320px;
            background:#fff;border:2px solid #10b981;border-radius:10px;
            box-shadow:0 8px 32px rgba(16,185,129,0.25);z-index:99999;
            font-family:'Segoe UI',sans-serif;animation:fadeIn 0.4s ease;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn { from { opacity:0;transform:translateY(20px); } to { opacity:1;transform:translateY(0); } }
        `;
        document.head.appendChild(style);

        alerta.innerHTML = `
            <div style="background:linear-gradient(135deg,#10b981,#059669);padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-radius:10px 10px 0 0;">
                <span style="color:#fff;font-weight:700;font-size:12px;">✅ CONTRATO SALVO</span>
                <button onclick="this.closest('#osir-alerta-salvo').remove()" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;">✕</button>
            </div>
            <div style="padding:12px 14px;">
                <div style="font-size:12px;font-weight:600;color:#1f2937;">Contrato #${contratoId} salvo!</div>
                <div style="font-size:11px;color:#6b7280;margin-bottom:10px;">📅 ${dataStr}</div>
                <button onclick="this.closest('#osir-alerta-salvo').remove()" style="padding:4px 16px;background:#10b981;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:700;font-size:11px;">OK</button>
            </div>
        `;

        document.body.appendChild(alerta);
        setTimeout(() => {
            const el = getEl('osir-alerta-salvo');
            if (el) {
                el.style.transition = 'all 0.4s ease';
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 400);
            }
        }, CFG.TIMINGS.ALERTA_TIMEOUT);
    }

    // ============ VERIFICAR DADOS ============
    async function verificarDados() {
        let dados = null;
        try {
            const texto = await navigator.clipboard.readText();
            if (texto?.startsWith('OSIRDATA||')) {
                dados = extrairDadosClipboard(texto);
                if (dados) estado.wifiPro = dados.wifiPro || false;
            }
        } catch(e) {}

        if (!dados) {
            const salvos = storage.getJSON('osir_ultimos_dados');
            if (salvos?.dados) {
                dados = salvos.dados;
                estado.wifiPro = dados.wifiPro || false;
            }
        }

        if (dados?.serial && dados.serial !== 'XX') {
            criarJanelaFlutuante(dados);
        }
    }

    // ============ INICIAR ============
    function iniciar() {
        log('🚀 Iniciando...');

        // URL Atendimento - Botão na fila
        if (location.href.includes(CFG.URL_ATENDIMENTO)) {
            const interval = setInterval(injetarBotaoFila, CFG.TIMINGS.INJECAO_BOTAO);
            setTimeout(injetarBotaoFila, CFG.TIMINGS.DELAY_1);
            setTimeout(injetarBotaoFila, CFG.TIMINGS.DELAY_2);
            window.addEventListener('beforeunload', () => clearInterval(interval));
            log('✅ Modo Atendimento');
            return;
        }

        // URL Contrato - Janelas
        if (location.href.includes(CFG.URL_CONTRATO) || location.href.includes(CFG.URL_OPERACAO)) {
            // Janela flutuante (direita)
            setTimeout(verificarDados, CFG.TIMINGS.VERIFICAR_1);
            setTimeout(verificarDados, CFG.TIMINGS.VERIFICAR_2);

            // Janela esquerda
            let tentativas = 0;
            const interval = setInterval(() => {
                tentativas++;
                const menu = document.querySelector('.panel-content .contract-menu');
                if (menu && !getEl('osir-config-complement-window')) {
                    criarJanelaEsquerda();
                    clearInterval(interval);
                }
                if (tentativas >= CFG.TIMINGS.MAX_TENTATIVAS) {
                    clearInterval(interval);
                }
            }, CFG.TIMINGS.INTERVALO);
            window.addEventListener('beforeunload', () => clearInterval(interval));

            // Monitoramento de salvamento
            setTimeout(() => {
                const observer = new MutationObserver(() => {
                    const growler = getEl('neo-growler');
                    if (growler?.dataset?.visible === '1') {
                        const box = growler.querySelector('#neo-growler-content .growl-box');
                        const msg = box?.textContent || '';
                        if (msg.includes('salvo') || msg.includes('sucesso') || msg.includes('atualizado')) {
                            const id = document.querySelector('.contract-menu')?.getAttribute('data-contractid');
                            if (id) {
                                storage.setJSON(`osir_contrato_salvo_${id}`, {
                                    salvoEm: new Date().toISOString(),
                                    status: 'SALVO'
                                });
                                exibirAlertaSalvo(id, new Date());
                            }
                        }
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            }, CFG.TIMINGS.MONITORAMENTO);

            // Verificar se já foi salvo
            setTimeout(() => {
                const id = document.querySelector('.contract-menu')?.getAttribute('data-contractid');
                if (id) {
                    const dados = storage.getJSON(`osir_contrato_salvo_${id}`);
                    if (dados) {
                        const data = new Date(dados.salvoEm);
                        const horas = (new Date() - data) / (1000 * 60 * 60);
                        if (horas < 24 && !getEl('osir-alerta-salvo')) {
                            exibirAlertaSalvo(id, data);
                        }
                    }
                }
            }, 3000);

            log('✅ Modo Contrato');
        }
    }

    // ============ EXECUTAR ============
    if (location.href.includes(CFG.URL_ATENDIMENTO) ||
        location.href.includes(CFG.URL_CONTRATO) ||
        location.href.includes(CFG.URL_OPERACAO)) {
        setTimeout(iniciar, 500);
    }

})();
