// ==UserScript==
// @name         Assistente de Cadastro Tatelecom
// @namespace    https://github.com/AlissonGuerreiro/meus-scripts
// @version      2.0.0
// @description  Copia dados do ERP, preenche automaticamente no Tatelecom e gera máscara de portabilidade
// @author       Alisson Guerreiro
// @match        https://erp.osirnet.com.br/*
// @match        http://sistema.tatelecom.com.br/*
// @match        https://sistema.tatelecom.com.br/*
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// @homepage     https://github.com/AlissonGuerreiro/meus-scripts
// @supportURL   https://github.com/AlissonGuerreiro/meus-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Assistente-Cadastro-Tatelecom.user.js
// @updateURL    https://raw.githubusercontent.com/AlissonGuerreiro/meus-scripts/main/Assistente-Cadastro-Tatelecom.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============ CONFIG ============
    const CFG = {
        DELAY_INICIAL: 300,
        DELAY_CAMPO: 300,
        DELAY_CEP: 500,
        DELAY_ENDERECO: 200,
        DELAY_TELEFONE: 400,
        DELAY_FINAL: 3500
    };

    const isERP = location.href.includes('erp.osirnet.com.br');
    const isTatelecom = location.href.includes('sistema.tatelecom.com.br');
    const isHistorico = location.href.includes('/historico-consumo/');

    // ============ UTILITÁRIOS ============
    function log(msg, tipo = 'info') {
        const emojis = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        console.log(`${emojis[tipo] || 'ℹ️'} ${msg}`);
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    function getEl(id) { return document.getElementById(id); }

    function feedbackBotao(btn, sucesso, msg) {
        if (!btn) return;
        const original = btn.textContent;
        const originalBg = btn.style.backgroundColor;
        btn.textContent = (sucesso ? '✅ ' : '❌ ') + msg;
        btn.style.backgroundColor = sucesso ? '#2e7d32' : '#c62828';
        btn.style.color = '#fff';
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = original;
            btn.style.backgroundColor = originalBg || '';
            btn.style.color = '';
            btn.disabled = false;
        }, 1500);
    }

    // ============ MODAL ERP ============
    function isModalCliente() {
        const modal = document.querySelector('.MuiDialog-container');
        if (!modal) return false;
        const titulo = modal.querySelector('.MuiTypography-root[class*="MuiTypography-h6"]');
        return titulo && titulo.textContent.includes('Informações -');
    }

    // ============ EXTRAIR DADOS ERP ============
    function extrairDadosERP() {
        const modal = document.querySelector('.MuiDialog-container');
        if (!modal) { log('Modal não encontrado!', 'error'); return null; }

        try {
            const dados = { nome: '', documento: '', endereco: '', cep: '', dataNascimento: '', email: '', celular: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '' };

            const titulo = modal.querySelector('.MuiTypography-root[class*="MuiTypography-h6"]');
            if (titulo) {
                const match = titulo.textContent.match(/Informações - (.+)/);
                dados.nome = match ? match[1].trim() : titulo.textContent.replace('Informações - ', '').trim();
            }

            function getValor(labelText) {
                const labels = modal.querySelectorAll('[class*="MuiTypography-subtitle1"]');
                for (let label of labels) {
                    if (label.textContent.trim().includes(labelText)) {
                        const parent = label.closest('.MuiGrid-root');
                        if (parent) {
                            const value = parent.querySelector('[class*="MuiTypography-body1"]');
                            if (value) return value.textContent.trim();
                        }
                        break;
                    }
                }
                return '';
            }

            function getEndereco() {
                const labels = modal.querySelectorAll('[class*="MuiTypography-subtitle1"]');
                for (let label of labels) {
                    if (label.textContent.trim().includes('Endereço:')) {
                        const parent = label.closest('.MuiGrid-root');
                        if (parent) {
                            const div = parent.querySelector('[class*="MuiTypography-body1"]');
                            if (div) {
                                const spans = div.querySelectorAll('span');
                                if (spans.length >= 2) {
                                    return { endereco: spans[0]?.textContent.trim() || '', cep: spans[1]?.textContent.trim() || '' };
                                }
                                const texto = div.textContent.trim();
                                const cepMatch = texto.match(/\d{5}-\d{3}/);
                                return { endereco: texto.replace(/\d{5}-\d{3}/, '').trim(), cep: cepMatch ? cepMatch[0] : '' };
                            }
                        }
                        break;
                    }
                }
                return { endereco: '', cep: '' };
            }

            dados.documento = getValor('Nº do documento');
            dados.dataNascimento = getValor('Data de Nascimento:');
            dados.email = getValor('Email:');
            dados.celular = getValor('Celular:');

            const endInfo = getEndereco();
            dados.endereco = endInfo.endereco;
            dados.cep = endInfo.cep;

            // Fatiar endereço
            if (dados.endereco) {
                const partes = fatiarEndereco(dados.endereco);
                Object.assign(dados, partes);
            }

            log(`Dados capturados: ${dados.nome}`, 'success');
            return dados;
        } catch (e) {
            console.error('Erro na extração:', e);
            log('Erro ao extrair dados', 'error');
            return null;
        }
    }

    // ============ FATIAR ENDEREÇO ============
    function fatiarEndereco(endereco) {
        const r = { logradouro: '', numero: '', bairro: '', cidade: '', uf: '' };
        if (!endereco) return r;

        try {
            const semCep = endereco.replace(/\d{5}-\d{3}/, '').trim();
            const partes = semCep.split(',').map(p => p.trim()).filter(p => p);

            if (partes.length >= 1) {
                const primeira = partes[0];
                const numMatch = primeira.match(/\s(\d+)$/);
                if (numMatch) {
                    r.numero = numMatch[1];
                    r.logradouro = primeira.replace(/\s\d+$/, '').trim();
                } else {
                    const n = primeira.match(/\d+/);
                    if (n) { r.numero = n[0]; r.logradouro = primeira.replace(n[0], '').trim(); }
                    else r.logradouro = primeira;
                }
            }

            if (partes.length >= 2) {
                const segunda = partes[1].trim();
                r.bairro = segunda.replace(/\s*-\s*[A-Za-zçãõáéíóúâêîôûàèìòù\s]+\s*[A-Z]{2}$/, '')
                    .replace(/\s*-\s*[A-Za-z\s]+$/, '').trim() || segunda;
            }

            if (partes.length >= 3) {
                const cidadeUf = partes[2].trim();
                const ufMatch = cidadeUf.match(/\b([A-Z]{2})$/);
                if (ufMatch) { r.uf = ufMatch[1]; r.cidade = cidadeUf.replace(/\s*[A-Z]{2}$/, '').trim(); }
                else r.cidade = cidadeUf;
            } else if (partes.length === 2) {
                const segunda = partes[1].trim();
                const ufMatch = segunda.match(/\b([A-Z]{2})$/);
                if (ufMatch) {
                    r.uf = ufMatch[1];
                    const cb = segunda.replace(/\s*[A-Z]{2}$/, '').trim().split('-').map(p => p.trim());
                    if (cb.length >= 2) { r.bairro = cb[0]; r.cidade = cb[1]; }
                    else r.cidade = segunda;
                }
            }

            if (r.bairro) {
                r.bairro = r.bairro.replace(/\s*-\s*[A-Za-zçãõáéíóúâêîôûàèìòù\s]+\s*$/, '')
                    .replace(/\s*[A-Z]{2}$/, '').trim();
            }
        } catch (e) { console.error('Erro ao fatiar endereço:', e); }
        return r;
    }

    // ============ COPIAR DADOS ERP ============
    function copiarDadosCliente() {
        const btn = getEl('btn-copiar-erp');
        const dados = extrairDadosERP();
        if (dados?.nome) {
            GM_setValue('dados_cliente_erp', JSON.stringify(dados));
            feedbackBotao(btn, true, 'Copiado!');
            log('Dados salvos!', 'success');
        } else {
            feedbackBotao(btn, false, 'Falhou!');
        }
    }

    // ============ FORÇAR INPUT LIVEWIRE ============
    function forcarInput(el, valor, campo) {
        if (!el) return false;
        try {
            let v = valor;
            if (campo?.toLowerCase().includes('cpf') && valor.length === 11) {
                v = valor.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            }
            if (campo?.toLowerCase().includes('telefone') && valor.length === 11) {
                v = valor.replace(/(\d{2})(\d{5})(\d{4})/, '($1)$2-$3');
            }

            el.focus();
            el.value = v;
            ['input', 'change', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true, cancelable: true })));

            const component = el.closest('[wire\\:id]');
            if (component && window.Livewire) {
                try {
                    const wireId = component.getAttribute('wire:id');
                    const lw = window.Livewire.find(wireId);
                    if (lw) {
                        const model = el.getAttribute('wire:model') || el.getAttribute('wire:model.defer') || el.getAttribute('wire:model.live');
                        if (model) lw.set(model, v, true);
                    }
                } catch (e) {}
            }

            setTimeout(() => {
                if (el.value !== v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
            }, 100);
            return true;
        } catch (e) { console.error(`Erro ao preencher ${campo}:`, e); return false; }
    }

    // ============ PREENCHER CPF ============
    function preencherCpf() {
        const btn = getEl('btn-preenche-cpf');
        const dados = JSON.parse(GM_getValue('dados_cliente_erp') || '{}');
        if (!dados.documento) {
            feedbackBotao(btn, false, 'Sem CPF');
            log('Capture os dados no ERP primeiro!', 'error');
            return;
        }
        const el = document.querySelector('#input_cpf, input[wire\\:model*="cpf"], input[name*="cpf"], input[placeholder*="CPF"]');
        if (el) {
            forcarInput(el, dados.documento, 'CPF');
            feedbackBotao(btn, true, 'CPF Colado!');
        } else {
            feedbackBotao(btn, false, 'Campo não encontrado');
        }
    }

    // ============ PREENCHER TUDO ============
    function preencherTudo() {
        const btn = getEl('btn-auto-tudo');
        const dados = JSON.parse(GM_getValue('dados_cliente_erp') || '{}');
        if (!dados.nome) {
            feedbackBotao(btn, false, 'Sem dados');
            log('Capture os dados no ERP primeiro!', 'error');
            return;
        }

        log('Iniciando preenchimento...', 'info');
        btn.disabled = true;
        let d = 0;

        setTimeout(() => {
            const el = document.querySelector('#input_nome, input[wire\\:model*="nome"], input[name*="nome"]');
            if (el) forcarInput(el, dados.nome, 'Nome');
        }, d);
        d += CFG.DELAY_CAMPO;

        if (dados.dataNascimento) {
            setTimeout(() => {
                const el = document.querySelector('#input_dt_nascimento, input[wire\\:model*="nascimento"], input[name*="nascimento"]');
                if (el) forcarInput(el, dados.dataNascimento, 'Data Nasc.');
            }, d);
            d += CFG.DELAY_CAMPO;
        }

        if (dados.email) {
            setTimeout(() => {
                const el = document.querySelector('#input_email, input[wire\\:model*="email"], input[name*="email"]');
                if (el) forcarInput(el, dados.email, 'Email');
            }, d);
            d += CFG.DELAY_CAMPO;
        }

        setTimeout(() => {
            const el = document.querySelector('#input_nome_mae, input[wire\\:model*="mae"], input[name*="mae"]');
            if (el) forcarInput(el, 'XXXX', 'Nome da Mãe');
        }, d);
        d += CFG.DELAY_CAMPO;

        setTimeout(() => {
            const tab = document.querySelector('a[href="#primaryhome"]');
            if (tab) tab.click();
            setTimeout(() => {
                if (dados.celular) {
                    const tel = document.querySelector('input[wire\\:model="telefones.0.numero"], input[name*="telefone"], input[type="tel"]');
                    if (tel) {
                        const limpo = dados.celular.replace(/\D/g, '');
                        forcarInput(tel, limpo, 'Telefone');
                        setTimeout(() => {
                            const sel = document.querySelector('select[wire\\:model="telefones.0.tipo"], select[name*="tipo_telefone"]');
                            if (sel) {
                                const opts = sel.querySelectorAll('option');
                                for (let opt of opts) {
                                    if (opt.textContent.toLowerCase().includes('celular') || opt.textContent.toLowerCase().includes('whatsapp')) {
                                        forcarInput(sel, opt.value, 'Tipo');
                                        break;
                                    }
                                }
                            }
                        }, CFG.DELAY_TELEFONE);
                    }
                }
            }, CFG.DELAY_TELEFONE);
        }, d);
        d += CFG.DELAY_TELEFONE + CFG.DELAY_CEP;

        if (dados.cep) {
            setTimeout(() => {
                const tab = document.querySelector('a[href="#primaryprofile"]');
                if (tab) {
                    tab.click();
                    setTimeout(() => executarEndereco(dados, 0), CFG.DELAY_ENDERECO);
                } else {
                    executarEndereco(dados, 0);
                }
            }, d);
        }

        setTimeout(() => {
            btn.disabled = false;
            feedbackBotao(btn, true, 'Pronto!');
            log('Preenchimento concluído!', 'success');
        }, d + CFG.DELAY_FINAL);
    }

    // ============ EXECUTAR ENDEREÇO ============
    function executarEndereco(dados, idx) {
        const cep = document.querySelector(`input[wire\\:model="enderecos.${idx}.cep"], input[name*="cep"], input[placeholder*="CEP"]`);
        if (cep && dados.cep) {
            const limpo = dados.cep.replace(/\D/g, '');
            forcarInput(cep, limpo, 'CEP');
            setTimeout(() => {
                let btn = document.querySelector(`button[wire\\:click*="busca_cep"]`);
                if (!btn) {
                    const botoes = document.querySelectorAll('button');
                    for (let b of botoes) {
                        if (b.textContent.trim().toLowerCase().includes('busca') || b.textContent.trim().toLowerCase().includes('consultar')) {
                            btn = b; break;
                        }
                    }
                }
                if (btn) btn.click();
            }, CFG.DELAY_CEP);
        }

        const campos = [
            { chave: 'logradouro', delay: 1000 },
            { chave: 'numero', delay: 1200 },
            { chave: 'bairro', delay: 1400 },
            { chave: 'cidade', delay: 1600, select: true },
            { chave: 'uf', delay: 1800, select: true }
        ];

        campos.forEach(({ chave, delay: d, select }) => {
            if (dados[chave]) {
                setTimeout(() => {
                    let el;
                    if (select) {
                        el = document.querySelector(`select[wire\\:model="enderecos.${idx}.${chave}"], select[name*="${chave}"]`);
                        if (el) {
                            const opts = el.querySelectorAll('option');
                            const busca = dados[chave].toUpperCase();
                            for (let opt of opts) {
                                if (opt.textContent.trim().toUpperCase() === busca || opt.textContent.trim().toUpperCase().includes(busca)) {
                                    forcarInput(el, opt.value, chave);
                                    break;
                                }
                            }
                        }
                    } else {
                        el = document.querySelector(`input[wire\\:model="enderecos.${idx}.${chave}"], input[name*="${chave}"], input[placeholder*="${chave.charAt(0).toUpperCase() + chave.slice(1)}"]`);
                        if (el) forcarInput(el, dados[chave], chave);
                    }
                }, d);
            }
        });

        setTimeout(() => {
            const el = document.querySelector(`select[wire\\:model="enderecos.${idx}.tipo"], select[name*="tipo_endereco"]`);
            if (el) {
                const opts = el.querySelectorAll('option');
                for (let opt of opts) {
                    if (opt.textContent.toLowerCase().includes('residencial')) {
                        forcarInput(el, opt.value, 'Tipo');
                        break;
                    }
                }
            }
        }, 2000);
    }

    // ============ PORTABILIDADE ============
    function extrairDadosHistorico() {
        try {
            const d = { nome: '', cpf: '', nascimento: '', email: '', telefone: '', iccid: '', plano: '', status: '', dataPortabilidade: '', numeroPortado: '', statusPortabilidade: '' };

            const nomeEl = document.querySelector('.d-flex.flex-column .w-100 strong');
            if (nomeEl) d.nome = nomeEl.textContent.trim();

            const cpfEl = document.querySelectorAll('.row .col strong');
            if (cpfEl.length >= 2) {
                d.cpf = cpfEl[0]?.textContent?.trim() || '';
                d.nascimento = cpfEl[1]?.textContent?.trim() || '';
            }
            if (cpfEl.length >= 4) d.email = cpfEl[2]?.textContent?.trim() || '';
            if (cpfEl.length >= 6) d.telefone = cpfEl[4]?.textContent?.trim() || '';
            if (cpfEl.length >= 8) d.plano = cpfEl[6]?.textContent?.trim() || '';
            if (cpfEl.length >= 10) d.iccid = cpfEl[8]?.textContent?.trim() || '';
            if (cpfEl.length >= 12) d.status = cpfEl[10]?.textContent?.trim() || '';

            const portSection = document.querySelector('.card .card-body .col-9');
            if (portSection) {
                const text = portSection.textContent;
                const dataMatch = text.match(/Data Prevista:\s*([^\n]+)/);
                const numeroMatch = text.match(/Número Portado:\s*([^\n]+)/);
                const statusMatch = text.match(/Status:\s*([^\n]+)/);
                d.dataPortabilidade = dataMatch ? dataMatch[1].trim() : '';
                d.numeroPortado = numeroMatch ? numeroMatch[1].trim() : '';
                d.statusPortabilidade = statusMatch ? statusMatch[1].trim() : '';
            }

            log('Dados do histórico capturados!', 'success');
            return d;
        } catch (e) {
            console.error('Erro ao extrair dados do histórico:', e);
            log('Erro ao extrair dados do histórico', 'error');
            return null;
        }
    }

    function montarMascara(dados) {
        if (!dados) return '';
        return `CHIP: ESim ( ) Sim Card (X)

PORTABILIDADE EM NOME DE 3º: SIM ( ) NÃO (X)

Nº Telefone Provisório: ${dados.telefone || ''}
Iccid: ${dados.iccid || ''}

Dados da Portabilidade:
Data Prevista: ${dados.dataPortabilidade || ''}
Número Portado: ${dados.numeroPortado || ''}
Status: ${dados.statusPortabilidade || ''}

Cliente ciente do prazo de 24hs para a confirmação via sms? SIM (X) NÃO ( )

Ciente da Data Prevista? SIM (X) NÃO ( )`;
    }

    function criarJanelaPortabilidade(mascara) {
        const existing = getEl('janela-mascara-portabilidade');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'janela-mascara-portabilidade';
        overlay.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;
            z-index:999999;animation:fadeIn 0.3s ease;backdrop-filter:blur(3px);
        `;

        const container = document.createElement('div');
        container.style.cssText = `
            background:#fff;border-radius:16px;padding:30px;max-width:650px;width:92%;
            max-height:90vh;overflow-y:auto;box-shadow:0 25px 80px rgba(0,0,0,0.4);
            position:relative;animation:slideUp 0.3s ease;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            position:absolute;top:12px;right:18px;font-size:26px;
            background:none;border:none;cursor:pointer;color:#999;font-weight:bold;z-index:10;
        `;
        closeBtn.onclick = () => overlay.remove();

        const title = document.createElement('h2');
        title.textContent = '📋 Máscara de Portabilidade';
        title.style.cssText = `
            margin:0 0 20px 0;color:#1976d2;font-size:22px;font-weight:700;
            border-bottom:3px solid #e3f2fd;padding-bottom:12px;
        `;

        const dados = extrairDadosHistorico();
        const info = document.createElement('div');
        info.style.cssText = `
            background:#f5f7fa;padding:12px 16px;border-radius:8px;margin-bottom:16px;
            font-size:13px;color:#555;border-left:4px solid #1976d2;
        `;
        info.innerHTML = `
            <strong>👤 ${dados?.nome || 'Cliente'}</strong>
            ${dados?.telefone ? ` | 📱 ${dados.telefone}` : ''}
            ${dados?.iccid ? ` | 🆔 ICCID: ${dados.iccid.substring(0, 10)}...` : ''}
        `;

        const textarea = document.createElement('textarea');
        textarea.value = mascara;
        textarea.style.cssText = `
            width:100%;min-height:350px;padding:16px;
            font-family:monospace;font-size:14px;line-height:1.8;
            border:2px solid #e0e0e0;border-radius:10px;resize:vertical;
            box-sizing:border-box;background:#fafafa;color:#1a1a1a;
        `;

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'margin-top:18px;display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;';

        function criarBtn(texto, cor, fn) {
            const b = document.createElement('button');
            b.textContent = texto;
            b.style.cssText = `
                padding:12px 28px;background:${cor};color:#fff;border:none;
                border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;
                transition:all 0.2s;box-shadow:0 4px 12px rgba(0,0,0,0.2);
            `;
            b.onclick = fn;
            b.onmouseover = () => { b.style.transform = 'translateY(-2px)'; };
            b.onmouseout = () => { b.style.transform = 'translateY(0)'; };
            return b;
        }

        const copyBtn = criarBtn('📋 Copiar Máscara', 'linear-gradient(135deg,#28a745,#20c997)', () => {
            textarea.select();
            textarea.setSelectionRange(0, 99999);
            try {
                if (document.execCommand('copy')) {
                    copyBtn.textContent = '✅ Copiado!';
                    copyBtn.style.background = '#2e7d32';
                    setTimeout(() => { copyBtn.textContent = '📋 Copiar Máscara'; copyBtn.style.background = 'linear-gradient(135deg,#28a745,#20c997)'; }, 2000);
                } else {
                    navigator.clipboard.writeText(mascara).then(() => {
                        copyBtn.textContent = '✅ Copiado!';
                        copyBtn.style.background = '#2e7d32';
                        setTimeout(() => { copyBtn.textContent = '📋 Copiar Máscara'; copyBtn.style.background = 'linear-gradient(135deg,#28a745,#20c997)'; }, 2000);
                    }).catch(() => alert('❌ Não foi possível copiar. Selecione o texto manualmente.'));
                }
            } catch (e) { alert('❌ Não foi possível copiar. Selecione o texto manualmente.'); }
        });

        const tecnicoBtn = criarBtn('🔧 Técnico', 'linear-gradient(135deg,#17a2b8,#0d6efd)', () => {
            const d = extrairDadosHistorico();
            if (!d?.nome) { alert('❌ Não foi possível extrair os dados!'); return; }
            const texto = `📱 Número Provisório: ${d.telefone || 'N/A'}\n📞 Número Portado: ${d.numeroPortado || 'N/A'}\n📅 Data Prevista: ${d.dataPortabilidade || 'N/A'}`;
            navigator.clipboard.writeText(texto).then(() => {
                tecnicoBtn.textContent = '✅ Copiado!';
                tecnicoBtn.style.background = '#2e7d32';
                setTimeout(() => { tecnicoBtn.textContent = '🔧 Técnico'; tecnicoBtn.style.background = 'linear-gradient(135deg,#17a2b8,#0d6efd)'; }, 2000);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = texto;
                ta.style.cssText = 'position:fixed;opacity:0;';
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                    tecnicoBtn.textContent = '✅ Copiado!';
                    tecnicoBtn.style.background = '#2e7d32';
                    setTimeout(() => { tecnicoBtn.textContent = '🔧 Técnico'; tecnicoBtn.style.background = 'linear-gradient(135deg,#17a2b8,#0d6efd)'; }, 2000);
                } catch (err) { alert('❌ Não foi possível copiar.'); }
                document.body.removeChild(ta);
            });
        });

        const closeButton = criarBtn('❌ Fechar', '#6c757d', () => overlay.remove());
        closeButton.onmouseover = () => { closeButton.style.background = '#5a6268'; closeButton.style.transform = 'translateY(-2px)'; };
        closeButton.onmouseout = () => { closeButton.style.background = '#6c757d'; closeButton.style.transform = 'translateY(0)'; };

        btnContainer.appendChild(copyBtn);
        btnContainer.appendChild(tecnicoBtn);
        btnContainer.appendChild(closeButton);

        container.appendChild(closeBtn);
        container.appendChild(title);
        container.appendChild(info);
        container.appendChild(textarea);
        container.appendChild(btnContainer);
        overlay.appendChild(container);

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
            @keyframes slideUp { from { opacity:0; transform:translateY(30px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
        `;
        document.head.appendChild(style);
        document.body.appendChild(overlay);
    }

    function gerarMascara() {
        const dados = extrairDadosHistorico();
        if (!dados?.nome) {
            log('Não foi possível extrair os dados', 'error');
            alert('❌ Não foi possível extrair os dados da página!');
            return;
        }
        criarJanelaPortabilidade(montarMascara(dados));
        log('Máscara gerada!', 'success');
    }

    // ============ INJETAR BOTÕES ============
    function injetarBotaoERP() {
        if (!isModalCliente() || getEl('btn-copiar-erp')) return;
        const modal = document.querySelector('.MuiDialog-container');
        if (!modal) return;
        const toolbar = modal.querySelector('.MuiToolbar-root');
        if (!toolbar) return;

        const btn = document.createElement('button');
        btn.id = 'btn-copiar-erp';
        btn.textContent = '📋 Capturar Dados';
        Object.assign(btn.style, {
            marginRight: '10px', backgroundColor: '#1976d2', color: 'white',
            padding: '8px 16px', borderRadius: '4px', border: 'none',
            cursor: 'pointer', fontWeight: 'bold', zIndex: '9999'
        });
        btn.onclick = copiarDadosCliente;
        toolbar.insertBefore(btn, toolbar.firstChild);
        log('Botão ERP injetado', 'success');
    }

    function injetarBotoesTatelecom() {
        const cpfInput = document.querySelector('#input_cpf, input[wire\\:model*="cpf"], input[name*="cpf"]');
        if (cpfInput && !getEl('btn-preenche-cpf')) {
            const btn = document.createElement('button');
            btn.id = 'btn-preenche-cpf';
            btn.textContent = '📋 Colar CPF';
            Object.assign(btn.style, {
                marginLeft: '5px', padding: '6px 12px', fontSize: '14px',
                backgroundColor: '#28a745', color: 'white', border: 'none',
                borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap'
            });
            btn.onclick = preencherCpf;
            const parent = cpfInput.parentElement;
            parent.style.display = 'flex';
            parent.style.gap = '5px';
            parent.style.alignItems = 'center';
            cpfInput.insertAdjacentElement('afterend', btn);
            log('Botão CPF injetado', 'success');
        }

        if (getEl('container-automacao-tatelecom')) return;

        let form = document.querySelector('form[wire\\:submit*="salvar"]');
        if (!form) {
            const card = document.querySelector('.card-body.p-3');
            if (card) form = card.querySelector('form');
        }
        if (!form) {
            const nome = document.querySelector('#input_nome');
            if (nome) form = nome.closest('form');
        }

        const target = form || document.querySelector('.card-body.p-3') || document.querySelector('.card-body') || document.querySelector('.main-content') || document.body;

        const temNome = document.querySelector('#input_nome, input[wire\\:model*="nome"], input[name*="nome"]');
        if (!temNome && !form) { log('Tela de cadastro não detectada', 'warning'); return; }

        const container = document.createElement('div');
        container.id = 'container-automacao-tatelecom';
        Object.assign(container.style, {
            padding: '12px 16px', background: '#e3f2fd', borderRadius: '8px',
            border: '2px solid #1976d2', marginBottom: '15px', marginTop: '10px',
            display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', width: '100%'
        });

        const label = document.createElement('strong');
        label.textContent = '🚀 Assistente de Cadastro:';
        label.style.cssText = 'color:#0d6efd;font-size:15px;';
        container.appendChild(label);

        const btn = document.createElement('button');
        btn.id = 'btn-auto-tudo';
        btn.textContent = '⚡ Preenchimento Completo';
        Object.assign(btn.style, {
            padding: '8px 20px', fontWeight: 'bold', cursor: 'pointer',
            backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', fontSize: '14px'
        });
        btn.onclick = preencherTudo;
        container.appendChild(btn);

        if (target.parentNode) target.parentNode.insertBefore(container, target);
        else if (target.firstChild) target.insertBefore(container, target.firstChild);
        else target.appendChild(container);

        log('✅ Botão "Preenchimento Completo" injetado!', 'success');
    }

    function injetarBotaoPortabilidade() {
        if (!isHistorico || getEl('btn-portabilidade')) return;

        let target = document.querySelector('.d-flex.justify-content-between .d-flex.gap-2') ||
                     document.querySelector('.d-flex.justify-content-between') ||
                     document.querySelector('.card .card-body .d-flex.justify-content-between');

        if (!target) {
            const float = document.createElement('div');
            float.style.cssText = `
                position:fixed;top:80px;right:20px;z-index:99999;
                background:#fff;padding:12px 18px;border-radius:12px;
                box-shadow:0 4px 20px rgba(0,0,0,0.15);border:2px solid #1976d2;
            `;
            const btn = document.createElement('button');
            btn.id = 'btn-portabilidade';
            btn.textContent = '📋 Máscara Portabilidade';
            btn.style.cssText = `
                padding:8px 16px;background:#1976d2;color:#fff;
                border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:14px;
            `;
            btn.onclick = gerarMascara;
            float.appendChild(btn);
            document.body.appendChild(float);
            log('✅ Botão flutuante criado!', 'success');
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'btn-portabilidade';
        btn.textContent = '📋 Máscara Portabilidade';
        btn.style.cssText = `
            padding:6px 14px;background:#1976d2;color:#fff;border:none;
            border-radius:4px;cursor:pointer;font-weight:bold;font-size:13px;transition:all 0.2s;
        `;
        btn.onclick = gerarMascara;
        const support = target.querySelector('.btn-warning');
        if (support) target.insertBefore(btn, support);
        else target.appendChild(btn);
        log('✅ Botão de portabilidade injetado!', 'success');
    }

    // ============ INICIAR ============
    const observer = new MutationObserver(() => {
        if (isERP) injetarBotaoERP();
        if (isTatelecom) injetarBotoesTatelecom();
        if (isHistorico) injetarBotaoPortabilidade();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
        if (isERP) injetarBotaoERP();
        if (isTatelecom) injetarBotoesTatelecom();
        if (isHistorico) injetarBotaoPortabilidade();
    }, 1500);

    setTimeout(() => {
        if (isTatelecom && !getEl('container-automacao-tatelecom')) injetarBotoesTatelecom();
        if (isHistorico && !getEl('btn-portabilidade')) injetarBotaoPortabilidade();
    }, 3000);

    console.log('🚀 Assistente de Cadastro Tatelecom v2.0.0 carregado!');
    console.log('📌 Modo:', isERP ? 'ERP' : isTatelecom ? 'Tatelecom' : isHistorico ? 'Histórico' : 'Outro');
    console.log('📊 Logs disponíveis no console (F12)');

})();
