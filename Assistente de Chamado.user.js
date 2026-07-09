// ==UserScript==
// @name         Osir - Assistente de Chamado
// @namespace    http://tampermonkey.net/
// @version      1.3.8
// @description  Alertas automáticos de planos e auditor de estoque
// @author       Alisson Guerreiro
// @match        https://erp.osirnet.com.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = '1.3.8';
    console.log(`🚀 Osir Assistente de Chamado v${SCRIPT_VERSION} carregado!`);

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
    // FUNÇÕES AUXILIARES
    // =========================================================================
    function normalizarItem(texto) {
        if (!texto) return "";
        return texto.trim().replace(/^\d+\s*-\s*/, "")
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s+/g, " ").toUpperCase();
    }

    const listaPermitidaNormalizada = MATERIAIS_PERMITIDOS.map(normalizarItem);
    const listaFerramentasNormalizada = FERRAMENTAS_PROIBIDAS.map(normalizarItem);
    const CABO_DROP_NORMALIZADO = normalizarItem("CABO ÓPTICO (DROP)");

    // NÃO REMOVER CARACTERES ESPECIAIS DOS NOMES DOS SERVIÇOS
    function normalizarTexto(texto) {
        if (!texto) return "";
        // Remove apenas acentos, mas mantém hífens e espaços para detectar "Osir Fone" e "Wi-Fi"
        return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s+/g, " ")  // Normaliza espaços
                    .toLowerCase().trim();
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
        card.innerText = icone + " " + texto;
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
    // FUNÇÃO PARA DETECTAR SERVIÇOS (TODAS AS VARIAÇÕES) - VERSÃO MELHORADA
    // =========================================================================
    function detectarServico(texto, servico) {
        const txtLower = texto.toLowerCase();

        switch(servico) {
            case 'wifiPro':
                // Todas as variações possíveis de WiFi Pro
                const wifiProPatterns = [
                    /wifi\s*pro/,
                    /wi-fi\s*pro/,
                    /wi\s*fi\s*pro/,
                    /wifipro/,
                    /wifi\s*profissional/,
                    /wi-fi\s*profissional/,
                    /wi\s*fi\s*profissional/,
                    /wifi\s*pro/,
                    /wi-fi\s*pro/
                ];
                return wifiProPatterns.some(pattern => pattern.test(txtLower));

            case 'wifiEnterprise':
                // Todas as variações possíveis de WiFi Enterprise
                const wifiEnterprisePatterns = [
                    /wifi\s*enterprise/,
                    /wi-fi\s*enterprise/,
                    /wi\s*fi\s*enterprise/,
                    /wifi\s+empresarial/,
                    /wi-fi\s+empresarial/,
                    /enterprise\s+wifi/,
                    /empresarial\s+wifi/
                ];
                return wifiEnterprisePatterns.some(pattern => pattern.test(txtLower));

            case 'osirFone':
                // Todas as variações possíveis de OsirFone
                const osirFonePatterns = [
                    /osir\s*fone/,
                    /osirfone/,
                    /osir\s+telefone/,
                    /telefonia\s+osir/,
                    /osir\s+fixa/,
                    /osir\s+telefonia/,
                    /osir\s+fone\s+ilimitado/,
                    /fone\s+osir/
                ];
                return osirFonePatterns.some(pattern => pattern.test(txtLower));

            case 'osirMovel':
                // Todas as variações possíveis de OsirMóvel
                const osirMovelPatterns = [
                    /osir\s*m[oó]vel/,
                    /osirm[oó]vel/,
                    /osir\s+movel/,
                    /chip\s+osir/,
                    /osir\s+chip/,
                    /osir\s+celular/,
                    /osir\s+mobile/
                ];
                return osirMovelPatterns.some(pattern => pattern.test(txtLower));

            default:
                return false;
        }
    }

    // =========================================================================
    // FUNÇÃO PARA OBTER O TEXTO DA DEMANDA DO CLIENTE
    // =========================================================================
    function obterTextoOS() {
        try {
            console.log('🔍 Buscando TODO o texto da Demanda do Cliente...');

            // Estratégia 1: Encontrar pelo título
            const todosElementos = document.querySelectorAll('p, div, span');
            let tituloDemanda = null;

            for (let el of todosElementos) {
                const texto = el.innerText ? el.innerText.trim() : '';
                if (texto === 'Demanda do Cliente' && el.tagName === 'P') {
                    tituloDemanda = el;
                    console.log('✅ Título "Demanda do Cliente" encontrado');
                    break;
                }
            }

            if (tituloDemanda) {
                let container = tituloDemanda.closest('.MuiBox-root') || tituloDemanda.parentElement;

                if (container) {
                    let textoCompleto = container.innerText || container.textContent || '';
                    textoCompleto = textoCompleto.replace(/^Demanda do Cliente\s*/, '');

                    const indexRelato = textoCompleto.indexOf('Relato de Atendimento');
                    if (indexRelato !== -1) {
                        textoCompleto = textoCompleto.substring(0, indexRelato);
                    }

                    textoCompleto = textoCompleto.replace(/Expandir/g, '').replace(/expandir/g, '');

                    if (textoCompleto && textoCompleto.length > 50) {
                        console.log('✅ Texto completo obtido do container!');
                        return textoCompleto.trim();
                    }
                }
            }

            // Estratégia 2: Buscar diretamente pelo conteúdo
            const todosDivs = document.querySelectorAll('div');
            let melhorTexto = '';
            let melhorScore = 0;

            for (let div of todosDivs) {
                const texto = div.innerText || div.textContent || '';

                if (texto.includes('-- Venda pelo vendedor') ||
                    texto.includes('Adesão: R$') ||
                    texto.includes('Forma de pagamento:')) {

                    if (!texto.includes('Instalação efetuada com sucesso') ||
                        !texto.includes('CTO:')) {

                        let textoLimpo = texto;
                        const indexRelato = textoLimpo.indexOf('Relato de Atendimento');
                        if (indexRelato !== -1) {
                            textoLimpo = textoLimpo.substring(0, indexRelato);
                        }

                        textoLimpo = textoLimpo.replace(/Expandir/g, '').replace(/expandir/g, '');

                        let score = 0;
                        if (textoLimpo.includes('Planos')) score += 3;
                        if (textoLimpo.includes('Endereço')) score += 3;
                        if (textoLimpo.includes('Serviços a serem ativados')) score += 3;
                        if (textoLimpo.includes('WI-FI PRO')) score += 2;
                        if (textoLimpo.includes('Wi-fi Pro')) score += 2;
                        if (textoLimpo.includes('Osir Fone')) score += 3;
                        if (textoLimpo.includes('OsirFone')) score += 3;

                        if (score > melhorScore && textoLimpo.length > 100) {
                            melhorScore = score;
                            melhorTexto = textoLimpo;
                        }
                    }
                }
            }

            if (melhorTexto && melhorTexto.length > 100) {
                console.log('✅ Texto completo encontrado!');
                return melhorTexto.trim();
            }

            console.log('⚠️ Nenhum texto válido encontrado');
            return '';

        } catch (err) {
            console.error('Erro ao buscar texto:', err);
            return '';
        }
    }

    // =========================================================================
    // MÓDULO 1: NOTIFICADOR DE PLANOS
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
            let textoOSOriginal = obterTextoOS();

            if (!textoOSOriginal || textoOSOriginal.length < 10) {
                alertContainer.innerHTML = "";
                return;
            }

            if (categoryAtual === ultimaCategoria && textoOSOriginal === ultimoTextoOS) return;
            ultimaCategoria = categoryAtual;
            ultimoTextoOS = textoOSOriginal;
            alertContainer.innerHTML = "";

            // Mantém uma versão limpa para debug
            let txtNorm = normalizarTexto(textoOSOriginal);
            txtNorm = txtNorm.replace(/https?:\/\/\S+/gi, "").replace(/\S+@\S+\.\S+/gi, "");

            console.log('📝 Processando alertas...');
            console.log('📝 Texto normalizado:', txtNorm.substring(0, 500) + '...');

            // =============================================================
            // TROCA DE ENDEREÇO
            // =============================================================
            if (categoryAtual.toLowerCase().includes("troca") && categoryAtual.toLowerCase().includes("ender")) {
                const temCusto80 = /custo[\s\S]*?80\s*00/.test(txtNorm);
                const temSimMarcado = /\([\s]*x[\s]*\)\s*sim|sim\s*\([\s]*x[\s]*\)|sim\s*\(x\)|\(x\)\s*sim/.test(txtNorm);

                if (temCusto80 && temSimMarcado) {
                    alertContainer.appendChild(criarCardAlerta(
                        "ENVIAR PARA SAC N2 FAZER A COBRANÇA DE R$ 80,00!",
                        "#ffebee", "#c62828", "#d32f2f", "⚠️"
                    ));
                }
                return;
            }

            // =============================================================
            // VERIFICAÇÕES DE SERVIÇOS (USANDO A FUNÇÃO DETECTAR)
            // =============================================================

            // ✅ WiFi Pro - 🌐
            if (detectarServico(txtNorm, 'wifiPro')) {
                console.log('✅ WiFi Pro detectado!');
                alertContainer.appendChild(criarCardAlerta(
                    "WIFI-PRO: VERIFICAR SE FOI INSTALADO!",
                    "#f3e5f5", "#4a148c", "#9c27b0", "🌐"
                ));
            }

            // ✅ WiFi Enterprise - 🏢
            if (detectarServico(txtNorm, 'wifiEnterprise')) {
                console.log('✅ WiFi Enterprise detectado!');
                alertContainer.appendChild(criarCardAlerta(
                    "WIFI ENTERPRISE: VERIFICAR SE FOI INSTALADO. EQUIPAMENTOS NECESSÁRIOS: ONU > RB > EAPs",
                    "#e8f5e9", "#1b5e20", "#43a047", "🏢"
                ));
            }

            // ✅ OsirFone - 📞
            if (detectarServico(txtNorm, 'osirFone')) {
                console.log('✅ OsirFone detectado!');
                alertContainer.appendChild(criarCardAlerta(
                    "TELEFONIA FIXA: VERIFICAR SE FOI INSTALADA! COM OS EQUIPAMENTOS ADEQUADOS.",
                    "#e3f2fd", "#0d47a1", "#1976d2", "📞"
                ));
            }

            // ✅ OsirMóvel - 📱
            if (detectarServico(txtNorm, 'osirMovel')) {
                console.log('✅ OsirMóvel detectado!');
                alertContainer.appendChild(criarCardAlerta(
                    "OSIRMÓVEL: VERIFICAR SE O CHIP FOI ENTREGUE!",
                    "#fff3e0", "#e65100", "#ff9800", "📱"
                ));
            }

        } catch (err) {
            console.error("Erro Notificador:", err);
        }
    }

    // =========================================================================
    // MÓDULO 2: AUDITOR DE ESTOQUE
    // =========================================================================
    function abaConsumoEstaAtiva(doc) {
        const spansAba = doc.querySelectorAll('.MuiTab-wrapper');
        for (let span of spansAba) {
            if (span.innerText && span.innerText.toUpperCase().includes("PRODUTOS - CONSUMO INTERNO")) {
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
                } catch (e) {}
            });

            auditorContainer.innerHTML = "";
            todosErrosItens.filter((v, i, a) => a.findIndex(t => t.item === v.item) === i).forEach(e => {
                auditorContainer.appendChild(criarCardErroEstoque(e.item, e.motivo));
            });
            todosErrosQtd.filter((v, i, a) => a.findIndex(t => (t.item === v.item && t.qtd === v.qtd)) === i).forEach(e => {
                auditorContainer.appendChild(criarCardErroQuantidade(e.item, e.qtd));
            });
        } catch (err) {
            console.error("Erro Auditoria Global:", err);
        }
    }

    // =========================================================================
    // DISPARADORES
    // =========================================================================
    setInterval(rodarAuditoriaGlobal, 1500);

    const observador = new MutationObserver(() => {
        try {
            processarAlertas();
        } catch (e) {}
    });
    observador.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
        try {
            processarAlertas();
        } catch (e) {}
    }, 2000);

    setTimeout(() => {
        try {
            processarAlertas();
        } catch (e) {}
    }, 5000);

    console.log(`✅ ${SCRIPT_VERSION} - Alertas: Troca de Endereço, OsirFone, OsirMóvel, WiFi Pro, WiFi Enterprise`);
    console.log(`✅ Auditor de estoque ativo`);
    console.log(`✅ Detecção melhorada para "Osir Fone" com espaço`);

})();
