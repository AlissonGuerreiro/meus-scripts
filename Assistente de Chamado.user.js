// ==UserScript==
// @name         Osir - Assistente de Chamado
// @namespace    http://tampermonkey.net/
// @version      3.7.1
// @description  Alertas de serviços da OS, auditor de estoque e trava antes de finalizar
// @author       Alisson Guerreiro
// @homepage     https://github.com/AlissonGuerreiro/meus-scripts
// @supportURL   https://github.com/AlissonGuerreiro/meus-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Assistente%20de%20Chamado.user.js
// @updateURL    https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Assistente%20de%20Chamado.user.js
// @match        https://erp.osirnet.com.br/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

/*
  O QUE MUDOU NA 3.7 (versão oficial)
  - Avisos de MATERIAIS (limite, ferramenta, fora do padrão...) ficam NA BARRA AZUL DO TOPO,
    do lado esquerdo do botão "Registrar Retrabalho", no mesmo tamanho dele.
    Passe o mouse para ver o texto completo. Clique para esconder.
    (Erro escondido continua contando na trava.)
  - Avisos de SERVIÇO (Wi-Fi Pro, chip, fone, cobrança R$ 80) ficam como no script antigo:
    cartões embaixo à direita, em cima do botão Avançar.
  - Dá para trocar no CONFIG: LOCAL_ESTOQUE e LOCAL_SERVICOS ('topo' ou 'canto').
    Se a barra azul não for achada, tudo vai para o canto.

  O QUE MUDOU NA 3.5
  - SEM CAIXINHA DE MARCAR: Wi-Fi Pro, Fone, Móvel etc. são só AVISOS (igual ao modelo antigo).
    Não precisa mais marcar "conferido" para encerrar. Ganha tempo.
  - VISUAL ANTIGO de volta:
      • Avisos de serviço ............ cartões coloridos embaixo à direita
      • Avisos de estoque ............ cartões no topo à direita
      • Cada cartão tem o ✕ para fechar (fica fechado até trocar de OS)
  - A TRAVA (pergunta antes de finalizar) agora só pergunta quando tem ERRO DE ESTOQUE:
      ferramenta no consumo, item fora do padrão ou limite de metragem passado.
    Serviços (Wi-Fi Pro, chip...) NÃO travam mais. Para voltar a travar: TRAVA_SERVICOS: true
    Para desligar a trava de vez: TRAVA_ATIVA: false
  - O cartão verde "X itens, nenhum problema" vem desligado (MOSTRAR_ESTOQUE_OK).
  - Tudo da 3.4.1 continua: materiais lidos pelo sistema, regra por tipo de OS, caixinha vazia ignorada.

  O QUE MUDOU NA 3.4.1
  - CORRIGIDO: materiais não eram conferidos sem abrir a aba de produtos.
    O ERP só aceita 100 itens por página e o script pedia 200 -> dava erro calado.
    Agora pede de 100 em 100 (até 5 páginas).
  - Se não conseguir ler os materiais, AVISA (não fica mais calado).

  O QUE MUDOU NA 3.4
  - Cada TIPO de OS confere uma coisa diferente (veja REGRAS_POR_TIPO no CONFIG):
      • Apoio / Preventiva ............ não confere nada
      • Manutenção / Troca de endereço  só materiais
      • Ativação PF/PJ (e o resto) .... tudo (serviços + materiais)
  - Linha de modelo com a caixinha VAZIA não conta mais.

  O QUE MUDOU NA 3.3
  - Confere os MATERIAIS sem precisar abrir a aba "Produtos - Consumo interno".
  - Com vários clientes abertos, mostra só os materiais do cliente que está na tela.
*/

// ============ ESCUTA DA API (roda na janela principal E no iframe) ============
// Copia as respostas de consumo interno e patrimônios que o próprio ERP já busca.
(function () {
    'use strict';

    const ALVOS = [
        { re: /GetAllocatedProductsByAssignment/i, tipo: 'consumo' },
        { re: /GetAllocatedPatrimoniesByAssignment/i, tipo: 'patrimonios' }
    ];

    function caixa() {
        let topo;
        try { topo = window.top; topo.document; } catch (e) { topo = window; }
        if (!topo.__OSIR_API) topo.__OSIR_API = { consumo: {}, patrimonios: {}, ultimoAssignmentId: null };
        return topo.__OSIR_API;
    }

    function guardar(url, texto) {
        try {
            const alvo = ALVOS.find(a => a.re.test(url));
            if (!alvo) return;
            const id = (String(url).match(/assignmentId=(\d+)/i) || [])[1] || '?';
            const pagina = (String(url).match(/[?&]Page=(\d+)/i) || [])[1] || '1';
            const c = caixa();
            if (!c[alvo.tipo][id]) c[alvo.tipo][id] = {};
            c[alvo.tipo][id][pagina] = { url: String(url), quando: Date.now(), json: JSON.parse(texto) };
            c.ultimoAssignmentId = id;
        } catch (e) { /* resposta que não é JSON: ignora */ }
    }

    // Anota o número da OS aberta, o endereço da API e os cabeçalhos de login
    // (fica só na memória da página, nada é salvo)
    function anotarChamada(url, cabecalhos) {
        try {
            const s = String(url || '');
            if (!/\/api\/v1\//i.test(s)) return;
            const c = caixa();
            const u = new URL(s, location.href);
            c.apiBase = u.origin;
            const m = s.match(/[?&]assignmentId=(\d+)/i) || s.match(/GetSolicitationPermissionsAsync\/(\d+)/i);
            if (m) {
                c.osAtual = m[1];
                const prot = (String(location.hash).match(/customer-attendance\/(\d+)/i) || [])[1];
                if (prot) {
                    if (!c.mapaOS) c.mapaOS = {};
                    c.mapaOS[prot] = m[1];
                }
            }
            if (cabecalhos && Object.keys(cabecalhos).length) {
                const temLogin = Object.keys(cabecalhos).some(k => /auth|token/i.test(k));
                const jaTinhaLogin = c.headers && Object.keys(c.headers).some(k => /auth|token/i.test(k));
                if (temLogin || !jaTinhaLogin) c.headers = Object.assign({}, cabecalhos);
            }
        } catch (e) { /* ignora */ }
    }

    function headersParaObjeto(h) {
        const o = {};
        try {
            if (!h) return o;
            if (typeof Headers !== 'undefined' && h instanceof Headers) h.forEach((v, k) => { o[k] = v; });
            else if (Array.isArray(h)) h.forEach(([k, v]) => { o[k] = v; });
            else Object.assign(o, h);
        } catch (e) { /* ignora */ }
        return o;
    }

    // fetch
    const fetchOriginal = window.fetch;
    if (fetchOriginal) {
        window.fetch = function (...args) {
            const p = fetchOriginal.apply(this, args);
            try {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
                const h = (args[1] && args[1].headers) || (args[0] && args[0].headers);
                if (!(args[1] && args[1].__osirProprio)) anotarChamada(url, headersParaObjeto(h));
                if (ALVOS.some(a => a.re.test(url))) {
                    p.then(r => r.clone().text().then(t => guardar(url, t))).catch(() => {});
                }
            } catch (e) { /* ignora */ }
            return p;
        };
    }

    // XMLHttpRequest (axios usa este)
    const abrir = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
        this.__osirUrl = url;
        this.__osirHeaders = {};
        return abrir.call(this, metodo, url, ...resto);
    };
    const porCabecalho = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
        try { if (this.__osirHeaders) this.__osirHeaders[nome] = valor; } catch (e) { /* ignora */ }
        return porCabecalho.call(this, nome, valor);
    };
    const enviar = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
        anotarChamada(this.__osirUrl, this.__osirHeaders);
        if (this.__osirUrl && ALVOS.some(a => a.re.test(this.__osirUrl))) {
            this.addEventListener('load', () => {
                try {
                    const t = (this.responseType === '' || this.responseType === 'text')
                        ? this.responseText
                        : JSON.stringify(this.response);
                    guardar(this.__osirUrl, t);
                } catch (e) { /* ignora */ }
            });
        }
        return enviar.apply(this, args);
    };
})();

// ============ PROGRAMA PRINCIPAL (só na janela principal) ============
(function () {
    'use strict';
    if (window.self !== window.top) return;   // dentro do iframe só roda a escuta acima

    // ============ CONFIG (pode mexer aqui) ============
    const CFG = {
        VERSAO: '3.7.1',
        CICLO: 1500,            // de quanto em quanto tempo confere a tela (ms)
        DEBUG: false,           // true = mostra mensagens no console

        // Materiais sem abrir a aba: pede a lista ao sistema
        MATERIAIS_AUTOMATICO: true,
        MATERIAIS_NOVA_TENTATIVA: 15000,   // se der erro, tenta de novo depois de 15 s (até 3 vezes)

        // Onde ficam os avisos: 'topo' (barra azul, ao lado do Registrar Retrabalho) ou 'canto'
        LOCAL_ESTOQUE: 'topo',     // materiais (limite, ferramenta, fora do padrão...)
        LOCAL_SERVICOS: 'canto',   // Wi-Fi Pro, chip, fone, cobrança R$ 80 (em cima do Avançar)
        TOPO_MAX_ETIQUETAS: 3,     // quantas etiquetas de material cabem na barra (o resto vira "+N")

        // true = mostra um cartão verde quando o estoque está todo certo
        MOSTRAR_ESTOQUE_OK: false,

        // Trava: pergunta antes de clicar em botões com estas palavras
        TRAVA_ATIVA: true,
        TRAVA_SERVICOS: false,  // true = Wi-Fi Pro, chip, fone... também travam (não recomendado)
        PALAVRAS_TRAVA: ['finalizar', 'encerrar', 'concluir', 'fechar atendimento', 'fechar protocolo'],

        // Limite por item (soma de todas as linhas do mesmo item)
        LIMITES: {
            'CABO ÓPTICO (DROP)': 350
            // 'CONECTOR FAST SC/APC': 6,   <- exemplo: tire as // para ativar
        },

        // ===== O QUE CONFERIR EM CADA TIPO DE OS =====
        //   nivel 'nada'      = não confere nada
        //   nivel 'materiais' = só o estoque / consumo interno
        //   nivel 'tudo'      = serviços (Wi-Fi Pro, Fone, Móvel...) + materiais
        REGRAS_POR_TIPO: [
            { nivel: 'nada',      nome: 'apoio / preventiva', palavras: ['apoio', 'preventiva'] },
            { nivel: 'materiais', nome: 'só materiais',       palavras: ['manutencao', 'troca de endereco', 'mudanca de endereco', 'troca endereco'] },
            { nivel: 'tudo',      nome: 'tudo',               palavras: ['ativacao', 'instalacao'] }
        ],
        NIVEL_PADRAO: 'tudo',

        // Textos dentro da Demanda que também contam como "apoio"
        TEXTO_DE_APOIO: ['tecnico apoiado', 'tecnico apoiador', 'tipo de apoio'],

        // true = linha de modelo com caixinha vazia "( ) Wi-Fi Pro" é ignorada
        IGNORAR_CAIXA_VAZIA: true
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
        "FIXA FIO BRANCO UNIDADE", "SUPORTE EMENDA 3/4", "SUPORTE DE ANTENA - MODELO CAVALETE PARA PAREDE 3/4", "CONECTOR RJ45 INTELBRAS INCOLOR"
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
    function log(...args) { if (CFG.DEBUG) console.log('[Chamado]', ...args); }

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

    function escaparHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // "1.234,5" -> 1234.5 | "350" -> 350 | "" -> null
    function lerQtd(t) {
        t = (t || '').trim().replace(/[^\d,.\-]/g, '');
        if (!t) return null;
        if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
        const v = parseFloat(t);
        return isNaN(v) ? null : v;
    }

    function fmtNum(n) { return String(Math.round(n * 100) / 100).replace('.', ','); }

    const MATERIAIS_NORM = new Set(MATERIAIS.map(normalizarItem));
    const FERRAMENTAS_NORM = FERRAMENTAS.map(normalizarItem);
    const LIMITES_NORM = {};
    Object.entries(CFG.LIMITES).forEach(([k, v]) => { LIMITES_NORM[normalizarItem(k)] = v; });

    // Página principal + iframes do mesmo site (a OS fica dentro de um iframe)
    function documentos() {
        const lista = [document];
        document.querySelectorAll('iframe').forEach(f => {
            try {
                const d = f.contentDocument;
                if (d && d.body) lista.push(d);
            } catch (e) { /* iframe de outro site: ignora */ }
        });
        return lista;
    }

    // ============ DETECTAR SERVIÇO ============
    function limparParaBusca(texto) {
        return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function levenshtein(a, b) {
        const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= b.length; j++) dp[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
            }
        }
        return dp[a.length][b.length];
    }

    function fuzzyContem(compacto, alvo, max = 1) {
        const n = alvo.length;
        for (let i = 0; i <= compacto.length - n + 1; i++) {
            for (const len of [n - 1, n, n + 1]) {
                const sub = compacto.substr(i, len);
                if (sub.length >= n - 1 && levenshtein(sub, alvo) <= max) return true;
            }
        }
        return false;
    }

    const WIFI = 'w+i+\\s*f+[iy]+';
    const OSIR = 'o[sz]i?e?r';

    const PADROES_SERVICO = {
        wifiPro: new RegExp(`(?<![a-z])${WIFI}\\s*(profissional|pro)(?![a-z])`),
        wifiEnterprise: new RegExp(`(?<![a-z])${WIFI}\\s*(ent[ea]r?pr[iy][sz][ec]|empresarial|business)`),
        osirFone: new RegExp(`(?<![a-z])${OSIR}\\s*(fone|phone|telefon[a-z]*|fixa)|telefonia\\s+(fixa|osir)|telefonia\\s+x\\s+sim`),
        osirMovel: new RegExp(`(?<![a-z])${OSIR}\\s*(m[oae]v[ei]l|mobile|chip|celular|cel)(?![a-z])|chip\\s*${OSIR}`)
    };

    const ALVOS_FUZZY = {
        wifiPro: { alvo: 'wifipro', max: 1 },
        wifiEnterprise: { alvo: 'wifienterprise', max: 2 },
        osirFone: { alvo: 'osirfone', max: 1 },
        osirMovel: { alvo: 'osirmovel', max: 1 }
    };

    function detectarServico(texto, servico) {
        const t = limparParaBusca(texto);
        const rx = PADROES_SERVICO[servico];
        if (rx && rx.test(t)) return true;
        const f = ALVOS_FUZZY[servico];
        if (f && f.max >= 0 && fuzzyContem(t.replace(/ /g, ''), f.alvo, f.max)) {
            log(`🔎 ${servico} detectado por aproximação`);
            return true;
        }
        return false;
    }

    function removerCamposNao(txt) {
        return txt.replace(
            /[a-z0-9 \/\-]{0,40}:\s*[\(\[]\s*[\)\]]\s*sim\s*[\(\[]\s*x\s*[\)\]]\s*nao/g, ' ');
    }

    function cobrancaOitentaMarcada(txt) {
        const m = txt.match(
            /custo[^:]{0,60}?80[^:]{0,40}:\s*[\(\[]\s*(x?)\s*[\)\]]\s*sim\s*[\(\[]\s*(x?)\s*[\)\]]\s*nao/);
        if (!m) return null;
        return m[1] === 'x' && m[2] !== 'x';
    }

    // ============ TIPO DA OS -> O QUE CONFERIR ============
    function nivelDaOS(tipoSolicitacao, categoria, textoDemanda) {
        const tipo = normalizarTexto(tipoSolicitacao + ' | ' + categoria);
        const demanda = normalizarTexto(textoDemanda);

        if (CFG.TEXTO_DE_APOIO.some(p => demanda.includes(normalizarTexto(p)))) {
            return { nivel: 'nada', nome: 'apoio (pela demanda)' };
        }
        for (const r of CFG.REGRAS_POR_TIPO) {
            if (r.palavras.some(p => tipo.includes(normalizarTexto(p)))) {
                return { nivel: r.nivel, nome: r.nome };
            }
        }
        return { nivel: CFG.NIVEL_PADRAO, nome: 'padrão' };
    }

    // Tira as linhas de modelo que começam com caixinha VAZIA: "()", "( )", "[ ]"
    function removerCaixasVazias(texto) {
        if (!CFG.IGNORAR_CAIXA_VAZIA) return texto;
        return texto.split('\n').filter(linha => {
            const comecaVazia = /^\s*[\(\[]\s*[\)\]]/.test(linha);
            const temMarcada = /[\(\[]\s*[xX✓✔*]\s*[\)\]]/.test(linha);
            return !(comecaVazia && !temMarcada);
        }).join('\n');
    }

    // Cores iguais às do modelo antigo
    const SERVICOS = [
        { id: 'wifiPro',        curto: 'WIFI-PRO', label: 'WIFI-PRO: VERIFICAR SE FOI INSTALADO!',             fundo: '#f3e5f5', texto: '#4a148c', borda: '#9c27b0', icone: '🌐' },
        { id: 'wifiEnterprise', curto: 'WIFI ENTERPRISE', label: 'WIFI ENTERPRISE: VERIFICAR. EQUIP: ONU > RB > EAPs', fundo: '#e8f5e9', texto: '#1b5e20', borda: '#43a047', icone: '🏢' },
        { id: 'osirFone',       curto: 'TELEFONIA FIXA', label: 'TELEFONIA FIXA: VERIFICAR SE FOI INSTALADA!',       fundo: '#e3f2fd', texto: '#0d47a1', borda: '#1976d2', icone: '📞' },
        { id: 'osirMovel',      curto: 'CHIP OSIRMÓVEL', label: 'OSIRMÓVEL: VERIFICAR SE O CHIP FOI ENTREGUE!',      fundo: '#fff3e0', texto: '#e65100', borda: '#ff9800', icone: '📱' }
    ];

    // ============ LER TEXTO DA OS ============
    function obterTextoOS(doc) {
        try {
            for (const el of doc.querySelectorAll('p')) {
                if (el.textContent?.trim() !== 'Demanda do Cliente') continue;
                const avo3 = el.parentElement?.parentElement?.parentElement;
                const container = (avo3 && avo3.children[1]) || avo3;
                if (container) {
                    let texto = container.innerText || container.textContent || '';
                    texto = texto.replace(/^Demanda do Cliente\s*/, '');
                    const idx = texto.indexOf('Relato de Atendimento');
                    if (idx !== -1) texto = texto.substring(0, idx);
                    texto = texto.replace(/Expandir/gi, '');
                    if (texto.length > 50) return texto.trim();
                }
                break;
            }

            let melhor = '';
            let melhorScore = 0;
            for (const div of doc.querySelectorAll('div')) {
                const bruto = div.textContent || '';
                if (!(bruto.includes('-- Venda pelo vendedor') || bruto.includes('Adesão: R$') || bruto.includes('Forma de pagamento:'))) continue;

                const texto = div.innerText || bruto;
                if (!(texto.includes('-- Venda pelo vendedor') || texto.includes('Adesão: R$') || texto.includes('Forma de pagamento:'))) continue;
                if (texto.includes('Instalação efetuada com sucesso') && texto.includes('CTO:')) continue;

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

                const melhorOuIgualMenor =
                    score > melhorScore ||
                    (score === melhorScore && score > 0 && limpo.length < melhor.length);

                if (melhorOuIgualMenor && limpo.length > 100) {
                    melhorScore = score;
                    melhor = limpo;
                }
            }
            return melhor.length > 100 ? melhor.trim() : '';
        } catch (e) {
            return '';
        }
    }

    // ============ ESTADO ============
    let estadoOS = { chave: '', itens: [], nivel: 'tudo', regra: '' };
    let ultimoTexto = '';
    let estoque = [];                    // problemas de estoque encontrados
    const dispensados = new Set();       // cartões de estoque fechados no ✕
    const alertasFechados = new Set();   // cartões de serviço fechados no ✕ (zera ao trocar de OS)

    function limparOS() {
        if (estadoOS.chave) alertasFechados.clear();
        estadoOS = { chave: '', itens: [], nivel: 'tudo', regra: '' };
    }

    // ============ SERVIÇOS (só aviso, sem caixinha) ============
    function lerServicos() {
        let input = null, doc = null;
        for (const d of documentos()) {
            const i = d.getElementById('serviceCategoryId1');
            if (i) { input = i; doc = d; break; }
        }
        if (!input) { limparOS(); return; }

        const categoria = input.value?.trim() || '';
        const tipoSolic = doc.getElementById('incidentTypeId')?.value?.trim() || '';
        const texto = obterTextoOS(doc);
        if (!texto || texto.length < 10) { limparOS(); return; }

        const chave = categoria + '||' + tipoSolic + '||' + texto;
        if (chave === estadoOS.chave) return;   // nada mudou

        alertasFechados.clear();   // OS nova: cartões fechados voltam
        ultimoTexto = texto;
        const itens = [];
        const { nivel, nome: regra } = nivelDaOS(tipoSolic, categoria, texto);

        const txt = normalizarTexto(removerCaixasVazias(texto))
            .replace(/https?:\/\/\S+/gi, '')
            .replace(/\S+@\S+\.\S+/gi, '');

        const cat = normalizarTexto(categoria + ' ' + tipoSolic);
        if (nivel === 'nada') {
            // Apoio / preventiva: não confere nada
        } else if (cat.includes('troca') && cat.includes('ender')) {
            const cobra = cobrancaOitentaMarcada(txt);
            if (cobra === true) {
                itens.push({ id: 'cobranca80', curto: 'COBRAR R$ 80 (SAC N2)', label: 'ENVIAR PARA SAC N2 FAZER A COBRANÇA DE R$ 80,00!', fundo: '#ffebee', texto: '#c62828', borda: '#d32f2f', icone: '⚠️' });
            } else if (cobra === null) {
                itens.push({ id: 'cobranca80?', curto: 'CONFERIR CUSTO R$ 80', label: 'NÃO CONSEGUI LER O CAMPO DE CUSTO R$ 80,00. CONFERIR MANUALMENTE!', fundo: '#fffde7', texto: '#f57f17', borda: '#fbc02d', icone: '❓' });
            }
        } else if (nivel === 'tudo') {
            const txtServicos = removerCamposNao(txt);
            SERVICOS.forEach(s => {
                if (detectarServico(txtServicos, s.id)) itens.push({ ...s });
            });
        }

        estadoOS = { chave, itens, nivel, regra };
        log('OS lida:', { tipoSolic, categoria, nivel, regra, itens: itens.map(i => i.id) });
    }

    // ============ AUDITOR DE ESTOQUE ============
    const SELETOR_LINHAS = 'tr.line, [role="row"], .rt-tr, [id*="datagrid_row" i]';
    const SELETOR_CELULAS = 'td, [role="gridcell"], .rt-td, div[class*="cell" i]';

    function abaConsumoAtiva(doc) {
        for (const aba of doc.querySelectorAll('[role="tab"]')) {
            if (!(aba.textContent || '').toUpperCase().includes('PRODUTOS - CONSUMO INTERNO')) continue;
            if (aba.getAttribute('aria-selected') === 'true' || aba.classList.contains('Mui-selected')) return true;
        }
        return false;
    }

    function analisarItens(itens) {
        const problemas = [];
        const contagem = new Map();
        const somas = new Map();
        const nomes = new Map();

        itens.forEach(({ produto, qtd }) => {
            produto = String(produto || '').trim();
            if (!produto || !isNaN(produto) || produto.length <= 3 || produto.toUpperCase().startsWith('TOTAL')) return;

            const n = normalizarItem(produto);
            if (!n || n === 'PRODUTO') return;

            nomes.set(n, produto);
            contagem.set(n, (contagem.get(n) || 0) + 1);

            if (qtd !== null && qtd !== undefined && !isNaN(qtd)) {
                somas.set(n, (somas.get(n) || 0) + qtd);
                if (qtd <= 0) {
                    problemas.push({ chave: 'zero|' + n, tipo: 'aviso', titulo: 'QUANTIDADE ZERADA', curto: 'QTD ZERADA: ' + produto, item: produto, motivo: 'Conferir a quantidade lançada' });
                }
            }

            const ferramenta = FERRAMENTAS_NORM.find(f => n === f || n.includes(f));
            if (ferramenta) {
                problemas.push({ chave: 'item|' + n, tipo: 'erro', titulo: 'FERRAMENTA DE TÉCNICO!', curto: 'FERRAMENTA: ' + produto, item: produto, motivo: 'NÃO ALOCAR NO CONSUMO!' });
            } else if (!MATERIAIS_NORM.has(n)) {
                problemas.push({ chave: 'item|' + n, tipo: 'erro', titulo: 'ITEM FORA DO PADRÃO DETECTADO!', curto: 'FORA DO PADRÃO: ' + produto, item: produto, motivo: 'NÃO ALOCAR COMO CONSUMO INTERNO!' });
            }
        });

        contagem.forEach((q, n) => {
            if (q > 1) {
                problemas.push({ chave: 'dup|' + n, tipo: 'aviso', titulo: `ITEM LANÇADO ${q} VEZES`, curto: `${q}X: ${nomes.get(n)}`, item: nomes.get(n), motivo: 'Verificar se não foi duplicado' });
            }
        });

        somas.forEach((s, n) => {
            const lim = LIMITES_NORM[n];
            if (lim !== undefined && s > lim) {
                problemas.push({ chave: 'lim|' + n + '|' + s, tipo: 'limite', titulo: 'LIMITE EXCEDIDO!', curto: `LIMITE: ${nomes.get(n)} (${fmtNum(s)}/${lim})`, item: nomes.get(n), motivo: `Quantidade: ${fmtNum(s)} — Limite: ${lim}` });
            }
        });

        return problemas;
    }

    function lerItensDaTela(doc) {
        if (!abaConsumoAtiva(doc)) return null;
        const itens = [];
        doc.querySelectorAll(SELETOR_LINHAS).forEach(linha => {
            if (linha.parentElement?.closest(SELETOR_LINHAS)) return;
            if (linha.classList.contains('-padRow')) return;

            const c = linha.classList.contains('rt-tr')
                ? linha.querySelectorAll(':scope > .rt-td')
                : linha.querySelectorAll(SELETOR_CELULAS);
            if (c.length < 3) return;

            itens.push({ produto: c[1].textContent.trim(), qtd: lerQtd(c[2].textContent) });
        });
        return itens;
    }

    // ============ MATERIAIS PELO SISTEMA (sem abrir a aba) ============
    const materiaisAPI = {};

    function protocoloNaTela() {
        for (const f of document.querySelectorAll('iframe')) {
            try {
                if (f.offsetParent === null) continue;
                const m = String(f.contentWindow.location.hash).match(/customer-attendance\/(\d+)/i);
                if (m) return m[1];
            } catch (e) { /* ignora */ }
        }
        const m = String(location.hash).match(/customer-attendance\/(\d+)/i);
        return m ? m[1] : '';
    }

    function osNaTela() {
        const api = window.__OSIR_API;
        const prot = protocoloNaTela();
        if (!api || !prot || !api.mapaOS) return '';
        return api.mapaOS[prot] || '';
    }

    function buscarMateriaisAPI(id) {
        if (!CFG.MATERIAIS_AUTOMATICO || !id) return;
        const api = window.__OSIR_API;
        if (!api || !api.apiBase || !api.headers) return;

        const atual = materiaisAPI[id];
        if (atual) {
            if (atual.carregando || atual.itens) return;
            if ((atual.tentativas || 0) >= 3) return;
            if (Date.now() - atual.quando < CFG.MATERIAIS_NOVA_TENTATIVA) return;
        }
        const tentativas = (atual && atual.tentativas || 0) + 1;
        materiaisAPI[id] = { quando: Date.now(), carregando: true, itens: null, tentativas };

        const ordem = encodeURIComponent('[{"PropertyName":"serviceProductCode","Dir":"a"}]');
        const POR_PAGINA = 100;
        const MAX_PAGINAS = 5;

        async function buscarTudo() {
            const todos = [];
            for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
                const url = `${api.apiBase}/api/v1/Materials/Materials/GetAllocatedProductsByAssignment` +
                    `?OrderBy=${ordem}&Page=${pagina}&PageSize=${POR_PAGINA}&assignmentId=${encodeURIComponent(id)}`;
                const r = await fetch(url, { headers: api.headers, __osirProprio: true });
                if (!r.ok) throw 'HTTP ' + r.status;
                const j = await r.json();
                const lista = j && j.response && j.response.data;
                if (!Array.isArray(lista)) {
                    const msg = j && j.messages && j.messages[0] && j.messages[0].message;
                    throw msg || 'formato diferente';
                }
                todos.push(...lista);
                if (lista.length < POR_PAGINA) break;
            }
            return todos;
        }

        buscarTudo()
            .then(lista => {
                materiaisAPI[id] = {
                    quando: Date.now(),
                    tentativas,
                    itens: lista.map(x => ({
                        produto: x.serviceProductTitle,
                        qtd: typeof x.allocatedAmount === 'number' ? x.allocatedAmount : lerQtd(String(x.allocatedAmount ?? ''))
                    }))
                };
                log(`Materiais da OS ${id}:`, materiaisAPI[id].itens);
            })
            .catch(e => {
                materiaisAPI[id] = { quando: Date.now(), itens: null, erro: String(e), tentativas };
                log('Não consegui buscar os materiais:', e);
            });
    }

    let fonteEstoque = '';
    let qtdItensEstoque = 0;
    let donoEstoque = '';

    function finalizarLista(todos) {
        const unicos = new Map();
        todos.forEach(p => { if (!unicos.has(p.chave)) unicos.set(p.chave, p); });
        const lista = [...unicos.values()];
        const atuais = new Set(lista.map(p => p.chave));
        dispensados.forEach(k => { if (!atuais.has(k)) dispensados.delete(k); });
        return lista;
    }

    function auditar() {
        if (!estadoOS.chave) { fonteEstoque = ''; qtdItensEstoque = 0; donoEstoque = ''; return []; }
        if (estadoOS.nivel === 'nada') { fonteEstoque = ''; qtdItensEstoque = 0; return []; }

        const prot = protocoloNaTela();

        if (donoEstoque !== prot) {
            donoEstoque = prot;
            fonteEstoque = '';
            qtdItensEstoque = 0;
            estoque = [];
        }

        // 1) Aba de consumo aberta: lê direto da tela
        let itensTela = null;
        documentos().forEach(d => {
            try {
                const r = lerItensDaTela(d);
                if (r) itensTela = (itensTela || []).concat(r);
            } catch (e) { /* ignora */ }
        });
        if (itensTela) {
            fonteEstoque = 'tela';
            qtdItensEstoque = itensTela.length;
            return finalizarLista(analisarItens(itensTela));
        }

        // 2) Aba fechada: usa a lista pedida ao sistema
        const id = osNaTela();
        try { buscarMateriaisAPI(id); } catch (e) { /* ignora */ }
        const dados = id && materiaisAPI[id];
        if (dados && dados.itens) {
            fonteEstoque = 'sistema';
            qtdItensEstoque = dados.itens.length;
            return finalizarLista(analisarItens(dados.itens));
        }

        // 3) Desistiu depois de 3 erros: avisa
        if (dados && dados.erro && (dados.tentativas || 0) >= 3) {
            fonteEstoque = '';
            return finalizarLista([{
                chave: 'semMateriais|' + id,
                tipo: 'aviso',
                titulo: 'NÃO CONSEGUI LER OS MATERIAIS',
                curto: 'MATERIAIS NÃO LIDOS — ABRIR ABA',
                item: 'Abra a aba "Produtos - Consumo interno" para conferir',
                motivo: 'Erro: ' + dados.erro
            }]);
        }

        // 4) Ainda sem dados deste cliente: mantém o que já tinha
        return estoque;
    }

    // ============ PENDÊNCIAS (só para a trava) ============
    // Erros e limites de estoque SEMPRE contam (mesmo fechados no ✕).
    // Avisos (duplicado, zerado) param de contar quando fechados.
    // Serviços só contam se TRAVA_SERVICOS = true.
    function listarPendencias() {
        const p = [];
        if (CFG.TRAVA_SERVICOS) estadoOS.itens.forEach(i => p.push(i.label));
        estoque
            .filter(e => e.tipo !== 'aviso' || !dispensados.has(e.chave))
            .forEach(e => p.push(`${e.titulo} ${e.item}`));
        return p;
    }

    // ============ CARTÕES (visual do modelo antigo) ============
    const CORES_ESTOQUE = {
        erro:   { fundo: '#ffebee', texto: '#c62828', borda: '#d32f2f' },
        limite: { fundo: '#fffde7', texto: '#f57f17', borda: '#fbc02d' },
        aviso:  { fundo: '#fff3e0', texto: '#e65100', borda: '#fb8c00' },
        ok:     { fundo: '#e8f5e9', texto: '#2e7d32', borda: '#66bb6a' }
    };

    // Cores das etiquetas da barra azul (fundo escuro, letra branca)
    const CORES_TOPO = { erro: '#c62828', limite: '#d84315', aviso: '#8d6e00', ok: '#2e7d32' };

    const CSS = `
        #tm-alerts-container{position:fixed;bottom:140px;right:25px;width:340px;z-index:10000;
            font-family:Roboto,sans-serif;display:flex;flex-direction:column-reverse;gap:10px;pointer-events:none}
        #tm-auditor-container{position:fixed;top:80px;right:25px;width:360px;z-index:10001;
            font-family:Roboto,sans-serif;display:flex;flex-direction:column;gap:10px;pointer-events:none}
        .tm-card{border:2px solid;border-radius:8px;padding:12px 15px;font-size:12px;font-weight:700;
            line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,.15);text-align:center;
            pointer-events:auto;position:relative}
        .tm-card .tm-x{position:absolute;top:6px;right:8px;cursor:pointer;font-size:14px;opacity:.6;padding:2px 4px}
        .tm-card .tm-x:hover{opacity:1}
        .tm-card .tm-txt{padding-right:18px}
        .tm-card .tm-item{color:#000;font-size:13px}
        #tm-navbar-alertas{display:flex;align-items:stretch;margin-right:12px;gap:2px}
        #tm-navbar-alertas:empty{display:none}
        .tm-chip{display:flex;align-items:center;gap:6px;padding:0 14px;color:#fff;
            font:700 12px Roboto,sans-serif;text-transform:uppercase;white-space:nowrap;cursor:pointer;user-select:none}
        .tm-chip span{max-width:280px;overflow:hidden;text-overflow:ellipsis}
        .tm-chip:hover{filter:brightness(1.15)}
        .tm-pisca{animation:tmPisca .35s 4}
        @keyframes tmPisca{50%{transform:scale(1.04);box-shadow:0 0 0 5px rgba(198,40,40,.55)}}
    `;

    let boxAlertas = null;
    let boxAuditor = null;
    let boxTopo = null;      // espaço na barra azul (ao lado do Registrar Retrabalho)

    // Acha (ou recria) o espaço na barra azul. O ERP às vezes redesenha a barra,
    // então isso é conferido em todo ciclo.
    function espacoNoTopo() {
        if (CFG.LOCAL_SERVICOS !== 'topo' && CFG.LOCAL_ESTOQUE !== 'topo') return null;
        if (boxTopo && boxTopo.isConnected) return boxTopo;
        const barra = document.getElementById('navbar-menu-buttons');
        if (!barra) return null;
        boxTopo = document.createElement('div');
        boxTopo.id = 'tm-navbar-alertas';
        const retrabalho = document.getElementById('rt-btn-flutuante');
        if (retrabalho && retrabalho.parentElement === barra) barra.insertBefore(boxTopo, retrabalho);
        else barra.insertBefore(boxTopo, barra.firstChild);
        boxTopo.addEventListener('click', ev => {
            const c = ev.target.closest('[data-acao]');
            if (!c) return;
            if (c.dataset.acao === 'fechar-alerta') alertasFechados.add(c.dataset.id);
            if (c.dataset.acao === 'fechar-estoque') dispensados.add(c.dataset.id);
            assinatura = '';
            render();
        });
        assinatura = '';   // espaço novo: desenha de novo
        return boxTopo;
    }
    let assinatura = '';

    function criarContainers() {
        const st = document.createElement('style');
        st.textContent = CSS;
        document.head.appendChild(st);

        boxAlertas = document.createElement('div');
        boxAlertas.id = 'tm-alerts-container';
        document.body.appendChild(boxAlertas);

        boxAuditor = document.createElement('div');
        boxAuditor.id = 'tm-auditor-container';
        document.body.appendChild(boxAuditor);

        // Clique no ✕ de qualquer cartão
        const aoFechar = ev => {
            const x = ev.target.closest('[data-acao]');
            if (!x) return;
            if (x.dataset.acao === 'fechar-alerta') alertasFechados.add(x.dataset.id);
            if (x.dataset.acao === 'fechar-estoque') dispensados.add(x.dataset.id);
            assinatura = '';
            render();
        };
        boxAlertas.addEventListener('click', aoFechar);
        boxAuditor.addEventListener('click', aoFechar);
    }

    function cartao(cores, conteudo, acao, id, maiusculo) {
        const x = acao ? `<span class="tm-x" data-acao="${acao}" data-id="${escaparHtml(id)}" title="Fechar">✕</span>` : '';
        return `<div class="tm-card" style="background:${cores.fundo};color:${cores.texto};border-color:${cores.borda};${maiusculo ? 'text-transform:uppercase;' : ''}">
            ${x}<div class="tm-txt">${conteudo}</div></div>`;
    }

    function render() {
        const topo = espacoNoTopo();
        const alertas = estadoOS.itens.filter(i => !alertasFechados.has(i.id));
        const visiveis = estoque.filter(e => !dispensados.has(e.chave));
        const mostrarOk = CFG.MOSTRAR_ESTOQUE_OK && !estoque.length && !!fonteEstoque;

        const sig = JSON.stringify([!!topo, alertas.map(i => i.id), visiveis.map(e => e.chave), mostrarOk ? qtdItensEstoque : -1]);
        if (sig === assinatura) return;
        assinatura = sig;

        const servNoTopo = !!topo && CFG.LOCAL_SERVICOS === 'topo';
        const estNoTopo = !!topo && CFG.LOCAL_ESTOQUE === 'topo';
        const etiquetas = [];

        // ----- Materiais -----
        if (estNoTopo) {
            const max = Math.max(1, CFG.TOPO_MAX_ETIQUETAS || 3);
            visiveis.slice(0, max).forEach(e => {
                etiquetas.push(etiqueta(CORES_TOPO[e.tipo] || CORES_TOPO.aviso, '⚠️', e.curto || e.titulo,
                    `${e.titulo} "${e.item}" — ${e.motivo} (clique para esconder)`, 'fechar-estoque', e.chave));
            });
            const resto = visiveis.slice(max);
            if (resto.length) {
                etiquetas.push(etiqueta(CORES_TOPO.aviso, '➕', `${resto.length} MATERIAL(IS)`,
                    resto.map(e => `${e.titulo} "${e.item}" — ${e.motivo}`).join('\n')));
            }
            if (mostrarOk) etiquetas.push(etiqueta(CORES_TOPO.ok, '✔', `${qtdItensEstoque} ITENS OK`, 'Materiais sem problema'));
            boxAuditor.innerHTML = '';
        } else {
            let h = visiveis.map(e =>
                cartao(CORES_ESTOQUE[e.tipo] || CORES_ESTOQUE.aviso,
                    `⚠️ ${escaparHtml(e.titulo)}<br><span class="tm-item">"${escaparHtml(e.item)}"</span><br>${escaparHtml(e.motivo)}`,
                    'fechar-estoque', e.chave)
            ).join('');
            if (mostrarOk) {
                h += cartao(CORES_ESTOQUE.ok, `✔ ${qtdItensEstoque} ${qtdItensEstoque === 1 ? 'item lançado' : 'itens lançados'}, nenhum problema`);
            }
            boxAuditor.innerHTML = h;
        }

        // ----- Serviços -----
        if (servNoTopo) {
            alertas.forEach(i => etiquetas.push(etiqueta(i.texto, i.icone, i.curto || i.label,
                `${i.label} — clique para esconder`, 'fechar-alerta', i.id)));
            boxAlertas.innerHTML = '';
        } else {
            boxAlertas.innerHTML = alertas.map(i =>
                cartao(i, `${i.icone} ${escaparHtml(i.label)}`, 'fechar-alerta', i.id, true)
            ).join('');
        }

        if (topo) topo.innerHTML = etiquetas.join('');
    }

    // Etiqueta da barra azul (mesmo tamanho do botão Registrar Retrabalho)
    function etiqueta(cor, icone, texto, dica, acao, id) {
        const a = acao ? ` data-acao="${acao}" data-id="${escaparHtml(id)}"` : '';
        return `<div class="tm-chip" style="background:${cor}" title="${escaparHtml(dica)}"${a}>${icone} <span>${escaparHtml(texto)}</span></div>`;
    }

    // Na hora da trava: reabre os erros fechados e faz os cartões piscarem
    function piscarCartoes() {
        estoque.forEach(e => { if (e.tipo !== 'aviso') dispensados.delete(e.chave); });
        if (CFG.TRAVA_SERVICOS) alertasFechados.clear();
        assinatura = '';
        render();
        [boxAuditor, boxAlertas, boxTopo].forEach(box => box && box.querySelectorAll('.tm-card, .tm-chip').forEach(c => {
            c.classList.remove('tm-pisca');
            void c.offsetWidth;   // reinicia a animação
            c.classList.add('tm-pisca');
        }));
    }

    // ============ TRAVA ANTES DE FINALIZAR ============
    const docsComTrava = new WeakSet();
    const PALAVRAS_NORM = CFG.PALAVRAS_TRAVA.map(normalizarTexto);

    function aoClicar(ev) {
        const btn = ev.target.closest?.('button, a, input[type="button"], input[type="submit"], [role="button"]');
        if (!btn || boxAlertas.contains(btn) || boxAuditor.contains(btn) || (boxTopo && boxTopo.contains(btn))) return;

        const txt = normalizarTexto(btn.innerText || btn.value || btn.getAttribute('aria-label') || '');
        if (!txt || txt.length > 60) return;

        const ehAvancar = txt.includes('avancar');
        if (ehAvancar) {
            // AVANÇAR só trava na etapa "Dados Finais"
            const f = btn.ownerDocument.getElementById('finalDate');
            if (!f || f.offsetParent === null) return;
        } else if (!PALAVRAS_NORM.some(p => txt.includes(p))) {
            return;
        }

        const pend = listarPendencias();
        if (!pend.length) return;

        piscarCartoes();
        const ok = window.confirm(
            `⚠️ ESTA OS TEM ${pend.length} PROBLEMA(S):\n\n- ` +
            pend.join('\n- ') +
            '\n\nQuer continuar mesmo assim?'
        );
        if (!ok) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            ev.stopPropagation();
        } else {
            log('Usuário continuou com pendências:', pend);
        }
    }

    function instalarTrava() {
        if (!CFG.TRAVA_ATIVA) return;
        documentos().forEach(d => {
            if (docsComTrava.has(d)) return;
            docsComTrava.add(d);
            d.addEventListener('click', aoClicar, true);
        });
    }

    // ============ ESCONDER BOTÃO ============
    const TEXTO_BOTAO_ESCONDER = 'Abrir novo protocolo para o mesmo cliente';

    function esconderBotao() {
        documentos().forEach(d => {
            d.querySelectorAll('button.MuiButtonBase-root.MuiButton-root').forEach(btn => {
                if (btn.style.display !== 'none' && btn.textContent?.trim() === TEXTO_BOTAO_ESCONDER) {
                    btn.style.display = 'none';
                }
            });
        });
    }

    // ============ CICLO PRINCIPAL ============
    function ciclo() {
        if (document.hidden) return;
        try { lerServicos(); } catch (e) { console.error('Erro serviços:', e); }
        try { estoque = auditar(); } catch (e) { console.error('Erro auditoria:', e); }
        try { instalarTrava(); } catch (e) { /* ignora */ }
        try { esconderBotao(); } catch (e) { /* ignora */ }
        render();
    }

    // ============ TESTES (console) ============
    //   TM_DEBUG.testar()          -> testa as variações de escrita
    //   TM_DEBUG.pendencias()      -> mostra o que trava agora
    //   copy(TM_DEBUG.ultimoTexto) -> copia o texto que o script leu da OS
    //   TM_DEBUG.materiais()       -> como está a busca automática de materiais
    window.TM_DEBUG = {
        detectarServico, cobrancaOitentaMarcada, removerCamposNao, normalizarTexto, lerQtd,
        nivelDaOS, removerCaixasVazias,
        get regra() { return estadoOS.nivel + ' (' + estadoOS.regra + ')'; },
        get ultimoTexto() { return ultimoTexto; },
        // Usado pelo "Gerador de Relato" para marcar as caixinhas
        get servicos() { return estadoOS.itens.map(i => i.id); },
        get estoque() { return estoque.map(e => ({ tipo: e.tipo, titulo: e.titulo, item: e.item, motivo: e.motivo })); },
        get fonteEstoque() { return fonteEstoque; },
        pendencias: listarPendencias,
        api() {
            const c = window.__OSIR_API;
            if (!c || !c.ultimoAssignmentId) return 'Nada capturado ainda. Abra a aba de consumo/patrimônios da OS e tente de novo.';
            return JSON.stringify(c, (k, v) => k === 'headers' ? '(escondido)' : v, 2);
        },
        materiais() {
            const c = window.__OSIR_API || {};
            const id = osNaTela();
            return {
                protocoloNaTela: protocoloNaTela() || '(nenhum)',
                osNaTela: id || '(ainda não sei)',
                clientesConhecidos: Object.keys(c.mapaOS || {}).length,
                temEndereco: !!c.apiBase,
                temLogin: !!c.headers,
                fonte: fonteEstoque || '(nada ainda)',
                dados: id ? materiaisAPI[id] || '(ainda não buscou)' : null
            };
        },
        testar() {
            const testes = {
                wifiPro: ['Wifi pro', 'wi fi pro', 'wifipro', 'Wi-fi pró', 'WIFI-PRO', 'wi_fi pro', 'wifi por', 'wifii pro', 'Wifi Profissional'],
                osirMovel: ['osir movel', 'osirmovel', 'Osir Móvel', 'osir-movel', 'chip osir', 'osir movl'],
                osirFone: ['osir fone', 'osirfone', 'Osir-Fone', 'osir fome', 'telefonia fixa'],
                wifiEnterprise: ['wifi enterprise', 'wi-fi enterprice', 'wifi empresarial']
            };
            for (const [srv, lista] of Object.entries(testes)) {
                lista.forEach(t => console.log(detectarServico(t, srv) ? '✅' : '❌', srv, '→', t));
            }
            [
                ['Custo R$ 80,00 (troca < 3 meses): ( ) Sim (X ) Não', false],
                ['Custo R$ 80,00 (troca < 3 meses): (X ) Sim ( ) Não', true],
                ['Custo R$ 80,00 (troca < 3 meses): ( X) Sim ( ) Não', true],
                ['Wifi Pro: ( ) Sim (X ) Não Custo R$ 80,00 (troca < 3 meses): ( ) Sim (X ) Não', false]
            ].forEach(([t, esperado]) => {
                const r = cobrancaOitentaMarcada(normalizarTexto(t));
                console.log(r === esperado ? '✅' : '❌', 'cobrança', '→', t, '=>', r);
            });
            [['350', 350], ['1.234,5', 1234.5], ['200,00', 200], ['', null]].forEach(([t, esp]) => {
                const r = lerQtd(t);
                console.log(r === esp ? '✅' : '❌', 'qtd', '→', JSON.stringify(t), '=>', r);
            });
        }
    };

    // ============ INICIAR ============
    function iniciar() {
        criarContainers();
        ciclo();
        setInterval(ciclo, CFG.CICLO);
        log(`🚀 v${CFG.VERSAO} iniciado`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 500));
    } else {
        setTimeout(iniciar, 500);
    }
})();
