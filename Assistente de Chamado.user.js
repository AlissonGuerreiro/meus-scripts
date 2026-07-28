// ==UserScript==
// @name         Osir - Assistente de Chamado
// @namespace    http://tampermonkey.net/
// @version      1.4.6
// @description  Alertas automáticos de planos, auditor de estoque e esconder botão
// @author       Alisson Guerreiro
// @match        https://erp.osirnet.com.br/ui/*/legacy/operations/*
// @match        https://erp.osirnet.com.br/*
// @match        *://*.osirnet.com.br/*
// @grant        none
// @run-at       document-end
// @homepage     https://github.com/AlissonGuerreiro/meus-scripts
// @supportURL   https://github.com/AlissonGuerreiro/meus-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Assistente%20de%20Chamado.user.js
// @updateURL    https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Assistente%20de%20Chamado.user.js
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // CONFIGURAÇÕES
    // =========================================================================
    const DEBUG = true;
    const SCRIPT_VERSION = '1.4.5';
    const CACHE_MAX_SIZE = 1000;
    const CACHE_CLEANUP_INTERVAL = 300000; // 5 minutos
    const MAX_TENTATIVAS_BOTAO = 10;

    // =========================================================================
    // SELETORES MUI (CENTRALIZADOS PARA FACILITAR MANUTENÇÃO)
    // =========================================================================
    const MUI_SELECTORS = {
        buttonBase: 'button.MuiButtonBase-root.MuiButton-root',
        tabWrapper: '.MuiTab-wrapper',
        typographyBody1: '.MuiTypography-body1',
        typographyBody2: '.MuiTypography-body2',
        typographyRoot: 'p.MuiTypography-root',
        tabPanel: 'div[role="tabpanel"]'
    };

    const SELECTORS_OS = [
        '[class*="demanda"]',
        '[class*="cliente"]',
        MUI_SELECTORS.typographyBody1,
        MUI_SELECTORS.typographyBody2,
        MUI_SELECTORS.typographyRoot,
        MUI_SELECTORS.tabPanel
    ];

    const KEYWORDS_OS = [
        'DEMANDA DO CLIENTE',
        'SERVIÇOS A SEREM ATIVADOS',
        'VENDA PELO VENDEDOR',
        'ADESÃO: R$',
        'FORMA DE PAGAMENTO:',
        '---- SERVIÇOS ----',
        'OSIR MÓVEL',
        'OSIR FONE',
        'WIFI PRO',
        'WI-FI PRO'
    ];

    // =========================================================================
    // FUNÇÃO DE LOG CONDICIONAL
    // =========================================================================
    function log(...args) {
        if (DEBUG) console.log(...args);
    }

    function logError(...args) {
        if (DEBUG) console.error(...args);
    }

    log(`🚀 Osir Assistente de Chamado v${SCRIPT_VERSION} carregado!`);

    // =========================================================================
    // BANCO DE DADOS (MATERIAIS E FERRAMENTAS)
    // =========================================================================
    const MATERIAIS_PERMITIDOS = [
        "CONECTOR FAST SC/APC", "FIXA FIO PRETO UNIDADE", "SUPORTE ORGANIZADOR DE ROTEADOR",
        "SUPORTE ORGANIZADOR DE ROTEADOR - OSIRNET", "BUCHA DE PAREDE 6MM", "PARAFUSO PHILIPS 6MM",
        "CABO ÓPTICO (DROP)", "FECHO DENTADO INOX 3/4", "ALCA PRE FORMADA PARA DROP - FIO FE 80/100/160 420MM BIT 1,85MM",
        "PLACA IDENTIFICADORA DE CABO OPTICO - OSIRNET", "ISOLADOR 4 VIAS", "ABRACADEIRA DE FIXACAO 20CM X 3,70MM - PRETA",
        "PITÃO 8 MM UNIDADE", "BUCHA DE PASSAGEM / FTB", "CABO LAN PRETO", "CONECTOR RJ45",
        "PARAFUSO SX SOBERBA 1/4", "PARAFUSO PHILIPS 4MM (INOVAÇÃO)", "PROTETOR CONECTOR OPTICO",
        "FITA ISOLANTE PRETA 20M X 19 MM", "BUCHA DE PAREDE 8MM", "PARAFUSO PHILIPS 4,0 X 40",
        "CABO LAN BRANCO", "ALINHADOR OPTICO APC SIMPLEX", "PROTETOR DE EMENDA", "SUPA 3",
        "FITA DE ACO INOX 430 LAMINADO A FRIO LISA 3/4 - 05 MM X 25MTS", "PF CHIP RT CB CH PH BC 3,5X25MM",
        "BUCHA FIXACAO 6MM", "PARAFUSO 10 x 55 mm", "ARAME DE ESPINAR ISOLADO METALICO FEI125V 105M", "FITA ISOLANTE PRETA 19MM X 10M", "BUCHA DE PAREDE 10mm", "ABRACADEIRA DE FIXACAO 28CM X 4,80MM - PRETA",
        "FIXA FIO BRANCO UNIDADE"
    ];

    const FERRAMENTAS_PROIBIDAS = [
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
        "CADEADO ANTIFURTO COM CHAVE 1,2 MT", "CLIVADOR REDEX", "CAIXA ORGANIZADORA", "GARRAFA TERMICA 5L"
    ];

    // =========================================================================
    // LISTA DE SERVIÇOS QUE DEVEM SER VERIFICADOS
    // =========================================================================
    const SERVICOS_VERIFICAR = [
        "fibra ativação",
        "fibra ativação crm",
        "fibra - ativação pj",
        "fibra + telefonia - ativação",
        "fibra + telefonia - ativação pj"
    ];

    const SERVICO_TROCA_ENDERECO = "contratos - troca de endereço fibra";

    // =========================================================================
    // FUNÇÕES AUXILIARES OTIMIZADAS (UNIFICADAS)
    // =========================================================================
    const normalizeCache = new Map();

    function normalizar(str, modo = 'upper') {
        if (!str) return "";

        const cacheKey = str + '_' + modo;

        if (normalizeCache.has(cacheKey)) {
            return normalizeCache.get(cacheKey);
        }

        let result = str.trim()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ");

        result = modo === 'upper' ? result.toUpperCase() : result.toLowerCase();

        if (normalizeCache.size < CACHE_MAX_SIZE) {
            normalizeCache.set(cacheKey, result);
        }

        return result;
    }

    // Mantendo compatibilidade com as funções antigas
    function normalizarItem(texto) {
        return normalizar(texto, 'upper');
    }

    function normalizarTexto(texto) {
        return normalizar(texto, 'lower');
    }

    // Limpeza periódica do cache para evitar memory leak
    setInterval(() => {
        const tamanhoAntes = normalizeCache.size;
        normalizeCache.clear();
        if (tamanhoAntes > 0) {
            log(`🧹 Cache de normalização limpo (${tamanhoAntes} itens removidos)`);
        }
    }, CACHE_CLEANUP_INTERVAL);

    // Pré-calcula listas normalizadas
    const listaPermitidaNormalizada = MATERIAIS_PERMITIDOS.map(normalizarItem);
    const listaFerramentasNormalizada = FERRAMENTAS_PROIBIDAS.map(normalizarItem);
    const CABO_DROP_NORMALIZADO = normalizarItem("CABO ÓPTICO (DROP)");

    // =========================================================================
    // FUNÇÃO PARA DETECTAR SERVIÇOS
    // =========================================================================
    const servicePatterns = {
        wifiPro: [
            /\bw[ei]\s*[-]?\s*f[ei]\s+pro\b/i,
            /\bw[ei]fipro\b/i,
            /\bwifi\s*pro\b/i,
            /\bwi-fi\s*pro\b/i
        ],
        wifiEnterprise: [
            /\bw[ei]\s*[-]?\s*f[ei]\s+(enterprise|empresarial)\b/i
        ],
        osirFone: [
            /(osir|ozir)\s+(fone|foni|fono|fixo|telefone|telefonia)\b/i,
            /telefonia\s+(osir|ozir)\b/i
        ],
        osirMovel: [
            /(osir|ozir)\s+(movel|móvel|chip|celular|mobile)\b/i,
            /(chip|celular)\s+(osir|ozir)\b/i,
            /\bosir\s+m[oó]vel\b/i,
            /osirm[oó]vel/i
        ]
    };

    function detectarServico(texto, servico) {
        const patterns = servicePatterns[servico];
        if (!patterns) return false;
        return patterns.some(pattern => pattern.test(texto));
    }

    // =========================================================================
    // FUNÇÃO PARA VERIFICAR SE O SERVIÇO DEVE SER ANALISADO
    // =========================================================================
    function deveVerificarServico(categoria) {
        if (!categoria) return false;

        const catNorm = normalizarTexto(categoria);

        return SERVICOS_VERIFICAR.some(servico =>
            catNorm.includes(servico) || servico.includes(catNorm)
        );
    }

    function isTrocaEndereco(categoria) {
        if (!categoria) return false;
        const catNorm = normalizarTexto(categoria);
        return catNorm.includes(normalizarTexto(SERVICO_TROCA_ENDERECO));
    }

    // =========================================================================
    // FUNÇÃO PARA OBTER O TEXTO DA DEMANDA
    // =========================================================================
    function obterTextoOS() {
        try {
            let textoEncontrado = '';
            let melhorScore = 0;
            const elementos = document.querySelectorAll(SELECTORS_OS.join(','));

            for (let el of elementos) {
                const txt = el.textContent || '';
                if (!txt || txt.length < 20) continue;

                let score = 0;
                const txtUpper = txt.toUpperCase();

                KEYWORDS_OS.forEach(keyword => {
                    if (txtUpper.includes(keyword)) {
                        score += 10;
                    }
                });

                if (txt.length > 50 && txt.length < 5000) {
                    score += txt.length / 100;
                }

                if (score > melhorScore) {
                    melhorScore = score;
                    textoEncontrado = txt;

                    // Early termination: se encontrou um elemento muito bom, para de buscar
                    if (melhorScore > 50) break;
                }
            }

            if (textoEncontrado) {
                textoEncontrado = textoEncontrado
                    .replace(/^Demanda do Cliente\s*/, '')
                    .replace(/Relato de Atendimento.*$/, '')
                    .replace(/Expandir/g, '')
                    .replace(/expandir/g, '');
                return textoEncontrado.trim();
            }

            const bodyText = document.body.textContent || '';
            if (bodyText.length > 100 && bodyText.length < 5000) {
                return bodyText;
            }

            return '';
        } catch (err) {
            logError('Erro ao buscar texto:', err);
            return '';
        }
    }

    // =========================================================================
    // CONTAINERS DE ALERTAS
    // =========================================================================
    const alertContainer = document.createElement('div');
    alertContainer.id = 'tm-alerts-container';
    alertContainer.style.cssText = "position: fixed; bottom: 140px; right: 25px; width: 340px; z-index: 10000; font-family: 'Roboto', sans-serif, Arial; display: flex; flex-direction: column-reverse; gap: 10px; pointer-events: none;";
    document.body.appendChild(alertContainer);

    const auditorContainer = document.createElement('div');
    auditorContainer.id = 'tm-auditor-container';
    auditorContainer.style.cssText = "position: fixed; top: 80px; right: 25px; width: 360px; z-index: 10001; font-family: 'Roboto', sans-serif, Arial; display: flex; flex-direction: column; gap: 10px; pointer-events: none;";
    document.body.appendChild(auditorContainer);

    // =========================================================================
    // FUNÇÕES DE CRIAÇÃO DE CARDS
    // =========================================================================
    function criarCardAlerta(texto, corFundo, corTexto, corBorda, icone = "") {
        const card = document.createElement('div');
        card.style.cssText = `background-color: ${corFundo}; color: ${corTexto}; border: 2px solid ${corBorda}; border-radius: 8px; padding: 12px 15px; font-size: 12px; font-weight: bold; line-height: 1.4; box-shadow: 0px 4px 12px rgba(0,0,0,0.15); text-align: center; text-transform: uppercase; pointer-events: auto;`;
        card.textContent = icone + " " + texto;
        return card;
    }

    function criarCardErroEstoque(itemIncorreto, motivo = "NÃO ALOCAR COMO CONSUMO INTERNO!") {
        const card = document.createElement('div');
        card.style.cssText = "background-color: #ffebee; color: #c62828; border: 2px solid #d32f2f; border-radius: 8px; padding: 14px; font-size: 12px; font-weight: bold; line-height: 1.5; box-shadow: 0px 4px 12px rgba(0,0,0,0.2); text-align: center; pointer-events: auto;";
        card.innerHTML = `⚠️ ATENÇÃO: ITEM FORA DO PADRÃO DETECTADO!<br><span style="color:#000; font-size:13px;">"${itemIncorreto}"</span><br>${motivo}`;
        return card;
    }

    function criarCardErroQuantidade(item, qtd) {
        const card = document.createElement('div');
        card.style.cssText = "background-color: #fffde7; color: #f57f17; border: 2px solid #fbc02d; border-radius: 8px; padding: 14px; font-size: 12px; font-weight: bold; line-height: 1.5; box-shadow: 0px 4px 12px rgba(0,0,0,0.2); text-align: center; pointer-events: auto;";
        card.innerHTML = `⚠️ LIMITE EXCEDIDO!<br><span style="color:#000; font-size:13px;">"${item}"</span><br>Quantidade alocada: <span style="font-size:14px; color:#e65100;">${qtd} MTS</span><br>O limite do teste é 350 MTS!`;
        return card;
    }

    // =========================================================================
    // FUNÇÃO PARA ESCONDER O BOTÃO (COM LIMITE DE TENTATIVAS)
    // =========================================================================
    let tentativasBotao = 0;

    function esconderBotaoProtocolo() {
        try {
            const botoes = document.querySelectorAll(MUI_SELECTORS.buttonBase);
            let encontrado = false;

            botoes.forEach(botao => {
                if (botao.textContent && botao.textContent.trim() === 'Abrir novo protocolo para o mesmo cliente') {
                    botao.style.display = 'none';
                    encontrado = true;
                    if (!window._botaoEscondido) {
                        log('✅ Botão "Abrir novo protocolo para o mesmo cliente" escondido!');
                        window._botaoEscondido = true;
                    }
                }
            });

            if (!encontrado && tentativasBotao < MAX_TENTATIVAS_BOTAO) {
                tentativasBotao++;
                setTimeout(esconderBotaoProtocolo, 2000);
            } else if (tentativasBotao >= MAX_TENTATIVAS_BOTAO && !window._botaoEscondido) {
                log('⚠️ Botão não encontrado após máximo de tentativas');
            }
        } catch (err) {
            // Ignora erros silenciosamente
        }
    }

    // =========================================================================
    // PROCESSADOR DE ALERTAS (VERSÃO REFORMULADA 1.4.5)
    // =========================================================================
    let ultimaCategoria = null;
    let ultimoTextoOS = "";

    function processarAlertas() {
        try {
            const inputCategoria = document.getElementById('serviceCategoryId1');
            if (!inputCategoria) {
                alertContainer.innerHTML = "";
                ultimaCategoria = null;
                return;
            }

            const categoryAtual = inputCategoria.value ? inputCategoria.value.trim() : "";

            // Verificação antecipada: se não tem categoria, nem busca o texto da OS
            if (!categoryAtual) {
                alertContainer.innerHTML = "";
                ultimaCategoria = null;
                ultimoTextoOS = "";
                return;
            }

            const textoOSOriginal = obterTextoOS();

            if (!textoOSOriginal || textoOSOriginal.length < 10) {
                alertContainer.innerHTML = "";
                return;
            }

            if (categoryAtual === ultimaCategoria && textoOSOriginal === ultimoTextoOS) return;

            ultimaCategoria = categoryAtual;
            ultimoTextoOS = textoOSOriginal;
            alertContainer.innerHTML = "";

            const txtNorm = normalizarTexto(textoOSOriginal);

            // ================================================================
            // CASO 1: TROCA DE ENDEREÇO (verifica apenas R$ 80,00)
            // ================================================================
            if (isTrocaEndereco(categoryAtual)) {
                const temCusto80Sim = /custo\s*r?\$?\s*80[^)]*\([^)]*x\s*\)\s*sim/i.test(txtNorm);

                if (temCusto80Sim) {
                    alertContainer.appendChild(criarCardAlerta(
                        "ENVIAR PARA SAC N2 FAZER A COBRANÇA DE R$ 80,00!",
                        "#ffebee", "#c62828", "#d32f2f", "⚠️"
                    ));
                }

                log('📌 Troca de Endereço: Verificando apenas cobrança R$ 80,00');
                return;
            }

            // ================================================================
            // CASO 2: SERVIÇOS DA LISTA (verifica WiFi Pro, Osir Móvel, etc)
            // ================================================================
            if (deveVerificarServico(categoryAtual)) {
                log(`✅ Serviço "${categoryAtual}" está na lista de verificação`);

                if (detectarServico(txtNorm, 'wifiPro')) {
                    alertContainer.appendChild(criarCardAlerta(
                        "WIFI-PRO: VERIFICAR SE FOI INSTALADO!",
                        "#f3e5f5", "#4a148c", "#9c27b0", "🌐"
                    ));
                }

                if (detectarServico(txtNorm, 'wifiEnterprise')) {
                    alertContainer.appendChild(criarCardAlerta(
                        "WIFI ENTERPRISE: VERIFICAR SE FOI INSTALADO. EQUIPAMENTOS: ONU > RB > EAPs",
                        "#e8f5e9", "#1b5e20", "#43a047", "🏢"
                    ));
                }

                if (detectarServico(txtNorm, 'osirFone')) {
                    alertContainer.appendChild(criarCardAlerta(
                        "TELEFONIA FIXA: VERIFICAR SE FOI INSTALADA COM OS EQUIPAMENTOS ADEQUADOS!",
                        "#e3f2fd", "#0d47a1", "#1976d2", "📞"
                    ));
                }

                if (detectarServico(txtNorm, 'osirMovel')) {
                    alertContainer.appendChild(criarCardAlerta(
                        "OSIRMÓVEL: VERIFICAR SE O CHIP FOI ENTREGUE!",
                        "#fff3e0", "#e65100", "#ff9800", "📱"
                    ));
                }

                return;
            }

            // ================================================================
            // CASO 3: OUTROS SERVIÇOS (IGNORA COMPLETAMENTE)
            // ================================================================
            log(`ℹ️ Serviço "${categoryAtual}" não está na lista de verificação. Ignorando.`);

        } catch (err) {
            logError("Erro Notificador:", err);
        }
    }

    // =========================================================================
    // MÓDULO 2: AUDITOR DE ESTOQUE
    // =========================================================================
    function abaConsumoEstaAtiva(doc) {
        const spansAba = doc.querySelectorAll(MUI_SELECTORS.tabWrapper);
        for (let span of spansAba) {
            if (span.textContent && span.textContent.toUpperCase().includes("PRODUTOS - CONSUMO INTERNO")) {
                const b = span.closest('button');
                if (b && b.classList.contains('Mui-selected')) return true;
            }
        }
        return false;
    }

    function analisarGridMateriais(doc) {
        let errosItens = [];
        let errosQtd = [];

        if (!abaConsumoEstaAtiva(doc)) return { errosItens, errosQtd };

        const linhasGrid = doc.querySelectorAll('tr.line, [role="row"], .rt-tr, [id*="datagrid_row" i]');
        linhasGrid.forEach(linha => {
            const celulas = linha.querySelectorAll('td, [role="gridcell"], .rt-td, div[class*="cell" i]');
            if (celulas.length >= 3) {
                const txtProd = celulas[1].textContent.trim();
                if (txtProd && isNaN(txtProd) && txtProd.length > 3 && !txtProd.toUpperCase().startsWith("TOTAL")) {
                    const itemNorm = normalizarItem(txtProd);
                    let ferramenta = listaFerramentasNormalizada.find(f => itemNorm === f || itemNorm.includes(f));

                    if (ferramenta) {
                        if (!errosItens.some(e => e.item === txtProd)) {
                            errosItens.push({ item: txtProd, motivo: "FERRAMENTA DE TÉCNICO! NÃO ALOCAR NO CONSUMO!" });
                        }
                    } else if (itemNorm && !listaPermitidaNormalizada.includes(itemNorm) && itemNorm !== "PRODUTO") {
                        if (!errosItens.some(e => e.item === txtProd)) {
                            errosItens.push({ item: txtProd, motivo: "NÃO ALOCAR COMO CONSUMO INTERNO!" });
                        }
                    }

                    if (itemNorm === CABO_DROP_NORMALIZADO) {
                        const qVal = parseFloat(celulas[2].textContent.trim().replace(',', '.'));
                        if (!isNaN(qVal) && qVal > 350) {
                            errosQtd.push({ item: txtProd, qtd: qVal });
                        }
                    }
                }
            }
        });
        return { errosItens, errosQtd };
    }

    function rodarAuditoriaGlobal() {
        try {
            let todosErrosItens = [];
            let todosErrosQtd = [];

            const resPrincipal = analisarGridMateriais(document);
            todosErrosItens = todosErrosItens.concat(resPrincipal.errosItens);
            todosErrosQtd = todosErrosQtd.concat(resPrincipal.errosQtd);

            document.querySelectorAll('iframe').forEach(frame => {
                try {
                    const docFrame = frame.contentDocument || frame.contentWindow.document;
                    const resFrame = analisarGridMateriais(docFrame);
                    todosErrosItens = todosErrosItens.concat(resFrame.errosItens);
                    todosErrosQtd = todosErrosQtd.concat(resFrame.errosQtd);
                } catch (e) {
                    // Iframe de origem diferente ou inacessível - normal
                }
            });

            auditorContainer.innerHTML = "";
            todosErrosItens.filter((v, i, a) => a.findIndex(t => t.item === v.item) === i).forEach(e => {
                auditorContainer.appendChild(criarCardErroEstoque(e.item, e.motivo));
            });
            todosErrosQtd.filter((v, i, a) => a.findIndex(t => (t.item === v.item && t.qtd === v.qtd)) === i).forEach(e => {
                auditorContainer.appendChild(criarCardErroQuantidade(e.item, e.qtd));
            });
        } catch (err) {
            logError("Erro Auditoria Global:", err);
        }
    }

    // =========================================================================
    // DISPARADORES
    // =========================================================================
    setInterval(rodarAuditoriaGlobal, 1500);

    // Inicia as tentativas de esconder o botão (com limite de tentativas)
    setTimeout(esconderBotaoProtocolo, 500);

    const observador = new MutationObserver(() => {
        try {
            processarAlertas();
            esconderBotaoProtocolo();
        } catch (e) {
            // Ignora erros silenciosamente
        }
    });
    observador.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
        try {
            processarAlertas();
        } catch (e) {
            // Ignora erros silenciosamente
        }
    }, 2000);

    setTimeout(() => {
        try {
            processarAlertas();
        } catch (e) {
            // Ignora erros silenciosamente
        }
    }, 5000);

    log(`✅ ${SCRIPT_VERSION} - Verificação apenas para serviços específicos:`);
    log(`   📋 Serviços verificados: Fibra Ativação, Fibra ativação CRM, Fibra - Ativação PJ, Fibra + Telefonia - Ativação, Fibra + Telefonia - Ativação PJ`);
    log(`   🔍 Verifica: WiFi Pro, Osir Móvel, Osir Fone, WiFi Enterprise`);
    log(`   💰 Troca de Endereço: Verifica apenas cobrança R$ 80,00`);
    log(`   ⏭️ Demais serviços: IGNORADOS`);
    log(`   📦 Auditor de estoque ativo`);
    log(`   🔒 Botão de protocolo escondido (com limite de ${MAX_TENTATIVAS_BOTAO} tentativas)`);
    log(`   🧹 Cache limpo a cada ${CACHE_CLEANUP_INTERVAL / 1000 / 60} minutos`);

})();
