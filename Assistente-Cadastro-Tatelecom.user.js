// ==UserScript==
// @name         Assistente de Cadastro Tatelecom
// @namespace    https://github.com/SEU-USUARIO/assistente-cadastro-tatelecom
// @version      1.3.0
// @description  Copia dados do ERP, preenche automaticamente no Tatelecom e gera máscara de portabilidade
// @author       SEU-NOME
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

    const isERP = window.location.href.includes('erp.osirnet.com.br');
    const isTatelecom = window.location.href.includes('sistema.tatelecom.com.br');
    const isHistorico = window.location.href.includes('/historico-consumo/');

    // Configuração de delays
    const CONFIG = {
        DELAY_INICIAL: 300,
        DELAY_CAMPO: 300,
        DELAY_CEP: 500,
        DELAY_ENDERECO: 200,
        DELAY_TELEFONE: 400,
        DELAY_FINAL: 3500
    };

    // ============================================
    // LOG APENAS NO CONSOLE
    // ============================================
    function log(mensagem, tipo = 'info') {
        const emojis = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        console.log(`${emojis[tipo] || 'ℹ️'} ${mensagem}`);
    }

    // ============================================
    // FEEDBACK VISUAL NO BOTÃO
    // ============================================
    function feedbackBotao(btn, sucesso, msg) {
        if (!btn) return;
        const originalText = btn.textContent;
        const originalBg = btn.style.backgroundColor;

        btn.textContent = (sucesso ? '✅ ' : '❌ ') + msg;
        btn.style.backgroundColor = sucesso ? '#2e7d32' : '#c62828';
        btn.style.color = 'white';
        btn.disabled = true;

        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.backgroundColor = originalBg || '';
            btn.style.color = '';
            btn.disabled = false;
        }, 1500);
    }

    // ============================================
    // VERIFICAR SE É MODAL DE INFORMAÇÕES DO CLIENTE
    // ============================================
    function isModalInformacoesCliente() {
        const modal = document.querySelector('.MuiDialog-container');
        if (!modal) return false;

        const titulo = modal.querySelector('.MuiTypography-root[class*="MuiTypography-h6"]');
        return titulo && titulo.textContent.includes('Informações -');
    }

    // ============================================
    // EXTRAIR DADOS DO ERP
    // ============================================
    function extrairDadosERP() {
        const modal = document.querySelector('.MuiDialog-container');
        if (!modal) {
            log('Modal não encontrado!', 'error');
            return null;
        }

        try {
            const dados = {
                nome: '',
                documento: '',
                endereco: '',
                cep: '',
                dataNascimento: '',
                email: '',
                celular: '',
                logradouro: '',
                numero: '',
                bairro: '',
                cidade: '',
                uf: ''
            };

            // Captura nome do título
            const titulo = modal.querySelector('.MuiTypography-root[class*="MuiTypography-h6"]');
            if (titulo) {
                const match = titulo.textContent.match(/Informações - (.+)/);
                dados.nome = match ? match[1].trim() : titulo.textContent.replace('Informações - ', '').trim();
            }

            // Função auxiliar para buscar valor por label
            function getValueByLabel(labelText) {
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

            // Função para extrair endereço completo
            function getEnderecoCompleto() {
                const labels = modal.querySelectorAll('[class*="MuiTypography-subtitle1"]');
                for (let label of labels) {
                    if (label.textContent.trim().includes('Endereço:')) {
                        const parent = label.closest('.MuiGrid-root');
                        if (parent) {
                            const div = parent.querySelector('[class*="MuiTypography-body1"]');
                            if (div) {
                                const spans = div.querySelectorAll('span');
                                if (spans.length >= 2) {
                                    return {
                                        endereco: spans[0]?.textContent.trim() || '',
                                        cep: spans[1]?.textContent.trim() || ''
                                    };
                                }
                                const texto = div.textContent.trim();
                                const cepMatch = texto.match(/\d{5}-\d{3}/);
                                return {
                                    endereco: texto.replace(/\d{5}-\d{3}/, '').trim(),
                                    cep: cepMatch ? cepMatch[0] : ''
                                };
                            }
                        }
                        break;
                    }
                }
                return { endereco: '', cep: '' };
            }

            dados.documento = getValueByLabel('Nº do documento');
            dados.dataNascimento = getValueByLabel('Data de Nascimento:');
            dados.email = getValueByLabel('Email:');
            dados.celular = getValueByLabel('Celular:');

            const endInfo = getEnderecoCompleto();
            dados.endereco = endInfo.endereco;
            dados.cep = endInfo.cep;

            if (dados.endereco) {
                const partes = fatiarEndereco(dados.endereco);
                Object.assign(dados, partes);
            }

            log(`Dados capturados: ${dados.nome}`, 'success');
            return dados;
        } catch (error) {
            console.error('Erro na extração:', error);
            log('Erro ao extrair dados. Veja o console (F12)', 'error');
            return null;
        }
    }

    // ============================================
    // FATIAR ENDEREÇO
    // ============================================
    function fatiarEndereco(enderecoCompleto) {
        const resultado = { logradouro: '', numero: '', bairro: '', cidade: '', uf: '' };
        if (!enderecoCompleto) return resultado;

        try {
            const semCep = enderecoCompleto.replace(/\d{5}-\d{3}/, '').trim();
            const partes = semCep.split(',').map(p => p.trim()).filter(p => p);

            if (partes.length >= 1) {
                const primeira = partes[0];
                const numMatch = primeira.match(/\s(\d+)$/);
                if (numMatch) {
                    resultado.numero = numMatch[1];
                    resultado.logradouro = primeira.replace(/\s\d+$/, '').trim();
                } else {
                    const n = primeira.match(/\d+/);
                    if (n) {
                        resultado.numero = n[0];
                        resultado.logradouro = primeira.replace(n[0], '').trim();
                    } else {
                        resultado.logradouro = primeira;
                    }
                }
            }

            if (partes.length >= 2) {
                const segunda = partes[1].trim();
                const bairro = segunda.replace(/\s*-\s*[A-Za-zçãõáéíóúâêîôûàèìòù\s]+\s*[A-Z]{2}$/, '')
                                     .replace(/\s*-\s*[A-Za-z\s]+$/, '')
                                     .trim();
                resultado.bairro = bairro || segunda;
            }

            if (partes.length >= 3) {
                const cidadeUf = partes[2].trim();
                const ufMatch = cidadeUf.match(/\b([A-Z]{2})$/);
                if (ufMatch) {
                    resultado.uf = ufMatch[1];
                    resultado.cidade = cidadeUf.replace(/\s*[A-Z]{2}$/, '').trim();
                } else {
                    resultado.cidade = cidadeUf;
                }
            } else if (partes.length === 2) {
                const segunda = partes[1].trim();
                const ufMatch = segunda.match(/\b([A-Z]{2})$/);
                if (ufMatch) {
                    resultado.uf = ufMatch[1];
                    const cidadeBairro = segunda.replace(/\s*[A-Z]{2}$/, '').trim();
                    const bc = cidadeBairro.split('-').map(p => p.trim());
                    if (bc.length >= 2) {
                        resultado.bairro = bc[0];
                        resultado.cidade = bc[1];
                    } else {
                        resultado.cidade = cidadeBairro;
                    }
                }
            }

            if (resultado.bairro) {
                resultado.bairro = resultado.bairro
                    .replace(/\s*-\s*[A-Za-zçãõáéíóúâêîôûàèìòù\s]+\s*$/, '')
                    .replace(/\s*[A-Z]{2}$/, '')
                    .trim();
            }

        } catch (error) {
            console.error('Erro ao fatiar endereço:', error);
        }

        return resultado;
    }

    // ============================================
    // COPIAR DADOS
    // ============================================
    function copiarDadosCliente() {
        const btn = document.getElementById('btn-copiar-erp');
        const dados = extrairDadosERP();

        if (dados && dados.nome) {
            GM_setValue('dados_cliente_erp', JSON.stringify(dados));
            feedbackBotao(btn, true, 'Copiado!');
            log('Dados salvos!', 'success');
        } else {
            feedbackBotao(btn, false, 'Falhou!');
        }
    }

    // ============================================
    // FORÇAR INPUT NO LIVEWIRE
    // ============================================
    function forcarInputLivewire(elemento, valor, campoNome) {
        if (!elemento) return false;

        try {
            let valorFinal = valor;

            if (campoNome && campoNome.toLowerCase().includes('cpf') && valor.length === 11) {
                valorFinal = valor.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            }

            if (campoNome && campoNome.toLowerCase().includes('telefone') && valor.length === 11) {
                valorFinal = valor.replace(/(\d{2})(\d{5})(\d{4})/, '($1)$2-$3');
            }

            elemento.focus();
            elemento.value = valorFinal;

            ['input', 'change', 'blur'].forEach(tipo => {
                elemento.dispatchEvent(new Event(tipo, { bubbles: true, cancelable: true }));
            });

            const component = elemento.closest('[wire\\:id]');
            if (component && window.Livewire) {
                try {
                    const wireId = component.getAttribute('wire:id');
                    const lw = window.Livewire.find(wireId);
                    if (lw) {
                        let modelName = elemento.getAttribute('wire:model') ||
                                      elemento.getAttribute('wire:model.defer') ||
                                      elemento.getAttribute('wire:model.live');
                        if (modelName) {
                            lw.set(modelName, valorFinal, true);
                        }
                    }
                } catch (e) {
                    // Fallback
                }
            }

            setTimeout(() => {
                if (elemento.value !== valorFinal) {
                    elemento.value = valorFinal;
                    elemento.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, 100);

            return true;
        } catch (error) {
            console.error(`Erro ao preencher ${campoNome}:`, error);
            return false;
        }
    }

    // ============================================
    // PREENCHER CPF
    // ============================================
    function preencherCpf() {
        const btn = document.getElementById('btn-preenche-cpf');
        const dados = JSON.parse(GM_getValue('dados_cliente_erp') || '{}');

        if (!dados.documento) {
            feedbackBotao(btn, false, 'Sem CPF');
            log('Capture os dados no ERP primeiro!', 'error');
            return;
        }

        const cpfInput = document.querySelector('#input_cpf') ||
                        document.querySelector('input[wire\\:model*="cpf"]') ||
                        document.querySelector('input[name*="cpf"]') ||
                        document.querySelector('input[type="text"][placeholder*="CPF"]');

        if (cpfInput) {
            forcarInputLivewire(cpfInput, dados.documento, 'CPF');
            feedbackBotao(btn, true, 'CPF Colado!');
            log(`CPF ${dados.documento} preenchido`, 'success');
        } else {
            feedbackBotao(btn, false, 'Campo não encontrado');
        }
    }

    // ============================================
    // PREENCHER TUDO AUTOMÁTICO
    // ============================================
    function preencherTudoAutomatico() {
        const btn = document.getElementById('btn-auto-tudo');
        const dados = JSON.parse(GM_getValue('dados_cliente_erp') || '{}');

        if (!dados.nome) {
            feedbackBotao(btn, false, 'Sem dados');
            log('Capture os dados no ERP primeiro!', 'error');
            return;
        }

        log('Iniciando preenchimento...', 'info');
        btn.disabled = true;

        let delay = 0;

        setTimeout(() => {
            const el = document.querySelector('#input_nome') ||
                      document.querySelector('input[wire\\:model*="nome"]') ||
                      document.querySelector('input[name*="nome"]');
            if (el) forcarInputLivewire(el, dados.nome, 'Nome');
        }, delay);
        delay += CONFIG.DELAY_CAMPO;

        if (dados.dataNascimento) {
            setTimeout(() => {
                const el = document.querySelector('#input_dt_nascimento') ||
                          document.querySelector('input[wire\\:model*="nascimento"]') ||
                          document.querySelector('input[name*="nascimento"]');
                if (el) forcarInputLivewire(el, dados.dataNascimento, 'Data Nasc.');
            }, delay);
            delay += CONFIG.DELAY_CAMPO;
        }

        if (dados.email) {
            setTimeout(() => {
                const el = document.querySelector('#input_email') ||
                          document.querySelector('input[wire\\:model*="email"]') ||
                          document.querySelector('input[name*="email"]');
                if (el) forcarInputLivewire(el, dados.email, 'Email');
            }, delay);
            delay += CONFIG.DELAY_CAMPO;
        }

        setTimeout(() => {
            const el = document.querySelector('#input_nome_mae') ||
                      document.querySelector('input[wire\\:model*="mae"]') ||
                      document.querySelector('input[name*="mae"]');
            if (el) forcarInputLivewire(el, 'XXXX', 'Nome da Mãe');
        }, delay);
        delay += CONFIG.DELAY_CAMPO;

        setTimeout(() => {
            const telTab = document.querySelector('a[href="#primaryhome"]');
            if (telTab) telTab.click();

            setTimeout(() => {
                if (dados.celular) {
                    const telInput = document.querySelector('input[wire\\:model="telefones.0.numero"]') ||
                                   document.querySelector('input[name*="telefone"]') ||
                                   document.querySelector('input[type="tel"]');
                    if (telInput) {
                        const telLimpo = dados.celular.replace(/\D/g, '');
                        forcarInputLivewire(telInput, telLimpo, 'Telefone');

                        setTimeout(() => {
                            const tipoSelect = document.querySelector('select[wire\\:model="telefones.0.tipo"]') ||
                                             document.querySelector('select[name*="tipo_telefone"]');
                            if (tipoSelect) {
                                const options = tipoSelect.querySelectorAll('option');
                                for (let opt of options) {
                                    if (opt.textContent.toLowerCase().includes('celular') ||
                                        opt.textContent.toLowerCase().includes('whatsapp')) {
                                        forcarInputLivewire(tipoSelect, opt.value, 'Tipo');
                                        break;
                                    }
                                }
                            }
                        }, CONFIG.DELAY_TELEFONE);
                    }
                }
            }, CONFIG.DELAY_TELEFONE);
        }, delay);
        delay += CONFIG.DELAY_TELEFONE + CONFIG.DELAY_CEP;

        if (dados.cep) {
            setTimeout(() => {
                const endTab = document.querySelector('a[href="#primaryprofile"]');
                if (endTab) {
                    endTab.click();
                    setTimeout(() => executarFluxoEndereco(dados, 0), CONFIG.DELAY_ENDERECO);
                } else {
                    executarFluxoEndereco(dados, 0);
                }
            }, delay);
        }

        setTimeout(() => {
            btn.disabled = false;
            feedbackBotao(btn, true, 'Pronto!');
            log('Preenchimento concluído!', 'success');
        }, delay + CONFIG.DELAY_FINAL);
    }

    // ============================================
    // FLUXO ENDEREÇO
    // ============================================
    function executarFluxoEndereco(dados, index) {
        const cepInput = document.querySelector(`input[wire\\:model="enderecos.${index}.cep"]`) ||
                        document.querySelector('input[name*="cep"]') ||
                        document.querySelector('input[placeholder*="CEP"]');

        if (cepInput && dados.cep) {
            const cepLimpo = dados.cep.replace(/\D/g, '');
            forcarInputLivewire(cepInput, cepLimpo, 'CEP');

            setTimeout(() => {
                let btn = document.querySelector(`button[wire\\:click*="busca_cep"]`);
                if (!btn) {
                    const botoes = document.querySelectorAll('button');
                    for (let b of botoes) {
                        if (b.textContent.trim().toLowerCase().includes('busca') ||
                            b.textContent.trim().toLowerCase().includes('consultar')) {
                            btn = b;
                            break;
                        }
                    }
                }
                if (btn) btn.click();
            }, CONFIG.DELAY_CEP);
        }

        const campos = [
            { chave: 'logradouro', delay: 1000 },
            { chave: 'numero', delay: 1200 },
            { chave: 'bairro', delay: 1400 },
            { chave: 'cidade', delay: 1600, isSelect: true },
            { chave: 'uf', delay: 1800, isSelect: true }
        ];

        campos.forEach(({ chave, delay, isSelect }) => {
            if (dados[chave]) {
                setTimeout(() => {
                    const selector = `input[wire\\:model="enderecos.${index}.${chave}"]` +
                                   `, input[name*="${chave}"]` +
                                   `, input[placeholder*="${chave.charAt(0).toUpperCase() + chave.slice(1)}"]`;

                    let el = document.querySelector(selector);

                    if (isSelect) {
                        el = document.querySelector(`select[wire\\:model="enderecos.${index}.${chave}"]`) ||
                             document.querySelector(`select[name*="${chave}"]`);
                    }

                    if (el) {
                        if (isSelect) {
                            const options = el.querySelectorAll('option');
                            for (let opt of options) {
                                const optText = opt.textContent.trim().toUpperCase();
                                const valorBusca = dados[chave].toUpperCase();
                                if (optText === valorBusca || optText.includes(valorBusca)) {
                                    forcarInputLivewire(el, opt.value, chave);
                                    break;
                                }
                            }
                        } else {
                            forcarInputLivewire(el, dados[chave], chave);
                        }
                    }
                }, delay);
            }
        });

        setTimeout(() => {
            const el = document.querySelector(`select[wire\\:model="enderecos.${index}.tipo"]`) ||
                      document.querySelector('select[name*="tipo_endereco"]');
            if (el) {
                const options = el.querySelectorAll('option');
                for (let opt of options) {
                    if (opt.textContent.toLowerCase().includes('residencial')) {
                        forcarInputLivewire(el, opt.value, 'Tipo');
                        break;
                    }
                }
            }
        }, 2000);
    }

    // ============================================
    // FUNÇÕES DA MÁSCARA DE PORTABILIDADE
    // ============================================
    function extrairDadosHistorico() {
        try {
            const dados = {
                nome: '',
                cpf: '',
                nascimento: '',
                email: '',
                telefone: '',
                iccid: '',
                plano: '',
                status: '',
                dataPortabilidade: '',
                numeroPortado: '',
                statusPortabilidade: ''
            };

            // Nome
            const nomeEl = document.querySelector('.d-flex.flex-column .w-100 strong');
            if (nomeEl) dados.nome = nomeEl.textContent.trim();

            // CPF e outros dados
            const cpfEl = document.querySelectorAll('.row .col strong');
            if (cpfEl.length >= 2) {
                dados.cpf = cpfEl[0]?.textContent?.trim() || '';
                dados.nascimento = cpfEl[1]?.textContent?.trim() || '';
            }
            if (cpfEl.length >= 4) {
                dados.email = cpfEl[2]?.textContent?.trim() || '';
            }
            if (cpfEl.length >= 6) {
                dados.telefone = cpfEl[4]?.textContent?.trim() || '';
            }
            if (cpfEl.length >= 8) {
                dados.plano = cpfEl[6]?.textContent?.trim() || '';
            }
            if (cpfEl.length >= 10) {
                dados.iccid = cpfEl[8]?.textContent?.trim() || '';
            }
            if (cpfEl.length >= 12) {
                dados.status = cpfEl[10]?.textContent?.trim() || '';
            }

            // Dados da Portabilidade
            const portabilidadeSection = document.querySelector('.card .card-body .col-9');
            if (portabilidadeSection) {
                const text = portabilidadeSection.textContent;
                const dataMatch = text.match(/Data Prevista:\s*([^\n]+)/);
                const numeroMatch = text.match(/Número Portado:\s*([^\n]+)/);
                const statusMatch = text.match(/Status:\s*([^\n]+)/);

                dados.dataPortabilidade = dataMatch ? dataMatch[1].trim() : '';
                dados.numeroPortado = numeroMatch ? numeroMatch[1].trim() : '';
                dados.statusPortabilidade = statusMatch ? statusMatch[1].trim() : '';
            }

            log('Dados do histórico capturados!', 'success');
            return dados;
        } catch (error) {
            console.error('Erro ao extrair dados do histórico:', error);
            log('Erro ao extrair dados do histórico', 'error');
            return null;
        }
    }

    function montarMascaraPortabilidade(dados) {
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
        const existing = document.getElementById('janela-mascara-portabilidade');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'janela-mascara-portabilidade';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.6);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 999999;
            animation: fadeIn 0.3s ease;
            backdrop-filter: blur(3px);
        `;

        const container = document.createElement('div');
        container.style.cssText = `
            background: white;
            border-radius: 16px;
            padding: 30px;
            max-width: 650px;
            width: 92%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 25px 80px rgba(0,0,0,0.4);
            position: relative;
            animation: slideUp 0.3s ease;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 12px;
            right: 18px;
            font-size: 26px;
            background: none;
            border: none;
            cursor: pointer;
            color: #999;
            font-weight: bold;
            transition: color 0.2s;
            z-index: 10;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = '#333';
        closeBtn.onmouseout = () => closeBtn.style.color = '#999';
        closeBtn.onclick = () => overlay.remove();

        const title = document.createElement('h2');
        title.innerHTML = '📋 Máscara de Portabilidade';
        title.style.cssText = `
            margin: 0 0 20px 0;
            color: #1976d2;
            font-size: 22px;
            font-weight: 700;
            border-bottom: 3px solid #e3f2fd;
            padding-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        const dados = extrairDadosHistorico();
        const infoCliente = document.createElement('div');
        infoCliente.style.cssText = `
            background: #f5f7fa;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 13px;
            color: #555;
            border-left: 4px solid #1976d2;
        `;
        infoCliente.innerHTML = `
            <strong>👤 ${dados?.nome || 'Cliente'}</strong>
            ${dados?.telefone ? ` | 📱 ${dados.telefone}` : ''}
            ${dados?.iccid ? ` | 🆔 ICCID: ${dados.iccid.substring(0, 10)}...` : ''}
        `;

        const textarea = document.createElement('textarea');
        textarea.value = mascara;
        textarea.style.cssText = `
            width: 100%;
            min-height: 350px;
            padding: 16px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.8;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            resize: vertical;
            box-sizing: border-box;
            background: #fafafa;
            color: #1a1a1a;
            transition: border-color 0.3s;
        `;
        textarea.onfocus = () => textarea.style.borderColor = '#1976d2';
        textarea.onblur = () => textarea.style.borderColor = '#e0e0e0';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            margin-top: 18px;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            flex-wrap: wrap;
        `;

        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = '📋 Copiar Máscara';
        copyBtn.style.cssText = `
            padding: 12px 28px;
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
        `;
        copyBtn.onmouseover = () => {
            copyBtn.style.transform = 'translateY(-2px)';
            copyBtn.style.boxShadow = '0 6px 20px rgba(40, 167, 69, 0.4)';
        };
        copyBtn.onmouseout = () => {
            copyBtn.style.transform = 'translateY(0)';
            copyBtn.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
        };
        copyBtn.onclick = () => {
            // Seleciona o texto
            textarea.select();
            textarea.setSelectionRange(0, 99999);

            // Tenta copiar
            try {
                const sucesso = document.execCommand('copy');
                if (sucesso) {
                    copyBtn.innerHTML = '✅ Copiado!';
                    copyBtn.style.background = 'linear-gradient(135deg, #2e7d32, #1a8c4a)';
                    setTimeout(() => {
                        copyBtn.innerHTML = '📋 Copiar Máscara';
                        copyBtn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
                    }, 2000);
                } else {
                    // Fallback: usa o clipboard API
                    navigator.clipboard.writeText(mascara).then(() => {
                        copyBtn.innerHTML = '✅ Copiado!';
                        copyBtn.style.background = 'linear-gradient(135deg, #2e7d32, #1a8c4a)';
                        setTimeout(() => {
                            copyBtn.innerHTML = '📋 Copiar Máscara';
                            copyBtn.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
                        }, 2000);
                    }).catch(() => {
                        alert('❌ Não foi possível copiar. Selecione o texto manualmente e use Ctrl+C.');
                    });
                }
            } catch (e) {
                alert('❌ Não foi possível copiar. Selecione o texto manualmente e use Ctrl+C.');
            }
        };

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '❌ Fechar';
        closeButton.style.cssText = `
            padding: 12px 24px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
            transition: all 0.2s;
        `;
        closeButton.onmouseover = () => {
            closeButton.style.background = '#5a6268';
            closeButton.style.transform = 'translateY(-2px)';
        };
        closeButton.onmouseout = () => {
            closeButton.style.background = '#6c757d';
            closeButton.style.transform = 'translateY(0)';
        };
        closeButton.onclick = () => overlay.remove();

        buttonContainer.appendChild(copyBtn);
        buttonContainer.appendChild(closeButton);

        container.appendChild(closeBtn);
        container.appendChild(title);
        container.appendChild(infoCliente);
        container.appendChild(textarea);
        container.appendChild(buttonContainer);
        overlay.appendChild(container);

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(30px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(overlay);
    }

    function gerarMascaraPortabilidade() {
        const dados = extrairDadosHistorico();
        if (!dados || !dados.nome) {
            log('Não foi possível extrair os dados da página', 'error');
            alert('❌ Não foi possível extrair os dados da página!');
            return;
        }
        const mascara = montarMascaraPortabilidade(dados);
        criarJanelaPortabilidade(mascara);
        log('Máscara de portabilidade gerada!', 'success');
    }

    // ============================================
    // INJETAR BOTÃO ERP
    // ============================================
    function injetarBotaoERP() {
        if (!isModalInformacoesCliente()) return;
        if (document.getElementById('btn-copiar-erp')) return;

        const modal = document.querySelector('.MuiDialog-container');
        if (!modal) return;

        const toolbar = modal.querySelector('.MuiToolbar-root');
        if (!toolbar) return;

        const btn = document.createElement('button');
        btn.id = 'btn-copiar-erp';
        btn.textContent = '📋 Capturar Dados';
        Object.assign(btn.style, {
            marginRight: '10px',
            backgroundColor: '#1976d2',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            zIndex: '9999'
        });
        btn.addEventListener('click', copiarDadosCliente);
        toolbar.insertBefore(btn, toolbar.firstChild);
        log('Botão ERP injetado', 'success');
    }

    // ============================================
    // INJETAR BOTÕES TATELEÇOM
    // ============================================
    function injetarBotoesTatelecom() {
        log('Procurando elementos do Tatelecom...', 'info');

        const cpfInput = document.querySelector('#input_cpf') ||
                        document.querySelector('input[wire\\:model*="cpf"]') ||
                        document.querySelector('input[name*="cpf"]');
        if (cpfInput && !document.getElementById('btn-preenche-cpf')) {
            const btn = document.createElement('button');
            btn.id = 'btn-preenche-cpf';
            btn.textContent = '📋 Colar CPF';
            Object.assign(btn.style, {
                marginLeft: '5px',
                padding: '6px 12px',
                fontSize: '14px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
            });
            btn.addEventListener('click', preencherCpf);

            const parent = cpfInput.parentElement;
            parent.style.display = 'flex';
            parent.style.gap = '5px';
            parent.style.alignItems = 'center';
            cpfInput.insertAdjacentElement('afterend', btn);
            log('Botão CPF injetado', 'success');
        }

        if (document.getElementById('container-automacao-tatelecom')) {
            log('Container de automação já existe', 'info');
            return;
        }

        let form = document.querySelector('form[wire\\:submit*="salvar"]');
        if (!form) {
            const cardBody = document.querySelector('.card-body.p-3');
            if (cardBody) form = cardBody.querySelector('form');
        }
        if (!form) {
            const nomeInput = document.querySelector('#input_nome');
            if (nomeInput) form = nomeInput.closest('form');
        }

        let target = form || document.querySelector('.card-body.p-3') ||
                     document.querySelector('.card-body') ||
                     document.querySelector('.main-content') ||
                     document.body;

        const temNome = document.querySelector('#input_nome') ||
                       document.querySelector('input[wire\\:model*="nome"]') ||
                       document.querySelector('input[name*="nome"]');
        if (!temNome && !form) {
            log('Tela de cadastro não detectada', 'warning');
            return;
        }

        log('Injetando botão "Preenchimento Completo"...', 'info');

        const container = document.createElement('div');
        container.id = 'container-automacao-tatelecom';
        Object.assign(container.style, {
            padding: '12px 16px',
            background: '#e3f2fd',
            borderRadius: '8px',
            border: '2px solid #1976d2',
            marginBottom: '15px',
            marginTop: '10px',
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'center',
            width: '100%'
        });

        const label = document.createElement('strong');
        label.textContent = '🚀 Assistente de Cadastro:';
        label.style.color = '#0d6efd';
        label.style.fontSize = '15px';
        container.appendChild(label);

        const btn = document.createElement('button');
        btn.id = 'btn-auto-tudo';
        btn.textContent = '⚡ Preenchimento Completo';
        Object.assign(btn.style, {
            padding: '8px 20px',
            fontWeight: 'bold',
            cursor: 'pointer',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px'
        });
        btn.addEventListener('click', preencherTudoAutomatico);
        container.appendChild(btn);

        if (target.parentNode) {
            target.parentNode.insertBefore(container, target);
        } else if (target.firstChild) {
            target.insertBefore(container, target.firstChild);
        } else {
            target.appendChild(container);
        }

        log('✅ Botão "Preenchimento Completo" injetado!', 'success');
    }

    // ============================================
    // INJETAR BOTÃO DE PORTABILIDADE
    // ============================================
    function injetarBotaoPortabilidade() {
        if (!isHistorico) return;
        if (document.getElementById('btn-portabilidade')) return;

        log('Página de histórico detectada!', 'info');

        // Procura o container dos botões (onde está o botão de suporte)
        let target = document.querySelector('.d-flex.justify-content-between .d-flex.gap-2');
        if (!target) {
            target = document.querySelector('.d-flex.justify-content-between');
        }
        if (!target) {
            target = document.querySelector('.card .card-body .d-flex.justify-content-between');
        }

        // Se não encontrar, cria um container flutuante
        if (!target) {
            const floatContainer = document.createElement('div');
            floatContainer.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 99999;
                background: white;
                padding: 12px 18px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                border: 2px solid #1976d2;
            `;

            const btn = document.createElement('button');
            btn.id = 'btn-portabilidade';
            btn.textContent = '📋 Máscara Portabilidade';
            btn.style.cssText = `
                padding: 8px 16px;
                background: #1976d2;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
                font-size: 14px;
            `;
            btn.onclick = gerarMascaraPortabilidade;

            floatContainer.appendChild(btn);
            document.body.appendChild(floatContainer);
            log('✅ Botão de portabilidade criado (flutuante)!', 'success');
            return;
        }

        // Se encontrou, adiciona o botão lá
        const btn = document.createElement('button');
        btn.id = 'btn-portabilidade';
        btn.textContent = '📋 Máscara Portabilidade';
        btn.style.cssText = `
            padding: 6px 14px;
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
            transition: all 0.2s;
        `;
        btn.onmouseover = () => {
            btn.style.background = '#1565c0';
            btn.style.transform = 'scale(1.05)';
        };
        btn.onmouseout = () => {
            btn.style.background = '#1976d2';
            btn.style.transform = 'scale(1)';
        };
        btn.onclick = gerarMascaraPortabilidade;

        // Insere antes do botão de suporte (btn-warning)
        const supportBtn = target.querySelector('.btn-warning');
        if (supportBtn) {
            target.insertBefore(btn, supportBtn);
        } else {
            target.appendChild(btn);
        }

        log('✅ Botão de portabilidade injetado!', 'success');
    }

    // ============================================
    // INICIAR
    // ============================================
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
        if (isTatelecom && !document.getElementById('container-automacao-tatelecom')) {
            injetarBotoesTatelecom();
        }
        if (isHistorico && !document.getElementById('btn-portabilidade')) {
            injetarBotaoPortabilidade();
        }
    }, 3000);

    console.log('🚀 Assistente de Cadastro Tatelecom v1.3.0 carregado!');
    console.log('📌 Modo:', isERP ? 'ERP' : isTatelecom ? 'Tatelecom' : isHistorico ? 'Histórico' : 'Outro');
    console.log('🔇 Sem notificações - feedback visual nos botões');
    console.log('📊 Logs disponíveis no console (F12)');
})();
