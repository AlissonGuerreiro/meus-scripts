// ==UserScript==
// @name          Combo de scrips
// @namespace     http://tampermonkey.net/
// @version       9.8
// @description   Script unificado: Ajusta complementar, verifica ferramentas, avisa serviços adicionais. Fluxo inteligente de Wi-Fi e correção de autenticação para Routers.
// @author        Alisson Guerreiro / Modo Integrado
// @match         https://erp.osirnet.com.br/*
// @grant         none
// @run-at        document-end
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // CONFIGURAÇÕES E BANCO DE DADOS (AUDITOR DE MATERIAIS)
    // =========================================================================
    const MATERIAIS_PERMITIDOS = [
        "CONECTOR FAST SC/APC",
        "FIXA FIO PRETO UNIDADE",
        "SUPORTE ORGANIZADOR DE ROTEADOR",
        "SUPORTE ORGANIZADOR DE ROTEADOR - OSIRNET",
        "BUCHA DE PAREDE 6MM",
        "PARAFUSO PHILIPS 6MM",
        "CABO ÓPTICO (DROP)",
        "FECHO DENTADO INOX 3/4",
        "ALCA PRE FORMADA PARA DROP - FIO FE 80/100/160 420MM BIT 1,85MM",
        "PLACA IDENTIFICADORA DE CABO OPTICO - OSIRNET",
        "ISOLADOR 4 VIAS",
        "ABRACADEIRA DE FIXACAO 20CM X 3,70MM - PRETA",
        "PITÃO 8 MM UNIDADE",
        "BUCHA DE PASSAGEM / FTB",
        "CABO LAN PRETO",
        "CONECTOR RJ45",
        "PARAFUSO SX SOBERBA 1/4",
        "PARAFUSO PHILIPS 4MM (INOVAÇÃO)",
        "PROTETOR CONECTOR OPTICO",
        "FITA ISOLANTE PRETA 20M X 19 MM",
        "BUCHA DE PAREDE 8MM",
        "PARAFUSO PHILIPS 4,0 X 40",
        "CABO LAN BRANCO",
        "ALINHADOR OPTICO APC SIMPLEX",
        "PROTETOR DE EMENDA",
        "SUPA 3",
        "FITA DE ACO INOX 430 LAMINADO A FRIO LISA 3/4 - 05 MM X 25MTS"
    ];

    const FERRAMENTAS_PROIBIDAS = [
        "ALICATE DE CORTE DIAGONAL ISOLADO",
        "ALICATE DE CRIMPAR",
        "ALICATE DECAPADOR DE CABO DROP FLAT CABLE STRIPPER VERDE",
        "ALICATE DECAPADOR DE FIBRA OPTICA 3 FUROS AMARELO CFS-3 (DESCASCADOR ACRILATO)",
        "ALICATE UNIVERSAL",
        "BADISCO DIGITAL C/ IDENTIFICADOR DE CHAMADAS",
        "PILHA AAA RECARREGÁVEL",
        "BOLSA PARA FERRAMENTAS 12\" STANDARD 2 BOLSOS - IRWIN",
        "BOLSA PARA KIT FIBRA",
        "BALDE EM LONA COM FUNDO EM COURO REFORÇADO",
        "BROCA 10MM MADEIRA ENG. RAP.",
        "BROCA WIDEA DE AÇO RAPIDO SDS PLUS 6MM X 160MM ENG. RAP.",
        "BROCA WIDEA DE AÇO RAPIDO SDS PLUS 10MM X 160MM ENG. RAP.",
        "BROCA WIDEA DE AÇO RAPIDO SDS PLUS 8MM X 160MM ENG. RAP.",
        "BROCA WIDEA DE AÇO RAPIDO SDS PLUS 10MM X 400MM ENG. RAP.",
        "GUIA PASSA FIO PROFISSIONAL ALMA DE AÇO - 20 METROS - KALOP",
        "CANETA LASER TESTADORA DE FIBRA",
        "CORDÃO ÓPTICO SC/APC -SC/APC 1,5MTS OU 3 MTS",
        "CARREGADOR DE PILHAS AA/AAA + 4 PILHAS AA 2500MAH",
        "CAVALETE PARA BOBINA DE CABO DROP",
        "PROLONGADOR PARA ROLO EXTENSOR 5MT - VARA DE MANOBRA",
        "CHAVE DE FENDA 3/16\"X 5\" AÇO CROMO 4,7\" X 127",
        "CHAVE FENDA 1/4 X 4\" AÇO CROMO 6,3\" X100",
        "CHAVE PHILIPS 1/4 X 8\" 6\" X 200",
        "CHAVE PHILIPS 3/16 X 4\" 4,5\" X 100",
        "CONE SINALIZADOR 50CM BRANCO E LARANJA - PLASTICO",
        "ESCADA TELESCOPIA AÇO 4,10MT 8055 ZEUS",
        "ESCADA EXTENSIVA DE FIBRA VAZADA 3,50/6,00 MT- 19 DEGRAUS",
        "ESTILETE 18MM",
        "EXTENSÃO ELÉTRICA 20M 10A 2X2,5MM",
        "FUSIMEC",
        "MALETA PLÁSTICA ORGANIZADORA 431X333X88MM - STANLEY",
        "MARTELO UNHA 23MM - CABO EM FIBRA",
        "NIVEL DE MADEIRA 14\"",
        "PILHA AA RECARREGAVEL",
        "RECIPIENTE P/ ÁLCOOL ISOPROPÍLICO 200ML",
        "CHAVE COMBINADA C/ CATRACA 10MM",
        "CHAVE COMBINADA C/ CATRACA 13MM",
        "CORDA ELASTICA 1,5M",
        "MARTELETE 820W 220V GBH 2-24 BOSCH",
        "TESTADOR DE REDE RJ 45 E RJ 11",
        "BATERIA 9V ALCALINA",
        "CANETA P/ RETROPROJETOR PRETA",
        "CADEADO ANTIFURTO COM CHAVE 1,2 MT",
        "CLIVADOR REDEX",
        "CAIXA ORGANIZADORA",
        "GARRAFA TERMICA 5L"
    ];

    function normalizarItem(texto) {
        if (!texto) return "";
        let textoLimpo = texto.trim().replace(/^\d+\s*-\s*/, "");
        return textoLimpo.normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .replace(/\s+/g, " ")
                          .toUpperCase();
    }

    const listaPermitidaNormalizada = MATERIAIS_PERMITIDOS.map(normalizarItem);
    const listaFerramentasNormalizada = FERRAMENTAS_PROIBIDAS.map(normalizarItem);
    const CABO_DROP_NORMALIZADO = normalizarItem("CABO ÓPTICO (DROP)");

    // =========================================================================
    // ESTRUTURAÇÃO DAS INTERFACES VISUAIS (CONTAINERS INJETADOS)
    // =========================================================================
    const alertContainer = document.createElement('div');
    alertContainer.id = 'tm-alerts-container';
    alertContainer.style.cssText = `
        position: fixed;
        bottom: 140px;
        right: 25px;
        width: 340px;
        z-index: 10000;
        font-family: 'Roboto', sans-serif, Arial;
        display: flex;
        flex-direction: column-reverse;
        gap: 10px;
        pointer-events: none;
    `;
    document.body.appendChild(alertContainer);

    const auditorContainer = document.createElement('div');
    auditorContainer.id = 'tm-auditor-container';
    auditorContainer.style.cssText = `
        position: fixed;
        top: 80px;
        right: 25px;
        width: 360px;
        z-index: 10001;
        font-family: 'Roboto', sans-serif, Arial;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
    `;
    document.body.appendChild(auditorContainer);

    function criarCardAlerta(texto, corFundo, corTexto, corBorda) {
        const card = document.createElement('div');
        card.style.cssText = `
            background-color: ${corFundo};
            color: ${corTexto};
            border: 2px solid ${corBorda};
            border-radius: 8px;
            padding: 12px 15px;
            font-size: 12px;
            font-weight: bold;
            line-height: 1.4;
            box-shadow: 0px 4px 12px rgba(0,0,0,0.15);
            text-align: center;
            text-transform: uppercase;
            pointer-events: auto;
        `;
        card.innerText = texto;
        return card;
    }

    function criarCardErroEstoque(itemIncorreto, motivo = "NÃO ALOCAR COMO CONSUMO INTERNO!") {
        const card = document.createElement('div');
        card.style.cssText = `
            background-color: #ffebee;
            color: #c62828;
            border: 2px solid #d32f2f;
            border-radius: 8px;
            padding: 14px;
            font-size: 12px;
            font-weight: bold;
            line-height: 1.5;
            box-shadow: 0px 4px 12px rgba(0,0,0,0.2);
            text-align: center;
            pointer-events: auto;
        `;
        card.innerHTML = `⚠️ ATENÇÃO: ITEM FORA DO PADRÃO DETECTADO!<br><span style="color:#000; font-size:13px;">"${itemIncorreto}"</span><br>${motivo}`;
        return card;
    }

    function criarCardErroQuantidade(item, qtd) {
        const card = document.createElement('div');
        card.style.cssText = `
            background-color: #fffde7;
            color: #f57f17;
            border: 2px solid #fbc02d;
            border-radius: 8px;
            padding: 14px;
            font-size: 12px;
            font-weight: bold;
            line-height: 1.5;
            box-shadow: 0px 4px 12px rgba(0,0,0,0.2);
            text-align: center;
            pointer-events: auto;
        `;
        card.innerHTML = `⚠️ LIMITE EXCEDIDO!<br><span style="color:#000; font-size:13px;">"${item}"</span><br>Quantidade alocada: <span style="font-size:14px; color:#e65100;">${qtd} MTS</span><br>O limite do teste é 350 MTS!`;
        return card;
    }

    function normalizarTexto(texto) {
        if (!texto) return "";
        return texto.normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[-_.,;:()|]/g, " ")
                    .replace(/\s+/g, " ")
                    .toLowerCase()
                    .trim();
    }

    // =========================================================================
    // MAPEAMENTO DE CAMPOS INTELIGENTES (Mecanismo Fuzzy)
    // =========================================================================
    function buscarCampoSmart(tipo) {
        const alvos = {
            complemento: {
                ids: ['AuthenticationContractComplement', 'OsComplement', 'OsExecution', 'OsLaudo', 'OsObservation', 'ServiceOrderComplement'],
                names: ['data[AuthenticationContract][complement]', 'data[Os][complemento]', 'data[Os][laudo]', 'data[Os][observacao]', 'data[ServiceOrder][complement]', 'data[ServiceOrder][resolution]'],
                selectors: ['textarea[id*="complement" i]', 'textarea[id*="laudo" i]', 'textarea[id*="execuc" i]', 'textarea[id*="observa" i]', 'textarea[id*="resolut" i]', 'input[id*="complement" i]']
            },
            splitter: { ids: ['AuthenticationSplitterPortTitle'], names: ['data[AuthenticationSplitterPort][title]'], selectors: ['input[id*="splitter" i][id*="title" i]', 'input[id*="splitter" i]', 'select[id*="splitter" i]'] },
            portaSplitter: { ids: ['AuthenticationSplitterPortPort'], names: ['data[AuthenticationSplitterPort][port]'], selectors: ['input[id*="splitter" i][id*="port" i]', 'input[name*="splitter" i][name*="port" i]'] },
            slotOlt: { ids: ['AuthenticationContractSlotOlt'], names: ['data[AuthenticationContract][slot_olt]'], selectors: ['input[id*="slot" i]', 'input[name*="slot" i]'] },
            portaOlt: { ids: ['AuthenticationContractPortOlt'], names: ['data[AuthenticationContract][port_olt]'], selectors: ['input[id*="port_olt" i]', 'input[name*="port_olt" i]'] },
            idOnu: { ids: ['AuthenticationContractOltId'], names: ['data[AuthenticationContract][olt_id]'], selectors: ['input[id*="olt_id" i]', 'input[id*="onu" i]', 'input[name*="olt_id" i]'] },
            serial: { ids: ['AuthenticationContractEquipmentSerialNumber'], names: ['data[AuthenticationContract][equipment_serial_number]'], selectors: ['input[id*="serial" i]', 'input[id*="equipment" i]', 'input[name*="serial" i]'] },
            mac: { ids: ['AuthenticationContractMac'], names: ['data[AuthenticationContract][mac]'], selectors: ['input[id*="mac" i]', 'input[name*="mac" i]'] },
            wifiSsid: { ids: ['AuthenticationContractWifiName'], names: ['data[AuthenticationContract][wifi_name]'], selectors: ['input[id*="wifi" i][id*="name" i]', 'input[id*="ssid" i]'] },
            wifiPass: { ids: ['AuthenticationContractWifiPassword'], names: ['data[AuthenticationContract][wifi_password]'], selectors: ['input[id*="wifi" i][id*="pass" i]', 'input[id*="senha" i]'] },
            accessPoint: { ids: ['AuthenticationContractAccessPointId'], names: ['data[AuthenticationContract][access_point_id]'], selectors: ['input[name*="access_point" i]', 'input[id*="AccessPoint" i]'] },
            portaWeb: { ids: ['AuthenticationContractEquipmentPort'], names: ['data[AuthenticationContract][equipment_port]'], selectors: ['input[id*="equipment_port" i]', 'input[name*="equipment_port" i]'] }
        };

        const config = alvos[tipo];
        if (!config) return null;

        function testarNoDocumento(doc) {
            for (let id of config.ids) { let el = doc.getElementById(id); if (el) return el; }
            for (let name of config.names) { let el = doc.querySelector(`[name="${name}"]`); if (el) return el; }
            for (let sel of config.selectors) { let el = doc.querySelector(sel); if (el) return el; }
            return null;
        }

        let elemento = testarNoDocumento(document);
        if (elemento) return elemento;

        const frames = document.querySelectorAll('iframe');
        for (let frame of frames) {
            try {
                const docFrame = frame.contentDocument || frame.contentWindow.document;
                elemento = testarNoDocumento(docFrame);
                if (elemento) return elemento;
            } catch (e) {}
        }
        return null;
    }

    // =========================================================================
    // MÓDULO 1: AUXILIAR TÉCNICO (CONSTRUTOR E ATUALIZADOR PADRÃO)
    // =========================================================================
    function executarAutomacaoOficial() {
        const inputInfo = buscarCampoSmart('complemento');
        if (!inputInfo) {
            alert('Campo de texto não localizado nesta página.');
            return;
        }

        let textoAtual = inputInfo.value || "";

        const inputMac = buscarCampoSmart('mac');
        if (inputMac && inputMac.value.trim() !== '') {
            inputMac.focus();
            inputMac.value = '';
            inputMac.dispatchEvent(new Event('input', { bubbles: true }));
            inputMac.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const inputSerial = buscarCampoSmart('serial');
        const inputSplitter = buscarCampoSmart('splitter');
        const inputPorta = buscarCampoSmart('portaSplitter');
        const inputSlotOlt = buscarCampoSmart('slotOlt');
        const inputPortaOlt = buscarCampoSmart('portaOlt');
        const inputIdOnu = buscarCampoSmart('idOnu');
        const inputWifiSsid = buscarCampoSmart('wifiSsid');
        const inputWifiPass = buscarCampoSmart('wifiPass');
        const inputAccessPointText = buscarCampoSmart('accessPoint');
        const inputPortaWeb = buscarCampoSmart('portaWeb');

        let serialVal = inputSerial ? inputSerial.value.trim().toUpperCase() : "XX";
        let splitterVal = inputSplitter && inputSplitter.value.trim() ? inputSplitter.value.trim() : "XX";
        let portaSplitterVal = inputPorta && inputPorta.value.trim() ? inputPorta.value.trim() : "XX";

        let slotVal = inputSlotOlt ? inputSlotOlt.value.trim() : "";
        let portaOltVal = inputPortaOlt ? inputPortaOlt.value.trim() : "";
        let idOnuVal = inputIdOnu ? inputIdOnu.value.trim() : "";

        let ssidVal = inputWifiSsid ? inputWifiSsid.value.trim() : "";
        let passVal = inputWifiPass ? inputWifiPass.value.trim() : "";

        if (inputAccessPointText && inputAccessPointText.value.trim() !== '') {
            const txtAP = inputAccessPointText.value.trim();
            const matchSlot = txtAP.match(/Slot\s*(\d+)/i);
            const matchPorta = txtAP.match(/Porta\s*(\d+)/i);
            if (!slotVal && matchSlot) slotVal = matchSlot[1];
            if (!portaOltVal && matchPorta) portaOltVal = matchPorta[1];
        }

        slotVal = (slotVal && !isNaN(slotVal)) ? slotVal.padStart(2, '0') : "XX";
        portaOltVal = (portaOltVal && !isNaN(portaOltVal)) ? portaOltVal.padStart(2, '0') : "XX";
        idOnuVal = (idOnuVal && !isNaN(idOnuVal)) ? idOnuVal.padStart(2, '0') : "XX";

        // =====================================================================
        // FLUXO BI-DIRECIONAL DE WI-FI (PUXA DA COMPLEMENTAR SE CAIXAS ESTIVEREM VAZIAS)
        // =====================================================================
        const regexWifiAntigo = /SSID:\s*([^|_\-\n]+?)\s*-\s*Senha:\s*([^|_\-\n]+)/i;
        const correspondencia = textoAtual.match(regexWifiAntigo);

        if (!ssidVal && !passVal) {
            if (correspondencia && correspondencia[1].trim() !== "" && correspondencia[2].trim() !== "") {
                ssidVal = correspondencia[1].trim();
                passVal = correspondencia[2].trim();

                if (inputWifiSsid) {
                    inputWifiSsid.focus();
                    inputWifiSsid.value = ssidVal;
                    inputWifiSsid.dispatchEvent(new Event('input', { bubbles: true }));
                    inputWifiSsid.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (inputWifiPass) {
                    inputWifiPass.focus();
                    inputWifiPass.value = passVal;
                    inputWifiPass.dispatchEvent(new Event('input', { bubbles: true }));
                    inputWifiPass.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
        // =====================================================================

        let equipPrefixo = "Equipamento Desconhecido";
        let autenticacao = "";
        let novaPortaWeb = "80";

        // CORREÇÃO: Routers autenticam neles mesmos (não adiciona nota "Autentica na ZTE")
        if (serialVal.startsWith("RCMG1")) {
            equipPrefixo = "Raisecom Router";
        } else if (serialVal.startsWith("RCMG3")) {
            equipPrefixo = "Raisecom Bridge (Router desativado)";
            autenticacao = "Autentica na ZTE";
        } else if (serialVal.startsWith("48575") || serialVal.startsWith("HWTC")) {
            equipPrefixo = "Huawei Router";
            novaPortaWeb = "80";
        } else if (serialVal.startsWith("5A544") || serialVal.startsWith("ZTEG")) {
            equipPrefixo = "ZTE Bridge";
            autenticacao = "Autentica na ZTE";
            if (serialVal.startsWith("5A544") || serialVal.startsWith("ZTEGD")) novaPortaWeb = "8092";
        }

        if (inputPortaWeb && inputPortaWeb.value !== novaPortaWeb) {
            inputPortaWeb.focus();
            inputPortaWeb.value = novaPortaWeb;
            inputPortaWeb.dispatchEvent(new Event('input', { bubbles: true }));
            inputPortaWeb.dispatchEvent(new Event('change', { bubbles: true }));
        }

        let blocos = [];
        blocos.push(equipPrefixo);
        if (serialVal !== "XX") blocos.push(`SN: ${serialVal}`);
        if (autenticacao) blocos.push(autenticacao);
        blocos.push(`${splitterVal} - Porta: ${portaSplitterVal}`);
        blocos.push(`Slot OLT: ${slotVal} Porta OLT: ${portaOltVal} ID: ${idOnuVal}`);

        if (ssidVal || passVal) {
            blocos.push(`SSID: ${ssidVal} - Senha: ${passVal}`);
        } else {
            blocos.push(`SSID:  - Senha: `);
        }

        let novoBlocoTecnico = blocos.join(" || ");
        let partesAntigas = textoAtual.split('||').map(p => p.trim()).filter(p => p !== "");

        let partesPreservadas = partesAntigas.filter(p => {
            let pMin = p.toLowerCase();
            return !(pMin.includes("sn:") ||
                     pMin.includes("serial:") ||
                     pMin.includes("slot olt:") ||
                     pMin.includes("ssid:") ||
                     pMin.includes("autentica na") ||
                     pMin.includes("raisecom") ||
                     pMin.includes("ektech") ||
                     pMin.includes("ekteck") ||
                     pMin.includes("zte bridge") ||
                     pMin.includes("zteg") ||
                     pMin.includes("huawei") ||
                     pMin.includes("equipamento desconhecido") ||
                     pMin.match(/[a-z0-9-]+\s*-\s*porta(?::)?\s*\d+/i) ||
                     pMin.includes("xx - porta xx"));
        });

        let textoFinal = partesPreservadas.length > 0 ? partesPreservadas.join(" || ") + " || " + novoBlocoTecnico : novoBlocoTecnico;

        const botao = inputInfo.parentNode ? inputInfo.parentNode.querySelector('#btn-osir-total') : null;

        if (textoAtual.trim() !== textoFinal.trim()) {
            inputInfo.focus();
            inputInfo.value = textoFinal;
            inputInfo.dispatchEvent(new Event('input', { bubbles: true }));
            inputInfo.dispatchEvent(new Event('change', { bubbles: true }));

            if (botao) {
                botao.textContent = '✓ Criado e Atualizado!';
                botao.style.backgroundColor = '#28a745';
                setTimeout(() => {
                    botao.textContent = '⚡ Criar/Atualizar Complementar';
                    botao.style.backgroundColor = '#e11d48';
                }, 2000);
            }
        } else {
            if (botao) {
                botao.textContent = '⚡ Já padronizado';
                botao.style.backgroundColor = '#6c757d';
                setTimeout(() => {
                    botao.textContent = '⚡ Criar/Atualizar Complementar';
                    botao.style.backgroundColor = '#e11d48';
                }, 1500);
            }
        }
    }

    function injetarBotaoOficial() {
        const inputInfo = buscarCampoSmart('complemento');
        if (!inputInfo || !inputInfo.parentNode) return;
        if (inputInfo.parentNode.querySelector('#btn-osir-total')) return;

        const docContexto = inputInfo.ownerDocument || document;
        const botao = docContexto.createElement('button');
        botao.id = 'btn-osir-total';
        botao.type = 'button';
        botao.textContent = '⚡ Criar/Atualizar Complementar';
        botao.style.cssText = `
            margin-left: 10px;
            padding: 5px 14px;
            background-color: #e11d48;
            color: #ffffff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
            vertical-align: middle;
            box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        `;

        botao.addEventListener('click', () => executarAutomacaoOficial());
        inputInfo.parentNode.appendChild(botao);
    }

    // =========================================================================
    // MÓDULO 2: NOTIFICADOR (ANÁLISE DE DEMANDA CRÍTICA)
    // =========================================================================
    let ultimaCategoria = null;
    let ultimoTextoOS = "";

    function encontrouVariacao(texto, variacoes) {
        return variacoes.some(variacao => {
            if (typeof variacao === "string") {
                return texto.includes(variacao);
            }
            return variacao.test(texto);
        });
    }

    const VARIACOES = {
        wifiPro: ["wifi pro", "wi fi pro", "wifipro", "wifi profissional", /\bwi\sfi\spro\b/],
        osirmovel: ["osirmovel", "osir movel", /\bosir\s*movel\b/],
        osirfone: ["osirfone", "osir fone", "telefonia fixa", /\bosir\s*fone\b/]
    };

    function processarAlertas() {
        const inputCategoria = document.getElementById('serviceCategoryId1');
        if (!inputCategoria) {
            alertContainer.innerHTML = "";
            ultimaCategoria = null;
            return;
        }

        const categoriaAtual = inputCategoria.value ? inputCategoria.value.trim() : "";
        let divDemandaCompleta = null;
        const todasAsDivs = document.querySelectorAll('div');

        for (let div of todasAsDivs) {
            if (div.innerText) {
                let textoDivMinulo = normalizarTexto(div.innerText);
                if (textoDivMinulo.includes("planos") || textoDivMinulo.includes("servicos a serem ativados") ||
                    textoDivMinulo.includes("troca de endereco") || textoDivMinulo.includes("troca do endereco") ||
                    textoDivMinulo.includes("custo r 80 00") || textoDivMinulo.includes("portabilidade") ||
                    textoDivMinulo.includes("niveis pj") || textoDivMinulo.includes("instalacao dentro da area")) {

                    if (!div.classList.contains('ql-editor') && !div.classList.contains('dx-htmleditor-content')) {
                        divDemandaCompleta = div;
                        break;
                    }
                }
            }
        }

        if (!divDemandaCompleta) { alertContainer.innerHTML = ""; return; }

        const cloneMemoria = divDemandaCompleta.cloneNode(true);
        const editoresParaRemover = cloneMemoria.querySelectorAll('.ql-editor, .dx-htmleditor-content, .ck-content, [contenteditable="true"]');
        editoresParaRemover.forEach(el => el.remove());

        let textoOSOriginal = cloneMemoria.innerText || "";
        if (categoriaAtual === ultimaCategoria && textoOSOriginal === ultimoTextoOS) return;

        ultimaCategoria = categoriaAtual;
        ultimoTextoOS = textoOSOriginal;
        alertContainer.innerHTML = "";

        if (!textoOSOriginal.trim()) return;

        let textoNormalizado = normalizarTexto(textoOSOriginal);
        textoNormalizado = textoNormalizado.replace(/https?:\/\/\S+/gi, "").replace(/\S+@\S+\.\S+/gi, "");

        const categoriesTrocaEndereco = ["Contratos - Troca de Endereço Fibra", "Troca de Endereço - Prédio"];
        const categoriasAtivacao = ["Fibra Ativação", "Fibra ativação CRM", "Fibra - Ativação PJ", "Fibra + Telefonia - Ativação", "Fibra + Telefonia - Ativação PJ", "Fibra + Telefonia Ativação - Prédio"];

        const ehCategoriaTroca = categoriesTrocaEndereco.includes(categoriaAtual) || (categoriaAtual !== "" && categoriaAtual.toLowerCase().includes("troca") && categoriaAtual.toLowerCase().includes("ender"));
        const ehCategoriaAtivacao = categoriasAtivacao.includes(categoriaAtual) || (categoriaAtual !== "" && categoriaAtual.toLowerCase().includes("corporativo")) || categoriaAtual === "";

        if (ehCategoriaTroca) {
            let regexCustoMarcado = /custo[\s\S]*?80\s*00[\s\S]*?\([\s]*x[\s]*\)\s*sim/.test(textoNormalizado);
            if (regexCustoMarcado) alertContainer.appendChild(criarCardAlerta("⚠️ ENVIAR PARA SAC N2 FAZER A COBRANÇA DE R$ 80,00!", "#ffebee", "#c62828", "#d32f2f"));
        }

        if (ehCategoriaAtivacao) {
            let detectouOsirmovel = encontrouVariacao(textoNormalizado, VARIACOES.osirmovel);
            let detectouWifiPro = encontrouVariacao(textoNormalizado, VARIACOES.wifiPro);
            let detectouTelefonia = encontrouVariacao(textoNormalizado, VARIACOES.osirfone) || /telefonia\s*[\s:]*\([\s]*x[\s]*\)\s*sim/.test(textoNormalizado);
            let detectouPortabilidade = /portabilidade\s*[\s:]*\(\s*x\s*\)\s*sim/.test(textoNormalizado);

            if (detectouOsirmovel) alertContainer.appendChild(criarCardAlerta("📱 OSIRMÓVEL: VERIFICAR SE O CHIP FOI ENTREGUE!", "#fff3e0", "#e65100", "#ff9800"));
            if (detectouWifiPro) alertContainer.appendChild(criarCardAlerta("🌐 WIFI-PRO: VERIFICAR SE FOI INSTALADO!", "#f3e5f5", "#4a148c", "#9c27b0"));
            if (detectouTelefonia) alertContainer.appendChild(criarCardAlerta("☎️ TELEFONIA FIXA: VERIFICAR SE FOI INSTALADA!", "#e3f2fd", "#0d47a1", "#1976d2"));
            if (detectouPortabilidade) alertContainer.appendChild(criarCardAlerta("💚 PORTABILIDADE ATIVA: VERIFICAR A PORTABILIDADE!", "#e8f5e9", "#1b5e20", "#4caf50"));
        }
    }

    // =========================================================================
    // MÓDULO 3: AUDITOR DE MATERIAIS (CONSUMO INTERNO & BLOQUEIOS)
    // =========================================================================
    function abaConsumoEstaAtiva(doc) {
        const spansAba = doc.querySelectorAll('.MuiTab-wrapper');
        for (let span of spansAba) {
            if (span.innerText && span.innerText.toUpperCase().includes("PRODUTOS - CONSUMO INTERNO")) {
                const botaoAba = span.closest('button');
                if (botaoAba && botaoAba.classList.contains('Mui-selected')) {
                    return true;
                }
            }
        }
        return false;
    }

    function analisarGridMateriais(doc) {
        let errosItens = [];
        let errosQtd = [];

        if (!abaConsumoEstaAtiva(doc)) return { errosItens, errosQtd };

        const linhasGrid = doc.querySelectorAll('[role="row"], .rt-tr, [id*="datagrid_row" i]');

        linhasGrid.forEach(linha => {
            const celulas = linha.querySelectorAll('[role="gridcell"], .rt-td, div[class*="cell" i]');

            if (celulas.length >= 3) {
                const celulaProduto = celulas[1];
                const pProduto = celulaProduto.querySelector('p');
                const textoProduto = pProduto ? pProduto.innerText.trim() : celulaProduto.innerText.trim();

                if (textoProduto && isNaN(textoProduto) && textoProduto.length > 3 && !textoProduto.toUpperCase().startsWith("TOTAL")) {
                    const itemFormatado = normalizarItem(textoProduto);

                    let ferramentaEncontrada = listaFerramentasNormalizada.find(ferramenta => itemFormatado === ferramenta || itemFormatado.includes(ferramenta));

                    if (ferramentaEncontrada) {
                        if (!errosItens.some(e => e.item === textoProduto)) {
                            errosItens.push({ item: textoProduto, motivo: "FERRAMENTA DE TÉCNICO! NÃO ALOCAR NO CONSUMO!" });
                        }
                    }
                    else if (itemFormatado && !listaPermitidaNormalizada.includes(itemFormatado) && itemFormatado !== "PRODUTO") {
                        if (!errosItens.some(e => e.item === textoProduto)) {
                            errosItens.push({ item: textoProduto, motivo: "NÃO ALOCAR COMO CONSUMO INTERNO!" });
                        }
                    }

                    if (itemFormatado === CABO_DROP_NORMALIZADO) {
                        const celulaQtd = celulas[2];
                        const pQtd = celulaQtd.querySelector('p');
                        const textoQtd = pQtd ? pQtd.innerText.trim() : celulaQtd.innerText.trim();
                        const quantidade = parseFloat(textoQtd.replace(',', '.'));

                        if (!isNaN(quantidade) && quantidade > 350) {
                            errosQtd.push({ item: textoProduto, qtd: quantidade });
                        }
                    }
                }
            }
        });

        return { errosItens, errosQtd };
    }

    function rodarAuditoriaGlobal() {
        let todosOsErrosItens = [];
        let todosOsErrosQtd = [];

        const resultadoPrincipal = analisarGridMateriais(document);
        todosOsErrosItens = todosOsErrosItens.concat(resultadoPrincipal.errosItens);
        todosOsErrosQtd = todosOsErrosQtd.concat(resultadoPrincipal.errosQtd);

        const frames = document.querySelectorAll('iframe');
        frames.forEach(frame => {
            try {
                const docFrame = frame.contentDocument || frame.contentWindow.document;
                const resultadoFrame = analisarGridMateriais(docFrame);
                todosOsErrosItens = todosOsErrosItens.concat(resultadoFrame.errosItens);
                todosOsErrosQtd = todosOsErrosQtd.concat(resultadoFrame.errosQtd);
            } catch (e) {}
        });

        auditorContainer.innerHTML = "";

        const errosItensUnicos = todosOsErrosItens.filter((v, i, a) => a.findIndex(t => t.item === v.item) === i);
        errosItensUnicos.forEach(erro => {
            auditorContainer.appendChild(criarCardErroEstoque(erro.item, erro.motivo));
        });

        const errosQtdUnicos = todosOsErrosQtd.filter((v, i, a) => a.findIndex(t => (t.item === v.item && t.qtd === v.qtd)) === i);
        errosQtdUnicos.forEach(erro => {
            auditorContainer.appendChild(criarCardErroQuantidade(erro.item, erro.qtd));
        });
    }

    // =========================================================================
    // LOOP DE EXECUÇÃO E MONITORAMENTO CONTÍNUO
    // =========================================================================
    setInterval(injetarBotaoOficial, 1000);
    setInterval(rodarAuditoriaGlobal, 1500);

    const observador = new MutationObserver(() => { processarAlertas(); });
    observador.observe(document.body, { childList: true, subtree: true });
    processarAlertas();
})();
