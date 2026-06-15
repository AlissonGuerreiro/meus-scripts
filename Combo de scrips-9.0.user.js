// ==UserScript==
// @name         Chamado
// @namespace    http://tampermonkey.net/
// @version      20.1
// @description  Apenas Voalle: Alertas visuais de serviços críticos, cobrança de troca de endereço e auditoria de materiais.
// @author       Alisson Guerreiro / Modo Integrado
// @match        https://erp.osirnet.com.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // BANCO DE DADOS (MATERIAIS E FERRAMENTAS) - FORMATO LINEAR ANTI-PARSING ERROR
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
        "FITA DE ACO INOX 430 LAMINADO A FRIO LISA 3/4 - 05 MM X 25MTS"
    ];

    const FERRAMENTAS_PROIBIDAS = [
        "ALICATE DE CORTE DIAGONAL ISOLADO", "ALICATE DE CRIMPAR", "ALICATE DECAPADOR DE CABO DROP FLAT CABLE STRIPPER VERDE",
        "ALICATE DECAPADOR DE FIBRA OPTICA 3 FUROS AMARELO CFS-3 (DESCASCADOR ACRILATO)", "ALICATE UNIVERSAL",
        "BADISCO DIGITAL C/ IDENTIFICADOR DE CHAMADAS", "PILHA AAA RECARREGÁVEL", "BOLSA PARA FERRAMENTAS 12\" STANDARD 2 BOLSOS - IRWIN",
        "BOLSA PARA KIT FIBRA", "BALDE EM LONA COM FUNDO EM COURO REFORÇADO", "BROCA 10MM MADEIRA ENG. RAP.",
        "BROCA WIDEA DE AÇO RAPIDO SDS PLUS 6MM X 160MM ENG. RAP.", "BROCA WIDEA DE AÇO RAPIDO SDS PLUS 10MM X 160MM ENG. RAP.",
        "BROCA WIDEA DE AÇO RAPIDO SDS PLUS 8MM X 160MM ENG. RAP.", "BROCA WIDEA DE AÇO RAPIDO SDS PLUS 10MM X 400MM ENG. RAP.",
        "GUIA PASSA FIO PROFISSIONAL ALMA DE AÇO - 20 METROS - KALOP", "CANETA LASER TESTADORA DE FIBRA",
        "CORDÃO ÓPTICO SC/APC -SC/APC 1,5MTS OU 3 MTS", "CARREGADOR DE PILHAS AA/AAA + 4 PILHAS AA 2500MAH",
        "CAVALETE PARA BOBINA DE CABO DROP", "PROLONGADOR PARA ROLO EXTENSOR 5MT - VARA DE MANOBRA",
        "CHAVE DE FENDA 3/16\"X 5\" AÇO CROMO 4,7\" X 127", "CHAVE FENDA 1/4 X 4\" AÇO CROMO 6,3\" X100",
        "CHAVE PHILIPS 1/4 X 8\" 6\" X 200", "CHAVE PHILIPS 3/16 X 4\" 4,5\" X 100", "CONE SINALIZADOR 50CM BRANCO E LARANJA - PLASTICO",
        "ESCADA TELESCOPIA AÇO 4,10MT 8055 ZEUS", "ESCADA EXTENSIVA DE FIBRA VAZADA 3,50/6,00 MT- 19 DEGRAUS",
        "ESTILETE 18MM", "EXTENSÃO ELÉTRICA 20M 10A 2X2,5MM", "FUSIMEC", "MALETA PLÁSTICA ORGANIZADORA 431X333X88MM - STANLEY",
        "MARTELO UNHA 23MM - CABO EM FIBRA", "NIVEL DE MADEIRA 14\"", "PILHA AA RECARREGAVEL", "RECIPIENTE P/ ÁLCOOL ISOPROPÍLICO 200ML",
        "CHAVE COMBINADA C/ CATRACA 10MM", "CHAVE COMBINADA C/ CATRACA 13MM", "CORDA ELASTICA 1,5M", "MARTELETE 820W 220V GBH 2-24 BOSCH",
        "TESTADOR DE REDE RJ 45 E RJ 11", "BATERIA 9V ALCALINA", "CANETA P/ RETROPROJETOR PRETA", "CADEADO ANTIFURTO COM CHAVE 1,2 MT",
        "CLIVADOR REDEX", "CAIXA ORGANIZADORA", "GARRAFA TERMICA 5L"
    ];

    function normalizarItem(texto) {
        if (!texto) return "";
        return texto.trim().replace(/^\d+\s*-\s*/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase();
    }

    const listaPermitidaNormalizada = MATERIAIS_PERMITIDOS.map(normalizarItem);
    const listaFerramentasNormalizada = FERRAMENTAS_PROIBIDAS.map(normalizarItem);
    const CABO_DROP_NORMALIZADO = normalizarItem("CABO ÓPTICO (DROP)");

    // =========================================================================
    // INTERFACES VISUAIS FLUTUANTES
    // =========================================================================
    const alertContainer = document.createElement('div');
    alertContainer.id = 'tm-alerts-container';
    alertContainer.style.cssText = "position: fixed; bottom: 140px; right: 25px; width: 340px; z-index: 10000; font-family: 'Roboto', sans-serif, Arial; display: flex; flex-direction: column-reverse; gap: 10px; pointer-events: none;";
    document.body.appendChild(alertContainer);

    const auditorContainer = document.createElement('div');
    auditorContainer.id = 'tm-auditor-container';
    auditorContainer.style.cssText = "position: fixed; top: 80px; right: 25px; width: 360px; z-index: 10001; font-family: 'Roboto', sans-serif, Arial; display: flex; flex-direction: column; gap: 10px; pointer-events: none;";
    document.body.appendChild(auditorContainer);

    function criarCardAlerta(texto, corFundo, corTexto, corBorda) {
        const card = document.createElement('div');
        card.style.cssText = "background-color: " + corFundo + "; color: " + corTexto + "; border: 2px solid " + corBorda + "; border-radius: 8px; padding: 12px 15px; font-size: 12px; font-weight: bold; line-height: 1.4; box-shadow: 0px 4px 12px rgba(0,0,0,0.15); text-align: center; text-transform: uppercase; pointer-events: auto;";
        card.innerText = texto;
        return card;
    }

    function criarCardErroEstoque(itemIncorreto, motivo) {
        const card = document.createElement('div');
        card.style.cssText = "background-color: #ffebee; color: #c62828; border: 2px solid #d32f2f; border-radius: 8px; padding: 14px; font-size: 12px; font-weight: bold; line-height: 1.5; box-shadow: 0px 4px 12px rgba(0,0,0,0.2); text-align: center; pointer-events: auto;";
        card.innerHTML = "⚠️ ATENÇÃO: ITEM FORA DO PADRÃO DETECTADO!<br><span style='color:#000; font-size:13px;'>\"" + itemIncorreto + "\"</span><br>" + (motivo || "NÃO ALOCAR COMO CONSUMO INTERNO!");
        return card;
    }

    function criarCardErroQuantidade(item, qtd) {
        const card = document.createElement('div');
        card.style.cssText = "background-color: #fffde7; color: #f57f17; border: 2px solid #fbc02d; border-radius: 8px; padding: 14px; font-size: 12px; font-weight: bold; line-height: 1.5; box-shadow: 0px 4px 12px rgba(0,0,0,0.2); text-align: center; pointer-events: auto;";
        card.innerHTML = "⚠️ LIMITE EXCEDIDO!<br><span style='color:#000; font-size:13px;'>\"" + item + "\"</span><br>Quantidade alocada: <span style='font-size:14px; color:#e65100;'>" + qtd + " MTS</span><br>O limite do teste é 350 MTS!";
        return card;
    }

    function normalizarTexto(texto) {
        if (!texto) return "";
        return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_.,;:()|]/g, " ").replace(/\s+/g, " ").toLowerCase().trim();
    }

    // =========================================================================
    // MÓDULO 1: NOTIFICADOR DE SERVIÇOS E COBRANÇAS
    // =========================================================================
    let ultimaCategoria = null;
    let ultimoTextoOS = "";
    const VARIACOES = {
        wifiPro: ["wifi pro", "wi fi pro", "wifipro", "wifi profissional", /\bwi\sfi\spro\b/],
        osirmovel: ["osirmovel", "osir movel", /\bosir\s*movel\b/],
        osirfone: ["osirfone", "osir fone", "telefonia fixa", /\bosir\s*fone\b/]
    };

    function encontrouVariacao(texto, variacoes) {
        return variacoes.some(function(v) { return typeof v === "string" ? texto.includes(v) : v.test(texto); });
    }

    function processarAlertas() {
        try {
            const inputCategoria = document.getElementById('serviceCategoryId1');
            if (!inputCategoria) { alertContainer.innerHTML = ""; ultimaCategoria = null; return; }

            const categoryAtual = inputCategoria.value ? inputCategoria.value.trim() : "";
            let divDemandaCompleta = null;
            const todasAsDivs = document.querySelectorAll('div');

            for (let i = 0; i < todasAsDivs.length; i++) {
                let div = todasAsDivs[i];
                if (div.innerText) {
                    let txt = normalizarTexto(div.innerText);
                    if (txt.includes("planos") || txt.includes("servicos a serem ativados") || txt.includes("troca de endereco") || txt.includes("custo r 80 00") || txt.includes("portabilidade")) {
                        if (!div.classList.contains('ql-editor') && !div.classList.contains('dx-htmleditor-content')) { divDemandaCompleta = div; break; }
                    }
                }
            }
            if (!divDemandaCompleta) { alertContainer.innerHTML = ""; return; }

            const cloneMemoria = divDemandaCompleta.cloneNode(true);
            cloneMemoria.querySelectorAll('.ql-editor, .dx-htmleditor-content, .ck-content, [contenteditable="true"]').forEach(function(el) { el.remove(); });
            let textoOSOriginal = cloneMemoria.innerText || "";

            if (categoryAtual === ultimaCategoria && textoOSOriginal === ultimoTextoOS) return;
            ultimaCategoria = categoryAtual;
            ultimoTextoOS = textoOSOriginal;
            alertContainer.innerHTML = "";
            if (!textoOSOriginal.trim()) return;

            let txtNorm = normalizarTexto(textoOSOriginal).replace(/https?:\/\/\S+/gi, "").replace(/\S+@\S+\.\S+/gi, "");

            if (categoryAtual.toLowerCase().includes("troca") && categoryAtual.toLowerCase().includes("ender")) {
                if (/custo[\s\S]*?80\s*00[\s\S]*?\([\s]*x[\s]*\)\s*sim/.test(txtNorm)) {
                    alertContainer.appendChild(criarCardAlerta("⚠️ ENVIAR PARA SAC N2 FAZER A COBRANÇA DE R$ 80,00!", "#ffebee", "#c62828", "#d32f2f"));
                }
            } else {
                if (encontrouVariacao(txtNorm, VARIACOES.osirmovel)) alertContainer.appendChild(criarCardAlerta("📱 OSIRMÓVEL: VERIFICAR SE O CHIP FOI ENTREGUE!", "#fff3e0", "#e65100", "#ff9800"));
                if (encontrouVariacao(txtNorm, VARIACOES.wifiPro)) alertContainer.appendChild(criarCardAlerta("🌐 WIFI-PRO: VERIFICAR SE FOI INSTALADO!", "#f3e5f5", "#4a148c", "#9c27b0"));
                if (encontrouVariacao(txtNorm, VARIACOES.osirfone) || /telefonia\s*[\s:]*\([\s]*x[\s]*\)\s*sim/.test(txtNorm)) alertContainer.appendChild(criarCardAlerta("☎️ TELEFONIA FIXA: VERIFICAR SE FOI INSTALADA!", "#e3f2fd", "#0d47a1", "#1976d2"));
                if (/portabilidade\s*[\s:]*\(\s*x\s*\)\s*sim/.test(txtNorm)) alertContainer.appendChild(criarCardAlerta("💚 PORTABILIDADE ATIVA: VERIFICAR A PORTABILIDADE!", "#e8f5e9", "#1b5e20", "#4caf50"));
            }
        } catch (err) { console.error("Erro Notificador:", err); }
    }

    // =========================================================================
    // MÓDULO 2: AUDITOR DE ESTOQUE (CONSUMO INTERNO)
    // =========================================================================
    function abaConsumoEstaAtiva(doc) {
        const spansAba = doc.querySelectorAll('.MuiTab-wrapper');
        for (let i = 0; i < spansAba.length; i++) {
            let span = spansAba[i];
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
        if (!abaConsumoEstaAtiva(doc)) return { errosItens: errosItens, errosQtd: errosQtd };

        const linhasGrid = doc.querySelectorAll('tr.line, [role="row"], .rt-tr, [id*="datagrid_row" i]');
        linhasGrid.forEach(function(linha) {
            const celulas = linha.querySelectorAll('td, [role="gridcell"], .rt-td, div[class*="cell" i]');
            if (celulas.length >= 3) {
                const txtProd = celulas[1].textContent.trim();
                if (txtProd && isNaN(txtProd) && txtProd.length > 3 && !txtProd.toUpperCase().startsWith("TOTAL")) {
                    const itemNorm = normalizarItem(txtProd);
                    let ferramenta = listaFerramentasNormalizada.find(function(f) { return itemNorm === f || itemNorm.includes(f); });

                    if (ferramenta) {
                        if (!errosItens.some(function(e) { return e.item === txtProd; })) errosItens.push({ item: txtProd, motivo: "FERRAMENTA DE TÉCNICO! NÃO ALOCAR NO CONSUMO!" });
                    } else if (itemNorm && !listaPermitidaNormalizada.includes(itemNorm) && itemNorm !== "PRODUTO") {
                        if (!errosItens.some(function(e) { return e.item === txtProd; })) errosItens.push({ item: txtProd, motivo: "NÃO ALOCAR COMO CONSUMO INTERNO!" });
                    }

                    if (itemNorm === CABO_DROP_NORMALIZADO) {
                        const qVal = parseFloat(celulas[2].textContent.trim().replace(',', '.'));
                        if (!isNaN(qVal) && qVal > 350) errosQtd.push({ item: txtProd, qtd: qVal });
                    }
                }
            }
        });
        return { errosItens: errosItens, errosQtd: errosQtd };
    }

    function rodarAuditoriaGlobal() {
        try {
            let todosErrosItens = [];
            let todosErrosQtd = [];

            const resPrincipal = analisarGridMateriais(document);
            todosErrosItens = todosErrosItens.concat(resPrincipal.errosItens);
            todosErrosQtd = todosErrosQtd.concat(resPrincipal.errosQtd);

            document.querySelectorAll('iframe').forEach(function(frame) {
                try {
                    const docFrame = frame.contentDocument || frame.contentWindow.document;
                    const resFrame = analisarGridMateriais(docFrame);
                    todosErrosItens = todosErrosItens.concat(resFrame.errosItens);
                    todosErrosQtd = todosErrosQtd.concat(resFrame.errosQtd);
                } catch (e) {}
            });

            auditorContainer.innerHTML = "";
            todosErrosItens.filter(function(v, i, a) { return a.findIndex(function(t) { return t.item === v.item; }) === i; }).forEach(function(e) {
                auditorContainer.appendChild(criarCardErroEstoque(e.item, e.motivo));
            });
            todosErrosQtd.filter(function(v, i, a) { return a.findIndex(function(t) { return t.item === v.item && t.qtd === v.qtd; }) === i; }).forEach(function(e) {
                auditorContainer.appendChild(criarCardErroQuantidade(e.item, e.qtd));
            });
        } catch (err) { console.error("Erro Auditoria Global:", err); }
    }

    // =========================================================================
    // GATILHOS EXECUTÁVEIS
    // =========================================================================
    setInterval(rodarAuditoriaGlobal, 1500);

    const observador = new MutationObserver(function() { try { processarAlertas(); } catch (e) {} });
    observador.observe(document.body, { childList: true, subtree: true });
    try { processarAlertas(); } catch (e) {}
})();
