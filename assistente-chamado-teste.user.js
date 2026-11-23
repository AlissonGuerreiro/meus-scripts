// ==UserScript==
// @name         Osir - Assistente de Chamado TESTE
// @namespace    http://tampermonkey.net/
// @version      3.8.0-teste.16
// @description  Alertas de serviços da OS, auditor de estoque e trava antes de finalizar
// @author       Alisson Guerreiro
// @homepage     https://github.com/AlissonGuerreiro/meus-scripts
// @supportURL   https://github.com/AlissonGuerreiro/meus-scripts/issues
// @match        https://erp.osirnet.com.br/*
// @grant        none
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/assistente-chamado-teste.user.js
// @updateURL    https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/assistente-chamado-teste.user.js
// ==/UserScript==

/*
  VERSÃO DE TESTE (atualiza pelo GitHub, arquivo separado do oficial). Desligue o Assistente oficial enquanto testa.

  O QUE MUDOU NA 3.8
  - BOTÃO "📝 RETRABALHO" em cada aviso (materiais, Wi-Fi Pro, chip, fone...).
    Abre o formulário do Projeto Retrabalho (2.0+) JÁ PREENCHIDO. Quem envia é
    sempre o Projeto Retrabalho; este script só sugere.
  - CONFERÊNCIA (novo): cruza o relato do técnico, a carga (patrimônios), o consumo
    e as fotos da OS e sugere retrabalhos:
      • sinal fora de -13 a -25 dBm no NOSSO relato (Relato de Atendimento) .. Sinal
      • relato diz troca de equipamento, sem patrimônio novo na data .. Material/Equipamento
      • troca feita, mas equipamento antigo ainda na carga ............. Material/Equipamento
      • relato de "só troca" com cabo drop no consumo .................. Material/Equipamento
      • OS sem fotos / poucas fotos (só cartão) ........................... Instalação
      • Wi-Fi Pro pedido com menos de 2 roteadores na carga ............. Wifi-Pro
      • Wi-Fi Enterprise: sem RB / RB 750-760 em plano > 500 Mb / sem EAP .. Wifi-Pro
      • PENDÊNCIA DE MATERIAL aberta (Solicitações vinculadas) .......... Material/Equipamento
        -> ao criar a pendência, ela é GRAVADA SOZINHA na planilha (PENDENCIA_AO_CRIAR: 'auto').
        Pendência FOTOGRÁFICA vira "Instalação" (com a lista das fotos que faltam).
  - Cartões do canto SOMEM enquanto um painel lateral do ERP está aberto.
  - TÉCNICO: quem encaminhou para o COP Encerramentos (antes só achava quem tinha GPS).
  - TERCEIRIZADA (time sem "CCO": ARCA, Aliança, VH...): avisos de Wi-Fi Pro/Enterprise/chip/fone
    viram "ABRIR RETORNO PARA TÉCNICO DA CASA" (sem botão de retrabalho).
  - Habilitação de fibra / troca de endereço e Apoio: não confere nada (nem fotos).
    São SUGESTÕES: a pessoa confere e decide.
  - TRAVA COM 3 BOTÕES (no lugar do OK/Cancelar):
      Voltar e corrigir | Registrar retrabalho | Finalizar mesmo assim
  - Patrimônios: o script aprende o endereço da lista na 1ª vez que alguém abre
    "Produtos e Serviços > Patrimônios Alocados" (fica guardado no navegador).

  O QUE MUDOU NA 3.7.2
  - CORRIGIDO: com mais de um cliente aberto, os avisos de SERVIÇO (chip, Wi-Fi Pro, fone)
    liam o cliente ERRADO (a primeira aba aberta, mesmo escondida). Agora leem só o
    cliente que está NA TELA.
  - O aviso do chip mostra a QUANTIDADE quando dá para ler (ex.: "2 CHIPS").

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
            if (alvo.tipo === 'patrimonios' && id !== '?') {
                // 3.8: guarda o "molde" do endereço para buscar patrimônios de qualquer OS
                try {
                    const abs = new URL(String(url), location.href).href
                        .replace(/assignmentId=\d+/i, 'assignmentId={ID}')
                        .replace(/([?&])Page=\d+/i, '$1Page=1')
                        .replace(/([?&])PageSize=\d+/i, '$1PageSize=100');
                    localStorage.setItem('osir_url_patrimonios', abs);
                } catch (e) { /* ignora */ }
            }
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
        VERSAO: '3.8.0-teste.16',
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

        // "ITEM LANÇADO 2 VEZES": false = não avisa para material PERMITIDO
        // (era o aviso chato). Material fora do padrão / ferramenta continua avisando.
        AVISAR_DUPLICADOS: false,

        // Limite por item = SOMA de todas as linhas (2 x 200 m = 400 m -> passa de 350).
        // O nome vale como "contém": pega variações do mesmo item.
        LIMITES: {
            'CABO ÓPTICO (DROP)': 350
            // 'CONECTOR FAST SC/APC': 6,   <- exemplo: tire as // para ativar
        },

        // ===== O QUE CONFERIR EM CADA TIPO DE OS =====
        //   nivel 'nada'      = não confere nada
        //   nivel 'materiais' = só o estoque / consumo interno
        //   nivel 'tudo'      = serviços (Wi-Fi Pro, Fone, Móvel...) + materiais
        REGRAS_POR_TIPO: [
            // Protocolos que NÓS abrimos para relatar (o técnico trabalha em outro): não confere nada
            { nivel: 'nada',      nome: 'apoio / habilitação / preventiva', palavras: ['apoio', 'preventiva', 'habilitacao'] },
            { nivel: 'materiais', nome: 'só materiais',       palavras: ['manutencao', 'troca de endereco', 'mudanca de endereco', 'troca endereco'] },
            { nivel: 'tudo',      nome: 'tudo',               palavras: ['ativacao', 'instalacao'] }
        ],
        NIVEL_PADRAO: 'tudo',

        // Textos dentro da Demanda que também contam como "apoio"
        TEXTO_DE_APOIO: ['tecnico apoiado', 'tecnico apoiador', 'tipo de apoio'],

        // true = linha de modelo com caixinha vazia "( ) Wi-Fi Pro" é ignorada
        IGNORAR_CAIXA_VAZIA: true,

        // ===== RETRABALHO / CONFERÊNCIA (3.8) =====
        CONFERENCIA_ATIVA: true,      // false = desliga as sugestões por regra
        TRAVA_SUGESTOES: false,       // false = sugestões (🔎) são só cartões, NÃO perguntam ao finalizar
        SINAL_MIN: -25,               // dBm
        SINAL_MAX: -13,
        // Cartão de "OS sem fotos / poucas fotos" (só aviso, não trava)
        REGRA_FOTOS: true,
        MIN_FOTOS: 3,
        MIN_ROTEADORES_WIFIPRO: 2,         // com ONU bridge (ou sem saber a ONU)
        MIN_ROTEADORES_WIFIPRO_ONU_ROT: 1, // com ONU que autentica (F6201B)
        // Wi-Fi Pro ENTERPRISE: não usa roteador. Vai uma RB + EAP(s).
        //   RB 750 / 760 -> planos até 500 Mb | RB 4011 -> planos acima (giga)
        ENTERPRISE_RB_GIGA: ['4011'],
        ENTERPRISE_LIMITE_MB_RB_PEQUENA: 500,
        // Time do técnico: começa com "CCO" = técnico da CASA. Outro (ARCA, Aliança, VH...) = TERCEIRIZADA.
        // Terceirizada não faz Wi-Fi Pro / Enterprise / chip / fone: o aviso vira "abrir RETORNO".
        TIME_CASA: /^\s*CCO\b/i,
        SERVICOS_QUE_TERCEIRA_NAO_FAZ: ['wifiPro', 'wifiEnterprise', 'osirMovel', 'osirFone'],
        // Pendência de material aberta pela "Solicitação vinculada" = retrabalho do técnico
        PENDENCIA_TITULO: /pend[eê]ncia/i,   // qualquer solicitação vinculada de pendência
        ESCONDER_COM_PAINEL: true,           // esconde os cartões do canto quando um painel lateral do ERP abre
        // Ao CRIAR uma pendência:
        //   'auto' = grava direto na planilha (sem formulário)  <- combinado no GR
        //   'form' = abre o formulário preenchido para a pessoa enviar
        //   ''     = só mostra o cartão
        PENDENCIA_AO_CRIAR: 'auto',
        // Palavras que indicam ROTEADOR na carga (título do patrimônio)
        PALAVRAS_ROTEADOR: ['ROTEADOR', 'ROUTER', 'MESH', 'H3601', 'WS7001', 'ARCHER', 'DECO', 'TWIBI', 'ROT '],
        // ONU/ONT na carga (para saber se é bridge ou roteador)
        PALAVRAS_ONU: ['ONU', 'ONT', 'MODEM', 'HG8010', 'HG 8010', 'F601', 'F6201', 'EG8145', '8145', 'EKTECH', 'RAISECOM'],
        // ONU que AUTENTICA (faz o papel de roteador controlador):
        // com mesh / Wi-Fi Pro precisa de só MAIS 1 roteador (o agente).
        // Todas as outras ONUs trabalham como BRIDGE -> precisam de 2 roteadores
        // (um controlador + o mesh/pró como agente).
        PALAVRAS_ONU_ROTEADOR: ['F6201B'],
        // Qual tipo de retrabalho cada aviso sugere (nome igual ao da planilha)
        TIPO_POR_AVISO: {
            wifiPro: 'Wifi-Pro',
            wifiEnterprise: 'Instalação',
            osirFone: 'Instalação',
            osirMovel: 'Chip',
            estoque: 'Material/Equipamento'
        }
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
        // "pro" seguido de enterprise NÃO é Wi-Fi Pro simples
        wifiPro: new RegExp(`(?<![a-z])${WIFI}\\s*(profissional|pro)(?![a-z])(?!\\s*(ent[ea]r?pr|empresarial|business))`),
        // aceita "wifi enterprise" e "wifi pro enterprise"
        wifiEnterprise: new RegExp(`(?<![a-z])${WIFI}\\s*(pro\\s*|profissional\\s*)?(ent[ea]r?pr[iy][sz][ec]|empresarial|business)`),
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
    // cartões de serviço fechados no ✕ — guardados por PROTOCOLO (antes zerava quando o texto
    // da OS mudava um pouco, e o cartão voltava)
    const fechadosPorProt = {};
    const alertasFechados = {
        _s() { const p = protocoloNaTela() || '?'; return fechadosPorProt[p] || (fechadosPorProt[p] = new Set()); },
        has(id) { return this._s().has(id); },
        add(id) { this._s().add(id); },
        delete(id) { this._s().delete(id); },
        clear() { /* não zera mais ao redesenhar; cada protocolo tem o seu */ }
    };

    function limparOS() {
        if (estadoOS.chave) alertasFechados.clear();
        estadoOS = { chave: '', itens: [], nivel: 'tudo', regra: '' };
    }

    // ============ SERVIÇOS (só aviso, sem caixinha) ============
    // Documento do cliente que está NA TELA (ignora abas de outros clientes escondidas)
    function docDaOSNaTela() {
        for (const f of document.querySelectorAll('iframe')) {
            try {
                if (f.offsetParent === null) continue;   // aba escondida
                const d = f.contentDocument;
                if (d && d.getElementById('serviceCategoryId1')) return d;
            } catch (e) { /* iframe de outro site: ignora */ }
        }
        if (document.getElementById('serviceCategoryId1')) return document;
        return null;
    }

    // Quantos chips: "02 Osirmóvel", "2 chips", "2x osir movel" -> 2
    function contarChips(txt) {
        let maior = 0;
        for (const m of txt.matchAll(/(?<!\d)(\d{1,2})\s*(?:x\s*)?(?:-\s*)?(?:o[sz]i?e?r\s*m[oae]v[ei]l|chips?)(?![a-z])/g)) {
            maior = Math.max(maior, parseInt(m[1], 10));
        }
        return maior;
    }

    function lerServicos() {
        const doc = docDaOSNaTela();
        const input = doc && doc.getElementById('serviceCategoryId1');
        if (!input) { limparOS(); return; }

        const categoria = input.value?.trim() || '';
        const tipoSolic = doc.getElementById('incidentTypeId')?.value?.trim() || '';
        const texto = obterTextoOS(doc);
        if (!texto || texto.length < 10) { limparOS(); return; }

        const chave = categoria + '||' + tipoSolic + '||' + texto;
        if (chave === estadoOS.chave) return;   // nada mudou

        // (cartões fechados ficam guardados por protocolo)
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
            // Enterprise e Pro simples nunca aparecem juntos: Enterprise ganha
            const ehEnt = detectarServico(txtServicos, 'wifiEnterprise');
            SERVICOS.forEach(s => {
                if (s.id === 'wifiPro' && ehEnt) return;
                if (s.id === 'wifiEnterprise' ? !ehEnt : !detectarServico(txtServicos, s.id)) return;
                const item = { ...s };
                if (s.id === 'osirMovel') {
                    const n = contarChips(txtServicos);
                    if (n > 1) {
                        item.curto = `${n} CHIPS OSIRMÓVEL`;
                        item.label = `OSIRMÓVEL: VERIFICAR SE OS ${n} CHIPS FORAM ENTREGUES!`;
                    }
                }
                itens.push(item);
            });
        }

        estadoOS = { chave, itens, nivel, regra };
        estadoOS.itensBrutos = itens;
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
        const partes = new Map();   // quantidades de cada linha (para mostrar 200 + 200)
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
                if (!partes.has(n)) partes.set(n, []);
                partes.get(n).push(qtd);
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
            if (!CFG.AVISAR_DUPLICADOS) return;
            if (q > 1) {
                problemas.push({ chave: 'dup|' + n, tipo: 'aviso', titulo: `ITEM LANÇADO ${q} VEZES`, curto: `${q}X: ${nomes.get(n)}`, item: nomes.get(n), motivo: 'Verificar se não foi duplicado' });
            }
        });

        // Limite: soma por item E soma por grupo (ex.: todas as linhas de DROP juntas,
        // mesmo com nomes um pouco diferentes)
        Object.entries(LIMITES_NORM).forEach(([chave, lim]) => {
            let total = 0;
            const linhas = [];
            const nomesGrupo = new Set();
            somas.forEach((soma, n) => {
                if (n === chave || n.includes(chave)) {
                    total += soma;
                    linhas.push(...(partes.get(n) || [soma]));
                    nomesGrupo.add(nomes.get(n));
                }
            });
            if (total > lim) {
                const nome = [...nomesGrupo][0] || chave;
                const conta = linhas.length > 1 ? `${linhas.map(fmtNum).join(' + ')} = ${fmtNum(total)}` : fmtNum(total);
                problemas.push({
                    chave: 'lim|' + chave + '|' + total, tipo: 'limite', titulo: 'LIMITE EXCEDIDO!',
                    curto: `LIMITE: ${nome} (${fmtNum(total)}/${lim})`, item: nome,
                    motivo: `${linhas.length > 1 ? linhas.length + ' lançamentos: ' : ''}${conta} — Limite: ${lim}. Enviar para análise (acima de ${lim} m).`
                });
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


    // ============ CONFERÊNCIA (3.8): relato x carga x consumo x fotos ============
    const conferenciaAPI = {};   // por OS: { quando, carregando, tentativas, dados:{...}, erro }
    let sugestoes = [];          // sugestões da conferência para a OS na tela
    const sugestoesFechadas = new Set();

    function retrabalhoDisponivel() {
        return !!document.documentElement.dataset.rtVersao;
    }

    function tiposDoRetrabalho() {
        try { return JSON.parse(document.documentElement.dataset.rtTipos || '[]'); } catch (e) { return []; }
    }

    // Abre o formulário do Projeto Retrabalho já preenchido
    function pedirRetrabalho(tipo, relato, motivo, sugestao, pendencia) {
        if (!retrabalhoDisponivel()) {
            alert('Instale/ligue o "Projeto Retrabalho" (2.0 ou mais novo) para registrar por aqui.');
            return;
        }
        const tipos = tiposDoRetrabalho();
        document.dispatchEvent(new CustomEvent('osir:registrar-retrabalho', {
            detail: JSON.stringify({
                tipo: tipos.length && tipos.indexOf(tipo) === -1 ? '' : tipo,
                relato: relato,
                motivo: motivo,
                sugestao: sugestao || 'aviso',
                pendencia: pendencia || ''
            })
        }));
    }

    // Grava sozinho (só pendência). Precisa do Projeto Retrabalho 2.0 teste.2+
    function registrarAutomatico(tipo, relato, motivo, pendencia) {
        if (!document.documentElement.dataset.rtAuto) return pedirRetrabalho(tipo, relato, motivo, 'pendencia', pendencia);
        document.dispatchEvent(new CustomEvent('osir:registrar-retrabalho-auto', {
            detail: JSON.stringify({ tipo, relato, motivo, pendencia })
        }));
    }

    function textoDeHtml(html) {
        const d = document.createElement('div');
        d.innerHTML = String(html || '').replace(/<\/p>|<br\s*\/?>/gi, '\n');
        return (d.textContent || '').trim();
    }

    async function getApi(caminho) {
        const api = window.__OSIR_API;
        const url = /^https?:/i.test(caminho) ? caminho : api.apiBase + caminho;
        const r = await fetch(url, { headers: api.headers, __osirProprio: true });
        if (!r.ok) throw 'HTTP ' + r.status;
        const j = await r.json();
        if (!j || j.success === false) throw (j && j.messages && j.messages[0] && j.messages[0].message) || 'sem sucesso';
        return j.response;
    }

    // Técnico = atendimento com GPS (visita em campo), o mais recente
    // Técnico = quem ENCAMINHOU a OS para o COP Encerramentos (com ou sem GPS).
    // Reserva: o atendimento mais recente com GPS.
    function acharVisita(reports) {
        const lista = (reports || []).filter(r => r && r.person);
        const recente = (a, b) => String(b.finalDate || b.beginningDate).localeCompare(String(a.finalDate || a.beginningDate));
        let v = lista.filter(r => r.destinationTeam && /cop encerramento/i.test(r.destinationTeam.name || '') && r.team && !/cop encerramento/i.test(r.team.name || '')).sort(recente)[0];
        if (!v) v = lista.filter(r => r.beginningGeopositionLatitude != null).sort(recente)[0];
        if (!v) return null;
        const time = (v.team && v.team.name) || '';
        const terceira = !!time && !CFG.TIME_CASA.test(time);
        return {
            tecnico: v.person.name,
            time,
            terceira,
            empresa: terceira ? time.replace(/^\s*COP\s+/i, '').trim() : '',
            relato: textoDeHtml(v.description),
            data: String(v.finalDate || v.beginningDate || '').slice(0, 10)
        };
    }

    // ---- Patrimônios: os nomes dos campos são descobertos (não sei todos de antemão) ----
    function achatar(obj, prefixo, out) {
        out = out || {};
        Object.keys(obj || {}).forEach(k => {
            const v = obj[k];
            const nome = prefixo ? prefixo + '.' + k : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) achatar(v, nome, out);
            else out[nome] = v;
        });
        return out;
    }

    const RE_DATA = /^\d{4}-\d{2}-\d{2}/;

    function lerPatrimonio(item) {
        const f = achatar(item);
        const chaves = Object.keys(f);
        const texto = re => {
            const k = chaves.find(c => re.test(c) && typeof f[c] === 'string' && f[c].trim().length > 2);
            return k ? f[k].trim() : '';
        };
        const data = re => {
            const k = chaves.find(c => re.test(c) && typeof f[c] === 'string' && RE_DATA.test(f[c]));
            return k ? f[k].slice(0, 10) : '';
        };
        const titulo = texto(/title|descri|patrimon.*name|product.*name|^name$/i) || texto(/name/i);
        const retorno = data(/return|retorno|devol|remov/i);
        const remessa = data(/remess|send|ship|output|exit|withdraw|delivery|alloc|begin/i) ||
            (() => { const k = chaves.find(c => typeof f[c] === 'string' && RE_DATA.test(f[c]) && !/return|retorno|devol|remov/i.test(c)); return k ? f[k].slice(0, 10) : ''; })();
        const removido = chaves.some(c => /removed|removido/i.test(c) && f[c] === true);
        return { titulo, remessa, retorno, ativo: !retorno && !removido };
    }

    async function buscarPatrimonios(id) {
        const molde = localStorage.getItem('osir_url_patrimonios');
        if (!molde) {
            // ainda não aprendeu: usa o que o ERP já buscou desta OS (se buscou)
            const c = window.__OSIR_API && window.__OSIR_API.patrimonios && window.__OSIR_API.patrimonios[id];
            if (!c) return null;
            const lista = [];
            Object.values(c).forEach(p => { const d = p.json && p.json.response && p.json.response.data; if (Array.isArray(d)) lista.push(...d); });
            return lista;
        }
        const r = await getApi(molde.replace('{ID}', encodeURIComponent(id)));
        return Array.isArray(r && r.data) ? r.data : (Array.isArray(r) ? r : []);
    }

    // Pendências de material criadas a partir desta OS (Solicitações vinculadas > geradas)
    async function buscarPendencias(id) {
        const r = await getApi('/api/v1/Projects/Attendance/GetPagedAssignmentLinks?Page=1&PageSize=50&OrderBy=%5B%5D&assignmentId=' + encodeURIComponent(id));
        const links = (r && r.data) || r || [];
        const pend = links
            .map(l => l && l.assignmentLinked)
            .filter(a => a && CFG.PENDENCIA_TITULO.test(a.title || ''));
        return Promise.all(pend.map(async a => {
            const p = {
                titulo: a.title || '',
                os: String(a.id),
                protocolo: ((a.title || '').match(/Protocolo\s+(\d+)/i) || [])[1] || String(a.id),
                status: a.assignmentIncidents && a.assignmentIncidents.incidentStatus && a.assignmentIncidents.incidentStatus.title || '',
                criada: String(a.beginningDate || '').slice(0, 16).replace('T', ' '),
                patrimonio: '', descricao: ''
            };
            try {
                const info = await getApi('/api/v1/ServiceDesk/AssignmentIncidents/GetSolicitationInformations?assignmentId=' + encodeURIComponent(a.id));
                const txt = textoDeHtml(info && info.assignment && info.assignment.description).replace(/\s+/g, ' ');
                const corte = txt.split(/---\s*Solicita[cç][aã]o Original/i)[0];
                p.textoTodo = corte;
                p.patrimonio = ((corte.match(/SN\/PATRIM[OÔ]NIO a ser desalocado:\s*(.*?)\s*(Descri[cç][aã]o:|Obs\.?:|$)/i) || [])[1] || '').trim();
                p.descricao = ((corte.match(/Descri[cç][aã]o:\s*(.*?)\s*(Obs\.?:|$)/i) || [])[1] || corte).trim();
            } catch (e) { /* sem descrição: segue só com o protocolo */ }
            Object.assign(p, classificarPendencia(p));
            return p;
        }));
    }

    // Pendência fotográfica -> Instalação | material/equipamento -> Material/Equipamento
    function classificarPendencia(p) {
        const tudo = normalizarTexto(p.titulo + ' ' + (p.textoTodo || ''));
        if (/fotogr|\bfotos?\b/.test(tudo) && !/sn\/patrimonio a ser desalocado:\s*\S/.test(tudo)) {
            // itens da lista "• ..." encurtados
            const itens = String(p.textoTodo || '').split(/[•●▪]/).slice(1)
                .map(t => t.replace(/\(.*?\)/g, '').replace(/[*]/g, '').replace(/\s+/g, ' ').trim())
                .map(t => t.split(',')[0].trim())
                .map(t => t.length > 55 ? t.slice(0, 52).replace(/\s+\S*$/, '') + '…' : t)
                .filter(t => t.length > 2);
            const servico = ((p.textoTodo || '').match(/^\s*([^:]{3,25}):\s*Descri/i) || [])[1] || '';
            return {
                tipo: 'Instalação', classe: 'fotográfica',
                resumo: (servico ? servico.trim() + ' — ' : '') + (itens.length ? 'faltam ' + itens.length + ' foto(s): ' + itens.join('; ') : 'pendência fotográfica')
            };
        }
        const desc = [p.patrimonio ? 'SN/Patrimônio: ' + p.patrimonio : '', p.descricao].filter(Boolean).join(' — ');
        return { tipo: 'Material/Equipamento', classe: 'de material', resumo: desc };
    }

    // "Solicitação vinculada criada com sucesso" apareceu? -> rebusca e abre o formulário
    let esperandoPendencia = 0;          // até quando (ms) esperar a pendência nova aparecer
    let ultimoAvisoCriada = 0;
    const pendenciasOferecidas = new Set(JSON.parse(sessionStorage.getItem('osir_pend_oferecidas') || '[]'));
    const pendenciasRegistradas = new Set(JSON.parse(sessionStorage.getItem('osir_pend_registradas') || '[]'));
    document.addEventListener('osir:retrabalho-enviado', ev => {
        try {
            const d = JSON.parse(ev.detail || '{}');
            if (d.pendencia) {
                pendenciasRegistradas.add(String(d.pendencia));
                sessionStorage.setItem('osir_pend_registradas', JSON.stringify([...pendenciasRegistradas]));
            }
        } catch (e) { /* ignora */ }
    });

    function vigiarCriacaoPendencia() {
        if (Date.now() - ultimoAvisoCriada < 8000) return;
        for (const d of documentos()) {
            let achou = false;
            try {
                d.querySelectorAll('[class*="nackbar"], [role="alert"], [class*="toast"], [class*="notistack"]').forEach(el => {
                    if (/vinculada criada com sucesso/i.test(el.textContent || '')) achou = true;
                });
            } catch (e) { /* ignora */ }
            if (achou) {
                ultimoAvisoCriada = Date.now();
                esperandoPendencia = Date.now() + 20000;
                const id = osNaTela();
                if (id) delete conferenciaAPI[id];   // força buscar de novo
                log('Solicitação vinculada criada: procurando pendência nova…');
                return;
            }
        }
    }

    function buscarConferencia(id) {
        if (!CFG.CONFERENCIA_ATIVA || !id) return;
        const api = window.__OSIR_API;
        if (!api || !api.apiBase || !api.headers) return;
        const atual = conferenciaAPI[id];
        if (atual) {
            if (atual.carregando) return;
            const esperando = esperandoPendencia > Date.now();
            if (esperando && atual.dados && Date.now() - atual.quando > 3000) { delete conferenciaAPI[id]; return buscarConferencia(id); }
            if (atual.dados && (atual.dados.patrimonios || Date.now() - atual.quando < 30000)) return;
            if ((atual.tentativas || 0) >= 3) return;
            if (atual.erro && Date.now() - atual.quando < CFG.MATERIAIS_NOVA_TENTATIVA) return;
        }
        const tentativas = (atual && atual.tentativas || 0) + 1;
        conferenciaAPI[id] = Object.assign({}, atual, { quando: Date.now(), carregando: true, tentativas });

        Promise.allSettled([
            getApi('/api/v1/Projects/Attendance/GetAssignmetReports?assignmentId=' + encodeURIComponent(id)),
            getApi('/api/v1/Projects/AssignmentsUploads?assignmentId=' + encodeURIComponent(id) + '&onlyAssigment=true&Page=1&PageSize=100'),
            buscarPatrimonios(id),
            buscarPendencias(id),
            getApi('/api/v1/ServiceDesk/AssignmentIncidents/GetSolicitationInformations?assignmentId=' + encodeURIComponent(id))
        ]).then(([rep, up, pat, pend, info]) => {
            const dados = {
                visita: rep.status === 'fulfilled' ? acharVisita(rep.value && rep.value.reports) : null,
                fotos: up.status === 'fulfilled'
                    ? ((up.value && up.value.data) || up.value || []).filter(x => /^image\//i.test(x.mimetype || '')).length
                    : null,
                patrimonios: pat.status === 'fulfilled' && pat.value ? pat.value.map(lerPatrimonio) : null,
                pendencias: pend.status === 'fulfilled' ? pend.value : null,
                plano: info.status === 'fulfilled' && info.value && info.value.contractServiceTag
                    ? String(info.value.contractServiceTag.title || '').split('**')[0] : '',
                erros: [rep, up, pat, pend].filter(x => x.status === 'rejected').map(x => String(x.reason))
            };
            conferenciaAPI[id] = { quando: Date.now(), tentativas, dados };
            log('Conferência da OS ' + id, dados);
        }).catch(e => {
            conferenciaAPI[id] = { quando: Date.now(), tentativas, erro: String(e) };
        });
    }

    function consumoAtual() {
        const id = osNaTela();
        const d = id && materiaisAPI[id];
        return (d && d.itens) || [];
    }

    // Lê os valores em dBm do relato: "-21,5 dBm", "-27dbm", "sinal -19"
    function lerSinais(relato) {
        const t = normalizarTexto(relato);
        const vals = [];
        for (const m of t.matchAll(/(-\s?\d{1,2}(?:[.,]\d{1,2})?)\s*d\s*b\s*m?\b/g)) vals.push(parseFloat(m[1].replace(/\s/g, '').replace(',', '.')));
        for (const m of t.matchAll(/(?:sinal|potencia|rx)\D{0,12}(-\s?\d{1,2}(?:[.,]\d{1,2})?)(?!\d)/g)) vals.push(parseFloat(m[1].replace(/\s/g, '').replace(',', '.')));
        return [...new Set(vals.filter(v => !isNaN(v) && v < 0 && v > -50))];
    }

    // Sinal FINAL do nosso relato: se tiver mais de um valor (ex.: "inicial -30 / final -23,8"),
    // vale o marcado como final/ficou/atual; senão, o último escrito.
    function lerSinalFinal(relato) {
        const t = normalizarTexto(relato);
        const achados = [];
        const re = /(-\s?\d{1,2}(?:[.,]\d{1,2})?)(?=\s*d\s*b\s*m?\b)|(?:sinal|potencia|rx)\D{0,12}(-\s?\d{1,2}(?:[.,]\d{1,2})?)(?!\d)/g;
        for (const m of t.matchAll(re)) {
            const bruto = m[1] || m[2];
            const v = parseFloat(bruto.replace(/\s/g, '').replace(',', '.'));
            if (isNaN(v) || v >= 0 || v <= -50) continue;
            const pos = m.index + m[0].lastIndexOf(bruto);
            const antes = t.slice(Math.max(0, pos - 30), pos);
            achados.push({ v, pos, final: /(final|ficou|atual|depois|apos|saida)/.test(antes), inicial: /(inicial|antes|entrada|chegada|estava)/.test(antes) });
        }
        if (!achados.length) return null;
        const fin = achados.filter(a => a.final);
        if (fin.length) return fin[fin.length - 1].v;
        const naoIni = achados.filter(a => !a.inicial);
        return (naoIni.length ? naoIni : achados).sort((a, b) => a.pos - b.pos).pop().v;
    }

    // Velocidade do plano em Mb: "Plano Multi 600 x 250" -> 600 | "Plano 1 Gb 1024 x ..." -> 1000
    function velocidadePlano(titulo) {
        // pega o número logo antes do " x " (download x upload); "1GB x 250" -> 1000
        const m = String(titulo || '').match(/(\d+(?:[.,]\d+)?)\s*(gb|giga|mb|mega)?\s*x\s*\d/i);
        if (!m) return 0;
        const v = parseFloat(m[1].replace(',', '.'));
        return /^g/i.test(m[2] || '') ? Math.round(v * 1000) : Math.round(v);
    }

    const RE_TROCA = /\b(troc\w*|troq\w*|substitu\w*)\b[^.\n]{0,40}\b(roteador|onu|ont|equipamento|modem|aparelho|router)\b|\b(roteador|onu|ont|equipamento|modem)\b[^.\n]{0,25}\b(trocad\w*|substitu\w*)/;
    const RE_SO_TROCA = /\b(so|apenas|somente)\b[^.\n]{0,15}\b(troc\w*|troq\w*|substitu\w*)/;
    const RE_CABO = /\b(drop|cabo|fibra|lanc\w*|repass\w*|metragem|metros)\b/;

    function sug(id, tipo, curto, motivo, relato) {
        return { id: 'conf|' + id, tipo, curto, motivo, relato };
    }

    // NOSSO relato (o que o COP escreve no "Relato de Atendimento").
    // Guarda por protocolo: na etapa "Dados Finais" o editor some, mas o valor fica.
    const nossoRelato = {};
    function lerNossoRelato() {
        const doc = docDaOSNaTela();
        const prot = protocoloNaTela();
        if (!doc || !prot) return '';
        // o editor que fica DENTRO do bloco "Relato de Atendimento"
        // (a OS pode ter outro editor antes, ex.: "Demanda do cliente")
        let ed = null;
        const titulo = [...doc.querySelectorAll('p, span, h6, div')]
            .find(e => !e.childElementCount && (e.textContent || '').trim() === 'Relato de Atendimento' && e.offsetParent !== null);
        let bloco = titulo;
        while (bloco && !bloco.querySelector('.ql-editor')) bloco = bloco.parentElement;
        if (bloco) ed = bloco.querySelector('.ql-editor');
        if (!ed) {   // reserva: o último editor visível
            const vis = [...doc.querySelectorAll('.ql-editor')].filter(e => e.offsetParent !== null);
            ed = vis[vis.length - 1] || null;
        }
        if (ed) nossoRelato[prot] = ed.innerText || '';
        return nossoRelato[prot] || '';
    }

    function conferir() {
        if (!CFG.CONFERENCIA_ATIVA || !estadoOS.chave || estadoOS.nivel === 'nada') return [];
        const id = osNaTela();
        if (!id) return [];
        const out = [];

        // 1) Sinal — vale o NOSSO relato (não depende da API, aparece na hora)
        const meu = lerNossoRelato();
        if (meu) {
            const fin = lerSinalFinal(meu);
            const ruins = fin !== null && (fin < CFG.SINAL_MIN || fin > CFG.SINAL_MAX) ? [fin] : [];
            if (ruins.length) {
                const v = ruins.map(fmtNum).join(' / ');
                out.push(sug('sinal', 'Sinal', 'SINAL ' + v + ' dBm',
                    `Sinal no relato de encerramento fora do padrão (${CFG.SINAL_MIN} a ${CFG.SINAL_MAX} dBm): ${v} dBm`,
                    `Sinal fora do padrão no encerramento: ${ruins.map(x => fmtNum(x) + ' dBm').join(', ')} (padrão ${CFG.SINAL_MIN} a ${CFG.SINAL_MAX} dBm).`));
                // a OS precisa estar na tela com a regra de fibra (não em apoio/preventiva)
            }
        }

        try { buscarConferencia(id); } catch (e) { /* ignora */ }
        const c = conferenciaAPI[id];
        if (!c || !c.dados) {
            const antigas = sugestoes.filter(s => s.os === id && s.id !== 'conf|sinal');
            out.forEach(s => { s.os = id; });
            return out.concat(antigas);
        }
        const { visita, fotos, patrimonios } = c.dados;
        const relato = visita ? visita.relato : '';
        const rel = normalizarTexto(relato);
        const tec = visita ? ' (técnico: ' + visita.tecnico + (visita.empresa ? ' · ' + visita.empresa : '') + ')' : '';
        const terceira = !!(visita && visita.terceira);
        if (out.length && visita) out[0].motivo += tec;

        const troca = RE_TROCA.test(rel);
        const novos = patrimonios && visita ? patrimonios.filter(p => p.remessa && p.remessa === visita.data) : null;

        // 2) Troca sem patrimônio novo
        if (troca && novos && novos.length === 0) {
            out.push(sug('trocaSemPat', 'Material/Equipamento', 'TROCA SEM PATRIMÔNIO NOVO',
                `Relato fala em troca de equipamento, mas nenhum patrimônio foi alocado na data da visita (${visita.data.split('-').reverse().join('/')})${tec}`,
                'Relato informa troca de equipamento, mas o equipamento novo não foi alocado na carga do cliente.'));
        }

        // 3) Troca feita, antigo ainda ativo
        if (troca && novos && novos.length) {
            const antigos = patrimonios.filter(p => p.ativo && p.remessa && p.remessa < visita.data);
            if (antigos.length) {
                out.push(sug('antigoAtivo', 'Material/Equipamento', 'ANTIGO AINDA NA CARGA',
                    `Equipamento novo alocado, mas ${antigos.length} antigo(s) continuam na carga: ${antigos.map(a => a.titulo || '?').join('; ')}. Conferir se foi trocado${tec}`,
                    'Equipamento trocado, mas o antigo não foi removido da carga do cliente: ' + antigos.map(a => a.titulo || '?').join('; ') + '.'));
            }
        }

        // 4) "Só troca" com drop no consumo
        if (RE_SO_TROCA.test(rel) && !RE_CABO.test(rel)) {
            const drop = consumoAtual().filter(i => /DROP|CABO OPTICO/.test(normalizarItem(i.produto)) && (i.qtd || 0) > 0);
            if (drop.length) {
                const total = drop.reduce((a, i) => a + (i.qtd || 0), 0);
                out.push(sug('dropSemMotivo', 'Material/Equipamento', 'DROP SEM MOTIVO (' + fmtNum(total) + ' m)',
                    `Relato diz só troca de equipamento, mas tem ${fmtNum(total)} m de cabo drop no consumo${tec}`,
                    `Relato informa apenas troca de equipamento, mas foram lançados ${fmtNum(total)} m de cabo drop no consumo.`));
            }
        }

        // 5) Fotos
        if (CFG.REGRA_FOTOS && fotos !== null && fotos !== undefined) {
            if (fotos === 0) {
                out.push(sug('semFotos', 'Instalação', 'OS SEM FOTOS', 'Nenhuma foto anexada na OS' + tec,
                    'OS encerrada sem fotos anexadas.'));
            } else if (estadoOS.nivel === 'tudo' && fotos < CFG.MIN_FOTOS) {
                out.push(sug('poucasFotos', 'Instalação', 'SÓ ' + fotos + ' FOTO(S)', `Só ${fotos} foto(s) anexada(s). Conferir com o relato se faltou alguma${tec}`,
                    `Faltam fotos obrigatórias: só ${fotos} foto(s) anexada(s).`));
            }
        }

        // 6b) Wi-Fi Pro ENTERPRISE: RB + EAP (não usa roteador)
        const ehEnterprise = estadoOS.itens.some(i => i.id === 'wifiEnterprise');
        if (patrimonios && ehEnterprise && !terceira) {
            const ativos = patrimonios.filter(p => p.ativo);
            const tit = p => normalizarItem(p.titulo + ' ');
            const rbs = ativos.filter(p => /\bRB\s?-?\d{3,4}|MIKROTIK|ROUTERBOARD|\bRB(750|760|4011)/.test(tit(p)));
            const eaps = ativos.filter(p => /\bEAP/.test(tit(p)));
            const mb = velocidadePlano(c.dados.plano);
            if (!rbs.length) {
                out.push(sug('entSemRb', 'Wifi-Pro', 'ENTERPRISE SEM RB',
                    `Wi-Fi Enterprise pedido, mas não tem RB (750/760/4011) na carga${tec}`,
                    'Wi-Fi Enterprise contratado, mas a RB não foi alocada na carga do cliente.'));
            } else if (mb && mb > CFG.ENTERPRISE_LIMITE_MB_RB_PEQUENA && !rbs.some(p => CFG.ENTERPRISE_RB_GIGA.some(g => tit(p).includes(g)))) {
                out.push(sug('entRbFraca', 'Wifi-Pro', `ENTERPRISE: RB FRACA P/ ${mb} MB`,
                    `Plano de ${mb} Mb precisa de RB 4011, mas a carga tem: ${rbs.map(p => p.titulo).join('; ')}${tec}`,
                    `Wi-Fi Enterprise com plano de ${mb} Mb e RB 750/760 (acima de ${CFG.ENTERPRISE_LIMITE_MB_RB_PEQUENA} Mb precisa de RB 4011).`));
            }
            if (!eaps.length) {
                out.push(sug('entSemEap', 'Wifi-Pro', 'ENTERPRISE SEM EAP',
                    `Wi-Fi Enterprise pedido, mas não tem EAP na carga${tec}`,
                    'Wi-Fi Enterprise contratado, mas nenhum EAP foi alocado na carga do cliente.'));
            }
        }

        // 6) Wi-Fi Pro x roteadores na carga (não vale para Enterprise)
        if (patrimonios && !ehEnterprise && !terceira && estadoOS.itens.some(i => i.id === 'wifiPro')) {
            const tem = (p, lista) => lista.some(w => normalizarItem(p.titulo + ' ').includes(normalizarItem(w)));
            const ativos = patrimonios.filter(p => p.ativo);
            const onus = ativos.filter(p => tem(p, CFG.PALAVRAS_ONU) && !tem(p, CFG.PALAVRAS_ROTEADOR));
            const rots = ativos.filter(p => tem(p, CFG.PALAVRAS_ROTEADOR) && !onus.includes(p));
            const onuRot = onus.some(p => tem(p, CFG.PALAVRAS_ONU_ROTEADOR));
            const minimo = onuRot ? CFG.MIN_ROTEADORES_WIFIPRO_ONU_ROT : CFG.MIN_ROTEADORES_WIFIPRO;
            const tipoOnu = onus.length ? (onuRot ? 'ONU roteador' : 'ONU bridge') : 'ONU não identificada';
            if (rots.length < minimo) {
                out.push(sug('wifiProRot', 'Wifi-Pro', `WI-FI PRO: ${rots.length}/${minimo} ROTEADOR(ES)`,
                    `Wi-Fi Pro pedido: ${tipoOnu} (${onus.map(o => o.titulo).join('; ') || '?'}) precisa de ${minimo} roteador(es), a carga tem ${rots.length}${tec}`,
                    `Wi-Fi Pro contratado, mas a carga do cliente tem só ${rots.length} roteador(es) (${tipoOnu}: mínimo ${minimo}).`));
            }
        }

        // 7) Pendência de material aberta = retrabalho do técnico
        (c.dados.pendencias || []).forEach(p => {
            const tipoP = p.tipo || 'Material/Equipamento';
            const classe = p.classe || 'de material';
            const desc = p.resumo || '';
            const s = sug('pend|' + p.protocolo, tipoP, 'PENDÊNCIA ' + classe.toUpperCase() + ' ' + p.protocolo,
                `Pendência ${classe} aberta (protocolo ${p.protocolo}, ${p.status || 'aberta'})${desc ? ': ' + desc : ''}${tec}`,
                `Pendência ${classe} aberta — protocolo ${p.protocolo}.${desc ? ' ' + desc : ''}`);
            s.pendencia = p.protocolo;
            if (pendenciasRegistradas.has(p.protocolo)) return;   // já foi para a planilha
            out.push(s);

            // Acabou de criar? abre o formulário sozinho (uma vez por pendência)
            const chave = id + '|' + p.protocolo;
            if (CFG.PENDENCIA_AO_CRIAR && esperandoPendencia > Date.now() && !pendenciasOferecidas.has(chave) && retrabalhoDisponivel()) {
                pendenciasOferecidas.add(chave);
                try { sessionStorage.setItem('osir_pend_oferecidas', JSON.stringify([...pendenciasOferecidas])); } catch (e) { /* ignora */ }
                esperandoPendencia = 0;
                const motivo = 'Você acabou de abrir a pendência ' + classe + ' ' + p.protocolo + '. Pendência conta como Retrabalho Técnico (' + tipoP + ').';
                if (CFG.PENDENCIA_AO_CRIAR === 'auto') setTimeout(() => registrarAutomatico(s.tipo, s.relato, motivo, p.protocolo), 300);
                else setTimeout(() => pedirRetrabalho(s.tipo, s.relato, motivo, 'pendencia', p.protocolo), 300);
            }
        });
        // as que já existiam ao abrir a OS não abrem o formulário sozinhas
        if (esperandoPendencia === 0 || esperandoPendencia < Date.now()) {
            (c.dados.pendencias || []).forEach(p => pendenciasOferecidas.add(id + '|' + p.protocolo));
        }

        out.forEach(s => { s.os = id; });
        return out;
    }

    // Botão de retrabalho de um aviso de serviço / estoque / sugestão
    function retrabalhoDeServico(i) {
        if (i.semRt) return null;
        const tipo = CFG.TIPO_POR_AVISO[i.id];
        if (!tipo) return null;
        if (i.terceira) {
            return {
                tipo,
                relato: `OS enviada para terceirizada (${i.terceira}) com ${NOME_SERVICO[i.id]} no pedido. A terceira não faz esse serviço: precisa de retorno com técnico da casa.`,
                motivo: `${NOME_SERVICO[i.id]} com terceirizada (${i.terceira}): conta como Retrabalho Relacionamento, não do técnico`
            };
        }
        const RELATOS = {
            wifiPro: 'Wi-Fi Pro contratado, mas não foi instalado (mesh não feito).',
            wifiEnterprise: 'Wi-Fi Enterprise não instalado conforme o pedido (ONU > RB > EAPs).',
            osirFone: 'Telefonia fixa contratada, mas não foi instalada.',
            osirMovel: 'Chip Osirmóvel não entregue ao cliente' + (/(\d+) CHIPS/.test(i.curto) ? ' (' + i.curto.match(/(\d+) CHIPS/)[1] + ' chips no pedido).' : '.')
        };
        return { tipo, relato: RELATOS[i.id] || i.label, motivo: i.label };
    }
    function retrabalhoDeEstoque(e) {
        return { tipo: CFG.TIPO_POR_AVISO.estoque, relato: `${e.titulo} "${e.item}" — ${e.motivo}`, motivo: `${e.titulo} ${e.item}` };
    }

    // ============ PENDÊNCIAS (só para a trava) ============
    // Erros e limites de estoque SEMPRE contam (mesmo fechados no ✕).
    // Avisos (duplicado, zerado) param de contar quando fechados.
    // Serviços só contam se TRAVA_SERVICOS = true.
    // Cada pendência: { texto, ret } — ret = dados para o formulário de retrabalho (ou null)
    function listarPendencias() {
        const p = [];
        if (CFG.TRAVA_SERVICOS) estadoOS.itens.forEach(i => { const r = retrabalhoDeServico(i); if (!(r && jaRegistrado(r.tipo))) p.push({ texto: i.label, ret: r, origem: 'aviso' }); });
        estoque
            .filter(e => e.tipo !== 'aviso' || !dispensados.has(e.chave))
            .filter(e => !(e.tipo === 'aviso' && jaRegistrado(CFG.TIPO_POR_AVISO.estoque)))
            .forEach(e => p.push({ texto: `${e.titulo} ${e.item}`, ret: retrabalhoDeEstoque(e), origem: 'aviso' }));
        if (CFG.TRAVA_SUGESTOES) {
            sugestoesVisiveis().forEach(s => p.push({ texto: '🔎 ' + s.motivo, ret: { tipo: s.tipo, relato: s.relato, motivo: s.motivo, pendencia: s.pendencia }, origem: s.pendencia ? 'pendencia' : 'regra' }));
        }
        return p;
    }

    function sugestoesVisiveis() {
        return sugestoes.filter(s => !sugestoesFechadas.has(s.os + '|' + s.id));
    }

    // Clique no botão 📝 de um aviso
    function acaoRetrabalho(ref) {
        const [tipo, ...resto] = String(ref || '').split('|');
        const id = resto.join('|');
        if (tipo === 'srv') {
            const i = estadoOS.itens.find(x => x.id === id);
            const r = i && retrabalhoDeServico(i);
            if (r) pedirRetrabalho(r.tipo, r.relato, r.motivo, 'aviso');
        } else if (tipo === 'est') {
            const e = estoque.find(x => x.chave === id);
            if (e) { const r = retrabalhoDeEstoque(e); pedirRetrabalho(r.tipo, r.relato, r.motivo, 'aviso'); }
        } else if (tipo === 'sug') {
            const sg = sugestoes.find(x => x.id === id);
            if (sg) pedirRetrabalho(sg.tipo, sg.relato, sg.motivo, sg.pendencia ? 'pendencia' : 'regra', sg.pendencia);
        }
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
    const CORES_SUG = { fundo: '#e0f2f1', texto: '#004d40', borda: '#00897b' };

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
        .tm-rt{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:5px;background:#f6b706;color:#1c2064;
            font-size:11px;font-weight:700;cursor:pointer;text-transform:none}
        .tm-rt:hover{background:#ffc72b}
        .tm-rt-topo{margin-left:6px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,.25);cursor:pointer}
        .tm-rt-topo:hover{background:rgba(255,255,255,.45)}
        .tm-card .tm-motivo{font-weight:400;font-size:11.5px;color:#263238}
        #tm-trava-fundo{position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-family:Roboto,Arial,sans-serif}
        #tm-trava{background:#fff;color:#222;border-radius:10px;width:560px;max-width:95vw;max-height:85vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4)}
        #tm-trava h3{margin:0;padding:16px 20px;border-bottom:1px solid #eee;font-size:16px;color:#c62828}
        #tm-trava ul{margin:0;padding:14px 20px 4px 38px;font-size:13px;line-height:1.5}
        #tm-trava li{margin-bottom:6px}
        #tm-trava .tm-li-rt{margin-left:6px;font-size:11px;color:#1c2064;background:#f6b706;border-radius:4px;padding:1px 6px;cursor:pointer;white-space:nowrap}
        #tm-trava .tm-rodape{display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid #eee;flex-wrap:wrap}
        #tm-trava button{padding:9px 14px;border-radius:6px;border:none;font:700 13px Roboto,Arial,sans-serif;cursor:pointer}
        #tm-trava .tm-b-voltar{background:#eee;color:#333}
        #tm-trava .tm-b-rt{background:#f6b706;color:#1c2064}
        #tm-trava .tm-b-seguir{background:#c62828;color:#fff}
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
            if (c.dataset.acao === 'retrabalho') { ev.stopPropagation(); acaoRetrabalho(c.dataset.ref); return; }
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
            if (x.dataset.acao === 'retrabalho') { acaoRetrabalho(x.dataset.ref); return; }
            if (x.dataset.acao === 'fechar-sug') sugestoesFechadas.add(x.dataset.id);
            if (x.dataset.acao === 'fechar-alerta') alertasFechados.add(x.dataset.id);
            if (x.dataset.acao === 'fechar-estoque') dispensados.add(x.dataset.id);
            assinatura = '';
            render();
        };
        boxAlertas.addEventListener('click', aoFechar);
        boxAuditor.addEventListener('click', aoFechar);
    }

    function botaoRt(ref, noTopo) {
        if (!ref || !retrabalhoDisponivel()) return '';
        return `<span class="${noTopo ? 'tm-rt-topo' : 'tm-rt'}" data-acao="retrabalho" data-ref="${escaparHtml(ref)}" title="Registrar retrabalho (abre o formulário preenchido)">📝${noTopo ? '' : ' RETRABALHO'}</span>`;
    }

    function cartao(cores, conteudo, acao, id, maiusculo, refRt) {
        const x = acao ? `<span class="tm-x" data-acao="${acao}" data-id="${escaparHtml(id)}" title="Fechar">✕</span>` : '';
        return `<div class="tm-card" style="background:${cores.fundo};color:${cores.texto};border-color:${cores.borda};${maiusculo ? 'text-transform:uppercase;' : ''}">
            ${x}<div class="tm-txt">${conteudo}</div>${botaoRt(refRt)}</div>`;
    }

    function render() {
        const topo = espacoNoTopo();
        const alertas = estadoOS.itens.filter(i => !alertasFechados.has(i.id));
        const visiveis = estoque.filter(e => !dispensados.has(e.chave));
        const mostrarOk = CFG.MOSTRAR_ESTOQUE_OK && !estoque.length && !!fonteEstoque;

        const sugs = sugestoesVisiveis();
        const sig = JSON.stringify([!!topo, alertas.map(i => i.id), visiveis.map(e => e.chave), mostrarOk ? qtdItensEstoque : -1,
            sugs.map(x => x.id + x.curto), retrabalhoDisponivel()]);
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
                    `${e.titulo} "${e.item}" — ${e.motivo} (clique para esconder; 📝 = registrar retrabalho)`, 'fechar-estoque', e.chave, 'est|' + e.chave));
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
                    'fechar-estoque', e.chave, false, 'est|' + e.chave)
            ).join('');
            if (mostrarOk) {
                h += cartao(CORES_ESTOQUE.ok, `✔ ${qtdItensEstoque} ${qtdItensEstoque === 1 ? 'item lançado' : 'itens lançados'}, nenhum problema`);
            }
            boxAuditor.innerHTML = h;
        }

        // ----- Serviços -----
        if (servNoTopo) {
            alertas.forEach(i => etiquetas.push(etiqueta(i.texto, i.icone, i.curto || i.label,
                `${i.label} — clique para esconder`, 'fechar-alerta', i.id, CFG.TIPO_POR_AVISO[i.id] && !i.semRt ? 'srv|' + i.id : '')));
            boxAlertas.innerHTML = '';
        } else {
            boxAlertas.innerHTML = alertas.map(i =>
                cartao(i, `${i.icone} ${escaparHtml(i.label)}`, 'fechar-alerta', i.id, true, CFG.TIPO_POR_AVISO[i.id] && !i.semRt ? 'srv|' + i.id : '')
            ).join('');
        }

        // ----- Sugestões da conferência (sempre no canto) -----
        boxAlertas.insertAdjacentHTML('beforeend', sugs.map(x =>
            cartao(CORES_SUG, `🔎 ${escaparHtml(x.curto)}<br><span class="tm-motivo">${escaparHtml(x.motivo)}</span>`,
                'fechar-sug', x.os + '|' + x.id, false, 'sug|' + x.id)
        ).join(''));

        if (topo) topo.innerHTML = etiquetas.join('');
    }

    // Etiqueta da barra azul (mesmo tamanho do botão Registrar Retrabalho)
    function etiqueta(cor, icone, texto, dica, acao, id, refRt) {
        const a = acao ? ` data-acao="${acao}" data-id="${escaparHtml(id)}"` : '';
        return `<div class="tm-chip" style="background:${cor}" title="${escaparHtml(dica)}"${a}>${icone} <span>${escaparHtml(texto)}</span>${botaoRt(refRt, true)}</div>`;
    }

    // Na hora da trava: reabre os erros fechados e faz os cartões piscarem
    function piscarCartoes() {
        estoque.forEach(e => { if (e.tipo !== 'aviso') dispensados.delete(e.chave); });
        if (CFG.TRAVA_SERVICOS) alertasFechados._s().clear();
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

        if (liberados.has(protocoloNaTela())) return;   // já decidiu nesta OS

        const pend = listarPendencias();
        if (!pend.length) return;

        ev.preventDefault();
        ev.stopImmediatePropagation();
        ev.stopPropagation();
        piscarCartoes();
        abrirTrava(pend, btn);
    }

    // ---- Janela da trava: Voltar | Registrar retrabalho | Finalizar mesmo assim ----
    const liberados = new Set();   // protocolos em que a pessoa já registrou ou escolheu "finalizar mesmo assim"

    document.addEventListener('osir:retrabalho-enviado', () => {
        // registrou retrabalho: a próxima tentativa de finalizar desta OS passa direto
        const p = protocoloNaTela();
        if (p) liberados.add(p);
    });

    function fecharTrava() {
        const f = document.getElementById('tm-trava-fundo');
        if (f) f.remove();
    }

    function abrirTrava(pend, btnOriginal) {
        fecharTrava();
        const comRt = pend.filter(p => p.ret);
        const podeRt = retrabalhoDisponivel() && comRt.length > 0;
        const fundo = document.createElement('div');
        fundo.id = 'tm-trava-fundo';
        fundo.innerHTML = `<div id="tm-trava">
            <h3>⚠️ Esta OS tem ${pend.length} problema(s)</h3>
            <ul>${pend.map((p, i) => `<li>${escaparHtml(p.texto)}${podeRt && p.ret ? ` <span class="tm-li-rt" data-i="${i}">📝 registrar</span>` : ''}</li>`).join('')}</ul>
            <div class="tm-rodape">
                <button class="tm-b-voltar" type="button">Voltar e corrigir</button>
                ${podeRt ? `<button class="tm-b-rt" type="button">📝 Registrar retrabalho</button>` : ''}
                <button class="tm-b-seguir" type="button">Finalizar mesmo assim</button>
            </div></div>`;
        document.body.appendChild(fundo);

        const registrar = p => {
            fecharTrava();
            pedirRetrabalho(p.ret.tipo, p.ret.relato, p.ret.motivo, p.origem || 'aviso', p.ret.pendencia);
        };
        fundo.querySelector('.tm-b-voltar').onclick = fecharTrava;
        const bRt = fundo.querySelector('.tm-b-rt');
        if (bRt) bRt.onclick = () => registrar(comRt[0]);
        fundo.querySelectorAll('.tm-li-rt').forEach(el => { el.onclick = () => registrar(pend[+el.dataset.i]); });
        fundo.querySelector('.tm-b-seguir').onclick = () => {
            log('Usuário continuou com pendências:', pend.map(p => p.texto));
            const p = protocoloNaTela();
            if (p) liberados.add(p);
            fecharTrava();
            try { btnOriginal.click(); } catch (e) { /* ignora */ }
        };
        fundo.addEventListener('click', ev => { if (ev.target === fundo) fecharTrava(); });
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

    // ============ ESCONDER CARTÕES COM PAINEL LATERAL ABERTO ============
    // Painéis do ERP (Anexos, Solicitações Vinculadas, Dados Gerais...) abrem pela direita.
    function painelLateralAberto() {
        const doc = docDaOSNaTela();
        if (!doc) return false;
        const win = doc.defaultView;
        const W = win.innerWidth, H = win.innerHeight;
        const ehPainel = el => {
            if (!el || el.offsetParent === null && win.getComputedStyle(el).position !== 'fixed') return false;
            const r = el.getBoundingClientRect();
            return r.width > 280 && r.width < W * 0.9 && r.left > W * 0.15 && r.right >= W - 40 && r.height > H * 0.6;
        };
        try {
            for (const el of doc.querySelectorAll('.MuiDrawer-paper, [class*="drawer" i], [class*="side-panel" i], [class*="sidepanel" i]')) {
                if (ehPainel(el)) return true;
            }
            // cabeçalho "Ações da Solicitação" / "Ações de Atendimento" do lado direito
            for (const el of doc.querySelectorAll('p, span, h4, h5, h6')) {
                if (el.childElementCount) continue;
                const t = (el.textContent || '').trim();
                if (!/^A[cç][oõ]es d[ae] (Solicita[cç][aã]o|Atendimento)$/i.test(t)) continue;
                const r = el.getBoundingClientRect();
                if (r.width && r.left > W * 0.25 && r.top < H * 0.2) return true;
            }
        } catch (e) { /* ignora */ }
        return false;
    }

    let painelAberto = false;
    function aplicarPainel() {
        if (!CFG.ESCONDER_COM_PAINEL) return;
        const aberto = painelLateralAberto();
        if (aberto === painelAberto) return;
        painelAberto = aberto;
        [boxAlertas, boxAuditor].forEach(b => { if (b) b.style.display = aberto ? 'none' : ''; });
    }

    // Se o NOSSO relato já diz que o serviço foi feito ("OsirMóvel: [X] Sim"), o aviso some
    const SERVICO_NO_RELATO = {
        osirMovel: /(osir\s*m[oa]vel|chips?)\W{0,6}[\(\[]\s*x\s*[\)\]]\s*sim/,
        wifiPro: /(wi\W?fi\W?pro)\W{0,6}[\(\[]\s*x\s*[\)\]]\s*sim/,
        osirFone: /(osir\s*fone|telefon\w*)\W{0,6}[\(\[]\s*x\s*[\)\]]\s*sim/,
        wifiEnterprise: /(enterprise)\W{0,6}[\(\[]\s*x\s*[\)\]]\s*sim/
    };
    function servicosConfirmadosNoRelato() {
        const t = normalizarTexto(lerNossoRelato());
        return Object.keys(SERVICO_NO_RELATO).filter(k => SERVICO_NO_RELATO[k].test(t));
    }
    function visitaAtual() {
        const c = conferenciaAPI[osNaTela()];
        return c && c.dados && c.dados.visita;
    }
    const NOME_SERVICO = { wifiPro: 'WI-FI PRO', wifiEnterprise: 'WI-FI ENTERPRISE', osirMovel: 'CHIP', osirFone: 'TELEFONIA' };
    function aplicarRelatoNosServicos() {
        if (!estadoOS.itensBrutos) return;
        const ok = servicosConfirmadosNoRelato();
        const v = visitaAtual();
        estadoOS.itens = estadoOS.itensBrutos.filter(i => ok.indexOf(i.id) === -1).map(i => {
            if (!(v && v.terceira && CFG.SERVICOS_QUE_TERCEIRA_NAO_FAZ.indexOf(i.id) !== -1)) return i;
            // terceirizada não faz: abrir RETORNO para a casa; o retrabalho é de RELACIONAMENTO
            // (quem mandou a OS para a terceira sem ver o serviço)
            return Object.assign({}, i, {
                terceira: v.empresa || 'TERCEIRIZADA',
                curto: `${NOME_SERVICO[i.id]}: ABRIR RETORNO`,
                label: `${NOME_SERVICO[i.id]}: ${v.empresa || 'TERCEIRIZADA'} NÃO FAZ — ABRIR RETORNO PARA TÉCNICO DA CASA (conta como Relacionamento)`
            });
        });
    }

    // Já registrado (protocolo|tipo) pelo Projeto Retrabalho nesta aba -> não sugere de novo
    function jaRegistrado(tipo) {
        try {
            const l = JSON.parse(sessionStorage.getItem('rt_enviados_v2') || '[]');
            return l.indexOf(protocoloNaTela() + '|' + tipo) !== -1;
        } catch (e) { return false; }
    }

    // ============ CICLO PRINCIPAL ============
    function ciclo() {
        if (document.hidden) return;
        try { lerServicos(); } catch (e) { console.error('Erro serviços:', e); }
        try { estoque = auditar(); } catch (e) { console.error('Erro auditoria:', e); }
        try { aplicarRelatoNosServicos(); } catch (e) { /* ignora */ }
        try { vigiarCriacaoPendencia(); } catch (e) { /* ignora */ }
        try { sugestoes = conferir().filter(x => x.pendencia || !jaRegistrado(x.tipo)); } catch (e) { console.error('Erro conferência:', e); }

        try { instalarTrava(); } catch (e) { /* ignora */ }
        try { esconderBotao(); } catch (e) { /* ignora */ }
        render();
        try { aplicarPainel(); } catch (e) { /* ignora */ }
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
        pendencias: () => listarPendencias().map(p => p.texto),
        get sugestoes() { return sugestoes.map(x => ({ tipo: x.tipo, curto: x.curto, motivo: x.motivo })); },
        // Mostra o que a conferência leu desta OS (técnico, fotos, patrimônios)
        conferencia() {
            const id = osNaTela();
            return {
                os: id || '(ainda não sei)',
                retrabalhoLigado: retrabalhoDisponivel(),
                moldePatrimonios: localStorage.getItem('osir_url_patrimonios') ? 'aprendido' : 'NÃO: abra Produtos e Serviços > Patrimônios Alocados uma vez',
                dados: id ? conferenciaAPI[id] || '(ainda não buscou)' : null
            };
        },
        // Mostra os campos crus do 1º patrimônio (para ajustar a leitura se precisar)
        patrimonioCru() {
            const c = window.__OSIR_API && window.__OSIR_API.patrimonios;
            const p = c && Object.values(c)[0];
            const pag = p && Object.values(p)[0];
            const d = pag && pag.json && pag.json.response && pag.json.response.data;
            return d && d[0] ? achatar(d[0]) : 'Abra Produtos e Serviços > Patrimônios Alocados primeiro.';
        },
        testarSinal: lerSinalFinal,
        velocidadePlano,
        get nossoRelato() { return lerNossoRelato(); },
        painel: () => painelLateralAberto(),
        classificarPendencia,
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
