// ==UserScript==
// @name         Assistente de Cadastro Tatelecom
// @namespace    https://github.com/AlissonGuerreiro/meus-scripts
// @version      1.0.1
// @description  Copia dados do ERP e preenche automaticamente no Tatelecom
// @author       Alisson Guerreiro
// @match        https://erp.osirnet.com.br/*
// @match        http://sistema.tatelecom.com.br/*
// @match        https://sistema.tatelecom.com.br/*
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// @homepage     https://github.com/AlissonGuerreiro/meus-scripts
// @supportURL   https://github.com/AlissonGuerreiro/meus-scripts/issues
// ==/UserScript==

(function() {
    'use strict';

    const isERP = window.location.href.includes('erp.osirnet.com.br');
    const isTatelecom = window.location.href.includes('sistema.tatelecom.com.br');

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
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.backgroundColor = originalBg || '';
            btn.style.color = '';
        }, 1500);
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

            const titulo = modal.querySelector('.MuiTypography-root[class*="MuiTypography-h6"]');
            if (titulo) {
                const match = titulo.textContent.match(/Informações - (.+)/);
                dados.nome = match ? match[1].trim() : titulo.textContent.replace('Informações - ', '').trim();
            }

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
                dados.logradouro = partes.logradouro;
                dados.numero = partes.numero;
                dados.bairro = partes.bairro;
                dados.cidade = partes.cidade;
                dados.uf = partes.uf;
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
            const partes = enderecoCompleto.split(',').map(p => p.trim());
            
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
                const bairroMatch = segunda.match(/^([^-]+)/);
                resultado.bairro = bairroMatch ? bairroMatch[1].trim() : segunda;
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
                    .replace(/\s*-\s*[A-Za-z]+\s*$/, '')
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
        
        if (dados) {
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
            elemento.focus();

            const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(elemento), 'value')?.set ||
                           Object.getOwnPropertyDescriptor(elemento, 'value')?.set;

            if (setter) {
                setter.call(elemento, valor);
            } else {
                elemento.value = valor;
            }

            ['input', 'change', 'blur'].forEach(tipo => {
                elemento.dispatchEvent(new Event(tipo, { bubbles: true, cancelable: true }));
            });

            const component = elemento.closest('[wire\\:id]');
            if (component && window.Livewire) {
                const wireId = component.getAttribute('wire:id');
                const lw = window.Livewire.find(wireId);
                if (lw) {
                    let modelName = elemento.getAttribute('wire:model') ||
                                    elemento.getAttribute('wire:model.defer') ||
                                    elemento.getAttribute('wire:model.live');
                    if (modelName) {
                        lw.set(modelName, valor, true);
                    }
                }
            }

            let tentativas = 0;
            const trava = setInterval(() => {
                if (elemento.value !== valor) {
                    elemento.value = valor;
                    elemento.dispatchEvent(new Event('input', { bubbles: true }));
                }
                tentativas++;
                if (tentativas >= 4) clearInterval(trava);
            }, 150);

            return true;
        } catch (error) {
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

        const cpfInput = document.querySelector('#input_cpf') || document.querySelector('input[wire\\:model*="cpf"]');
        if (cpfInput) {
            forcarInputLivewire(cpfInput, dados.documento, 'CPF');
            feedbackBotao(btn, true, 'CPF Colado!');
            log(`CPF ${dados.documento} preenchido`, 'success');
        } else {
            feedbackBotao(btn, false, 'Campo não encontrado');
        }
    }

    // ============================================
    // PREENCHER TUDO
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

        let delay = 0;

        setTimeout(() => {
            const el = document.querySelector('#input_nome') || document.querySelector('input[wire\\:model*="nome"]');
            if (el) forcarInputLivewire(el, dados.nome, 'Nome');
        }, delay);
        delay += 300;

        if (dados.dataNascimento) {
            setTimeout(() => {
                const el = document.querySelector('#input_dt_nascimento') || document.querySelector('input[wire\\:model*="nascimento"]');
                if (el) forcarInputLivewire(el, dados.dataNascimento, 'Data Nasc.');
            }, delay);
            delay += 300;
        }

        if (dados.email) {
            setTimeout(() => {
                const el = document.querySelector('#input_email') || document.querySelector('input[wire\\:model*="email"]');
                if (el) forcarInputLivewire(el, dados.email, 'Email');
            }, delay);
            delay += 300;
        }

        setTimeout(() => {
            const el = document.querySelector('#input_nome_mae') || document.querySelector('input[wire\\:model*="mae"]');
            if (el) forcarInputLivewire(el, 'XXXX', 'Nome da Mãe');
        }, delay);
        delay += 300;

        setTimeout(() => {
            const telTab = document.querySelector('a[href="#primaryhome"]');
            if (telTab) telTab.click();
            
            setTimeout(() => {
                if (dados.celular) {
                    let tel = dados.celular.replace(/\D/g, '');
                    if (tel.length === 11) tel = `(${tel.slice(0,2)})${tel.slice(2,7)}-${tel.slice(7)}`;
                    else if (tel.length === 10) tel = `(${tel.slice(0,2)})${tel.slice(2,6)}-${tel.slice(6)}`;
                    
                    const telInput = document.querySelector('input[wire\\:model="telefones.0.numero"]');
                    if (telInput) {
                        forcarInputLivewire(telInput, tel, 'Telefone');
                        
                        setTimeout(() => {
                            const tipoSelect = document.querySelector('select[wire\\:model="telefones.0.tipo"]');
                            if (tipoSelect) forcarInputLivewire(tipoSelect, 'Celular WhatsApp', 'Tipo');
                        }, 300);
                    }
                }
            }, 400);
        }, delay);
        delay += 1200;

        if (dados.cep) {
            setTimeout(() => {
                const endTab = document.querySelector('a[href="#primaryprofile"]');
                if (endTab) {
                    endTab.click();
                    setTimeout(() => executarFluxoEndereco(dados, 0), 600);
                } else {
                    executarFluxoEndereco(dados, 0);
                }
            }, delay);
        }

        setTimeout(() => {
            feedbackBotao(btn, true, 'Pronto!');
            log('Preenchimento concluído!', 'success');
        }, delay + 3500);
    }

    // ============================================
    // FLUXO ENDEREÇO
    // ============================================
    function executarFluxoEndereco(dados, index) {
        const cepInput = document.querySelector(`input[wire\\:model="enderecos.${index}.cep"]`);
        if (cepInput && dados.cep) {
            let cepLimpo = dados.cep.replace(/\D/g, '');
            if (cepLimpo.length === 8) cepLimpo = `${cepLimpo.slice(0,5)}-${cepLimpo.slice(5)}`;
            forcarInputLivewire(cepInput, cepLimpo, 'CEP');
            
            setTimeout(() => {
                let btn = document.querySelector(`button[wire\\:click*="busca_cep(${index})"]`);
                if (!btn) {
                    const botoes = document.querySelectorAll('button');
                    for (let b of botoes) {
                        if (b.textContent.trim().includes('Busca')) { btn = b; break; }
                    }
                }
                if (btn) btn.click();
            }, 500);
        }

        setTimeout(() => {
            if (dados.logradouro) {
                const el = document.querySelector(`input[wire\\:model="enderecos.${index}.logradouro"]`);
                if (el) forcarInputLivewire(el, dados.logradouro, 'Logradouro');
            }
        }, 1000);

        setTimeout(() => {
            if (dados.numero) {
                const el = document.querySelector(`input[wire\\:model="enderecos.${index}.numero"]`);
                if (el) forcarInputLivewire(el, dados.numero, 'Número');
            }
        }, 1200);

        setTimeout(() => {
            if (dados.bairro) {
                const el = document.querySelector(`input[wire\\:model="enderecos.${index}.bairro"]`);
                if (el) forcarInputLivewire(el, dados.bairro, 'Bairro');
            }
        }, 1400);

        setTimeout(() => {
            if (dados.cidade) {
                const el = document.querySelector(`select[wire\\:model="enderecos.${index}.cidade"]`);
                if (el) {
                    const options = el.querySelectorAll('option');
                    for (let opt of options) {
                        if (opt.textContent.trim().toUpperCase() === dados.cidade.toUpperCase() ||
                            opt.textContent.trim().toUpperCase().includes(dados.cidade.toUpperCase())) {
                            forcarInputLivewire(el, opt.value, 'Cidade');
                            break;
                        }
                    }
                }
            }
        }, 1600);

        setTimeout(() => {
            if (dados.uf) {
                const el = document.querySelector(`select[wire\\:model="enderecos.${index}.uf"]`);
                if (el) {
                    const options = el.querySelectorAll('option');
                    for (let opt of options) {
                        if (opt.value.toUpperCase() === dados.uf.toUpperCase()) {
                            forcarInputLivewire(el, opt.value, 'UF');
                            break;
                        }
                    }
                }
            }
        }, 1800);

        setTimeout(() => {
            const el = document.querySelector(`select[wire\\:model="enderecos.${index}.tipo"]`);
            if (el) forcarInputLivewire(el, 'residencial', 'Tipo');
        }, 2000);
    }

    // ============================================
    // FUNÇÃO PARA VERIFICAR SE É O MODAL CORRETO
    // ============================================
    function isModalInformacoes() {
        const titulo = document.querySelector('.MuiDialog-container .MuiTypography-root[class*="MuiTypography-h6"]');
        if (!titulo) return false;
        return titulo.textContent.trim().startsWith('Informações -');
    }

    // ============================================
    // INJETAR BOTÃO ERP (SÓ NO MODAL DE INFORMAÇÕES)
    // ============================================
    function injetarBotaoERP() {
        // Só injeta se for o modal de informações do cliente
        if (!isModalInformacoes()) {
            return;
        }

        if (document.getElementById('btn-copiar-erp')) return;
        const toolbar = document.querySelector('.MuiDialog-container .MuiToolbar-root');
        if (!toolbar) return;

        const btn = document.createElement('button');
        btn.id = 'btn-copiar-erp';
        btn.textContent = '📋 Capturar Dados';
        Object.assign(btn.style, {
            marginRight: '10px', backgroundColor: '#1976d2', color: 'white',
            padding: '8px 16px', borderRadius: '4px', border: 'none',
            cursor: 'pointer', fontWeight: 'bold', zIndex: '9999'
        });
        btn.addEventListener('click', copiarDadosCliente);
        toolbar.insertBefore(btn, toolbar.firstChild);
        log('Botão ERP injetado (modal de informações)', 'success');
    }

    // ============================================
    // INJETAR BOTÕES TATELEÇOM
    // ============================================
    function injetarBotoesTatelecom() {
        log('Procurando elementos do Tatelecom...', 'info');

        const cpfInput = document.querySelector('#input_cpf') || document.querySelector('input[wire\\:model*="cpf"]');
        if (cpfInput && !document.getElementById('btn-preenche-cpf')) {
            const btn = document.createElement('button');
            btn.id = 'btn-preenche-cpf';
            btn.textContent = '📋 Colar CPF';
            Object.assign(btn.style, {
                marginLeft: '5px', padding: '6px 12px', fontSize: '14px',
                backgroundColor: '#28a745', color: 'white', border: 'none',
                borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold',
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

        const temNome = document.querySelector('#input_nome') || document.querySelector('input[wire\\:model*="nome"]');
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
    // INICIAR
    // ============================================
    const observer = new MutationObserver(() => {
        if (isERP) injetarBotaoERP();
        if (isTatelecom) injetarBotoesTatelecom();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
        if (isERP) injetarBotaoERP();
        if (isTatelecom) injetarBotoesTatelecom();
    }, 1500);

    console.log('🚀 Assistente de Cadastro Tatelecom v1.0.1 carregado!');
    console.log('📌 Modo:', isERP ? 'ERP' : isTatelecom ? 'Tatelecom' : 'Outro');
    console.log('🔇 Sem notificações - feedback visual nos botões');
    console.log('📊 Logs disponíveis no console (F12)');
})();
