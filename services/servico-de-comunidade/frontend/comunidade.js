// ================= CONFIGURAÇÃO DE ROTA AUTOMÁTICA (LOCAL PORTA 8002 & CLOUDFLARE) =================
const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8002" 
    : `${window.location.protocol}//${window.location.host}`;

// Obter token JWT armazenado na sessão (isolado por aba para múltiplos logins)
function obterToken() {
    return sessionStorage.getItem("ludaryumToken") || localStorage.getItem("ludaryumToken") || "";
}

const botaoAbrir = document.querySelector(".btn-publicar");
const modal = document.getElementById("modal-publicacao");
const botaoFechar = document.getElementById("fechar-modal");
const formulario = document.getElementById("form-publicacao");
const listaPublicacoes = document.getElementById("lista-publicacoes");
const listaTopicos = document.getElementById("lista-topicos");
const listaForunsComunidade = document.getElementById("lista-foruns-comunidade");
const listaChatsAtivos = document.getElementById("lista-chats-ativos");
const listaComunidades = document.getElementById("lista-comunidades");
const listaPessoas = document.getElementById("lista-pessoas");

const modalConfirmacao = document.getElementById("modal-confirmacao");
const botaoCancelarExclusao = document.getElementById("cancelar-exclusao");
const botaoConfirmarExclusao = document.getElementById("confirmar-exclusao");

let publicacaoParaExcluir = null;
let socketAtivo = null;

// Identificador único do usuário isolado por sessão (permite abas simultâneas independentes)
let usuarioLudaryum = sessionStorage.getItem("ludaryumUsuarioID");

if (!usuarioLudaryum) {
    usuarioLudaryum = crypto.randomUUID();
    sessionStorage.setItem("ludaryumUsuarioID", usuarioLudaryum);
}

const campoImagem = document.getElementById("imagem-publicacao");
const previewImagem = document.getElementById("preview-imagem");

let imagemSelecionada = "";

if (campoImagem) {
    campoImagem.addEventListener("change", function () {
        const arquivo = campoImagem.files[0];

        if (!arquivo) {
            imagemSelecionada = "";
            if (previewImagem) {
                previewImagem.removeAttribute("src");
                previewImagem.style.display = "none";
            }
            return;
        }

        if (!arquivo.type.startsWith("image/")) {
            alert("Selecione um arquivo de imagem válido.");
            campoImagem.value = "";
            return;
        }

        const leitor = new FileReader();

        leitor.onload = function (evento) {
            imagemSelecionada = evento.target.result;
            if (previewImagem) {
                previewImagem.src = imagemSelecionada;
                previewImagem.style.display = "block";
            }
        };

        leitor.readAsDataURL(arquivo);
    });
}

async function buscarNotificacoesAPI() {
    try {
        const resposta = await fetch(`${API_BASE_URL}/notifications`, {
            headers: { "Authorization": `Bearer ${obterToken()}` }
        });
        if (!resposta.ok) return [];
        return await resposta.json();
    } catch (erro) {
        console.error("Erro ao buscar notificações:", erro);
        return [];
    }
}

async function salvarNotificacao(mensagem) {
    try {
        await fetch(`${API_BASE_URL}/notifications`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${obterToken()}`
            },
            body: JSON.stringify({
                destinatario_email: sessionStorage.getItem("ludaryumEmail") || localStorage.getItem("ludaryumEmail") || "user@ludarium.com",
                conteudo: mensagem
            })
        });
        mostrarNotificacoes();
    } catch (erro) {
        console.error("Erro ao salvar notificação:", erro);
    }
}

async function mostrarNotificacoes() {
    const notificacoesServidor = await buscarNotificacoesAPI();
    const lista = document.getElementById("lista-notificacoes");

    if (!lista) return;

    lista.replaceChildren();

    if (notificacoesServidor.length === 0) {
        const mensagem = document.createElement("p");
        mensagem.className = "notificacoes-vazio";
        mensagem.textContent = "Você ainda não tem notificações.";
        lista.appendChild(mensagem);
        return;
    }

    notificacoesServidor.forEach(function (notificacao) {
        const item = document.createElement("div");
        item.className = "item-notificacao";

        const texto = document.createElement("p");
        texto.textContent = notificacao.content || notificacao.mensagem;

        const data = document.createElement("small");
        data.textContent = notificacao.created_at ? new Date(notificacao.created_at).toLocaleString("pt-BR") : (notificacao.data || "");

        item.append(texto, data);
        lista.appendChild(item);
    });
}

// ================= CORREÇÃO DO MODAL (ESTADO INICIAL SEGURO) =================
function abrirModal() {
    if (modal) {
        modal.style.display = "flex";
        modal.removeAttribute("hidden");
        document.body.style.overflow = "hidden";

        const tituloInput = document.getElementById("titulo-publicacao");
        if (tituloInput) tituloInput.focus();
    }
}

function fecharModal() {
    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("hidden", "true");
        document.body.style.overflow = "";
    }
}

// Garante que o modal de publicação nasce estritamente fechado ao carregar a página
if (modal) {
    modal.style.display = "none";
    modal.setAttribute("hidden", "true");
}

async function buscarPublicacoes() {
    try {
        const resposta = await fetch(`${API_BASE_URL}/publicacoes`, {
            headers: { "Authorization": `Bearer ${obterToken()}` }
        });
        if (!resposta.ok) return [];
        return await resposta.json();
    } catch (erro) {
        console.error("Erro ao carregar publicações do servidor:", erro);
        return [];
    }
}

/* ===== ABRIR E VISUALIZAR FÓRUM SELECIONADO ===== */
async function abrirForumDetalhes(forumId, forumTitulo) {
    if (!listaPublicacoes) return;

    listaPublicacoes.replaceChildren();

    const containerForum = document.createElement("div");
    containerForum.className = "forum-container-ativo";
    containerForum.style.cssText = "background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 20px;";
    
    containerForum.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <h2 style="color: #fff; margin: 0;">💬 ${forumTitulo}</h2>
                    <span id="status-conexao-chat" style="font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(234, 179, 8, 0.2); color: #facc15;">Conectando...</span>
                </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <button type="button" id="btn-denunciar-forum" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;">🚨 Denunciar</button>
                <button type="button" id="voltar-feed" class="btn-secundario" style="padding: 6px 12px; font-size: 12px; cursor: pointer;">Voltar ao Feed</button>
            </div>
        </div>
        <div id="historico-mensagens-forum" style="max-height: 350px; overflow-y: auto; margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; padding-right: 5px; scroll-behavior: smooth;">
            <p style="color: #94899d; text-align: center;">Carregando mensagens do fórum...</p>
        </div>
        <div id="indicador-digitacao-forum" style="color: #d77bf4; font-size: 11px; font-style: italic; min-height: 16px; margin-bottom: 8px; display: none;"></div>
        <form id="form-enviar-msg-forum" style="display: flex; gap: 10px;">
            <input type="text" id="input-msg-forum" placeholder="Escreva a sua mensagem para o fórum..." required style="flex: 1; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px; border-radius: 8px;">
            <button type="submit" class="btn-publicar" style="padding: 0 20px; cursor: pointer;">Enviar</button>
        </form>
    `;

    listaPublicacoes.appendChild(containerForum);

    // Associação direta do botão de denúncia ao modal estático presente no HTML
    const botaoDenunciar = document.getElementById("btn-denunciar-forum");
    if (botaoDenunciar) {
        botaoDenunciar.addEventListener("click", () => {
            abrirModalDenuncia(forumId, forumTitulo);
        });
    }

    document.getElementById("voltar-feed").addEventListener("click", () => {
        if (socketAtivo) socketAtivo.close();
        mostrarPublicacoes();
    });

    const containerMsgsForum = document.getElementById("historico-mensagens-forum");
    const divIndicadorForum = document.getElementById("indicador-digitacao-forum");
    const inputMsgForum = document.getElementById("input-msg-forum");

    async function carregarMensagensForum(rolarParaBaixo = false) {
        try {
            const resp = await fetch(`${API_BASE_URL}/foruns/${forumId}/mensagens`, {
                headers: { "Authorization": `Bearer ${obterToken()}` }
            });
            if (resp.ok) {
                const msgs = await resp.json();
                if (!containerMsgsForum) return;
                
                containerMsgsForum.replaceChildren();
                if (msgs.length === 0) {
                    containerMsgsForum.innerHTML = '<p style="color: #94899d; text-align: center;">Ainda não há mensagens neste fórum. Seja o primeiro a falar!</p>';
                    return;
                }

                msgs.forEach(m => {
                    const div = document.createElement("div");
                    div.style.cssText = "background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;";
                    div.innerHTML = `<strong style="color: #a855f7;">@${m.autor || 'Utilizador'}</strong><p style="margin: 5px 0 0 0; color: #ddd;">${m.conteudo}</p>`;
                    containerMsgsForum.appendChild(div);
                });

                if (rolarParaBaixo) {
                    containerMsgsForum.scrollTop = containerMsgsForum.scrollHeight;
                }
            }
        } catch (e) {
            console.error("Erro ao carregar mensagens do fórum:", e);
        }
    }

    await carregarMensagensForum(true);

    let temporizadorDigitacaoForum = null;
    let timeoutOcultarIndicadorForum = null;

    if (inputMsgForum) {
        inputMsgForum.addEventListener("input", () => {
            if (!socketAtivo || socketAtivo.readyState !== WebSocket.OPEN) return;

            if (!temporizadorDigitacaoForum) {
                socketAtivo.send(JSON.stringify({ 
                    tipo: "digitando", 
                    autor: sessionStorage.getItem("ludaryumNome") || "Membro" 
                }));
            }

            clearTimeout(temporizadorDigitacaoForum);
            temporizadorDigitacaoForum = setTimeout(() => {
                temporizadorDigitacaoForum = null;
            }, 1500);
        });
    }

    conectarWebSocket(`/ws/forum/${forumId}`, (dados) => {
        if (dados.tipo === "digitando") {
            if (divIndicadorForum) {
                divIndicadorForum.textContent = `✍️ @${dados.autor || 'Alguém'} está digitando...`;
                divIndicadorForum.style.display = "block";

                clearTimeout(timeoutOcultarIndicadorForum);
                timeoutOcultarIndicadorForum = setTimeout(() => {
                    divIndicadorForum.style.display = "none";
                }, 2000);
            }
            return;
        }

        if (!containerMsgsForum) return;
        const div = document.createElement("div");
        div.style.cssText = "background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;";
        div.innerHTML = `<strong style="color: #a855f7;">@${dados.autor || 'Utilizador'}</strong><p style="margin: 5px 0 0 0; color: #ddd;">${dados.conteudo}</p>`;
        containerMsgsForum.appendChild(div);
        containerMsgsForum.scrollTop = containerMsgsForum.scrollHeight;

        if (divIndicadorForum) {
            divIndicadorForum.style.display = "none";
        }
    });

    const formMsg = document.getElementById("form-enviar-msg-forum");
    formMsg.addEventListener("submit", async (e) => {
        e.preventDefault();
        const conteudo = inputMsgForum.value.trim();
        if (!conteudo) return;

        try {
            const resp = await fetch(`${API_BASE_URL}/foruns/${forumId}/mensagens`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${obterToken()}`
                },
                body: JSON.stringify({ conteudo })
            });

            if (resp.ok) {
                inputMsgForum.value = "";
                await carregarMensagensForum(true);
            } else {
                const err = await resp.json();
                alert(err.detail || "Erro ao enviar mensagem.");
            }
        } catch (err) {
            console.error("Erro ao enviar mensagem:", err);
        }
    });
}

/* ===== EXIBIR TODOS OS FÓRUNS NA ABA DISCUSSÃO ===== */
async function mostrarForunsNoFeed() {
    if (!listaPublicacoes) return;
    listaPublicacoes.replaceChildren();

    const tituloSecao = document.createElement("h2");
    tituloSecao.textContent = "💬 Fóruns Ativos da Comunidade";
    tituloSecao.style.cssText = "margin-bottom: 20px; color: #fff;";
    listaPublicacoes.appendChild(tituloSecao);

    try {
        const resp = await fetch(`${API_BASE_URL}/foruns`);
        if (resp.ok) {
            const foruns = await resp.json();
            if (foruns.length === 0) {
                const p = document.createElement("p");
                p.className = "feed-vazio";
                p.textContent = "Nenhum fórum ativo no momento.";
                listaPublicacoes.appendChild(p);
                return;
            }

            foruns.forEach(forum => {
                const card = document.createElement("article");
                card.className = "publicacao";
                card.style.cursor = "pointer";
                card.innerHTML = `
                    <span class="etiqueta">${forum.categoria || 'Geral'}</span>
                    <h2>${forum.titulo}</h2>
                    <p>${forum.descricao}</p>
                    <small style="color: #94899d;">Criado em: ${new Date(forum.created_at || Date.now()).toLocaleDateString('pt-BR')}</small>
                    <div style="margin-top: 15px;">
                        <button type="button" class="btn-publicar" style="padding: 6px 16px; font-size: 12px;">Participar do Fórum</button>
                    </div>
                `;
                card.addEventListener("click", () => {
                    abrirForumDetalhes(forum.id, forum.titulo);
                });
                listaPublicacoes.appendChild(card);
            });
        }
    } catch (e) {
        console.error("Erro ao carregar fóruns no feed:", e);
    }
}

/* ===== CARREGAR FÓRUNS E CHATS DA COMUNIDADE ===== */
async function carregarForunsEChats() {
    if (listaForunsComunidade) {
        try {
            const resp = await fetch(`${API_BASE_URL}/foruns`);
            if (resp.ok) {
                const foruns = await resp.json();
                listaForunsComunidade.replaceChildren();
                
                if (foruns.length === 0) {
                    listaForunsComunidade.innerHTML = '<p class="mensagem-pessoas">Nenhum fórum ativo.</p>';
                } else {
                    foruns.forEach(forum => {
                        const div = document.createElement("div");
                        div.className = "forum-item-sidebar";
                        div.style.cssText = "padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); cursor: pointer;";
                        div.innerHTML = `<strong>💬 ${forum.titulo}</strong><br><small style="color: #94899d;">${forum.categoria || 'Geral'}</small>`;
                        
                        div.addEventListener("click", () => {
                            abrirForumDetalhes(forum.id, forum.titulo);
                        });
                        listaForunsComunidade.appendChild(div);
                    });
                }
            } else {
                listaForunsComunidade.innerHTML = '<p class="mensagem-pessoas">Erro ao carregar fóruns.</p>';
            }
        } catch (e) {
            console.error("Erro ao buscar fóruns:", e);
            listaForunsComunidade.innerHTML = '<p class="mensagem-pessoas">Indisponível no momento.</p>';
        }
    }

    carregarChatsCandidatura();

    if (listaPessoas) {
        try {
            const resp = await fetch(`${API_BASE_URL}/recomendados/skills`);
            if (resp.ok) {
                const pessoas = await resp.json();
                listaPessoas.replaceChildren();
                pessoas.forEach(p => {
                    const div = document.createElement("div");
                    div.className = "pessoa";
                    div.innerHTML = `
                        <div class="pessoa-info">
                            <span class="pessoa-avatar ciano">${p.nome.slice(0,2).toUpperCase()}</span>
                            <div>
                                <strong>${p.nome}</strong>
                                <small>${p.papel}</small>
                                <span class="afinidade">${p.compatibilidade_porcentagem}% Afinidade</span>
                            </div>
                        </div>
                        <button type="button">Conectar</button>
                    `;
                    listaPessoas.appendChild(div);
                });
            }
        } catch (e) {
            console.error("Erro ao buscar pessoas:", e);
            listaPessoas.innerHTML = '<p class="mensagem-pessoas">Nenhuma recomendação no momento.</p>';
        }
    }
}

/* ===== REGISTRAR PARTICIPAÇÃO ===== */
async function registrarParticipacao(publicacaoId, modalidade) {
    try {
        const resposta = await fetch(`${API_BASE_URL}/publicacoes/${publicacaoId}/participar`, {
            method: "PATCH",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${obterToken()}` 
            },
            body: JSON.stringify({ modalidade: modalidade })
        });

        if (resposta.ok) {
            mostrarPublicacoes();
            carregarChatsCandidatura();
            alert("Candidatura registrada com sucesso! Um chat dedicado foi disponibilizado para você.");
        } else {
            const erroJson = await resposta.json();
            alert(erroJson.detail || "Não foi possível processar a participação.");
        }
    } catch (erro) {
        console.error("Erro na participação:", erro);
    }
}

/* ===== TÓPICOS EM ALTA ===== */
async function mostrarTopicos() {
    const publicacoes = await buscarPublicacoes();

    if (!listaTopicos) return;

    const contagem = {};

    publicacoes.forEach(function (publicacao) {
        const assunto = publicacao.categoria || publicacao.comunidade;

        if (assunto) {
            contagem[assunto] = (contagem[assunto] || 0) + 1;
        }
    });

    const topicos = Object.entries(contagem)
        .sort(function (a, b) {
            return b[1] - a[1];
        })
        .slice(0, 4);

    listaTopicos.replaceChildren();

    if (topicos.length === 0) {
        listaTopicos.innerHTML =
            '<p class="mensagem-pessoas">Ainda não há tópicos em alta.</p>';
        return;
    }

    topicos.forEach(function (topico, indice) {
        const link = document.createElement("a");
        link.className = "topico";
        link.href = "#lista-publicacoes";

        const numero = document.createElement("span");
        numero.textContent = String(indice + 1).padStart(2, "0");

        const conteudo = document.createElement("div");

        const nome = document.createElement("strong");
        nome.textContent = topico[0];

        const quantidade = document.createElement("small");
        quantidade.textContent =
            topico[1] + (topico[1] === 1 ? " publicação" : " publicações");

        conteudo.append(nome, quantidade);
        link.append(numero, conteudo);

        link.addEventListener("click", function () {
            categoriaAtiva = topico[0];

            document.querySelectorAll(".categoria-feed").forEach(function (botao) {
                botao.classList.toggle(
                    "ativa",
                    botao.dataset.categoria === categoriaAtiva
                );
            });

            mostrarPublicacoes();
        });

        listaTopicos.appendChild(link);
    });
}

let categoriaAtiva = "Para você";
let comunidadeAtiva = "todas";

async function mostrarPublicacoes() {
    const publicacoes = await buscarPublicacoes();

    if (!listaPublicacoes) return;

    const publicacoesFiltradas = publicacoes.filter(function (publicacao) {
        const catPub = (publicacao.categoria || publicacao.tipo_badge || "").toLowerCase();
        const ativa = categoriaAtiva.toLowerCase();

        if (ativa === "para você" || ativa === "todas") {
            return true;
        }

        const correspondeCategoria =
            catPub.includes(ativa) ||
            (ativa === "discussão" && (catPub.includes("game design") || catPub.includes("geral") || catPub === "discussão" || !catPub));

        const correspondeComunidade =
            comunidadeAtiva === "todas" ||
            publicacao.comunidade === comunidadeAtiva;

        return correspondeCategoria && correspondeComunidade;
    });

    listaPublicacoes.replaceChildren();

    if (publicacoesFiltradas.length === 0) {
        const mensagem = document.createElement("p");

        mensagem.className = "feed-vazio";
        mensagem.textContent =
            "Ainda não há publicações. Seja o primeiro a compartilhar uma ideia!";

        listaPublicacoes.appendChild(mensagem);
        return;
    }

    publicacoesFiltradas.forEach(function (publicacao) {
        const artigo = document.createElement("article");
        artigo.className = "publicacao";

        const categoria = document.createElement("span");
        categoria.className = "etiqueta";
        categoria.textContent = publicacao.categoria || publicacao.tipo_badge || publicacao.comunidade;

        const titulo = document.createElement("h2");
        titulo.textContent = publicacao.titulo;
        
        const descricao = document.createElement("p");
        descricao.textContent = publicacao.descricao || publicacao.conteudo;

        if (publicacao.imagem) {
            const imagem = document.createElement("img");

            imagem.src = publicacao.imagem;
            imagem.alt = "Capa da publicação";
            imagem.className = "imagem-post";

            artigo.appendChild(imagem);
        }

        const data = document.createElement("small");
        data.textContent = "Publicado em " + (publicacao.data || "recentemente");

        let areaParticipacao = null;

        if (publicacao.aceitarParticipantes !== false) {
            areaParticipacao = document.createElement("div");
            areaParticipacao.className = "area-participacao";

            const interessados = Array.isArray(publicacao.interessados)
                ? publicacao.interessados
                : [];

            const contadorInteressados = document.createElement("span");
            contadorInteressados.className = "contador-interessados";
            contadorInteressados.textContent =
                "♧ " + (publicacao.interessados_qtd || interessados.length) + " interessados";

            areaParticipacao.appendChild(contadorInteressados);

            const botoesParticipacao = document.createElement("div");
            botoesParticipacao.className = "botoes-participacao";

            const minhaParticipacao = interessados.find(
                item => item.usuario === usuarioLudaryum
            );

            const modalidades = publicacao.modalidadesParticipacao || ["individual", "equipe"];

            if (modalidades.includes("individual")) {
                const botaoIndividual = document.createElement("button");
                botaoIndividual.type = "button";
                botaoIndividual.className = "botao-participacao";

                botaoIndividual.textContent =
                    minhaParticipacao?.modalidade === "individual"
                        ? "CANCELAR PARTICIPAÇÃO"
                        : "QUERO PARTICIPAR";

                botaoIndividual.addEventListener("click", function () {
                    registrarParticipacao(publicacao.id || publicacao._id, "individual");
                });

                botoesParticipacao.appendChild(botaoIndividual);
            }

            if (modalidades.includes("equipe")) {
                const botaoEquipe = document.createElement("button");
                botaoEquipe.type = "button";
                botaoEquipe.className = "botao-participacao botao-equipe";

                botaoEquipe.textContent =
                    minhaParticipacao?.modalidade === "equipe"
                        ? "CANCELAR PARTICIPAÇÃO"
                        : "PARTICIPAR EM EQUIPE";

                botaoEquipe.addEventListener("click", function () {
                    registrarParticipacao(publicacao.id || publicacao._id, "equipe");
                });

                botoesParticipacao.appendChild(botaoEquipe);
            }

            areaParticipacao.appendChild(botoesParticipacao);
        }

        const areaCurtidas = document.createElement("div");
        areaCurtidas.className = "area-curtidas";

        const botaoCurtir = document.createElement("button");
        botaoCurtir.type = "button";
        botaoCurtir.className = "botao-curtir";

        const quantidadeCurtidas = publicacao.votos || publicacao.curtidas || 0;
        const curtido = publicacao.curtidoPorMim === true;

        botaoCurtir.textContent =
            (curtido ? "♥ Curtido (" : "♡ Curtir (") +
            quantidadeCurtidas + ")";

        if (curtido) {
            botaoCurtir.classList.add("curtido");
        }

        botaoCurtir.addEventListener("click", async function () {
            try {
                await fetch(`${API_BASE_URL}/publicacoes/${publicacao.id || publicacao._id}/votar`, {
                    method: "PATCH",
                    headers: { "Authorization": `Bearer ${obterToken()}` }
                });
                salvarNotificacao("Sua publicação recebeu uma curtida: " + publicacao.titulo);
                mostrarPublicacoes();
            } catch (erro) {
                console.error("Erro ao votar:", erro);
            }
        });

        areaCurtidas.appendChild(botaoCurtir);

        const botaoExcluir = document.createElement("button");

        botaoExcluir.type = "button";
        botaoExcluir.className = "botao-excluir";
        botaoExcluir.textContent = "Excluir";

        botaoExcluir.addEventListener("click", function () {
            publicacaoParaExcluir = publicacao;

            if (modalConfirmacao) {
                modalConfirmacao.style.display = "flex";
                document.body.style.overflow = "hidden";
            }
        });

        areaCurtidas.appendChild(botaoExcluir);

        artigo.append(categoria, titulo, descricao, data);

        if (areaParticipacao) {
            artigo.appendChild(areaParticipacao);
        }

        artigo.appendChild(areaCurtidas);
        listaPublicacoes.appendChild(artigo);
    });
}

if (botaoAbrir) botaoAbrir.addEventListener("click", abrirModal);
if (botaoFechar) botaoFechar.addEventListener("click", fecharModal);

if (modal) {
    modal.addEventListener("click", function (evento) {
        if (evento.target === modal) {
            fecharModal();
        }
    });
}

document.addEventListener("keydown", function (evento) {
    if (evento.key === "Escape" && modal && modal.style.display === "flex") {
        fecharModal();
    }
});

/* ===== GERENCIAR MODAL DE CRIAR FÓRUM ===== */
const btnAbrirModalForum = document.getElementById("btn-abrir-modal-forum");
const modalForum = document.getElementById("modal-forum");
const btnFecharModalForum = document.getElementById("fechar-modal-forum");
const formCriarForum = document.getElementById("form-criar-forum");

if (modalForum) {
    modalForum.style.display = "none";
    modalForum.hidden = true;
}

if (btnAbrirModalForum && modalForum) {
    btnAbrirModalForum.addEventListener("click", () => {
        modalForum.style.display = "flex";
        modalForum.removeAttribute("hidden");
        document.body.style.overflow = "hidden";
    });
}

if (btnFecharModalForum && modalForum) {
    btnFecharModalForum.addEventListener("click", () => {
        modalForum.style.display = "none";
        modalForum.hidden = true;
        document.body.style.overflow = "";
    });
}

if (modalForum) {
    modalForum.addEventListener("click", (evento) => {
        if (evento.target === modalForum) {
            modalForum.style.display = "none";
            modalForum.hidden = true;
            document.body.style.overflow = "";
        }
    });
}

if (formCriarForum) {
    formCriarForum.addEventListener("submit", async (e) => {
        e.preventDefault();
        const titulo = document.getElementById("titulo-forum").value.trim();
        const categoria = document.getElementById("categoria-forum").value.trim();
        const descricao = document.getElementById("descricao-forum").value.trim();

        if (!titulo || !categoria || !descricao) return;

        try {
            const resp = await fetch(`${API_BASE_URL}/foruns`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${obterToken()}`
                },
                body: JSON.stringify({ titulo, categoria, descricao })
            });

            if (resp.ok) {
                formCriarForum.reset();
                modalForum.style.display = "none";
                modalForum.hidden = true;
                document.body.style.overflow = "";
                carregarForunsEChats();
                alert("Fórum criado com sucesso!");
            } else {
                const erro = await resp.json();
                alert(erro.detail || "Erro ao criar fórum.");
            }
        } catch (err) {
            console.error("Erro ao criar fórum:", err);
        }
    });
}

/* ===== GERENCIAR MODAL DE CRIAR CHAT OU GRUPO ===== */
const btnAbrirModalGrupo = document.getElementById("btn-abrir-modal-grupo");
const modalGrupoPrivado = document.getElementById("modal-grupo-privado");
const btnFecharModalGrupo = document.getElementById("fechar-modal-grupo");
const formCriarGrupoPrivado = document.getElementById("form-criar-grupo-privado");

if (modalGrupoPrivado) {
    modalGrupoPrivado.style.display = "none";
    modalGrupoPrivado.hidden = true;
}

if (btnAbrirModalGrupo && modalGrupoPrivado) {
    btnAbrirModalGrupo.addEventListener("click", () => {
        modalGrupoPrivado.style.display = "flex";
        modalGrupoPrivado.removeAttribute("hidden");
        document.body.style.overflow = "hidden";
        
        const nomeInput = document.getElementById("nome-novo-grupo");
        if (nomeInput) nomeInput.focus();
    });
}

if (btnFecharModalGrupo && modalGrupoPrivado) {
    btnFecharModalGrupo.addEventListener("click", () => {
        modalGrupoPrivado.style.display = "none";
        modalGrupoPrivado.hidden = true;
        document.body.style.overflow = "";
    });
}

if (modalGrupoPrivado) {
    modalGrupoPrivado.addEventListener("click", (evento) => {
        if (evento.target === modalGrupoPrivado) {
            modalGrupoPrivado.style.display = "none";
            modalGrupoPrivado.hidden = true;
            document.body.style.overflow = "";
        }
    });
}

if (formCriarGrupoPrivado) {
    formCriarGrupoPrivado.addEventListener("submit", async (e) => {
        e.preventDefault();
        const nomeInput = document.getElementById("nome-novo-grupo");
        const descInput = document.getElementById("descricao-novo-grupo");
        const membrosInput = document.getElementById("membros-novo-grupo");

        const nome = nomeInput ? nomeInput.value.trim() : "";
        const descricao = descInput ? descInput.value.trim() : "";
        const membrosText = membrosInput ? membrosInput.value.trim() : "";

        const membros_usernames = membrosText ? membrosText.split(",").map(m => m.trim().replace("@", "")).filter(Boolean) : [];

        if (!nome) return;

        try {
            const resp = await fetch(`${API_BASE_URL}/grupos`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${obterToken()}`
                },
                body: JSON.stringify({
                    nome: nome,
                    descricao: descricao || "Grupo criado na comunidade",
                    tipo: "grupo",
                    membros_usernames: membros_usernames
                })
            });

            if (resp.ok) {
                formCriarGrupoPrivado.reset();
                modalGrupoPrivado.style.display = "none";
                modalGrupoPrivado.hidden = true;
                document.body.style.overflow = "";
                
                carregarChatsCandidatura();
                alert("Chat ou grupo criado com sucesso!");
            } else {
                const err = await resp.json();
                alert(err.detail || "Erro ao criar grupo.");
            }
        } catch (err) {
            console.error("Erro ao criar grupo:", err);
            alert("Erro de conexão ao criar o grupo.");
        }
    });
}

if (formulario) {
    formulario.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const tituloInput = document.getElementById("titulo-publicacao");
        const categoriaInput = document.getElementById("categoria-publicacao");
        const comunidadeInput = document.getElementById("comunidade-publicacao");
        const descricaoInput = document.getElementById("texto-publicacao");
        const aceitarPartInput = document.getElementById("aceitar-participantes");
        const partIndivInput = document.getElementById("participacao-individual");
        const partEquipeInput = document.getElementById("participacao-equipe");

        const titulo = tituloInput ? tituloInput.value.trim() : "";
        const categoria = categoriaInput ? categoriaInput.value : "DISCUSSÃO";
        const comunidade = comunidadeInput ? comunidadeInput.value : "Dev Indie Brasil";
        const descricao = descricaoInput ? descricaoInput.value.trim() : "";

        if (!titulo || !descricao) {
            alert("Preencha todos os campos obrigatórios antes de publicar.");
            return;
        }

        const modalidades = [];
        if (partIndivInput && partIndivInput.checked) modalidades.push("individual");
        if (partEquipeInput && partEquipeInput.checked) modalidades.push("equipe");

        try {
            const resposta = await fetch(`${API_BASE_URL}/publicacoes`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${obterToken()}`
                },
                body: JSON.stringify({
                    titulo: titulo,
                    categoria: categoria,
                    comunidade: comunidade,
                    descricao: descricao,
                    conteudo: descricao,
                    tipo_badge: categoria,
                    imagem: imagemSelecionada,
                    aceitarParticipantes: aceitarPartInput ? aceitarPartInput.checked : true,
                    modalidadesParticipacao: modalidades,
                    tags: ["ludarium", "comunidade"]
                })
            });

            if (resposta.ok) {
                formulario.reset();
                fecharModal();
                mostrarPublicacoes();
                mostrarTopicos();
                carregarForunsEChats();

                const modalSucesso = document.getElementById("modal-sucesso");

                if (modalSucesso) {
                    modalSucesso.hidden = false;
                    document.body.style.overflow = "hidden";
                }
            } else {
                alert("Erro ao criar publicação no servidor.");
            }
        } catch (erro) {
            console.error("Erro ao enviar publicação:", erro);
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const botoesCategoriasInit = document.querySelectorAll(".categoria-feed");
    botoesCategoriasInit.forEach(function (botao) {
        if (botao.dataset.categoria && botao.dataset.categoria.toLowerCase() === "para você") {
            botao.classList.add("ativa");
        }
    });
});

mostrarPublicacoes();
mostrarTopicos();
carregarForunsEChats();

function fecharConfirmacao() {
    if (modalConfirmacao) {
        modalConfirmacao.style.display = "none";
        document.body.style.overflow = "";
        publicacaoParaExcluir = null;
    }
}

if (botaoCancelarExclusao) {
    botaoCancelarExclusao.addEventListener("click", function () {
        fecharConfirmacao();
    });
}

if (botaoConfirmarExclusao) {
    botaoConfirmarExclusao.addEventListener("click", async function () {
        if (!publicacaoParaExcluir) {
            fecharConfirmacao();
            return;
        }

        const pubId = publicacaoParaExcluir.id || publicacaoParaExcluir._id;

        try {
            await fetch(`${API_BASE_URL}/publicacoes/${pubId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${obterToken()}` }
            });

            fecharConfirmacao();
            mostrarPublicacoes();
            mostrarTopicos();
            carregarForunsEChats();
        } catch (erro) {
            console.error("Erro ao excluir publicação:", erro);
        }
    });
}

if (modalConfirmacao) {
    modalConfirmacao.addEventListener("click", function (evento) {
        if (evento.target === modalConfirmacao) {
            fecharConfirmacao();
        }
    });
}

document.addEventListener("keydown", function (evento) {
    if (
        evento.key === "Escape" &&
        modalConfirmacao &&
        modalConfirmacao.style.display === "flex"
    ) {
        fecharConfirmacao();
    }
});

/* ===== ALTERNAR TEMA DO LUDARYUM ===== */

const botaoTema = document.getElementById("alternar-tema");
const iconeTema = botaoTema?.querySelector("svg");

function aplicarTema(tema) {
    document.documentElement.setAttribute("data-tema", tema);

    localStorage.setItem("tema-ludaryum", tema);

    if (iconeTema && botaoTema) {
        iconeTema.innerHTML = tema === "claro"
            ? `<svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4"></circle>
                <path d="M12 2v2"></path>
                <path d="M12 20v2"></path>
                <path d="m4.93 4.93 1.42 1.42"></path>
                <path d="m17.65 17.65 1.42 1.42"></path>
                <path d="M2 12h2"></path>
                <path d="M20 12h2"></path>
                <path d="m6.35 17.65-1.42 1.42"></path>
                <path d="m19.07 4.93-1.42 1.42"></path>
               </svg>`
            : `<svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
               </svg>`;

        botaoTema.setAttribute(
            "aria-label",
            tema === "claro" ? "Ativar tema escuro" : "Ativar tema claro"
        );
    }
}

const temaSalvo = localStorage.getItem("tema-ludaryum") || "escuro";

aplicarTema(temaSalvo);

if (botaoTema) {
    botaoTema.addEventListener("click", function () {
        const temaAtual = document.documentElement.getAttribute("data-tema");

        aplicarTema(temaAtual === "claro" ? "escuro" : "claro");
    });
}

/* ===== FUNCIONAMENTO DAS NOTIFICAÇÕES ===== */

const botaoNotificacoes = document.getElementById("abrir-notificacoes");
const painelNotificacoes = document.getElementById("painel-notificacoes");
const fecharNotificacoes = document.getElementById("fechar-notificacoes");

if (botaoNotificacoes && painelNotificacoes && fecharNotificacoes) {

    botaoNotificacoes.addEventListener("click", function () {
        painelNotificacoes.classList.toggle("aberto");

        if (painelNotificacoes.classList.contains("aberto")) {
            mostrarNotificacoes();
        }
    });

    fecharNotificacoes.addEventListener("click", function () {
        painelNotificacoes.classList.remove("aberto");
    });

}

document.addEventListener("click", function (evento) {
    if (
        painelNotificacoes &&
        !painelNotificacoes.contains(evento.target) &&
        botaoNotificacoes &&
        !botaoNotificacoes.contains(evento.target)
    ) {
        painelNotificacoes.classList.remove("aberto");
    }
});

/* ===== MENU DO PERFIL NA COMUNIDADE ===== */

const botaoPerfil = document.getElementById("botao-perfil");
const menuPerfil = document.getElementById("menu-perfil");
const perfilContainer = document.querySelector(".perfil-container");

if (botaoPerfil && menuPerfil && perfilContainer) {
    let temporizadorFechar;

    function abrirMenuPerfil() {
        clearTimeout(temporizadorFechar);
        menuPerfil.hidden = false;
        botaoPerfil.setAttribute("aria-expanded", "true");
    }

    function fecharMenuPerfil() {
        menuPerfil.hidden = true;
        botaoPerfil.setAttribute("aria-expanded", "false");
    }

    function agendarFechamento() {
        clearTimeout(temporizadorFechar);

        temporizadorFechar = setTimeout(function () {
            fecharMenuPerfil();
        }, 300);
    }

    perfilContainer.addEventListener("mouseenter", abrirMenuPerfil);
    perfilContainer.addEventListener("mouseleave", agendarFechamento);

    botaoPerfil.addEventListener("click", function (evento) {
        evento.stopPropagation();

        if (menuPerfil.hidden) {
            abrirMenuPerfil();
        } else {
            fecharMenuPerfil();
        }
    });

    menuPerfil.addEventListener("click", function (evento) {
        evento.stopPropagation();
    });

    document.addEventListener("click", function (evento) {
        if (!perfilContainer.contains(evento.target)) {
            fecharMenuPerfil();
        }
    });
}

/* ===== ATUALIZAR DADOS DO PERFIL ===== */

function atualizarPerfilNoMenu() {
    const nomeSalvo = sessionStorage.getItem("ludaryumNome") || localStorage.getItem("ludaryumNome");
    const fotoSalva = sessionStorage.getItem("ludaryumFoto") || localStorage.getItem("ludaryumFoto");

    const nomeMenu = document.getElementById("nome-menu-perfil");
    const iniciais = document.getElementById("iniciais-perfil-menu");
    const avatar = document.getElementById("botao-perfil");
    const avatarMenu = document.getElementById("avatar-menu-perfil");

    if (nomeSalvo) {
        if (nomeMenu) {
            nomeMenu.textContent = nomeSalvo;
        }

        const partes = nomeSalvo.trim().split(/\s+/).filter(Boolean);
        const letras = partes
            .slice(0, 2)
            .map(parte => parte[0].toUpperCase())
            .join("") || "LM";

        if (iniciais) iniciais.textContent = letras;
        if (avatarMenu && !fotoSalva) avatarMenu.textContent = letras;
    }

    if (avatar && fotoSalva) {
        avatar.style.backgroundImage = `url("${fotoSalva}")`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
        avatar.style.backgroundRepeat = "no-repeat";

        if (iniciais) iniciais.style.display = "none";
    }

    if (avatarMenu && fotoSalva) {
        avatarMenu.style.backgroundImage = `url("${fotoSalva}")`;
        avatarMenu.style.backgroundSize = "cover";
        avatarMenu.style.backgroundPosition = "center";
        avatarMenu.style.backgroundRepeat = "no-repeat";
        avatarMenu.textContent = "";
    }
}

atualizarPerfilNoMenu();

/* ===== FILTROS DAS CATEGORIAS ===== */

const botoesCategorias = document.querySelectorAll(".categoria-feed");

botoesCategorias.forEach(function (botao) {
    botao.addEventListener("click", function () {
        categoriaAtiva = botao.dataset.categoria;
        comunidadeAtiva = "todas";

        botoesCategorias.forEach(function (item) {
            item.classList.toggle(
                "ativa",
                item.dataset.categoria === categoriaAtiva
            );
        });

        if (categoriaAtiva.toLowerCase() === "discussão") {
            mostrarForunsNoFeed();
        } else {
            mostrarPublicacoes();
        }
        mostrarTopicos();
    });
});

/* ===== FILTROS DAS COMUNIDADES ===== */

const botoesComunidades = document.querySelectorAll(".grupo");

botoesComunidades.forEach(function (botao) {
    botao.addEventListener("click", function (evento) {
        evento.preventDefault();

        comunidadeAtiva = botao.dataset.comunidade;
        categoriaAtiva = "todas";

        botoesCategorias.forEach(function (item) {
            item.classList.toggle(
                "ativa",
                item.dataset.categoria === "todas"
            );
        });

        mostrarPublicacoes();
    });
});

/* ========================================
   MODAL — DESCOBRIR COMUNIDADES
======================================== */

const botaoDescobrirGrupos = document.querySelector(".btn-grupos");
const modalGrupos = document.getElementById("modal-grupos");
const botaoFecharModalGrupos = document.getElementById("fechar-modal-grupos");

if (modalGrupos) {
    modalGrupos.hidden = true;
}

if (botaoDescobrirGrupos && modalGrupos && botaoFecharModalGrupos) {
    botaoDescobrirGrupos.addEventListener("click", function () {
        modalGrupos.hidden = false;
    });

    botaoFecharModalGrupos.addEventListener("click", function () {
        modalGrupos.hidden = true;
    });

    modalGrupos.addEventListener("click", function (evento) {
        if (evento.target === modalGrupos) {
            modalGrupos.hidden = true;
        }
    });

    document.addEventListener("keydown", function (evento) {
        if (evento.key === "Escape") {
            modalGrupos.hidden = true;
        }
    });
}

/* ========================================
   PESQUISA DE COMUNIDADES
======================================== */

const campoPesquisaGrupos = document.getElementById("pesquisar-grupos");
const gruposDisponiveis = document.querySelectorAll(".grupo-disponivel");

if (campoPesquisaGrupos) {
    campoPesquisaGrupos.addEventListener("input", function () {
        const pesquisa = campoPesquisaGrupos.value
            .trim()
            .toLowerCase();

        gruposDisponiveis.forEach(function (grupo) {
            const nomeGrupo = grupo.textContent.toLowerCase();

            grupo.hidden = !nomeGrupo.includes(pesquisa);
        });
    });
}

/* ========================================
   MODAL DE SUCESSO DA PUBLICAÇÃO
======================================== */

const modalSucesso = document.getElementById("modal-sucesso");
const botaoFecharSucesso = document.getElementById("fechar-modal-sucesso");

if (modalSucesso) {
    modalSucesso.hidden = true;
}

function fecharModalSucesso() {
    if (!modalSucesso) return;

    modalSucesso.hidden = true;
    document.body.style.overflow = "";
}

if (modalSucesso && botaoFecharSucesso) {
    botaoFecharSucesso.addEventListener("click", fecharModalSucesso);

    modalSucesso.addEventListener("click", function (evento) {
        if (evento.target === modalSucesso) {
            fecharModalSucesso();
        }
    });
}

document.addEventListener("keydown", function (evento) {
    if (evento.key === "Escape" && modalSucesso && !modalSucesso.hidden) {
        fecharModalSucesso();
    }
});

/* ===== OPÇÕES DE PARTICIPAÇÃO ===== */

const aceitarParticipantes = document.getElementById("aceitar-participantes");
const modalidadesParticipacao = document.getElementById("modalidades-participacao");

if (aceitarParticipantes && modalidadesParticipacao) {
    modalidadesParticipacao.hidden = true;
    aceitarParticipantes.addEventListener("change", function () {
        modalidadesParticipacao.hidden = !aceitarParticipantes.checked;
    });
}

/* ===== SAIR DA LUDARYUM ===== */

const botaoSair = document.getElementById("desconectar");

if (botaoSair) {
    botaoSair.addEventListener("click", function () {
        sessionStorage.clear();
        localStorage.removeItem("ludaryumToken");
        localStorage.removeItem("ludaryumNome");
        localStorage.removeItem("ludaryumFoto");
        localStorage.removeItem("tema-ludaryum");
        
        window.location.href = "/home-ui/login.html";
    });
}

/* ===== CARREGAR E GERENCIAR CHATS DE CANDIDATURA E GRUPOS ===== */
async function carregarChatsCandidatura() {
    const containerChats = document.getElementById("lista-chats-candidatura");
    if (!containerChats) return;

    try {
        const token = obterToken();
        if (!token) {
            containerChats.innerHTML = '<p class="mensagem-pessoas" style="color: #94899d; font-size: 11px;">Faça login para ver seus chats.</p>';
            return;
        }

        const resposta = await fetch(`${API_BASE_URL}/grupos`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (resposta.ok) {
            const grupos = await resposta.json();
            containerChats.replaceChildren();

            if (grupos.length === 0) {
                containerChats.innerHTML = '<p class="mensagem-pessoas" style="color: #94899d; font-size: 11px;">Nenhum chat de candidatura ativo no momento. Participe de uma publicação!</p>';
                return;
            }

            grupos.forEach(grupo => {
                const itemChat = document.createElement("div");
                itemChat.className = "item-chat-candidatura";
                itemChat.style.cssText = "background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: all 0.2s;";
                
                itemChat.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: #faf7fc; font-size: 12px;">🗨️ ${grupo.nome}</strong>
                        <span style="font-size: 9px; background: rgba(168,59,209,0.2); color: #d77bf4; padding: 2px 6px; border-radius: 4px;">${grupo.tipo || 'Candidatura'}</span>
                    </div>
                    <small style="color: #94899d; display: block; margin-top: 4px;">Clique para abrir o painel de mensagens</small>
                `;

                itemChat.addEventListener("click", () => {
                    abrirInterfaceChatIsolada(grupo.id, grupo.nome);
                });

                containerChats.appendChild(itemChat);
            });
        } else {
            containerChats.innerHTML = '<p class="mensagem-pessoas" style="color: #94899d; font-size: 11px;">Erro ao carregar chats.</p>';
        }
    } catch (erro) {
        console.error("Erro ao buscar chats de candidatura:", erro);
        containerChats.innerHTML = '<p class="mensagem-pessoas" style="color: #94899d; font-size: 11px;">Indisponível no momento.</p>';
    }
}

/* ===== ABRIR ÁREA ISOLADA DE MENSAGENS (COM POLLING, ENTER, EFEITO VISUAL E EXCLUSÃO DISCRETA) ===== */
function abrirInterfaceChatIsolada(grupoId, nomeGrupo) {
    if (!listaPublicacoes) return;

    listaPublicacoes.replaceChildren();

    const wrapperChat = document.createElement("div");
    wrapperChat.className = "chat-isolado-container";
    wrapperChat.style.cssText = "background: #211c25; padding: 24px; border-radius: 16px; border: 1px solid rgba(215, 123, 244, 0.35); box-shadow: 0 0 30px rgba(168, 59, 209, 0.12); position: relative;";

    wrapperChat.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
            <div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <h2 style="color: #faf7fc; font-size: 18px; margin: 0;">🚀 Chat: ${nomeGrupo}</h2>
                    <span style="font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(34, 197, 94, 0.2); color: #4ade80;">🟢 Ativo</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px;">
                    <small style="color: #d77bf4; cursor: pointer;" id="btn-abrir-info-grupo">Ver membros e gerenciar grupo ⚙️</small>
                    <!-- Botão de exclusão discreto injetado dinamicamente para o criador -->
                    <button type="button" id="btn-apagar-chat-discreto" style="display: none; background: transparent; border: none; color: #ef4444; font-size: 11px; cursor: pointer; padding: 0; opacity: 0.7; transition: opacity 0.2s;" title="Apagar este chat permanentemente">🗑️ Apagar chat</button>
                </div>
            </div>
            <button type="button" id="voltar-feed-chat" class="btn-secundario" style="padding: 6px 12px; font-size: 12px; cursor: pointer;">Voltar ao Feed</button>
        </div>

        <div id="painel-membros-grupo" style="display: none; background: #17121c; border: 1px solid rgba(168,59,209,0.3); border-radius: 12px; padding: 16px; margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <strong style="color: #faf7fc; font-size: 14px;">👥 Gerenciar Integrantes</strong>
                <button type="button" id="fechar-painel-membros" style="background: none; border: none; color: #b9adbf; cursor: pointer; font-size: 16px;">✕</button>
            </div>
            <div style="max-height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;" id="lista-membros-atual">
                <small style="color: #94899d;">Carregando membros...</small>
            </div>
        </div>

        <div id="historico-chat-candidatura" style="height: 380px; overflow-y: auto; margin-bottom: 15px; display: flex; flex-direction: column; gap: 12px; padding-right: 8px; scroll-behavior: smooth;">
            <p style="color: #94899d; text-align: center;">Carregando mensagens...</p>
        </div>

        <form id="form-enviar-msg-candidatura" style="display: flex; gap: 12px;">
            <input type="text" id="input-msg-candidatura" placeholder="Digite sua mensagem..." autocomplete="off" required style="flex: 1; background: #17121c; border: 1px solid #514659; color: #faf7fc; padding: 13px 15px; border-radius: 10px; outline: none; font-size: 13px;">
            <button type="submit" id="btn-enviar-chat" class="btn-publicar" style="padding: 0 24px; cursor: pointer; transition: opacity 0.2s;">Enviar</button>
        </form>
    `;

    listaPublicacoes.appendChild(wrapperChat);

    const containerMsgs = document.getElementById("historico-chat-candidatura");
    const inputMsg = document.getElementById("input-msg-candidatura");
    const formEnvio = document.getElementById("form-enviar-msg-candidatura");
    const btnEnviar = document.getElementById("btn-enviar-chat");
    const btnApagarChat = document.getElementById("btn-apagar-chat-discreto");

    let ultimaQuantidadeMensagens = 0;

    async function verificarPermissaoExclusao() {
        try {
            const emailLogado = sessionStorage.getItem("ludaryumEmail") || localStorage.getItem("ludaryumEmail") || "";
            const usernameLogado = sessionStorage.getItem("ludaryumNome") || sessionStorage.getItem("ludaryumUsuarioID") || "";

            const respGrupo = await fetch(`${API_BASE_URL}/grupos`, {
                headers: { "Authorization": `Bearer ${obterToken()}` }
            });
            
            if (respGrupo.ok) {
                const grupos = await respGrupo.json();
                const grupoAtual = grupos.find(g => String(g.id) === String(grupoId));

                if (grupoAtual) {
                    const donoGrupo = (grupoAtual.criador || grupoAtual.owner || grupoAtual.usuario || "").toLowerCase();
                    if (donoGrupo && (donoGrupo === emailLogado.toLowerCase() || donoGrupo === usernameLogado.toLowerCase() || grupoAtual.is_owner === true)) {
                        if (btnApagarChat) btnApagarChat.style.display = "inline-block";
                        return;
                    }
                }
            }

            const respMembros = await fetch(`${API_BASE_URL}/grupos/${grupoId}/membros`, {
                headers: { "Authorization": `Bearer ${obterToken()}` }
            });
            
            if (respMembros.ok) {
                const membros = await respMembros.json();
                const usuarioAtual = membros.find(m => {
                    const mEmail = (m.email || m.user_email || "").toLowerCase();
                    const mNome = (m.username || m.nome || "").toLowerCase();
                    return mEmail === emailLogado.toLowerCase() || mNome === usernameLogado.toLowerCase();
                });
                
                const cargo = (usuarioAtual?.role || usuarioAtual?.funcao || "").toLowerCase();
                const ehAdminOuCriador = ['admin', 'criador', 'owner', 'administrador'].includes(cargo) || usuarioAtual?.is_owner === true;

                if (ehAdminOuCriador || emailLogado.includes("admin")) {
                    if (btnApagarChat) btnApagarChat.style.display = "inline-block";
                }
            }
        } catch (e) {
            console.error("Erro ao verificar permissão do chat:", e);
        }
    }

    verificarPermissaoExclusao();

    if (btnApagarChat) {
        btnApagarChat.addEventListener("mouseover", () => btnApagarChat.style.opacity = "1");
        btnApagarChat.addEventListener("mouseout", () => btnApagarChat.style.opacity = "0.7");

        btnApagarChat.addEventListener("click", async () => {
            if (confirm("Tem certeza de que deseja apagar permanentemente este chat e todas as suas mensagens?")) {
                try {
                    const resp = await fetch(`${API_BASE_URL}/grupos/${grupoId}`, {
                        method: "DELETE",
                        headers: { "Authorization": `Bearer ${obterToken()}` }
                    });

                    if (resp.ok) {
                        alert("Chat apagado com sucesso.");
                        mostrarPublicacoes();
                        if (typeof carregarChatsCandidatura === "function") {
                            carregarChatsCandidatura();
                        }
                    } else {
                        const err = await resp.json().catch(() => ({}));
                        alert(err.detail || "Erro ao apagar o chat.");
                    }
                } catch (err) {
                    console.error("Erro ao excluir chat:", err);
                    alert("Erro de conexão ao tentar apagar o chat.");
                }
            }
        });
    }

    async function carregarMensagens(rolarParaBaixo = false) {
        try {
            const resp = await fetch(`${API_BASE_URL}/grupos/${grupoId}/mensagens`, {
                headers: { "Authorization": `Bearer ${obterToken()}` }
            });
            if (resp.ok) {
                const msgs = await resp.json();
                if (!containerMsgs) return;

                const estaNoFim = containerMsgs.scrollHeight - containerMsgs.scrollTop <= containerMsgs.clientHeight + 50;
                const houveNovasMensagens = msgs.length > ultimaQuantidadeMensagens;
                ultimaQuantidadeMensagens = msgs.length;

                containerMsgs.replaceChildren();
                if (msgs.length === 0) {
                    containerMsgs.innerHTML = '<p style="color: #94899d; text-align: center;">Ainda não há mensagens neste chat. Comece a conversar!</p>';
                    return;
                }

                msgs.forEach((m, index) => {
                    const div = document.createElement("div");
                    div.style.cssText = "background: rgba(255,255,255,0.04); padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);";
                    
                    if (houveNovasMensagens && index === msgs.length - 1) {
                        div.style.animation = "fadeInMsg 0.3s ease-in-out";
                    }

                    div.innerHTML = `<strong style="color: #d77bf4; font-size: 12px;">@${m.autor || 'Membro'}</strong><p style="margin: 6px 0 0 0; color: #ddd; font-size: 13px; line-height: 1.5;">${m.conteudo}</p>`;
                    containerMsgs.appendChild(div);
                });

                if (rolarParaBaixo || estaNoFim) {
                    containerMsgs.scrollTop = containerMsgs.scrollHeight;
                }
            }
        } catch (e) {
            console.error("Erro ao atualizar mensagens:", e);
        }
    }

    if (!document.getElementById("chat-anim-style")) {
        const styleAnim = document.createElement("style");
        styleAnim.id = "chat-anim-style";
        styleAnim.textContent = `
            @keyframes fadeInMsg {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(styleAnim);
    }

    carregarMensagens(true);

    const intervaloAtualizacao = setInterval(() => {
        if (!document.getElementById("historico-chat-candidatura")) {
            clearInterval(intervaloAtualizacao);
            return;
        }
        carregarMensagens(false);
    }, 3000);

    document.getElementById("voltar-feed-chat").addEventListener("click", () => {
        clearInterval(intervaloAtualizacao);
        mostrarPublicacoes();
    });

    async function enviarMensagem() {
        const conteudo = inputMsg.value.trim();
        if (!conteudo) return;

        inputMsg.disabled = true;
        btnEnviar.disabled = true;
        btnEnviar.style.opacity = "0.6";
        btnEnviar.textContent = "Enviando...";

        try {
            const resp = await fetch(`${API_BASE_URL}/grupos/${grupoId}/mensagens`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${obterToken()}`
                },
                body: JSON.stringify({ conteudo })
            });

            if (resp.ok) {
                inputMsg.value = "";
                await carregarMensagens(true);
            } else {
                const erroServidor = await resp.json();
                alert(erroServidor.detail || "Erro ao enviar mensagem.");
            }
        } catch (err) {
            console.error("Erro ao enviar mensagem:", err);
        } finally {
            inputMsg.disabled = false;
            btnEnviar.disabled = false;
            btnEnviar.style.opacity = "1";
            btnEnviar.textContent = "Enviar";
            inputMsg.focus();
        }
    }

    if (formEnvio) {
        formEnvio.addEventListener("submit", async (e) => {
            e.preventDefault();
            await enviarMensagem();
        });
    }

    if (inputMsg) {
        inputMsg.addEventListener("keydown", async (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                await enviarMensagem();
            }
        });
    }

    const painelMembros = document.getElementById("painel-membros-grupo");
    document.getElementById("btn-abrir-info-grupo").addEventListener("click", () => {
        painelMembros.style.display = painelMembros.style.display === "none" ? "block" : "none";
        carregarMembrosDoGrupo(grupoId);
    });

    document.getElementById("fechar-painel-membros").addEventListener("click", () => {
        painelMembros.style.display = "none";
    });
}

async function carregarMembrosDoGrupo(grupoId) {
    const containerMembros = document.getElementById("lista-membros-atual");
    if (!containerMembros) return;

    try {
        const resp = await fetch(`${API_BASE_URL}/grupos/${grupoId}/membros`, {
            headers: { "Authorization": `Bearer ${obterToken()}` }
        });

        if (resp.ok) {
            const membros = await resp.json();
            containerMembros.replaceChildren();

            if (membros.length === 0) {
                containerMembros.innerHTML = '<small style="color: #94899d;">Nenhum membro listado.</small>';
                return;
            }

            membros.forEach(membro => {
                const divMembro = document.createElement("div");
                divMembro.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 6px 10px; border-radius: 6px;";
                
                const membroId = membro.id || membro.membro_id || membro.user_id || membro.usuario_id || membro.email || membro.user_email || membro.username;
                const nomeMembro = membro.username || membro.nome || membro.user_email || membro.email || "Membro";
                const funcaoMembro = membro.role || membro.funcao || 'Membro';
                const isCriadorOuAdmin = ['criador', 'owner', 'admin', 'administrador'].includes(funcaoMembro.toLowerCase());

                divMembro.innerHTML = `
                    <div>
                        <strong style="color: #faf7fc; font-size: 11px;">@${nomeMembro}</strong>
                        <span style="font-size: 9px; color: #d77bf4; margin-left: 6px;">${funcaoMembro}</span>
                    </div>
                    ${!isCriadorOuAdmin ? `<button type="button" class="btn-remover-membro" data-id="${encodeURIComponent(membroId)}" style="background: rgba(255,85,110,0.1); border: 1px solid rgba(255,85,110,0.3); color: #ff8598; font-size: 9px; padding: 2px 6px; border-radius: 4px; cursor: pointer;">Excluir</button>` : ''}
                `;

                const btnRemover = divMembro.querySelector(".btn-remover-membro");
                if (btnRemover) {
                    btnRemover.addEventListener("click", async () => {
                        const targetId = decodeURIComponent(btnRemover.dataset.id);
                        if (!targetId || targetId === "undefined" || targetId === "null") {
                            alert("Erro: ID ou identificador do membro não encontrado para exclusão.");
                            return;
                        }

                        if (confirm(`Deseja remover @${nomeMembro} deste grupo?`)) {
                            try {
                                const resDel = await fetch(`${API_BASE_URL}/grupos/${grupoId}/membros/${targetId}`, {
                                    method: "DELETE",
                                    headers: { "Authorization": `Bearer ${obterToken()}` }
                                });
                                if (resDel.ok) {
                                    alert("Integrante removido com sucesso.");
                                    carregarMembrosDoGrupo(grupoId);
                                } else {
                                    const errJson = await resDel.json().catch(() => ({}));
                                    alert(errJson.detail || "Erro ao remover integrante.");
                                }
                            } catch (err) {
                                console.error("Erro ao excluir membro:", err);
                                alert("Erro de conexão com o servidor.");
                            }
                        }
                    });
                }

                containerMembros.appendChild(divMembro);
            });
        }
    } catch (e) {
        console.error("Erro ao carregar membros:", e);
    }
}

/* ===== WEBSOCKET ROBUSTO COM RECONEXÃO AUTOMÁTICA E STATUS VISUAL ===== */
function conectarWebSocket(endpointUrl, onMensagemRecebida) {
    if (socketAtivo) {
        socketAtivo.close();
    }

    const token = obterToken();
    const separador = endpointUrl.includes("?") ? "&" : "?";
    const urlComToken = `${endpointUrl}${separador}token=${encodeURIComponent(token)}`;

    const wsProtocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? `ws://127.0.0.1:8002${urlComToken}`
        : `${wsProtocolo}//${window.location.host}${urlComToken}`;

    const statusBadge = document.getElementById("status-conexao-chat");
    if (statusBadge) {
        statusBadge.style.background = "rgba(234, 179, 8, 0.2)";
        statusBadge.style.color = "#facc15";
        statusBadge.textContent = "Conectando...";
    }

    socketAtivo = new WebSocket(wsUrl);

    socketAtivo.onopen = () => {
        console.log("WebSocket autenticado conectado:", endpointUrl);
        if (statusBadge) {
            statusBadge.style.background = "rgba(34, 197, 94, 0.2)";
            statusBadge.style.color = "#4ade80";
            statusBadge.textContent = "🟢 Conectado em tempo real";
        }
    };

    socketAtivo.onmessage = (evento) => {
        const dados = JSON.parse(evento.data);
        onMensagemRecebida(dados);
    };

    socketAtivo.onerror = (erro) => {
        console.error("Erro na conexão WebSocket:", erro);
        if (statusBadge) {
            statusBadge.style.background = "rgba(239, 68, 68, 0.2)";
            statusBadge.style.color = "#f87171";
            statusBadge.textContent = "🔴 Erro de conexão";
        }
    };

    socketAtivo.onclose = (evento) => {
        if (evento.code === 4001) {
            console.error("Conexão recusada pelo servidor: Token JWT inválido ou expirado.");
            if (statusBadge) {
                statusBadge.style.background = "rgba(239, 68, 68, 0.2)";
                statusBadge.style.color = "#f87171";
                statusBadge.textContent = "⛔ Sessão expirada";
            }
            return;
        }

        if (statusBadge) {
            statusBadge.style.background = "rgba(234, 179, 8, 0.2)";
            statusBadge.style.color = "#facc15";
            statusBadge.textContent = "🟡 Reconectando em 3s...";
        }

        console.warn("WebSocket desconectado. Tentando reconectar em 3 segundos...");
        setTimeout(() => {
            conectarWebSocket(endpointUrl, onMensagemRecebida);
        }, 3000);
    };

    return socketAtivo;
}

// ================= GERENCIAMENTO DO MODAL DE DENÚNCIA ESTÁTICO =================
const modalDenuncia = document.getElementById("modal-denuncia-forum");
const btnFecharDenuncia = document.getElementById("fechar-modal-denuncia");
const btnCancelarDenuncia = document.getElementById("btn-cancelar-denuncia");
const formDenuncia = document.getElementById("form-denuncia-forum");

let forumIdParaDenunciar = null;

if (modalDenuncia) {
    modalDenuncia.style.display = "none";
    modalDenuncia.hidden = true;
}

function abrirModalDenuncia(forumId, forumTitulo) {
    forumIdParaDenunciar = forumId;
    if (modalDenuncia) {
        const tituloModal = document.getElementById("titulo-denuncia-modal");
        if (tituloModal) tituloModal.textContent = `Denunciar Fórum: ${forumTitulo}`;
        
        modalDenuncia.style.display = "flex";
        modalDenuncia.hidden = false;
        document.body.style.overflow = "hidden";
    }
}

function fecharModalDenuncia() {
    if (modalDenuncia) {
        modalDenuncia.style.display = "none";
        modalDenuncia.hidden = true;
        document.body.style.overflow = "";
        if (formDenuncia) formDenuncia.reset();
        forumIdParaDenunciar = null;
    }
}

if (btnFecharDenuncia) btnFecharDenuncia.addEventListener("click", fecharModalDenuncia);
if (btnCancelarDenuncia) btnCancelarDenuncia.addEventListener("click", fecharModalDenuncia);

if (modalDenuncia) {
    modalDenuncia.addEventListener("click", (e) => {
        if (e.target === modalDenuncia) {
            fecharModalDenuncia();
        }
    });
}

if (formDenuncia) {
    formDenuncia.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!forumIdParaDenunciar) return;

        const motivoInput = document.getElementById("motivo-denuncia-texto");
        const arquivoInput = document.getElementById("arquivo-evidencia-denuncia");

        const motivo = motivoInput ? motivoInput.value.trim() : "";
        if (!motivo) {
            alert("Insira o motivo da denúncia.");
            return;
        }

        let evidenciaBase64 = "";
        if (arquivoInput && arquivoInput.files[0]) {
            const reader = new FileReader();
            evidenciaBase64 = await new Promise((resolve) => {
                reader.onload = (evt) => resolve(evt.target.result);
                reader.readAsDataURL(arquivoInput.files[0]);
            });
        }

        try {
            const resp = await fetch(`${API_BASE_URL}/foruns/${forumIdParaDenunciar}/denunciar`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${obterToken()}`
                },
                body: JSON.stringify({
                    motivo: motivo,
                    evidencia: evidenciaBase64
                })
            });

            if (resp.ok) {
                alert("🚨 Denúncia enviada com sucesso à moderação.");
                fecharModalDenuncia();
            } else {
                const erro = await resp.json().catch(() => ({}));
                alert(erro.detail || "Erro ao enviar denúncia.");
            }
        } catch (err) {
            console.error("Erro na denúncia:", err);
            alert("Erro de conexão ao enviar a denúncia.");
        }
    });
}