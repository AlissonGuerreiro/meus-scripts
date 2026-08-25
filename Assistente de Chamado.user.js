// ==UserScript==
// @name         Osir - Assistente de Chamado (Rústico)
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Alertas automáticos de planos, auditor de estoque e esconder botão
// @author       Alisson Guerreiro
// @match        https://erp.osirnet.com.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ============ CONFIG ============
    const CFG = {
        VERSAO: '2.0.0',
        AUDITOR_INTERVAL: 2000,
        DEBOUNCE_DELAY: 400,
        MAX_CABO_DROP: 350,
        DEBUG: true
    };

    // ============ BANCO DE DADOS ============
    const MATERIAIS = [
        "CONECTOR FAST SC/APC", "FIXA FIO PRETO UNIDADE", "SUPORTE ORGANIZADOR DE ROTEADOR",
        "SUPORTE ORGANIZADOR DE ROTEADOR - OSIRNET", "BUCHA DE PAREDE 6MM", "PARAFUSO PHILIPS 6MM",
        "CABO ÓPTICO (DROP)", "FECHO DENTADO INOX 3/4", "ALCA PRE FORMADA PARA DROP - FIO FE 80/100/160 420MM BIT 1,85MM",
        "PLACA IDENTIFICADORA DE CABO OPTICO - OSIRNET", "ISOLADOR 4 VIAS", "ABRACADEIRA DE FIXACAO 20CM X 3,70MM - PRETA",
        "PITÃO 8 MM UNIDADE", "BUCHA DE PASSAGEM / FTB", "CABO LAN PRETO", "CONECTOR RJ45",
        "PARAFUSO SX SOBERBA 1/4", "PARAFUSO PHILIPS 4MM (INOVAÇÃO)", "PROTETOR CONECTOR OPTICO",
        "FITA ISOLANTE PRETA 20M X 19 MM", "BUCHA DE PAREDE 8MM", "PARAFUSO PHILIPS 4,0 X 40",
        "CABO LAN BRANCO", "ALINHADOR OPTICO APC SIMPLEX", "PROTETOR DE EMENDA", "SUPA 3",
        "FITA DE ACO INOX 430 LAMINADO A FRIO LISA 3/4 - 05 MM X 25MTS", "PF CHIP RT CB CH PH BC 3,5X25MM",
        "BUCHA FIXACAO 6MM", "PARAFUSO 10 x 55 mm", "ARAME DE ESPINAR ISOLADO METALICO FEI125V 105M",
        "FITA ISOLANTE PRETA 19MM X 10M", "BUCHA DE PAREDE 10mm", "ABRACADEIRA DE FIXACAO 28CM X 4,80MM - PRETA",
        "FIXA FIO BRANCO UNIDADE", "SUPORTE EMENDA 3/4", "SUPORTE DE ANTENA - MODELO CAVALETE PARA PAREDE 3/4"
    ];

    const FERRAMENTAS = [
        "ALICATE DE CORTE DIAGONAL ISOLADO", "ALICATE DE CRIMPAR", "ALICATE DECAPADOR DE CABO DROP FLAT CABLE STRIPPER VERDE",
        "ALICATE DECAPADOR DE FIBRA OPTICA 3 FUROS AMARELO CFS-3", "ALICATE UNIVERSAL",
        "BADISCO DIGITAL C/ IDENTIFICADOR DE CHAMADAS", "PILHA AAA RECARREGÁVEL", "BOLSA PARA FERRAMENTAS 12\" STANDARD",
        "BOLSA PARA KIT FIBRA", "BALDE EM LONA COM FUNDO EM COURO REFORÇADO", "BROCA 10MM MADEIRA ENG. RAP.",
        "BROCA WIDEA DE AÇO RAPIDO SDS PLUS", "GUIA PASSA FIO PROFISSIONAL ALMA DE AÇO - 20 METROS",
        "CANETA LASER TESTADORA DE FIBRA", "CORDÃO ÓPTICO SC/APC -SC/APC 1,5MTS OU 3 MTS",
        "CARREGADOR DE PILHAS AA/AAA + 4 PILHAS AA 2500MAH", "CAVALETE PARA BOBINA DE CABO DROP",
        "PROLONGADOR PARA ROLO EXTENSOR 5MT - VARA DE MANOBRA", "CHAVE DE FENDA 3/16\"X 5\" AÇO CROMO",
        "CHAVE FENDA 1/4 X 4\" AÇO CROMO 6,3\" X100", "CHAVE PHILIPS 1/4 X 8\" 6\" X 200",
        "CHAVE PHILIPS 3/16 X 4\" 4,5\" X 100", "CONE SINALIZADOR 50CM BRANCO E LARANJA - PLASTICO",
        "ESCADA TELESCOPIA AÇO 4,10MT 8055 ZEUS", "ESCADA EXTENSIVA DE FIBRA VAZADA 3,50/6,00 MT- 19 DEGRAUS",
        "ESTILETE 18MM", "EXTENSÃO ELÉTRICA 20M 10A 2X2,5MM", "FUSIMEC", "MALETA PLÁSTICA ORGANIZADORA",
        "MARTELO UNHA 23MM - CABO EM FIBRA", "NIVEL DE MADEIRA 14\"", "PILHA AA RECARREGAVEL",
        "RECIPIENTE P/ ÁLCOOL ISOPROPÍLICO 200ML", "CHAVE COMBINADA C/ CATRACA 10MM",
        "CHAVE COMBINADA C/ CATRACA 13MM", "CORDA ELASTICA 1,5M", "MARTELETE 820W 220V GBH 2-24 BOSCH",
        "TESTADOR DE REDE RJ 45 E RJ 11", "BATERIA 9V ALCALINA", "CANETA P/ RETROPROJETOR PRETA",
        "CADEADO ANTIFURTO COM CHAVE 1,2 MT", "CLIVADOR REDEX", "CAIXA ORGANIZADORA", "GARRAFA TERMICA 5L",
        "FILTRO DE LINHA REGUA 4 TOMADAS - 10A - PRETO"
    ];

    // ============ UTILITÁRIOS ============
    function log(...args) {
        if (CFG.DEBUG) console.log('[Chamado]', ...args);
    }

    function normalizarItem(texto) {
        if (!texto) return '';
        return texto.trim().replace(/^\d+\s*-\s*/, '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ').toUpperCase();
    }

    function normalizarTexto(texto) {
        if (!texto) return '';
        return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ').toLowerCase().trim();
    }

    function debounce(fn, delay = 300) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    const MATERIAIS_NORM = MATERIAIS.map(normalizarItem);
    const FERRAMENTAS_NORM = FERRAMENTAS.map(normalizarItem);
    const CABO_DROP = normalizarItem('CABO ÓPTICO (DROP)');

    // ============ CONTAINERS ============
    const containers = {};

    function criarContainers() {
        const alertC = document.createElement('div');
        alertC.id = 'tm-alerts-container';
        alertC.style.cssText = `
            position:fixed;bottom:140px;right:25px;width:340px;z-index:10000;
            font-family:Roboto,sans-serif;display:flex;flex-direction:column-reverse;
            gap:10px;pointer-events:none;
        `;
        document.body.appendChild(alertC);
        containers.alertas = alertC;

        const auditC = document.createElement('div');
        auditC.id = 'tm-auditor-container';
        auditC.style.cssText = `
            position:fixed;top:80px;right:25px;width:360px;z-index:10001;
            font-family:Roboto,sans-serif;display:flex;flex-direction:column;
            gap:10px;pointer-events:none;
        `;
        document.body.appendChild(auditC);
        containers.auditor = auditC;

        log('✅ Containers criados');
    }

    // ============ CARDS ============
    function criarCard(corFundo, corTexto, corBorda) {
        const card = document.createElement('div');
        card.style.cssText = `
            background:${corFundo};color:${corTexto};border:2px solid ${corBorda};
            border-radius:8px;padding:12px 15px;font-size:12px;font-weight:700;
            line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,0.15);
            text-align:center;pointer-events:auto;position:relative;
        `;

        const btnFechar = document.createElement('span');
        btnFechar.textContent = '✕';
        btnFechar.style.cssText = `
            position:absolute;top:6px;right:8px;cursor:pointer;
            font-size:14px;opacity:0.6;padding:2px 4px;
        `;
        btnFechar.onmouseenter = () => btnFechar.style.opacity = '1';
        btnFechar.onmouseleave = () => btnFechar.style.opacity = '0.6';
        btnFechar.onclick = () => card.remove();
        card.appendChild(btnFechar);
        return card;
    }

    function cardAlerta(texto, corFundo, corTexto, corBorda, icone = '') {
        const card = criarCard(corFundo, corTexto, corBorda);
        card.style.textTransform = 'uppercase';
        const div = document.createElement('div');
        div.style.paddingRight = '18px';
        div.textContent = `${icone} ${texto}`;
        card.appendChild(div);
        return card;
    }

    function cardErroItem(item, motivo = 'NÃO ALOCAR COMO CONSUMO INTERNO!') {
        const card = criarCard('#ffebee', '#c62828', '#d32f2f');
        const div = document.createElement('div');
        div.style.paddingRight = '18px';
        div.innerHTML = `
            ⚠️ ATENÇÃO: ITEM FORA DO PADRÃO DETECTADO!<br>
            <span style="color:#000;font-size:13px;">"${item}"</span><br>
            ${motivo}
        `;
        card.appendChild(div);
        return card;
    }

    function cardErroQtd(item, qtd) {
        const card = criarCard('#fffde7', '#f57f17', '#fbc02d');
        const div = document.createElement('div');
        div.style.paddingRight = '18px';
        div.innerHTML = `
            ⚠️ LIMITE EXCEDIDO!<br>
            <span style="color:#000;font-size:13px;">"${item}"</span><br>
            Quantidade: <span style="font-size:14px;color:#e65100;">${qtd} MTS</span><br>
            Limite: ${CFG.MAX_CABO_DROP} MTS!
        `;
        card.appendChild(div);
        return card;
    }

    // ============ ESCONDER BOTÃO ============
    function esconderBotao() {
        const botoes = document.querySelectorAll('button.MuiButtonBase-root.MuiButton-root');
        let encontrado = false;
        botoes.forEach(btn => {
            if (btn.textContent?.trim() === 'Abrir novo protocolo para o mesmo cliente') {
                btn.style.display = 'none';
                encontrado = true;
                if (!window._botaoEscondido) {
                    log('✅ Botão escondido');
                    window._botaoEscondido = true;
                }
            }
        });
        if (!encontrado && !window._botaoEscondido) {
            setTimeout(esconderBotao, 2000);
        }
    }

    // ============ DETECTAR SERVIÇO ============
    function detectarServico(texto, servico) {
        const t = texto.toLowerCase();
        const patterns = {
            wifiPro: [/wifi\s*pro/, /wi-fi\s*pro/, /wi\s*fi\s*pro/, /wifipro/, /wifi\s*profissional/],
            wifiEnterprise: [/wifi\s*enterprise/, /wi-fi\s*enterprise/, /wi\s*fi\s*enterprise/, /wifi\s+empresarial/],
            osirFone: [/osir\s*fone/, /osirfone/, /osir\s+telefone/, /telefonia\s+osir/, /osir\s+fixa/],
            osirMovel: [/osir\s*m[oó]vel/, /osirm[oó]vel/, /chip\s+osir/, /osir\s+chip/, /osir\s+celular/]
        };
        return (patterns[servico] || []).some(p => p.test(t));
    }

    // ============ OBTER TEXTO DA OS ============
    function obterTextoOS() {
        try {
            const elementos = document.querySelectorAll('p, div, span');
            let tituloDemanda = null;

            for (const el of elementos) {
                if (el.innerText?.trim() === 'Demanda do Cliente' && el.tagName === 'P') {
                    tituloDemanda = el;
                    break;
                }
            }

            if (tituloDemanda) {
                const container = tituloDemanda.closest('.MuiBox-root') || tituloDemanda.parentElement;
                if (container) {
                    let texto = container.innerText || container.textContent || '';
                    texto = texto.replace(/^Demanda do Cliente\s*/, '');
                    const idx = texto.indexOf('Relato de Atendimento');
                    if (idx !== -1) texto = texto.substring(0, idx);
                    texto = texto.replace(/Expandir/gi, '');
                    if (texto?.length > 50) return texto.trim();
                }
            }

            let melhor = '';
            let melhorScore = 0;
            for (const div of document.querySelectorAll('div')) {
                const texto = div.innerText || div.textContent || '';
                if (texto.includes('-- Venda pelo vendedor') || texto.includes('Adesão: R$') || texto.includes('Forma de pagamento:')) {
                    if (!texto.includes('Instalação efetuada com sucesso') || !texto.includes('CTO:')) {
                        let limpo = texto;
                        const idx = limpo.indexOf('Relato de Atendimento');
                        if (idx !== -1) limpo = limpo.substring(0, idx);
                        limpo = limpo.replace(/Expandir/gi, '');

                        let score = 0;
                        if (limpo.includes('Planos')) score += 3;
                        if (limpo.includes('Endereço')) score += 3;
                        if (limpo.includes('Serviços a serem ativados')) score += 3;
                        if (limpo.includes('WI-FI PRO') || limpo.includes('Wi-fi Pro')) score += 2;
                        if (limpo.includes('Osir Fone') || limpo.includes('OsirFone')) score += 3;

                        if (score > melhorScore && limpo.length > 100) {
                            melhorScore = score;
                            melhor = limpo;
                        }
                    }
                }
            }
            return melhor?.length > 100 ? melhor.trim() : '';
        } catch (e) {
            return '';
        }
    }

    // ============ PROCESSAR ALERTAS ============
    let ultimaCategoria = null;
    let ultimoTexto = '';

    function processarAlertas() {
        try {
            const input = document.getElementById('serviceCategoryId1');
            if (!input) { containers.alertas.innerHTML = ''; ultimaCategoria = null; return; }

            const categoria = input.value?.trim() || '';
            let texto = obterTextoOS();

            if (!texto || texto.length < 10) { containers.alertas.innerHTML = ''; return; }
            if (categoria === ultimaCategoria && texto === ultimoTexto) return;

            ultimaCategoria = categoria;
            ultimoTexto = texto;
            containers.alertas.innerHTML = '';

            let txt = normalizarTexto(texto).replace(/https?:\/\/\S+/gi, '').replace(/\S+@\S+\.\S+/gi, '');

            // Troca de Endereço
            if (categoria.toLowerCase().includes('troca') && categoria.toLowerCase().includes('ender')) {
                if (/custo[\s\S]*?80\s*00/.test(txt) && /\([\s]*x[\s]*\)\s*sim|sim\s*\([\s]*x[\s]*\)/.test(txt)) {
                    containers.alertas.appendChild(cardAlerta(
                        'ENVIAR PARA SAC N2 FAZER A COBRANÇA DE R$ 80,00!',
                        '#ffebee', '#c62828', '#d32f2f', '⚠️'
                    ));
                }
                return;
            }

            // Serviços
            const servicos = [
                { id: 'wifiPro', label: 'WIFI-PRO: VERIFICAR SE FOI INSTALADO!', cor: '#f3e5f5', texto: '#4a148c', borda: '#9c27b0', icone: '🌐' },
                { id: 'wifiEnterprise', label: 'WIFI ENTERPRISE: VERIFICAR. EQUIP: ONU > RB > EAPs', cor: '#e8f5e9', texto: '#1b5e20', borda: '#43a047', icone: '🏢' },
                { id: 'osirFone', label: 'TELEFONIA FIXA: VERIFICAR SE FOI INSTALADA!', cor: '#e3f2fd', texto: '#0d47a1', borda: '#1976d2', icone: '📞' },
                { id: 'osirMovel', label: 'OSIRMÓVEL: VERIFICAR SE O CHIP FOI ENTREGUE!', cor: '#fff3e0', texto: '#e65100', borda: '#ff9800', icone: '📱' }
            ];

            servicos.forEach(s => {
                if (detectarServico(txt, s.id)) {
                    containers.alertas.appendChild(cardAlerta(s.label, s.cor, s.texto, s.borda, s.icone));
                    log(`✅ ${s.id} detectado!`);
                }
            });
        } catch (e) {
            console.error('Erro Notificador:', e);
        }
    }

    const processarDebounced = debounce(processarAlertas, CFG.DEBOUNCE_DELAY);

    // ============ AUDITOR DE ESTOQUE ============
    let auditando = false;

    function abaConsumoAtiva(doc) {
        const spans = doc.querySelectorAll('.MuiTab-wrapper');
        for (const span of spans) {
            if (span.innerText?.toUpperCase().includes('PRODUTOS - CONSUMO INTERNO')) {
                const btn = span.closest('button');
                if (btn?.classList.contains('Mui-selected')) return true;
            }
        }
        return false;
    }

    function analisarGrid(doc) {
        const errosItens = [];
        const errosQtd = [];

        if (!abaConsumoAtiva(doc)) return { errosItens, errosQtd };

        const linhas = doc.querySelectorAll('tr.line, [role="row"], .rt-tr, [id*="datagrid_row" i]');
        linhas.forEach(linha => {
            const celulas = linha.querySelectorAll('td, [role="gridcell"], .rt-td, div[class*="cell" i]');
            if (celulas.length >= 3) {
                const produto = celulas[1].textContent.trim();
                if (produto && isNaN(produto) && produto.length > 3 && !produto.toUpperCase().startsWith('TOTAL')) {
                    const itemNorm = normalizarItem(produto);

                    const ferramenta = FERRAMENTAS_NORM.find(f => itemNorm === f || itemNorm.includes(f));
                    if (ferramenta) {
                        if (!errosItens.some(e => e.item === produto)) {
                            errosItens.push({ item: produto, motivo: 'FERRAMENTA DE TÉCNICO! NÃO ALOCAR NO CONSUMO!' });
                        }
                    } else if (itemNorm && !MATERIAIS_NORM.includes(itemNorm) && itemNorm !== 'PRODUTO') {
                        if (!errosItens.some(e => e.item === produto)) {
                            errosItens.push({ item: produto, motivo: 'NÃO ALOCAR COMO CONSUMO INTERNO!' });
                        }
                    }

                    if (itemNorm === CABO_DROP) {
                        const qtd = parseFloat(celulas[2].textContent.trim().replace(',', '.'));
                        if (!isNaN(qtd) && qtd > CFG.MAX_CABO_DROP) {
                            errosQtd.push({ item: produto, qtd });
                        }
                    }
                }
            }
        });

        return { errosItens, errosQtd };
    }

    function rodarAuditoria() {
        if (auditando) return;
        auditando = true;

        try {
            let itens = [];
            let qtds = [];

            const res = analisarGrid(document);
            itens = itens.concat(res.errosItens);
            qtds = qtds.concat(res.errosQtd);

            document.querySelectorAll('iframe').forEach(frame => {
                try {
                    const doc = frame.contentDocument || frame.contentWindow.document;
                    const r = analisarGrid(doc);
                    itens = itens.concat(r.errosItens);
                    qtds = qtds.concat(r.errosQtd);
                } catch (e) { /* cross-origin */ }
            });

            containers.auditor.innerHTML = '';

            itens.filter((v, i, a) => a.findIndex(t => t.item === v.item) === i)
                .forEach(e => containers.auditor.appendChild(cardErroItem(e.item, e.motivo)));

            qtds.filter((v, i, a) => a.findIndex(t => t.item === v.item && t.qtd === v.qtd) === i)
                .forEach(e => containers.auditor.appendChild(cardErroQtd(e.item, e.qtd)));

        } catch (e) {
            console.error('Erro Auditoria:', e);
        } finally {
            auditando = false;
        }
    }

    // ============ INICIAR ============
    function iniciar() {
        log(`🚀 v${CFG.VERSAO}`);

        criarContainers();

        // Auditor
        setInterval(rodarAuditoria, CFG.AUDITOR_INTERVAL);

        // Esconder botão
        [500, 1500, 3000, 5000].forEach(ms => setTimeout(esconderBotao, ms));

        // Observer
        const observer = new MutationObserver(() => {
            try {
                processarDebounced();
                esconderBotao();
            } catch (e) {}
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Inicialização
        setTimeout(processarAlertas, 2000);
        setTimeout(processarAlertas, 5000);

        log('✅ Alertas: Troca de Endereço, OsirFone, OsirMóvel, WiFi Pro, WiFi Enterprise');
        log(`✅ Auditor: intervalo ${CFG.AUDITOR_INTERVAL}ms`);
        log(`✅ Debounce: ${CFG.DEBOUNCE_DELAY}ms`);
        log('✅ Botão "Abrir novo protocolo" escondido');
    }

    // ============ EXECUTAR ============
    if (location.href.includes('erp.osirnet.com.br')) {
        setTimeout(iniciar, 500);
    }

})();
