// ==UserScript==
// @name         Osir - Assistente de Provisionamento
// @namespace    http://tampermonkey.net/
// @version      6.1.0
// @description  Provisionamento - Fila e Contrato
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

    // ═══════════════════════════════════════════════════════════════
    // 1. CONFIGURAÇÕES E CONSTANTES
    // ═══════════════════════════════════════════════════════════════

    const CONFIG = {
        debug: true,
        version: '6.1.0',
        cacheTTL: 10000,
        urls: {
            atendimento: 'filaProvisionamento.php',
            contrato: 'authentication_contracts/contract_panel',
            operacao: '/legacy/operations/'
        },
        timings: {
            injecaoBotao: 800,
            verificarDados: [2000, 4000],
            maxTentativasJanela: 15,
            feedbackBotao: 1500
        },
        janela: {
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
        }
    };

    const CAMPOS = {
        SERIAL: 'AuthenticationContractEquipmentSerialNumber',
        SSID: 'AuthenticationContractWifiName',
        SENHA: 'AuthenticationContractWifiPassword',
        SLOT: 'AuthenticationContractSlotOlt',
        PORTA: 'AuthenticationContractPortOlt',
        ID: 'AuthenticationContractOltId',
        VLAN: 'AuthenticationContractVlan',
        PORTA_WEB: 'AuthenticationContractEquipmentPort',
        TIPO: 'tipoProvisionamento',
        USUARIO_ONU: 'AuthenticationContractEquipmentUser',
        SENHA_ONU: 'AuthenticationContractEquipmentPassword',
        SPLITTER: 'AuthenticationSplitterPortTitle',
        PORTA_SPLITTER: 'AuthenticationSplitterPortPort',
        COMPLEMENTAR: 'AuthenticationContractComplement',
        MAC: 'AuthenticationContractMac'
    };

    // ═══════════════════════════════════════════════════════════════
    // 2. UTILITÁRIOS
    // ═══════════════════════════════════════════════════════════════

    function log(...args) {
        if (CONFIG.debug) {
            console.log(`[${new Date().toLocaleTimeString()}]`, ...args);
        }
    }

    function logError(...args) {
        if (CONFIG.debug) {
            console.error(`[${new Date().toLocaleTimeString()}]`, ...args);
        }
    }

    const storage = {
        get: (key) => { try { return localStorage.getItem(key); } catch(e) { return null; } },
        set: (key, value) => { try { localStorage.setItem(key, value); } catch(e) {} },
        remove: (key) => { try { localStorage.removeItem(key); } catch(e) {} },
        getJSON: (key) => {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : null;
            } catch(e) { return null; }
        },
        setJSON: (key, value) => {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
        }
    };

    const domCache = new Map();

    function getElement(id) {
        try {
            const cached = domCache.get(id);
            if (cached && cached.timestamp > Date.now() - CONFIG.cacheTTL) {
                return cached.element;
            }
            const element = document.getElementById(id);
            if (element) {
                domCache.set(id, { element, timestamp: Date.now() });
            }
            return element;
        } catch(e) {
            logError('Erro ao buscar elemento:', id, e);
            return null;
        }
    }

    function getValor(id) {
        const el = getElement(id);
        return el?.value?.trim() || '';
    }

    function setValor(id, valor) {
        const el = getElement(id);
        if (el && valor && valor !== 'XX' && valor !== '') {
            el.value = valor;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function clearCache() {
        domCache.clear();
    }

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ═══════════════════════════════════════════════════════════════
    // 3. ESTADO DA APLICAÇÃO
    // ═══════════════════════════════════════════════════════════════

    const state = {
        wifiPro: {
            _ativo: false,
            get ativo() { return this._ativo; },
            set ativo(valor) {
                this._ativo = Boolean(valor);
                storage.set('osir_wifi_pro_ativo', String(this._ativo));
            }
        },
        janela: {
            largura: CONFIG.janela.larguraPadrao,
            altura: CONFIG.janela.alturaPadrao,
            fonte: CONFIG.janela.fontePadrao
        },
        dadosAtuais: null
    };

    const wifiProSalvo = storage.get('osir_wifi_pro_ativo');
    if (wifiProSalvo !== null) {
        state.wifiPro._ativo = wifiProSalvo === 'true';
    }

    const prefsJanela = storage.getJSON('osir_janela_flutuante_prefs');
    if (prefsJanela) {
        state.janela.largura = prefsJanela.largura || CONFIG.janela.larguraPadrao;
        state.janela.altura = prefsJanela.altura || CONFIG.janela.alturaPadrao;
        state.janela.fonte = prefsJanela.fonte || CONFIG.janela.fontePadrao;
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. FUNÇÕES DE NEGÓCIO
    // ═══════════════════════════════════════════════════════════════

    function normalizarPE(nome) {
        if (!nome) return '';
        let n = nome.toUpperCase().trim();
        n = n.replace(/STLDC\s*0?1/, 'DC 1');
        n = n.replace(/STLDC\s*0?2/, 'DC 2');
        n = n.replace(/PTN[_\s]*NOVA/, 'PTN');
        return n;
    }

    function calcularVlan(pontoAcesso, slot, porta) {
        const pa = normalizarPE(pontoAcesso);

        const vlanEspecial = ['STL_CE3_R', 'STL_CE4_R', 'STL_CE_3', 'STL_CE_4', 'TTN_LAN', 'GAR', 'ROS'];
        if (vlanEspecial.some(v => pa.includes(v))) {
            return '2200';
        }

        const s = parseInt(slot, 10);
        const p = parseInt(porta, 10);
        if (isNaN(s) || isNaN(p) || slot === 'XX' || porta === 'XX') return 'XX';

        if (s === 0) return (p + 10).toString();
        return s.toString() + (p < 10 ? '0' + p : p.toString());
    }

    function definirPortaWeb(tipo) {
        const t = (tipo || '').toLowerCase().trim();
        if (t === 'b') return '8092';
        if (t === 'r') return '80';
        return '80';
    }

    function detectarEquipamento(tipo, serial) {
        const s = (serial || '').toUpperCase();
        const t = (tipo || '').toLowerCase().trim();

        if (s.startsWith('53484') || s.startsWith('48575')) return 'Ektech Bridge';
        if (s.startsWith('4857') || s.startsWith('HWTC')) {
            return t === 'b' ? 'Huawei Bridge' : 'Huawei Router';
        }
        if (s.startsWith('ZTEG') || s.startsWith('5A54') || s.startsWith('5A544') || s.startsWith('ZTEGD')) {
            return 'ZTE Bridge';
        }
        if (s.startsWith('RCMG1')) return 'Raisecom Bridge';
        if (s.startsWith('RCMG3')) return 'Raisecom Router';
        if (s.startsWith('RCMG')) return t === 'b' ? 'Raisecom Bridge' : 'Raisecom Router';
        return 'Equipamento Desconhecido';
    }

    function precisaAutenticar(tipo, serial) {
        const s = (serial || '').toUpperCase();
        const t = (tipo || '').toLowerCase().trim();

        if (t === 'b') return true;
        if (t === 'r') return false;
        if (s.startsWith('RCMG1')) return true;
        if (s.startsWith('RCMG3')) return false;
        if (s.startsWith('5A544') || s.startsWith('ZTEGD')) return true;
        if (s.startsWith('ZTEG') || s.startsWith('5A54')) return false;
        if (s.startsWith('RCMG')) return false;
        if (s.startsWith('4857') || s.startsWith('HWTC') || s.startsWith('53484') || s.startsWith('48575')) {
            return t === 'b';
        }
        return false;
    }

    function extrairOSIRDATA(texto) {
        try {
            if (!texto?.trim().startsWith('OSIRDATA||')) return null;
            const p = texto.trim().split('||');
            if (p.length < 18) return null;

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
                    temTelefonia: !!(p[12] && p[12].trim()),
                    numero: p[12] || '',
                    senha: p[13] || '',
                    ip: p[14] || ''
                }
            };
        } catch(e) {
            logError('Erro ao extrair OSIRDATA:', e);
            return null;
        }
    }

    function montarOSIRDATA(dados) {
        const tel = dados.telefonia || {};
        return `OSIRDATA||${dados.serial}||${dados.ssid}||${dados.senha}||${dados.slot}||${dados.porta}||${dados.id}||${dados.contrato}||${dados.vlan}||${dados.pontoAcesso}||${dados.olt}||${dados.tipoProvisionamento}||${tel.numero||''}||${tel.senha||''}||${tel.ip||''}||${dados.portaWeb||'80'}||${dados.sinal||''}||${state.wifiPro.ativo?'1':'0'}`;
    }

    function formatarPESlotPorta(dados) {
        let pe = dados.pontoAcesso || dados.olt || '';
        if (pe.includes(' - ')) {
            pe = pe.split(' - ').pop().trim();
        }
        pe = normalizarPE(pe);
        pe = pe.replace(/STL_CE_/, 'STL ').replace(/JUN_/, 'JUN ').replace(/_/g, ' ');

        const slot = String(dados.slot || '0').padStart(2, '0');
        const porta = String(dados.porta || '0').padStart(2, '0');
        return `${pe} ${slot} ${porta}`;
    }

    function getIDCorreto(dadosOSIR) {
        if (dadosOSIR.id && dadosOSIR.id !== 'XX') {
            log(`✅ Usando ID do OSIRDATA: ${dadosOSIR.id}`);
            return dadosOSIR.id;
        }
        const idForm = getValor(CAMPOS.ID);
        if (idForm && idForm !== 'XX') {
            log(`📝 Usando ID do formulário: ${idForm}`);
            return idForm;
        }
        return 'XX';
    }

    function getSSIDeSenha(dadosOSIR) {
        const complementar = getValor(CAMPOS.COMPLEMENTAR);
        if (complementar) {
            const ssidMatch = complementar.match(/SSID:\s*([^|]+)/i);
            const senhaMatch = complementar.match(/Senha:\s*([^|]+)/i);
            if (ssidMatch || senhaMatch) {
                log('🔒 Mantendo SSID/Senha da complementar');
                return {
                    ssid: ssidMatch ? ssidMatch[1].trim() : null,
                    senha: senhaMatch ? senhaMatch[1].trim() : null
                };
            }
        }
        if (dadosOSIR.ssid && dadosOSIR.ssid !== 'XX') {
            log(`📝 Usando SSID/Senha do OSIRDATA`);
            return { ssid: dadosOSIR.ssid, senha: dadosOSIR.senha };
        }
        return { ssid: null, senha: null };
    }

    function montarComplemento(opcoes) {
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

        const partes = [];

        if (wifiPro) partes.push('Cliente Wifi Pro');
        if (modelo) partes.push(modelo);
        if (serial && serial !== 'XX') partes.push(`SN: ${serial}`);
        if (autenticaZTE) partes.push('Autentica na ZTE');
        if (autenticaRB) partes.push('Autentica em uma RB');
        if (omada) partes.push('EAPs configurados no OMADA');

        if (splitter && splitter !== 'XX') {
            const ps = portaSplitter && portaSplitter !== 'XX'
                ? (/^\d+$/.test(portaSplitter) ? portaSplitter.padStart(2, '0') : portaSplitter)
                : 'XX';
            partes.push(`Splitter: ${splitter} Porta: ${ps}`);
        } else {
            partes.push('XX - Porta XX');
        }

        if (slot && porta && id) {
            const p = /^\d+$/.test(porta) ? porta.padStart(2, '0') : porta;
            partes.push(`Slot OLT: ${slot} Porta OLT: ${p} ID: ${id}`);
        }

        if (ssid && ssid !== 'XX') {
            partes.push(senha && senha !== 'XX' ? `SSID: ${ssid} - Senha: ${senha}` : `SSID: ${ssid}`);
        } else if (senha && senha !== 'XX') {
            partes.push(`Senha: ${senha}`);
        }

        if (telefonia?.temTelefonia) {
            if (telefonia.numero) partes.push(`Nº: ${telefonia.numero}`);
            if (telefonia.senha) partes.push(`Senha da Telefonia: ${telefonia.senha}`);
            if (telefonia.ip) partes.push(`IP de Telefonia: ${telefonia.ip}`);
        }

        return partes.join(' || ')
            .replace(/\|\|\s*\|\|/g, '||')
            .replace(/^\s*\|\|\s*/, '')
            .replace(/\s*\|\|\s*$/, '')
            .trim();
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. UI HELPERS (NEUTRO)
    // ═══════════════════════════════════════════════════════════════

    function criarBotao(texto, cor, onClick, extras = {}) {
        const btn = document.createElement('button');
        btn.textContent = texto;

        const cores = {
            primario: { bg: '#4F46E5', hover: '#4338CA', shadow: 'rgba(79, 70, 229, 0.3)' },
            secundario: { bg: '#6B7280', hover: '#4B5563', shadow: 'rgba(107, 114, 128, 0.3)' },
            sucesso: { bg: '#059669', hover: '#047857', shadow: 'rgba(5, 150, 105, 0.3)' },
            perigo: { bg: '#DC2626', hover: '#B91C1C', shadow: 'rgba(220, 38, 38, 0.3)' }
        };

        const c = cores[cor] || cores.primario;

        Object.assign(btn.style, {
            padding: '6px 12px',
            background: c.bg,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '11px',
            transition: 'all 0.2s ease',
            boxShadow: `0 1px 3px ${c.shadow}`,
            letterSpacing: '0.2px',
            ...extras
        });

        btn.onmouseover = () => {
            btn.style.background = c.hover;
            btn.style.transform = 'translateY(-1px)';
            btn.style.boxShadow = `0 4px 12px ${c.shadow}`;
        };
        btn.onmouseout = () => {
            btn.style.background = c.bg;
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = `0 1px 3px ${c.shadow}`;
        };
        btn.onclick = onClick;

        return btn;
    }

    function criarBadge(texto, cor, fundo) {
        const badge = document.createElement('div');
        Object.assign(badge.style, {
            background: fundo || '#F3F4F6',
            color: cor || '#1F2937',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: '600',
            border: '1px solid #E5E7EB',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
        });
        badge.textContent = texto;
        return badge;
    }

    function criarLinha(label, valor, comBotao = false, onCopiar = null) {
        const linha = document.createElement('div');
        Object.assign(linha.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '5px 8px',
            borderBottom: '1px solid #F3F4F6',
            fontSize: '11px',
            gap: '4px',
            borderRadius: '4px',
            transition: 'background 0.15s ease'
        });
        linha.onmouseover = () => linha.style.background = '#F9FAFB';
        linha.onmouseout = () => linha.style.background = 'transparent';

        const labelEl = document.createElement('span');
        Object.assign(labelEl.style, {
            fontWeight: '600',
            color: '#4B5563',
            minWidth: '55px',
            flexShrink: '0'
        });
        labelEl.textContent = label;

        const valorEl = document.createElement('span');
        Object.assign(valorEl.style, {
            color: '#1F2937',
            fontFamily: 'Courier New, monospace',
            background: '#F9FAFB',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '500',
            border: '1px solid #E5E7EB',
            flex: '1',
            minWidth: '0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
        });
        valorEl.textContent = valor;

        if (!comBotao || !onCopiar) {
            linha.appendChild(labelEl);
            linha.appendChild(valorEl);
            return linha;
        }

        const container = document.createElement('div');
        Object.assign(container.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flex: '1',
            minWidth: '0'
        });

        valorEl.style.flex = '1';
        container.appendChild(valorEl);

        const btn = criarBotao('📋', 'secundario', onCopiar, {
            padding: '2px 6px',
            fontSize: '10px',
            lineHeight: '1.2',
            flexShrink: '0'
        });
        container.appendChild(btn);

        linha.appendChild(labelEl);
        linha.appendChild(container);
        return linha;
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. JANELA FLUTUANTE (NEUTRA)
    // ═══════════════════════════════════════════════════════════════

    function criarJanelaFlutuante(dados) {
        state.dadosAtuais = dados;
        if (dados.wifiPro !== undefined) {
            state.wifiPro.ativo = dados.wifiPro;
        }

        const existente = document.getElementById('osir-floating-window');
        const complemento = montarComplemento({
            wifiPro: state.wifiPro.ativo,
            modelo: detectarEquipamento(dados.tipoProvisionamento, dados.serial) + (dados.telefonia?.temTelefonia ? ' + Telefonia' : ''),
            serial: dados.serial,
            autenticaZTE: precisaAutenticar(dados.tipoProvisionamento, dados.serial),
            splitter: dados.splitter || '',
            portaSplitter: dados.portaSplitter || '',
            slot: dados.slot,
            porta: dados.porta,
            id: dados.id,
            ssid: dados.ssid,
            senha: dados.senha,
            telefonia: dados.telefonia
        });

        if (existente) {
            atualizarJanelaFlutuante(existente, dados, complemento);
            return;
        }

        const janela = document.createElement('div');
        janela.id = 'osir-floating-window';
        Object.assign(janela.style, {
            position: 'fixed',
            top: '70px',
            right: '15px',
            width: state.janela.largura + 'px',
            maxHeight: state.janela.altura + 'px',
            background: '#FFFFFF',
            border: '1px solid #D1D5DB',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            zIndex: '99999',
            fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif',
            padding: '0',
            overflowY: 'auto',
            transition: 'width 0.3s ease, max-height 0.3s ease, box-shadow 0.3s ease',
            fontSize: state.janela.fonte + 'px',
            userSelect: 'none'
        });

        janela.appendChild(criarHeaderFlutuante(janela, dados));
        janela.appendChild(criarCorpoFlutuante(dados, complemento));
        document.body.appendChild(janela);
        tornarArrastavel(janela);
    }

    function criarHeaderFlutuante(janela, dados) {
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            background: '#F8FAFC',
            borderRadius: '11px 11px 0 0',
            gap: '6px',
            flexWrap: 'wrap',
            cursor: 'grab',
            userSelect: 'none',
            borderBottom: '1px solid #E5E7EB'
        });
        header.className = 'osir-header-drag';

        const esquerda = document.createElement('div');
        esquerda.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        esquerda.innerHTML = `
            <span style="font-size:16px;font-weight:700;color:#4F46E5;">⚡</span>
            <span style="font-weight:700;font-size:13px;color:#1F2937;">Osir Assistente</span>
            <span style="font-weight:600;font-size:10px;color:#6B7280;background:#F3F4F6;padding:2px 10px;border-radius:12px;border:1px solid #E5E7EB;">#${dados.contrato || '???'}</span>
        `;

        const controles = document.createElement('div');
        controles.className = 'osir-no-drag';
        controles.style.cssText = 'display: flex; align-items: center; gap: 4px;';

        const btnMenos = criarBotao('−', 'secundario', () => {
            state.janela.largura = Math.max(CONFIG.janela.larguraMin, state.janela.largura - CONFIG.janela.passo);
            state.janela.altura = Math.max(CONFIG.janela.alturaMin, state.janela.altura - CONFIG.janela.passo);
            state.janela.fonte = Math.max(CONFIG.janela.fonteMin, state.janela.fonte - 1);
            aplicarTamanhoJanela(janela);
            storage.setJSON('osir_janela_flutuante_prefs', state.janela);
        }, { padding: '2px 8px', fontSize: '14px', minWidth: '24px', background: '#F3F4F6', color: '#1F2937', boxShadow: 'none' });

        const sizeDisplay = document.createElement('span');
        sizeDisplay.id = 'osir-size-display';
        Object.assign(sizeDisplay.style, {
            fontSize: '7px',
            color: '#6B7280',
            padding: '2px 6px',
            minWidth: '45px',
            textAlign: 'center',
            fontFamily: 'Courier New, monospace',
            fontWeight: '600',
            background: '#F9FAFB',
            borderRadius: '4px',
            border: '1px solid #E5E7EB'
        });
        sizeDisplay.textContent = `${state.janela.largura}×${state.janela.altura}`;

        const btnMais = criarBotao('+', 'secundario', () => {
            state.janela.largura = Math.min(CONFIG.janela.larguraMax, state.janela.largura + CONFIG.janela.passo);
            state.janela.altura = Math.min(CONFIG.janela.alturaMax, state.janela.altura + CONFIG.janela.passo);
            state.janela.fonte = Math.min(CONFIG.janela.fonteMax, state.janela.fonte + 1);
            aplicarTamanhoJanela(janela);
            storage.setJSON('osir_janela_flutuante_prefs', state.janela);
        }, { padding: '2px 8px', fontSize: '14px', minWidth: '24px', background: '#F3F4F6', color: '#1F2937', boxShadow: 'none' });

        const btnReset = criarBotao('↺', 'secundario', () => {
            state.janela.largura = CONFIG.janela.larguraPadrao;
            state.janela.altura = CONFIG.janela.alturaPadrao;
            state.janela.fonte = CONFIG.janela.fontePadrao;
            aplicarTamanhoJanela(janela);
            storage.setJSON('osir_janela_flutuante_prefs', state.janela);
            if (janela.resetPosition) janela.resetPosition();
        }, { padding: '2px 8px', fontSize: '14px', background: '#F3F4F6', color: '#1F2937', boxShadow: 'none' });

        const btnFechar = criarBotao('✕', 'perigo', () => {
            janela.remove();
            state.dadosAtuais = null;
        }, { padding: '2px 8px', fontSize: '13px' });

        controles.append(btnMenos, sizeDisplay, btnMais, btnReset, btnFechar);
        header.append(esquerda, controles);
        return header;
    }

    function criarCorpoFlutuante(dados, complemento) {
        const body = document.createElement('div');
        body.style.cssText = 'padding: 12px 14px 14px 14px;';

        // Badges
        const badges = document.createElement('div');
        badges.style.cssText = 'display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap;';
        badges.append(
            criarBadge('📋 Dados do Provisionamento', '#1F2937', '#F3F4F6'),
            criarBadge(
                (dados.telefonia?.temTelefonia ? '✅ Dados do Amarelo 📞' : '✅ Dados do Amarelo') + (state.wifiPro.ativo ? ' 📶 WiFi Pro' : ''),
                '#065F46', '#D1FAE5'
            )
        );
        body.appendChild(badges);

        // WiFi Pro toggle
        const wifiContainer = document.createElement('div');
        Object.assign(wifiContainer.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            marginBottom: '8px',
            background: '#F9FAFB',
            borderRadius: '6px',
            border: '1px solid #E5E7EB'
        });

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'osir-wifi-pro-checkbox';
        checkbox.checked = state.wifiPro.ativo;
        checkbox.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:#4F46E5;';
        checkbox.addEventListener('change', () => {
            state.wifiPro.ativo = checkbox.checked;
            const dadosAtualizados = state.dadosAtuais;
            if (dadosAtualizados) {
                const novoComplemento = montarComplemento({
                    wifiPro: state.wifiPro.ativo,
                    modelo: detectarEquipamento(dadosAtualizados.tipoProvisionamento, dadosAtualizados.serial) + (dadosAtualizados.telefonia?.temTelefonia ? ' + Telefonia' : ''),
                    serial: dadosAtualizados.serial,
                    autenticaZTE: precisaAutenticar(dadosAtualizados.tipoProvisionamento, dadosAtualizados.serial),
                    splitter: dadosAtualizados.splitter || '',
                    portaSplitter: dadosAtualizados.portaSplitter || '',
                    slot: dadosAtualizados.slot,
                    porta: dadosAtualizados.porta,
                    id: dadosAtualizados.id,
                    ssid: dadosAtualizados.ssid,
                    senha: dadosAtualizados.senha,
                    telefonia: dadosAtualizados.telefonia
                });
                const preview = document.querySelector('.osir-preview-texto');
                if (preview) preview.textContent = novoComplemento;
            }
        });

        const label = document.createElement('label');
        label.htmlFor = 'osir-wifi-pro-checkbox';
        label.textContent = '📶 WiFi Pro';
        Object.assign(label.style, {
            fontWeight: '600',
            color: '#1F2937',
            fontSize: '11px',
            cursor: 'pointer',
            userSelect: 'none'
        });

        wifiContainer.append(checkbox, label);
        body.appendChild(wifiContainer);

        // Campos
        let pe = dados.nomeOLT || dados.olt || 'N/A';
        if (pe === 'N/A' && dados.pontoAcesso) pe = dados.pontoAcesso;

        body.appendChild(criarLinha('📍 PE', pe, true, () => {
            const texto = formatarPESlotPorta(dados);
            navigator.clipboard.writeText(texto);
        }));

        const campos = [
            ['📊 Slot', dados.slot || 'XX'],
            ['🔌 Porta', dados.porta || 'XX'],
            ['🆔 ID', dados.id || 'XX'],
            ['🔌 Serial', dados.serial || 'XX'],
            ['📡 SSID', dados.ssid || 'XX'],
            ['🔑 Senha', dados.senha || 'XX']
        ];
        campos.forEach(([label, valor]) => body.appendChild(criarLinha(label, valor)));

        if (dados.telefonia?.temTelefonia) {
            body.appendChild(criarLinha('📞 Tel', dados.telefonia.numero || 'N/A'));
            if (dados.telefonia.senha) body.appendChild(criarLinha('🔑 Senha Tel', dados.telefonia.senha));
            if (dados.telefonia.ip) body.appendChild(criarLinha('🌐 IP Tel', dados.telefonia.ip));
        }

        // Preview
        const previewLabel = document.createElement('div');
        previewLabel.style.cssText = 'margin-top:10px;font-weight:600;color:#4B5563;font-size:10px;display:flex;align-items:center;gap:6px;';
        previewLabel.innerHTML = '📝 <span style="background:#F3F4F6;padding:0 8px;border-radius:4px;border:1px solid #E5E7EB;">Complemento</span>';
        body.appendChild(previewLabel);

        const preview = document.createElement('div');
        preview.className = 'osir-preview-texto';
        Object.assign(preview.style, {
            marginTop: '4px',
            padding: '8px 10px',
            background: '#F9FAFB',
            borderRadius: '6px',
            fontFamily: 'Courier New, monospace',
            fontSize: '9px',
            color: '#1F2937',
            wordBreak: 'break-all',
            maxHeight: '60px',
            overflowY: 'auto',
            border: '1px solid #E5E7EB',
            fontWeight: '500'
        });
        preview.textContent = complemento;
        body.appendChild(preview);

        // Botões
        const botoes = document.createElement('div');
        botoes.style.cssText = 'display: flex; gap: 8px; margin-top: 10px;';

        const btnSincronizar = criarBotao('🔄 Sincronizar', 'primario', () => {
            const dadosAtuais = state.dadosAtuais;
            if (!dadosAtuais) return;

            const dadosParaEnviar = {
                ...dadosAtuais,
                id: getIDCorreto(dadosAtuais),
                wifiPro: state.wifiPro.ativo
            };
            const { ssid, senha } = getSSIDeSenha(dadosAtuais);
            if (ssid) dadosParaEnviar.ssid = ssid;
            if (senha) dadosParaEnviar.senha = senha;

            const osirData = montarOSIRDATA(dadosParaEnviar);
            navigator.clipboard.writeText(osirData).then(() => {
                preencherFormulario(dadosParaEnviar);
                btnSincronizar.textContent = '✅ OK';
                btnSincronizar.style.background = '#059669';
                setTimeout(() => {
                    btnSincronizar.textContent = '🔄 Sincronizar';
                    btnSincronizar.style.background = '#4F46E5';
                }, CONFIG.timings.feedbackBotao);
            });
        }, { flex: '1', padding: '8px 12px', fontSize: '10px' });

        const btnComplemento = criarBotao('📝 Complemento', 'primario', () => {
            const dadosAtuais = state.dadosAtuais;
            if (!dadosAtuais) return;

            const dadosComplemento = {
                ...dadosAtuais,
                splitter: getValor(CAMPOS.SPLITTER) || dadosAtuais.splitter,
                portaSplitter: getValor(CAMPOS.PORTA_SPLITTER) || dadosAtuais.portaSplitter,
                id: getValor(CAMPOS.ID) || dadosAtuais.id,
                ssid: getValor(CAMPOS.SSID) || dadosAtuais.ssid,
                senha: getValor(CAMPOS.SENHA) || dadosAtuais.senha
            };

            const novoComplemento = montarComplemento({
                wifiPro: state.wifiPro.ativo,
                modelo: detectarEquipamento(dadosAtuais.tipoProvisionamento, dadosAtuais.serial) + (dadosAtuais.telefonia?.temTelefonia ? ' + Telefonia' : ''),
                serial: dadosAtuais.serial,
                autenticaZTE: precisaAutenticar(dadosAtuais.tipoProvisionamento, dadosAtuais.serial),
                splitter: dadosComplemento.splitter,
                portaSplitter: dadosComplemento.portaSplitter,
                slot: dadosAtuais.slot,
                porta: dadosAtuais.porta,
                id: dadosComplemento.id,
                ssid: dadosComplemento.ssid,
                senha: dadosComplemento.senha,
                telefonia: dadosAtuais.telefonia
            });

            setValor(CAMPOS.COMPLEMENTAR, novoComplemento);
            const previewEl = document.querySelector('.osir-preview-texto');
            if (previewEl) previewEl.textContent = novoComplemento;

            btnComplemento.textContent = '✅ OK';
            btnComplemento.style.background = '#059669';
            setTimeout(() => {
                btnComplemento.textContent = '📝 Complemento';
                btnComplemento.style.background = '#4F46E5';
            }, CONFIG.timings.feedbackBotao);
        }, { flex: '1', padding: '8px 12px', fontSize: '10px' });

        botoes.append(btnSincronizar, btnComplemento);
        body.appendChild(botoes);

        return body;
    }

    function atualizarJanelaFlutuante(janela, dados, complemento) {
        const novoBody = criarCorpoFlutuante(dados, complemento);
        const oldBody = janela.querySelector('div:not(.osir-header-drag)');
        if (oldBody) oldBody.remove();
        janela.appendChild(novoBody);
    }

    function aplicarTamanhoJanela(janela) {
        janela.style.width = state.janela.largura + 'px';
        janela.style.maxHeight = state.janela.altura + 'px';
        janela.style.fontSize = state.janela.fonte + 'px';
        const sizeDisplay = document.getElementById('osir-size-display');
        if (sizeDisplay) {
            sizeDisplay.textContent = `${state.janela.largura}×${state.janela.altura}`;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. JANELA ESQUERDA (CONFIGURAÇÃO) - NEUTRA
    // ═══════════════════════════════════════════════════════════════

    function criarJanelaConfiguracao() {
        if (document.getElementById('osir-config-window')) return;

        const menu = document.querySelector('.panel-content .contract-menu');
        if (!menu) return;

        const contratoId = menu.getAttribute('data-contractid') || '???';
        const cliente = document.querySelector('.menu-info p')?.textContent?.trim() || 'Cliente';

        const janela = document.createElement('div');
        janela.id = 'osir-config-window';
        Object.assign(janela.style, {
            position: 'relative',
            margin: '10px 0',
            width: '100%',
            maxWidth: '380px',
            background: '#FFFFFF',
            border: '1px solid #D1D5DB',
            borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '0',
            fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '11px',
            transition: 'all 0.3s ease',
            overflow: 'hidden'
        });

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E5E7EB'
        });
        header.innerHTML = `
            <span style="font-weight:700;font-size:13px;color:#1F2937;">⚙️ Complemento</span>
        `;

        const btnFechar = document.createElement('button');
        Object.assign(btnFechar.style, {
            background: 'none',
            border: 'none',
            fontSize: '15px',
            cursor: 'pointer',
            color: '#6B7280',
            padding: '2px 8px',
            borderRadius: '4px',
            transition: 'all 0.2s ease',
            fontWeight: '600'
        });
        btnFechar.textContent = '✕';
        btnFechar.onmouseover = () => { btnFechar.style.background = '#F3F4F6'; };
        btnFechar.onmouseout = () => { btnFechar.style.background = 'none'; };
        btnFechar.onclick = () => janela.remove();
        header.appendChild(btnFechar);
        janela.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'padding: 12px 14px 14px 14px;';

        // Info Cliente
        const info = document.createElement('div');
        Object.assign(info.style, {
            background: '#F9FAFB',
            padding: '8px 12px',
            borderRadius: '6px',
            marginBottom: '12px',
            borderLeft: '3px solid #4F46E5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        });
        info.innerHTML = `
            <div>
                <div style="font-weight:600;color:#1F2937;font-size:12px;">📌 #${contratoId}</div>
                <div style="color:#6B7280;font-size:10px;">${cliente}</div>
            </div>
            <div style="background:#D1FAE5;color:#065F46;padding:2px 10px;border-radius:12px;font-size:9px;font-weight:600;">ATIVO</div>
        `;
        body.appendChild(info);

        // Modelos
        const labelModelos = criarLabel('📋 Modelo');
        body.appendChild(labelModelos);

        const modelos = [
            'huawei-router', 'Huawei Router',
            'huawei-bridge', 'Huawei Bridge',
            'ektech-bridge', 'Ektech Bridge',
            'raisecom-router', 'Raisecom Router',
            'raisecom-bridge', 'Raisecom Bridge',
            'raisecom-bridge-desativada', 'Raisecom Bridge (Des.)',
            'zte-bridge', 'ZTE Bridge',
            'zte-router', 'ZTE Router'
        ];

        const modelosContainer = criarContainer();
        for (let i = 0; i < modelos.length; i += 2) {
            const id = modelos[i];
            const label = modelos[i+1];
            const div = criarRadio(id, label, i === 2);
            modelosContainer.appendChild(div);
            div.querySelector('input').addEventListener('change', () => {
                if (div.querySelector('input').checked) atualizarPreviewConfig();
            });
        }
        body.appendChild(modelosContainer);

        // Opções
        const labelOpcoes = criarLabel('📋 Opções');
        body.appendChild(labelOpcoes);

        const opcoesContainer = document.createElement('div');
        Object.assign(opcoesContainer.style, {
            marginBottom: '8px',
            background: '#F9FAFB',
            padding: '6px 8px',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2px'
        });

        const opcoes = [
            ['osir-wifi-pro-check', '📶 WiFi Pro', state.wifiPro.ativo],
            ['osir-autentica-zte-check', '🔐 ZTE', false],
            ['osir-autentica-rb-check', '🔄 RB', false],
            ['osir-omada-check', '📶 OMADA', false]
        ];

        opcoes.forEach(([id, label, checked]) => {
            const div = criarCheckbox(id, label, checked);
            opcoesContainer.appendChild(div);
            div.querySelector('input').addEventListener('change', () => {
                if (id === 'osir-wifi-pro-check') {
                    state.wifiPro.ativo = div.querySelector('input').checked;
                }
                atualizarPreviewConfig();
            });
        });
        body.appendChild(opcoesContainer);

        // VLAN e Porta Web
        const infoVlan = document.createElement('div');
        Object.assign(infoVlan.style, {
            background: '#F9FAFB',
            padding: '6px 12px',
            borderRadius: '6px',
            margin: '6px 0',
            fontSize: '10px',
            border: '1px solid #E5E7EB',
            display: 'flex',
            justifyContent: 'space-between'
        });
        infoVlan.innerHTML = `
            <span style="font-weight:600;color:#4B5563;">VLAN: <strong id="osir-vlan-display" style="color:#1F2937;">---</strong></span>
            <span style="font-weight:600;color:#4B5563;">Porta Web: <strong id="osir-portaweb-display" style="color:#1F2937;">80</strong></span>
        `;
        body.appendChild(infoVlan);

        // Preview
        const labelPreview = criarLabel('📝 Preview');
        body.appendChild(labelPreview);

        const preview = document.createElement('div');
        preview.id = 'osir-preview-complement';
        Object.assign(preview.style, {
            background: '#F9FAFB',
            padding: '8px 10px',
            borderRadius: '6px',
            fontFamily: 'Courier New, monospace',
            fontSize: '10px',
            color: '#1F2937',
            minHeight: '30px',
            wordBreak: 'break-all',
            maxHeight: '60px',
            overflowY: 'auto',
            marginBottom: '10px',
            border: '1px solid #E5E7EB',
            fontWeight: '500'
        });
        preview.textContent = 'Selecione um modelo...';
        body.appendChild(preview);

        // Botões
        const botoesContainer = document.createElement('div');
        Object.assign(botoesContainer.style, {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
            marginBottom: '8px'
        });

        const botoes = [
            ['🔄 Atualizar', 'primario', atualizarComplemento],
            ['📥 Buscar', 'primario', buscarDados],
            ['⚡ Auto', 'primario', gerarAutomatico],
            ['❌ Limpar', 'secundario', limparComplemento]
        ];

        botoes.forEach(([label, cor, action]) => {
            const btn = criarBotao(label, cor, action, {
                padding: '6px 10px',
                fontSize: '10px',
                borderRadius: '6px'
            });
            botoesContainer.appendChild(btn);
        });
        body.appendChild(botoesContainer);

        // Atalhos
        const labelAtalhos = document.createElement('div');
        Object.assign(labelAtalhos.style, {
            fontWeight: '600',
            color: '#4B5563',
            margin: '4px 0 4px 0',
            fontSize: '9px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
        });
        labelAtalhos.textContent = '⚡ Atalhos:';
        body.appendChild(labelAtalhos);

        const atalhosContainer = document.createElement('div');
        atalhosContainer.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';

        const atalhos = [
            ['WiFi', () => {
                const check = document.getElementById('osir-wifi-pro-check');
                if (check) { check.checked = !check.checked; state.wifiPro.ativo = check.checked; atualizarPreviewConfig(); }
            }],
            ['ZTE', () => {
                const check = document.getElementById('osir-autentica-zte-check');
                if (check) { check.checked = !check.checked; atualizarPreviewConfig(); }
            }],
            ['RB', () => {
                const check = document.getElementById('osir-autentica-rb-check');
                if (check) { check.checked = !check.checked; atualizarPreviewConfig(); }
            }],
            ['OMADA', () => {
                const check = document.getElementById('osir-omada-check');
                if (check) { check.checked = !check.checked; atualizarPreviewConfig(); }
            }]
        ];

        atalhos.forEach(([label, action]) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            Object.assign(btn.style, {
                padding: '2px 10px',
                background: '#F3F4F6',
                color: '#1F2937',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '9px',
                transition: 'all 0.2s ease'
            });
            btn.onmouseover = () => { btn.style.background = '#E5E7EB'; };
            btn.onmouseout = () => { btn.style.background = '#F3F4F6'; };
            btn.onclick = action;
            atalhosContainer.appendChild(btn);
        });

        body.appendChild(atalhosContainer);
        janela.appendChild(body);

        menu.parentNode.insertBefore(janela, menu.nextSibling);
        setTimeout(atualizarPreviewConfig, 100);
    }

    // Helpers da janela esquerda
    function criarLabel(texto) {
        const label = document.createElement('div');
        Object.assign(label.style, {
            fontWeight: '600',
            color: '#4B5563',
            margin: '8px 0 4px 0',
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
        });
        label.textContent = texto;
        return label;
    }

    function criarContainer() {
        const div = document.createElement('div');
        Object.assign(div.style, {
            marginBottom: '8px',
            background: '#F9FAFB',
            padding: '6px 8px',
            borderRadius: '6px',
            border: '1px solid #E5E7EB'
        });
        return div;
    }

    function criarRadio(id, label, checked = false) {
        const div = document.createElement('div');
        Object.assign(div.style, {
            display: 'flex',
            alignItems: 'center',
            padding: '3px 6px',
            cursor: 'pointer',
            borderRadius: '4px',
            transition: 'all 0.2s ease',
            margin: '1px 0'
        });
        div.onmouseover = () => div.style.background = '#F3F4F6';
        div.onmouseout = () => div.style.background = 'transparent';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'modelo-equipamento';
        radio.value = id;
        radio.id = `modelo-${id}`;
        radio.checked = checked;
        Object.assign(radio.style, {
            marginRight: '6px',
            accentColor: '#4F46E5',
            cursor: 'pointer',
            width: '14px',
            height: '14px'
        });

        const labelEl = document.createElement('label');
        labelEl.htmlFor = `modelo-${id}`;
        labelEl.textContent = label;
        Object.assign(labelEl.style, {
            cursor: 'pointer',
            fontSize: '10px',
            color: '#1F2937',
            flex: '1',
            fontWeight: '500',
            userSelect: 'none'
        });

        div.append(radio, labelEl);
        return div;
    }

    function criarCheckbox(id, label, checked = false) {
        const div = document.createElement('div');
        Object.assign(div.style, {
            display: 'flex',
            alignItems: 'center',
            padding: '3px 4px',
            borderRadius: '4px',
            transition: 'all 0.2s ease'
        });
        div.onmouseover = () => div.style.background = '#F3F4F6';
        div.onmouseout = () => div.style.background = 'transparent';

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.id = id;
        check.checked = checked;
        Object.assign(check.style, {
            marginRight: '4px',
            accentColor: '#4F46E5',
            cursor: 'pointer',
            width: '13px',
            height: '13px'
        });

        const labelEl = document.createElement('label');
        labelEl.htmlFor = id;
        labelEl.textContent = label;
        Object.assign(labelEl.style, {
            cursor: 'pointer',
            fontSize: '10px',
            color: '#1F2937',
            fontWeight: '500',
            userSelect: 'none'
        });

        div.append(check, labelEl);
        return div;
    }

    // Funções da janela esquerda
    function getModeloLabel() {
        const selected = document.querySelector('input[name="modelo-equipamento"]:checked');
        if (!selected) return 'Bridge';
        const map = {
            'huawei-router': 'Huawei Router',
            'huawei-bridge': 'Huawei Bridge',
            'ektech-bridge': 'Ektech Bridge',
            'raisecom-router': 'Raisecom Router',
            'raisecom-bridge': 'Raisecom Bridge',
            'raisecom-bridge-desativada': 'Raisecom Bridge (Desativada)',
            'zte-bridge': 'ZTE Bridge',
            'zte-router': 'ZTE Router'
        };
        return map[selected.value] || 'Bridge';
    }

    function getDadosForm() {
        return {
            serial: getValor(CAMPOS.SERIAL) || 'XX',
            slot: getValor(CAMPOS.SLOT) || 'XX',
            porta: getValor(CAMPOS.PORTA) || 'XX',
            id: getValor(CAMPOS.ID) || 'XX',
            ssid: getValor(CAMPOS.SSID) || '',
            senha: getValor(CAMPOS.SENHA) || '',
            splitter: getValor(CAMPOS.SPLITTER) || '',
            portaSplitter: getValor(CAMPOS.PORTA_SPLITTER) || ''
        };
    }

    function getTipoPorModelo(modelo) {
        const bridge = ['Huawei Bridge', 'ZTE Bridge', 'Raisecom Bridge', 'Raisecom Bridge (Des.)', 'Ektech Bridge'];
        return bridge.includes(modelo) ? 'b' : 'r';
    }

    function montarComplementoConfig() {
        const modelo = getModeloLabel();
        const dados = getDadosForm();
        return montarComplemento({
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

    function atualizarPreviewConfig() {
        const preview = document.getElementById('osir-preview-complement');
        if (preview) {
            preview.textContent = montarComplementoConfig() || 'Nenhum dado disponível';
        }

        const dados = getDadosForm();
        const modelo = getModeloLabel();
        const tipo = getTipoPorModelo(modelo);
        const vlan = calcularVlan('', dados.slot, dados.porta);
        const portaWeb = definirPortaWeb(tipo);

        const vlanDisplay = document.getElementById('osir-vlan-display');
        const portaDisplay = document.getElementById('osir-portaweb-display');
        if (vlanDisplay) vlanDisplay.textContent = vlan || '---';
        if (portaDisplay) portaDisplay.textContent = portaWeb || '80';
    }

    function atualizarComplemento() {
        preencherVlanEPortaWeb();
        setValor(CAMPOS.COMPLEMENTAR, montarComplementoConfig());
        atualizarPreviewConfig();
        limparMAC();
        feedbackBotao('🔄 Atualizar');
    }

    function buscarDados() {
        preencherVlanEPortaWeb();
        setValor(CAMPOS.COMPLEMENTAR, montarComplementoConfig());
        atualizarPreviewConfig();
        feedbackBotao('📥 Buscar');
    }

    function gerarAutomatico() {
        const dados = getDadosForm();
        const serial = dados.serial.toUpperCase();

        let modelo = 'Bridge';
        if (serial.startsWith('53484') || serial.startsWith('48575')) modelo = 'Ektech Bridge';
        else if (serial.startsWith('4857') || serial.startsWith('HWTC')) modelo = 'Huawei Bridge';
        else if (serial.startsWith('ZTEG') || serial.startsWith('5A544') || serial.startsWith('ZTEGD')) modelo = 'ZTE Bridge';
        else if (serial.startsWith('RCMG1')) modelo = 'Raisecom Bridge';
        else if (serial.startsWith('RCMG3')) modelo = 'Raisecom Router';
        else if (serial.startsWith('RCMG')) modelo = 'Raisecom Router';

        const precisaZTE = serial.startsWith('5A544') || serial.startsWith('ZTEGD');

        preencherVlanEPortaWeb();
        setValor(CAMPOS.COMPLEMENTAR, montarComplementoConfig());
        atualizarPreviewConfig();
        limparMAC();

        const wifiCheck = document.getElementById('osir-wifi-pro-check');
        const zteCheck = document.getElementById('osir-autentica-zte-check');
        if (wifiCheck) wifiCheck.checked = state.wifiPro.ativo;
        if (zteCheck) zteCheck.checked = precisaZTE;

        const map = {
            'Huawei Bridge': 'modelo-huawei-bridge',
            'ZTE Bridge': 'modelo-zte-bridge',
            'Raisecom Bridge': 'modelo-raisecom-bridge',
            'Raisecom Router': 'modelo-raisecom-router',
            'Ektech Bridge': 'modelo-ektech-bridge'
        };
        const id = map[modelo];
        if (id) {
            const radio = document.getElementById(id);
            if (radio) radio.checked = true;
        }

        feedbackBotao('⚡ Auto');
    }

    function limparComplemento() {
        setValor(CAMPOS.COMPLEMENTAR, '');
        ['osir-wifi-pro-check', 'osir-autentica-zte-check', 'osir-autentica-rb-check', 'osir-omada-check'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });
        const defaultModelo = document.getElementById('modelo-huawei-bridge');
        if (defaultModelo) defaultModelo.checked = true;

        const preview = document.getElementById('osir-preview-complement');
        if (preview) preview.textContent = 'Selecione um modelo...';
        const vlanDisplay = document.getElementById('osir-vlan-display');
        const portaDisplay = document.getElementById('osir-portaweb-display');
        if (vlanDisplay) vlanDisplay.textContent = '---';
        if (portaDisplay) portaDisplay.textContent = '80';
        setValor(CAMPOS.VLAN, '');
        setValor(CAMPOS.PORTA_WEB, '');

        feedbackBotao('❌ Limpar');
    }

    function preencherVlanEPortaWeb() {
        const dados = getDadosForm();
        const modelo = getModeloLabel();
        const tipo = getTipoPorModelo(modelo);
        const vlan = calcularVlan('', dados.slot, dados.porta);
        const portaWeb = definirPortaWeb(tipo);

        if (vlan && vlan !== 'XX') setValor(CAMPOS.VLAN, vlan);
        if (portaWeb) setValor(CAMPOS.PORTA_WEB, portaWeb);
    }

    function limparMAC() {
        const mac = getElement(CAMPOS.MAC);
        if (mac && mac.value && mac.value.trim() !== '') {
            mac.value = '';
            mac.dispatchEvent(new Event('input', { bubbles: true }));
            mac.dispatchEvent(new Event('change', { bubbles: true }));
            mac.dispatchEvent(new Event('blur', { bubbles: true }));
            log('✅ MAC Address limpo');
        }
    }

    function feedbackBotao(textoOriginal) {
        const botoes = document.querySelectorAll('#osir-config-window button');
        botoes.forEach(btn => {
            if (btn.textContent === '✅ OK') {
                btn.textContent = textoOriginal;
                btn.style.background = '#4F46E5';
                btn.style.color = '#FFFFFF';
            }
        });
        // Se não encontrou, procura por classe
        const btn = document.querySelector('#osir-config-window button:not([style*="background"])');
        if (btn && btn.textContent === '✅ OK') {
            btn.textContent = textoOriginal;
            btn.style.background = '#4F46E5';
            btn.style.color = '#FFFFFF';
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. PREENCHIMENTO DO FORMULÁRIO
    // ═══════════════════════════════════════════════════════════════

    function preencherFormulario(dados) {
        // Campos técnicos
        const tecnicos = [
            [CAMPOS.SERIAL, dados.serial],
            [CAMPOS.SLOT, dados.slot],
            [CAMPOS.PORTA, dados.porta],
            [CAMPOS.VLAN, dados.vlan],
            [CAMPOS.PORTA_WEB, dados.portaWeb],
            [CAMPOS.TIPO, dados.tipoProvisionamento],
            [CAMPOS.USUARIO_ONU, dados.usuarioONU],
            [CAMPOS.SENHA_ONU, dados.senhaONU]
        ];
        tecnicos.forEach(([id, valor]) => {
            if (valor && valor !== 'XX') setValor(id, valor);
        });

        // ID
        const idCorreto = getIDCorreto(dados);
        setValor(CAMPOS.ID, idCorreto);
        dados.id = idCorreto;

        // SSID/Senha
        const { ssid, senha } = getSSIDeSenha(dados);
        if (ssid) { setValor(CAMPOS.SSID, ssid); dados.ssid = ssid; }
        if (senha) { setValor(CAMPOS.SENHA, senha); dados.senha = senha; }

        // Splitter
        if (dados.splitter && dados.splitter !== 'XX') setValor(CAMPOS.SPLITTER, dados.splitter);
        if (dados.portaSplitter && dados.portaSplitter !== 'XX') setValor(CAMPOS.PORTA_SPLITTER, dados.portaSplitter);

        // Telefonia
        if (dados.telefonia?.temTelefonia) {
            const tel = dados.telefonia;
            const numTel = getElement('numeroTelefone01');
            if (numTel && tel.numero) { numTel.value = tel.numero; numTel.dispatchEvent(new Event('input', { bubbles: true })); }
            const senhaTel = getElement('senhaTelefone');
            if (senhaTel && tel.senha) { senhaTel.value = tel.senha; senhaTel.dispatchEvent(new Event('input', { bubbles: true })); }
            const ipTel = getElement('ipGerencia');
            if (ipTel && tel.ip) { ipTel.value = tel.ip; ipTel.dispatchEvent(new Event('input', { bubbles: true })); }
        }

        // Limpar MAC
        limparMAC();

        // Regenerar complementar
        setTimeout(() => {
            const complemento = montarComplemento({
                wifiPro: state.wifiPro.ativo,
                modelo: detectarEquipamento(dados.tipoProvisionamento, dados.serial) + (dados.telefonia?.temTelefonia ? ' + Telefonia' : ''),
                serial: dados.serial,
                autenticaZTE: precisaAutenticar(dados.tipoProvisionamento, dados.serial),
                splitter: dados.splitter || '',
                portaSplitter: dados.portaSplitter || '',
                slot: dados.slot,
                porta: dados.porta,
                id: dados.id,
                ssid: dados.ssid,
                senha: dados.senha,
                telefonia: dados.telefonia
            });
            setValor(CAMPOS.COMPLEMENTAR, complemento);
            log('✅ Complementar regenerada');
        }, 200);
    }

    // ═══════════════════════════════════════════════════════════════
    // 9. DRAG DA JANELA
    // ═══════════════════════════════════════════════════════════════

    function tornarArrastavel(janela) {
        let dragging = false;
        let x = 0, y = 0, ox = 0, oy = 0;

        const pos = storage.getJSON('osir_janela_posicao');
        if (pos && pos.x !== undefined && pos.y !== undefined) {
            const maxX = window.innerWidth - 320 - 10;
            const maxY = window.innerHeight - 400 - 10;
            janela.style.top = Math.max(10, Math.min(pos.y, maxY)) + 'px';
            janela.style.left = Math.max(10, Math.min(pos.x, maxX)) + 'px';
            janela.style.right = 'auto';
            janela.style.bottom = 'auto';
            ox = pos.x; oy = pos.y;
        }

        const start = (e) => {
            if (e.target.closest('.osir-no-drag')) return;
            if (!e.target.closest('.osir-header-drag')) return;
            const ev = e.type === 'touchstart' ? e.touches[0] : e;
            x = ev.clientX - ox;
            y = ev.clientY - oy;
            dragging = true;
            janela.style.cursor = 'grabbing';
            janela.style.transition = 'none';
        };

        const move = (e) => {
            if (!dragging) return;
            e.preventDefault();
            const ev = e.type === 'touchmove' ? e.touches[0] : e;
            let cx = ev.clientX - x;
            let cy = ev.clientY - y;
            const rect = janela.getBoundingClientRect();
            cx = Math.max(10, Math.min(cx, window.innerWidth - rect.width - 10));
            cy = Math.max(10, Math.min(cy, window.innerHeight - rect.height - 10));
            janela.style.left = cx + 'px';
            janela.style.top = cy + 'px';
            janela.style.right = 'auto';
            janela.style.bottom = 'auto';
            ox = cx; oy = cy;
        };

        const end = () => {
            if (dragging) {
                dragging = false;
                janela.style.cursor = 'default';
                janela.style.transition = 'width 0.3s ease, max-height 0.3s ease, box-shadow 0.3s ease';
                storage.setJSON('osir_janela_posicao', { x: ox, y: oy });
            }
        };

        janela.addEventListener('mousedown', start);
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', end);
        janela.addEventListener('touchstart', start, { passive: true });
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', end);

        janela.resetPosition = () => {
            storage.remove('osir_janela_posicao');
            janela.style.top = '70px';
            janela.style.right = '15px';
            janela.style.left = 'auto';
            janela.style.bottom = 'auto';
            ox = 0; oy = 0;
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // 10. CAPTURA DE DADOS DA FILA
    // ═══════════════════════════════════════════════════════════════

    function capturarDadosFila() {
        const dados = {
            serial: 'XX',
            ssid: 'XX',
            senha: 'XX',
            slot: 'XX',
            porta: 'XX',
            id: 'XX',
            contrato: '',
            vlan: 'XX',
            pontoAcesso: '',
            olt: 'N/A',
            tipoProvisionamento: '',
            portaWeb: '80',
            sinal: '',
            nomeOLT: '',
            wifiPro: state.wifiPro.ativo,
            telefonia: { temTelefonia: false, numero: '', senha: '', ip: '' }
        };

        const map = {
            serial: 'serialEquipamentoSynsuite',
            ssid: 'ssid',
            senha: 'senhaSSID',
            usuarioPPPoE: 'pppoe',
            senhaPPPoE: 'senhaPPPOE',
            usuarioONU: 'usuarioEquip',
            senhaONU: 'senhaEquip',
            tipoProvisionamento: 'tipoProvisionamento',
            nomeONU: 'nomeONU',
            sinal: 'sinal',
            status: 'status',
            olt: 'olt',
            slotOLT: 'slotOLT',
            portaOLT: 'portaOLT',
            idOnuOlt: 'idOnuOlt'
        };

        Object.entries(map).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (el && el.value) {
                if (key === 'serial') dados.serial = el.value.trim().toUpperCase();
                else if (key === 'ssid') dados.ssid = el.value.trim();
                else if (key === 'senha') dados.senha = el.value.trim();
                else if (key === 'slotOLT') dados.slot = el.value.trim();
                else if (key === 'portaOLT') dados.porta = el.value.trim();
                else if (key === 'idOnuOlt') dados.id = el.value.trim();
                else if (key === 'olt') {
                    dados.olt = el.value.trim();
                    dados.nomeOLT = el.value.trim();
                } else if (key === 'tipoProvisionamento') {
                    dados.tipoProvisionamento = el.value.toLowerCase().trim();
                } else if (key === 'sinal') {
                    dados.sinal = el.value.trim();
                }
            }
        });

        const tel01 = document.getElementById('numeroTelefone01');
        if (tel01 && tel01.value && tel01.value.trim() !== '') {
            dados.telefonia.temTelefonia = true;
            dados.telefonia.numero = tel01.value.trim();
        }
        const senhaTel = document.getElementById('senhaTelefone');
        if (senhaTel && senhaTel.value) dados.telefonia.senha = senhaTel.value.trim();
        const ipTel = document.getElementById('ipGerencia');
        if (ipTel && ipTel.value) dados.telefonia.ip = ipTel.value.trim();

        const modal = document.querySelector('#nomeClienteModal');
        if (modal) {
            const match = modal.textContent.match(/(\d+)/);
            if (match) dados.contrato = match[1].trim();
        }

        if (dados.nomeOLT) {
            const partes = dados.nomeOLT.split(' - ');
            if (partes.length >= 3) {
                dados.pontoAcesso = partes[partes.length - 1].trim();
            }
        }

        dados.vlan = calcularVlan(dados.pontoAcesso, dados.slot, dados.porta);
        dados.portaWeb = definirPortaWeb(dados.tipoProvisionamento);

        return dados;
    }

    // ═══════════════════════════════════════════════════════════════
    // 11. VERIFICAR DADOS E MOSTRAR JANELA
    // ═══════════════════════════════════════════════════════════════

    async function verificarDados() {
        let dados = null;

        try {
            const texto = await navigator.clipboard.readText();
            if (texto?.trim().startsWith('OSIRDATA||')) {
                dados = extrairOSIRDATA(texto);
                if (dados) {
                    state.wifiPro.ativo = dados.wifiPro || false;
                }
            }
        } catch(e) {}

        if (!dados) {
            const salvos = storage.getJSON('osir_ultimos_dados');
            if (salvos?.dados) {
                dados = salvos.dados;
                state.wifiPro.ativo = dados.wifiPro || false;
            }
        }

        if (!dados || !dados.serial || dados.serial === 'XX') {
            return;
        }

        criarJanelaFlutuante(dados);
    }

    // ═══════════════════════════════════════════════════════════════
    // 12. ALERTA DE CONTRATO SALVO
    // ═══════════════════════════════════════════════════════════════

    function exibirAlertaSalvo(contratoId, data) {
        if (document.getElementById('osir-alerta-salvo')) return;

        const dataStr = data.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const alerta = document.createElement('div');
        alerta.id = 'osir-alerta-salvo';
        Object.assign(alerta.style, {
            position: 'fixed',
            bottom: '75px',
            right: '15px',
            width: '320px',
            background: '#FFFFFF',
            border: '2px solid #059669',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: '99999',
            fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif',
            overflow: 'hidden',
            animation: 'osirFadeIn 0.3s ease'
        });

        alerta.innerHTML = `
            <div style="background:#059669;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
                <span style="color:white;font-weight:600;font-size:12px;display:flex;align-items:center;gap:6px;">
                    <span style="font-size:14px;">✅</span>
                    CONTRATO SALVO
                </span>
                <button id="osir-alerta-fechar" style="background:rgba(255,255,255,0.15);border:none;color:white;padding:2px 8px;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px;">✕</button>
            </div>
            <div style="padding:12px 14px 14px 14px;">
                <div style="font-size:12px;color:#1F2937;font-weight:600;">Contrato #${contratoId} salvo com sucesso!</div>
                <div style="font-size:11px;color:#6B7280;margin-bottom:10px;">📅 ${dataStr}</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="osir-alerta-ok" style="padding:4px 16px;background:#4F46E5;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;transition:all 0.2s ease;">OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(alerta);

        const fechar = () => {
            alerta.style.transition = 'all 0.3s ease';
            alerta.style.opacity = '0';
            alerta.style.transform = 'translateY(20px)';
            setTimeout(() => alerta.remove(), 300);
        };

        document.getElementById('osir-alerta-fechar').onclick = fechar;
        document.getElementById('osir-alerta-ok').onclick = fechar;

        if (!document.getElementById('osir-animation-style')) {
            const style = document.createElement('style');
            style.id = 'osir-animation-style';
            style.textContent = '@keyframes osirFadeIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }';
            document.head.appendChild(style);
        }

        setTimeout(fechar, 300000);
    }

    // ═══════════════════════════════════════════════════════════════
    // 13. PÁGINAS ESPECÍFICAS
    // ═══════════════════════════════════════════════════════════════

    // 13.1 Fila de Provisionamento
    if (window.location.href.includes(CONFIG.urls.atendimento)) {
        function removerComplementar() {
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent?.trim() === 'Complementar') {
                    btn.remove();
                    log('✅ Botão Complementar removido');
                }
            });
        }

        function injetarBotaoFila() {
            removerComplementar();
            if (document.getElementById('btn-copiar-osir-nativo')) return;

            let btnChamado = null;
            document.querySelectorAll('button, a, .btn, [role="button"]').forEach(el => {
                const texto = el.textContent?.trim() || '';
                if (texto === 'Chamado' || el.id === 'linkChamado') {
                    btnChamado = el;
                }
            });

            if (!btnChamado) {
                log('⚠️ Botão Chamado não encontrado');
                return;
            }

            const btn = document.createElement('a');
            btn.id = 'btn-copiar-osir-nativo';
            btn.type = 'button';
            btn.textContent = '📥 Preparar Dados';
            btn.title = 'Preparar dados da fila para o contrato';
            Object.assign(btn.style, {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 14px',
                background: '#4F46E5',
                color: '#FFFFFF',
                border: '1px solid #4338CA',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '10px',
                margin: '0 3px',
                textDecoration: 'none',
                textAlign: 'center',
                verticalAlign: 'middle',
                transition: 'all 0.3s ease',
                lineHeight: '1.4',
                height: '31px',
                minWidth: '60px',
                boxShadow: '0 1px 3px rgba(79, 70, 229, 0.3)',
                letterSpacing: '0.2px'
            });
            btn.onmouseover = () => {
                btn.style.background = '#4338CA';
                btn.style.transform = 'translateY(-1px)';
                btn.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.4)';
            };
            btn.onmouseout = () => {
                btn.style.background = '#4F46E5';
                btn.style.transform = 'translateY(0)';
                btn.style.boxShadow = '0 1px 3px rgba(79, 70, 229, 0.3)';
            };

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                try {
                    const dados = capturarDadosFila();
                    dados.wifiPro = state.wifiPro.ativo;
                    const osirData = montarOSIRDATA(dados);

                    navigator.clipboard.writeText(osirData).then(() => {
                        btn.textContent = '✅ OK';
                        btn.style.background = '#059669';
                        btn.style.boxShadow = '0 1px 3px rgba(5, 150, 105, 0.3)';
                        setTimeout(() => {
                            btn.textContent = '📥 Preparar Dados';
                            btn.style.background = '#4F46E5';
                            btn.style.boxShadow = '0 1px 3px rgba(79, 70, 229, 0.3)';
                        }, 2000);
                    });
                } catch(err) {
                    logError('Erro na captura:', err);
                }
            });

            btnChamado.parentNode.replaceChild(btn, btnChamado);
            log('✅ Botão Preparar Dados substituiu o Chamado');
        }

        const intervaloFila = setInterval(injetarBotaoFila, CONFIG.timings.injecaoBotao);
        setTimeout(injetarBotaoFila, 100);
        setTimeout(injetarBotaoFila, 3000);
        window.addEventListener('beforeunload', () => {
            clearInterval(intervaloFila);
            clearCache();
        });
    }

    // 13.2 Página do Contrato
    if (window.location.href.includes(CONFIG.urls.contrato) ||
        window.location.href.includes(CONFIG.urls.operacao)) {

        setTimeout(verificarDados, CONFIG.timings.verificarDados[0]);
        setTimeout(verificarDados, CONFIG.timings.verificarDados[1]);

        let tentativas = 0;
        const intervaloConfig = setInterval(() => {
            tentativas++;
            const menu = document.querySelector('.panel-content .contract-menu');
            if (menu && !document.getElementById('osir-config-window')) {
                criarJanelaConfiguracao();
                clearInterval(intervaloConfig);
            }
            if (tentativas >= CONFIG.timings.maxTentativasJanela) {
                clearInterval(intervaloConfig);
            }
        }, 1000);

        let observerSalvamento = null;
        let ultimoEvento = 0;

        function marcarSalvo() {
            const menu = document.querySelector('.contract-menu');
            if (!menu) return;
            const id = menu.getAttribute('data-contractid');
            if (!id) return;

            storage.setJSON(`osir_contrato_salvo_${id}`, {
                salvoEm: new Date().toISOString(),
                status: 'SALVO'
            });
            exibirAlertaSalvo(id, new Date());
        }

        setTimeout(() => {
            observerSalvamento = new MutationObserver(() => {
                const agora = Date.now();
                if (agora - ultimoEvento < 1000) return;
                ultimoEvento = agora;

                const growler = document.getElementById('neo-growler');
                if (growler?.dataset?.visible === '1') {
                    const msg = growler.querySelector('#neo-growler-content .growl-box')?.textContent || '';
                    if (msg.includes('salvo') || msg.includes('sucesso') || msg.includes('atualizado')) {
                        marcarSalvo();
                    }
                }
            });

            observerSalvamento.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-visible']
            });
        }, 2000);

        setTimeout(() => {
            const menu = document.querySelector('.contract-menu');
            if (menu) {
                const id = menu.getAttribute('data-contractid');
                if (id) {
                    const dados = storage.getJSON(`osir_contrato_salvo_${id}`);
                    if (dados) {
                        const data = new Date(dados.salvoEm);
                        const diff = (Date.now() - data.getTime()) / (1000 * 60 * 60);
                        if (diff < 24 && !document.getElementById('osir-alerta-salvo')) {
                            exibirAlertaSalvo(id, data);
                        }
                    }
                }
            }
        }, 3000);

        window.addEventListener('beforeunload', () => {
            clearInterval(intervaloConfig);
            if (observerSalvamento) {
                observerSalvamento.disconnect();
                observerSalvamento = null;
            }
            clearCache();
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // 14. INICIALIZAÇÃO
    // ═══════════════════════════════════════════════════════════════

    log(`🚀 Osir Assistente v${CONFIG.version}`);
    log('✅ ' + [
        'VLAN 2200 para STL_CE_3/4, TTN_LAN, GAR, ROS',
        'Normalização: STLDC→DC, PTN_NOVA→PTN',
        'Botão 📋 para copiar PE+Slot+Porta',
        'Botão Complementar removido',
        'Botão Preparar Dados substituiu o Chamado',
        'ID inteligente: OSIRDATA ou formulário',
        'SSID/Senha: prioridade da complementar',
        'Filosofia de botões manuais - NADA automático!'
    ].join('\n  ✅ '));

})();
