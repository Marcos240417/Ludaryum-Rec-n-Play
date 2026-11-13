// ================= CONFIGURAÇÃO DE ROTA AUTOMÁTICA (LOCAL PORTA 8081 & CLOUDFLARE) =================
if (typeof API_BASE_URL === 'undefined') {
    var API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "http://127.0.0.1:8081" 
        : `${window.location.protocol}//${window.location.host}`;
}

// Obter token JWT armazenado na sessão (isolado por aba)
function obterToken() {
    return sessionStorage.getItem("ludaryumToken") || localStorage.getItem("ludaryumToken") || sessionStorage.getItem("ludarium_token") || localStorage.getItem("ludarium_token") || "";
}

const areaProjetos = document.getElementById("projetos-criados");
const campoBusca = document.getElementById("busca-projetos");
const botoesFiltro = document.querySelectorAll(".filtro-projeto");
const areaCards = document.querySelector(".projetos .cards");

let filtroAtual = "todos";
let buscaAtual = "";
let listaProjetosCache = [];

async function obterProjetosCriados() {
    try {
        const resposta = await fetch(`${API_BASE_URL}/projects`, {
            headers: { "Authorization": `Bearer ${obterToken()}` }
        });
        if (!resposta.ok) return [];
        const dados = await resposta.json();
        return Array.isArray(dados) ? dados : [];
    } catch (erro) {
        console.error("Erro ao carregar projetos do servidor (porta 8081):", erro);
        return [];
    }
}

function normalizar(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function configurarCard(card, projeto) {
    card.style.cursor = "pointer";
    card.title = "Clique para jogar diretamente";

    card.addEventListener("click", function (evento) {
        if (evento.target.closest("button") || evento.target.closest(".btn-excluir")) {
            return;
        }

        // Verifica se o projeto possui build web executável
        if (projeto.executavel_navegador === 1 && projeto.build_path) {
            const modalPlayer = document.getElementById("modal-player-jogo");
            const iframe = document.getElementById("iframe-jogo-home");
            const tituloPlayer = document.getElementById("titulo-player-jogo");
            const descPlayer = document.getElementById("descricao-player-jogo");

            if (modalPlayer && iframe) {
                tituloPlayer.textContent = `🎮 ${projeto.title || "Jogo"}`;
                if (descPlayer) descPlayer.textContent = projeto.description || "";

                // Guarda o ID do projeto atual no modal para uso posterior ao fechar
                modalPlayer.setAttribute("data-projeto-id", projeto.id);

                // Garante que o caminho do build aponte corretamente para o index.html
                let caminhoBuild = String(projeto.build_path).trim();
                
                if (!caminhoBuild.endsWith("index.html")) {
                    caminhoBuild = caminhoBuild.endsWith("/") ? `${caminhoBuild}index.html` : `${caminhoBuild}/index.html`;
                }

                if (caminhoBuild.startsWith("/")) {
                    caminhoBuild = caminhoBuild.substring(1);
                }

                const urlBuildFinal = `${API_BASE_URL}/${caminhoBuild}`;
                
                console.log("A carregar build do jogo em:", urlBuildFinal);

                iframe.src = urlBuildFinal;
                modalPlayer.style.display = "flex";
                modalPlayer.setAttribute("aria-hidden", "false");
                document.body.style.overflow = "hidden";
            }
        } else {
            alert("Este projeto não possui um build web executável no navegador.");
        }
    });
}

// =========================================================================
// CONTROLO DO PLAYER, FECHO COM AVALIAÇÃO, XP E FEEDBACK NA HOME
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    const modalPlayer = document.getElementById("modal-player-jogo");
    const botaoFecharPlayer = document.getElementById("fechar-modal-player");
    const iframe = document.getElementById("iframe-jogo-home");
    const containerIframe = document.getElementById("container-iframe-jogo");
    const btnToggleSom = document.getElementById("btn-toggle-som");
    const btnFullscreen = document.getElementById("btn-fullscreen");

    let jogoMutado = false;

    // Função para abrir o modal de avaliação e ganho de XP ao fechar o jogo
    function dispararModalAvaliacao(projetoId) {
        if (!projetoId) return;
        
        let modalAvaliacao = document.getElementById("modal-avaliacao-feedback");
        if (!modalAvaliacao) {
            modalAvaliacao = document.createElement("div");
            modalAvaliacao.id = "modal-avaliacao-feedback";
            modalAvaliacao.className = "modal-projeto-overlay";
            modalAvaliacao.style.cssText = "display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;";
            modalAvaliacao.innerHTML = `
                <div class="modal-projeto-conteudo" style="background: #1e293b; padding: 25px; border-radius: 12px; max-width: 450px; width: 90%; color: #f8fafc; border: 1px solid #38bdf8;">
                    <span class="etiqueta" style="color: #38bdf8; font-size: 12px; font-weight: bold;">⭐ AVALIAÇÃO DO JOGO</span>
                    <h3 style="margin: 10px 0; color: #fff;">O que achou da experiência?</h3>
                    <p style="color: #94a3b8; font-size: 13px; margin-bottom: 15px;">Avalie o jogo e deixe um feedback para garantir <strong style="color: #38bdf8;">+75 XP</strong> no seu perfil!</p>
                    
                    <div id="estrelas-avaliacao" style="font-size: 28px; cursor: pointer; margin-bottom: 15px; text-align: center;">
                        <span data-estrela="1">☆</span><span data-estrela="2">☆</span><span data-estrela="3">☆</span><span data-estrela="4">☆</span><span data-estrela="5">☆</span>
                    </div>

                    <textarea id="texto-feedback-jogo" placeholder="Deixe um comentário construtivo para o criador..." style="width: 100%; height: 80px; background: #0f172a; border: 1px solid #334155; color: #fff; padding: 10px; border-radius: 6px; margin-bottom: 15px; resize: none;"></textarea>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button type="button" id="btn-pular-avaliacao" style="background: transparent; border: 1px solid #64748b; color: #94a3b8; padding: 8px 14px; border-radius: 6px; cursor: pointer;">Pular</button>
                        <button type="button" id="btn-enviar-avaliacao" style="background: #38bdf8; border: none; color: #0f172a; font-weight: bold; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Enviar e Garantir XP</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalAvaliacao);

            let estrelasSelecionadas = 0;
            const spansEstrelas = modalAvaliacao.querySelectorAll("#estrelas-avaliacao span");
            spansEstrelas.forEach(s => {
                s.addEventListener("click", (e) => {
                    estrelasSelecionadas = parseInt(e.target.getAttribute("data-estrela"));
                    spansEstrelas.forEach((st, idx) => {
                        st.textContent = idx < estrelasSelecionadas ? "★" : "☆";
                        st.style.color = idx < estrelasSelecionadas ? "#f59e0b" : "#fff";
                    });
                });
            });

            modalAvaliacao.querySelector("#btn-pular-avaliacao").addEventListener("click", () => {
                modalAvaliacao.style.display = "none";
            });

            modalAvaliacao.querySelector("#btn-enviar-avaliacao").addEventListener("click", async () => {
                const comentario = modalAvaliacao.querySelector("#texto-feedback-jogo").value.trim();
                
                try {
                    // Envia avaliação/comentário para o projeto
                    await fetch(`${API_BASE_URL}/projects/${projetoId}/comentarios`, {
                        method: "POST",
                        headers: { 
                            "Authorization": `Bearer ${obterToken()}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ conteudo: `[Avaliação ⭐${estrelasSelecionadas}] ${comentario || "Excelente jogo!"}` })
                    });

                    // Credita +75 XP no perfil do utilizador
                    await fetch(`${API_BASE_URL}/projects/${projetoId}/testar`, {
                        method: "POST",
                        headers: { 
                            "Authorization": `Bearer ${obterToken()}`,
                            "Content-Type": "application/json"
                        }
                    });

                    alert("🎉 Feedback enviado com sucesso! +75 XP adicionados ao seu perfil.");
                } catch (err) {
                    console.error("Erro ao submeter feedback:", err);
                    alert("Feedback guardado, mas ocorreu um erro ao sincronizar o XP.");
                }

                modalAvaliacao.style.display = "none";
            });
        } else {
            modalAvaliacao.style.display = "flex";
        }
    }

    if (modalPlayer && botaoFecharPlayer) {
        const fecharPlayer = () => {
            const projetoIdAtivo = modalPlayer.getAttribute("data-projeto-id");

            modalPlayer.style.display = "none";
            modalPlayer.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
            if (iframe) iframe.src = ""; // Para o jogo e áudio ao fechar
            
            // Sai do fullscreen se estiver ativo
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
            
            // Reseta o estado do som
            jogoMutado = false;
            if (btnToggleSom) {
                btnToggleSom.textContent = "🔊 Som Ativo";
                btnToggleSom.style.borderColor = "#38bdf8";
                btnToggleSom.style.color = "#38bdf8";
            }

            // Dispara o modal de avaliação e ganho de XP assim que o player é fechado
            if (projetoIdAtivo) {
                dispararModalAvaliacao(projetoIdAtivo);
            }
        };

        botaoFecharPlayer.addEventListener("click", fecharPlayer);
        modalPlayer.addEventListener("click", (e) => {
            if (e.target === modalPlayer) fecharPlayer();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modalPlayer.style.display === "flex") fecharPlayer();
        });
    }

    // Botão de Controlar Som (Ativar / Desativar áudio do Iframe)
    if (btnToggleSom && iframe) {
        btnToggleSom.addEventListener("click", () => {
            jogoMutado = !jogoMutado;
            try {
                if (jogoMutado) {
                    iframe.contentWindow.postMessage('{"action":"mute"}', '*');
                    btnToggleSom.textContent = "🔇 Mudo";
                    btnToggleSom.style.borderColor = "#ef4444";
                    btnToggleSom.style.color = "#ef4444";
                } else {
                    iframe.contentWindow.postMessage('{"action":"unmute"}', '*');
                    btnToggleSom.textContent = "🔊 Som Ativo";
                    btnToggleSom.style.borderColor = "#38bdf8";
                    btnToggleSom.style.color = "#38bdf8";
                }
            } catch (err) {
                console.log("Controle de som via postMessage ajustado.");
            }
        });
    }

    // Botão de Expandir Tela (Fullscreen)
    if (btnFullscreen && containerIframe) {
        btnFullscreen.addEventListener("click", () => {
            if (!document.fullscreenElement) {
                if (containerIframe.requestFullscreen) {
                    containerIframe.requestFullscreen();
                } else if (containerIframe.webkitRequestFullscreen) {
                    containerIframe.webkitRequestFullscreen();
                } else if (containerIframe.msRequestFullscreen) {
                    containerIframe.msRequestFullscreen();
                }
                if (iframe) iframe.style.height = "100vh";
                btnFullscreen.textContent = "⤓ Normal";
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
                if (iframe) iframe.style.height = "550px";
                btnFullscreen.textContent = "⛶ Tela Cheia";
            }
        });

        document.addEventListener("fullscreenchange", () => {
            if (!document.fullscreenElement && iframe) {
                iframe.style.height = "550px";
                if (btnFullscreen) btnFullscreen.textContent = "⛶ Tela Cheia";
            }
        });
    }
});

function normalizarTags(tagsInput) {
    if (Array.isArray(tagsInput)) return tagsInput;
    if (typeof tagsInput === 'string') {
        return tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    }
    return [];
}

function criarCardProjeto(projeto) {
    const card = document.createElement("article");
    card.className = "card projeto-dinamico";

    const capa = document.createElement("div");
    const formato = projeto.formatoCapa || "horizontal";
    const ajuste = projeto.ajusteCapa || "preencher";

    capa.className = "capa capa-1 capa-" + formato;

    if (projeto.poster_path) {
        const imagem = document.createElement("img");
        const urlPoster = projeto.poster_path.startsWith("http") ? projeto.poster_path : `${API_BASE_URL}${projeto.poster_path}`;
        imagem.src = urlPoster;
        imagem.alt = "Capa do projeto " + (projeto.title || "");
        imagem.style.width = "100%";
        imagem.style.height = "100%";
        imagem.style.objectFit = ajuste === "inteira" ? "contain" : "cover";
        imagem.style.display = "block";
        capa.appendChild(imagem);
    } else {
        capa.textContent = "✦ " + String(projeto.studio || "PROJETO").toUpperCase();
    }

    const tagsArray = normalizarTags(projeto.tags);

    const informacoes = document.createElement("div");
    informacoes.className = "card-info";

    const categoria = document.createElement("span");
    categoria.textContent = "◉ " + (tagsArray.length > 0 ? tagsArray[0] : "Sem categoria");

    const titulo = document.createElement("h3");
    titulo.textContent = projeto.title || "Projeto sem nome";

    const indicadorComentarios = document.createElement("span");
    indicadorComentarios.textContent = "💬 " + (projeto.comments_count || 0) + " Comentários";
    indicadorComentarios.className = "indicador-comentarios ativado";
    indicadorComentarios.title = "Este projeto permite comentários e feedbacks";

    const descricao = document.createElement("p");
    descricao.textContent = projeto.description || "Sem descrição disponível.";

    const versao = document.createElement("small");
    versao.className = "versao-card";
    versao.textContent = "Status: " + (projeto.status || "Ativo");

    const progressoContainer = document.createElement("div");
    progressoContainer.className = "progresso-card";

    const progressoTexto = document.createElement("small");
    progressoTexto.textContent = "Progresso: " + (projeto.progress || 0) + "%";

    const progressoBarra = document.createElement("div");
    progressoBarra.className = "progresso-barra";

    const progressoPreenchimento = document.createElement("div");
    progressoPreenchimento.className = "progresso-preenchimento";
    progressoPreenchimento.style.width = (projeto.progress || 0) + "%";

    progressoBarra.appendChild(progressoPreenchimento);
    progressoContainer.append(progressoTexto, progressoBarra);

    const areaTags = document.createElement("div");
    areaTags.className = "tags-card";

    tagsArray.forEach(function (tag) {
        const etiqueta = document.createElement("span");
        etiqueta.className = "tag-card";
        etiqueta.textContent = tag;
        areaTags.appendChild(etiqueta);
    });

    const status = document.createElement("small");
    status.textContent = "Criador: " + (projeto.owner || "Comunidade");

    const visibilidade = document.createElement("span");
    visibilidade.className = "visibilidade-card publico";
    visibilidade.textContent = "🌐 PÚBLICO";
    capa.appendChild(visibilidade);

    const botaoExcluir = document.createElement("button");
    botaoExcluir.textContent = "🗑️ Excluir";
    botaoExcluir.className = "btn-excluir";
    botaoExcluir.type = "button";

    configurarCard(card, projeto);

    // Verificação rigorosa do utilizador logado versus o dono do projeto
    const usuarioLogadoEmail = (
        sessionStorage.getItem("ludaryumEmail") || 
        localStorage.getItem("ludaryumEmail") || 
        sessionStorage.getItem("ludaryumNome") || 
        localStorage.getItem("ludaryumNome") || 
        ""
    ).trim().toLowerCase();

    const donoProjeto = (projeto.owner || projeto.user_id || "").trim().toLowerCase();

    // Só exibe e aplica a ação de exclusão se o utilizador logado for o dono real do projeto
    if (usuarioLogadoEmail && donoProjeto && usuarioLogadoEmail === donoProjeto) {
        botaoExcluir.style.display = "inline-block";

        botaoExcluir.addEventListener("click", function (evento) {
            evento.stopPropagation();

            const modal = document.getElementById("modal-confirmacao");
            const botaoCancelar = document.getElementById("cancelar-exclusao");
            const botaoConfirmar = document.getElementById("confirmar-exclusao");

            if (!modal || !botaoCancelar || !botaoConfirmar) {
                console.error("Janela de confirmação não encontrada.");
                return;
            }

            modal.style.display = "flex";

            function fecharModal() {
                modal.style.display = "none";
                botaoCancelar.removeEventListener("click", cancelar);
                botaoConfirmar.removeEventListener("click", confirmar);
            }

            function cancelar() {
                fecharModal();
            }

            async function confirmar() {
                try {
                    const resposta = await fetch(`${API_BASE_URL}/projects/${projeto.id}`, {
                        method: "DELETE",
                        headers: { "Authorization": `Bearer ${obterToken()}` }
                    });
                    if (resposta.ok) {
                        fecharModal();
                        carregarProjetos();
                    } else {
                        alert("Erro ao excluir o projeto.");
                    }
                } catch (erro) {
                    console.error("Erro na exclusão:", erro);
                }
            }

            botaoCancelar.addEventListener("click", cancelar);
            botaoConfirmar.addEventListener("click", confirmar);
        });
    } else {
        // Se não for o dono, oculta completamente o botão de exclusão
        botaoExcluir.style.display = "none";
    }

    informacoes.append(
        categoria,
        titulo,
        indicadorComentarios,
        descricao,
        versao,
        progressoContainer,
        areaTags,
        status,
        botaoExcluir
    );
    card.append(capa, informacoes);

    return card;
}

function correspondeAoFiltro(projeto) {
    const tagsProj = normalizarTags(projeto.tags).map(t => normalizar(t));
    const tituloProj = normalizar(projeto.title);
    const descProj = normalizar(projeto.description);

    const correspondeBusca = tituloProj.includes(normalizar(buscaAtual)) || descProj.includes(normalizar(buscaAtual));
    const correspondeCategoria = filtroAtual === "todos" || tagsProj.includes(normalizar(filtroAtual));

    return correspondeBusca && correspondeCategoria;
}

function atualizarProjetosVisiveis() {
    if (!areaProjetos) return;

    areaProjetos.innerHTML = "";
    let quantidadeVisivel = 0;

    listaProjetosCache.forEach(function (projeto) {
        if (correspondeAoFiltro(projeto)) {
            areaProjetos.appendChild(criarCardProjeto(projeto));
            quantidadeVisivel++;
        }
    });

    let mensagem = document.getElementById("nenhum-projeto");

    if (!mensagem) {
        mensagem = document.createElement("p");
        mensagem.id = "nenhum-projeto";
        mensagem.className = "mensagem-pessoas";
        mensagem.textContent = "Nenhum projeto encontrado.";
        areaProjetos.appendChild(mensagem);
    }

    mensagem.hidden = quantidadeVisivel > 0;
}

async function carregarProjetos() {
    if (!areaProjetos) return;
    listaProjetosCache = await obterProjetosCriados();
    atualizarProjetosVisiveis();
}

if (campoBusca) {
    campoBusca.addEventListener("input", function () {
        buscaAtual = campoBusca.value;
        atualizarProjetosVisiveis();
    });
}

botoesFiltro.forEach(function (botao) {
    botao.addEventListener("click", function () {
        filtroAtual = botao.dataset.filtro || "todos";

        botoesFiltro.forEach(function (outroBotao) {
            outroBotao.classList.toggle("ativo", outroBotao === botao);
        });

        atualizarProjetosVisiveis();
    });
});

carregarProjetos();

const botaoProjetosAnterior = document.getElementById("projetos-anterior");
const botaoProjetosProxima = document.getElementById("projetos-proxima");
const trilhoProjetos = document.getElementById("projetos-criados");

if (botaoProjetosAnterior && trilhoProjetos) {
    botaoProjetosAnterior.addEventListener("click", function () {
        trilhoProjetos.scrollBy({
            left: -300,
            behavior: "smooth"
        });
    });
}

if (botaoProjetosProxima && trilhoProjetos) {
    botaoProjetosProxima.addEventListener("click", function () {
        trilhoProjetos.scrollBy({
            left: 300,
            behavior: "smooth"
        });
    });
}

/* ===== CONTROLO DO MODAL DE CRIAR PROJETO ===== */
const modalProjeto = document.getElementById("modal-projeto");
const botaoAbrirModal = document.getElementById("abrir-modal-projeto");
const botaoFecharModal = document.getElementById("fechar-modal-projeto");
const formCriarProjeto = document.getElementById("form-projeto") || document.getElementById("formCriarProjeto");

if (modalProjeto && botaoAbrirModal) {
    botaoAbrirModal.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        modalProjeto.style.display = "flex";
        modalProjeto.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        const primeiroCampo = document.getElementById("nome-projeto");
        if (primeiroCampo) primeiroCampo.focus();
    });
}

if (formCriarProjeto) {
    formCriarProjeto.addEventListener("submit", async function (e) {
        e.preventDefault();

        const formData = new FormData();
        formData.append("title", document.getElementById("nome-projeto")?.value || "");
        formData.append("categoria", document.getElementById("categoria")?.value || "");
        formData.append("campanha", document.getElementById("campanha-projeto")?.value || "");
        formData.append("description", document.getElementById("descricao")?.value || "");
        formData.append("visibilidade", document.getElementById("visibilidade-projeto")?.value || "publico");
        formData.append("comentarios", document.getElementById("comentarios-projeto")?.value || "sim");
        formData.append("versao", document.getElementById("versao-projeto")?.value || "1.0.0");
        formData.append("progress", document.getElementById("progresso-projeto")?.value || "0");
        formData.append("repositorio", document.getElementById("repositorio-projeto")?.value || "");
        formData.append("formatoCapa", document.getElementById("formato-capa")?.value || "horizontal");
        formData.append("ajusteCapa", document.getElementById("ajuste-capa")?.value || "preencher");

        const inputZip = document.getElementById("build-zip");
        if (inputZip && inputZip.files[0]) {
            formData.append("build_file", inputZip.files[0]);
        }

        const inputCapa = document.getElementById("imagem-projeto");
        if (inputCapa && inputCapa.files[0]) {
            formData.append("poster", inputCapa.files[0]);
        }

        try {
            const resposta = await fetch(`${API_BASE_URL}/projects`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${obterToken()}`
                },
                body: formData
            });

            if (!resposta.ok) {
                const erroTexto = await resposta.text();
                throw new Error(erroTexto || "Erro ao criar projeto.");
            }

            formCriarProjeto.reset();

            if (modalProjeto) {
                modalProjeto.style.display = "none";
                modalProjeto.setAttribute("aria-hidden", "true");
                document.body.style.overflow = "";
            }

            alert("Projeto criado com sucesso!");
            carregarProjetos();
        } catch (erro) {
            console.error("Erro ao criar projeto:", erro);
            alert("Não foi possível criar o projeto. Verifique os dados e tente novamente.");
        }
    });
}

if (modalProjeto && botaoFecharModal) {
    botaoFecharModal.addEventListener("click", function () {
        modalProjeto.style.display = "none";
        modalProjeto.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    });

    modalProjeto.addEventListener("click", function (evento) {
        if (evento.target === modalProjeto) {
            modalProjeto.style.display = "none";
            modalProjeto.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
        }
    });

    document.addEventListener("keydown", function (evento) {
        if (evento.key === "Escape" && modalProjeto.style.display === "flex") {
            modalProjeto.style.display = "none";
            modalProjeto.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
        }
    });
}

/* MENU DO PERFIL */
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

    function agendarFechamento() {
        clearTimeout(temporizadorFechar);
        temporizadorFechar = setTimeout(function () {
            fecharMenuPerfil();
        }, 300);
    }

    function fecharMenuPerfil() {
        menuPerfil.hidden = true;
        botaoPerfil.setAttribute("aria-expanded", "false");
    }

    perfilContainer.addEventListener("mouseenter", abrirMenuPerfil);
    perfilContainer.addEventListener("mouseleave", agendarFechamento);

    menuPerfil.addEventListener("mouseenter", abrirMenuPerfil);
    menuPerfil.addEventListener("mouseleave", agendarFechamento);

    botaoPerfil.addEventListener("click", function (evento) {
        evento.stopPropagation();

        if (menuPerfil.hidden) {
            abrirMenuPerfil();
        } else {
            fecharMenuPerfil();
        }
    });

    document.addEventListener("click", function (evento) {
        if (!perfilContainer.contains(evento.target)) {
            fecharMenuPerfil();
        }
    });
}

function atualizarPerfilNoMenu() {
    const nomeSalvo = sessionStorage.getItem("ludaryumNome") || localStorage.getItem("ludaryumNome");
    const fotoSalva = sessionStorage.getItem("ludaryumFoto") || localStorage.getItem("ludaryumFoto");
    const nomeMenu = document.getElementById("nome-menu-perfil");

    if (nomeSalvo && nomeMenu) {
        nomeMenu.textContent = nomeSalvo;
    }

    const avatar = document.getElementById("botao-perfil");
    const iniciais = document.getElementById("iniciais-perfil-menu");

    if (!avatar || !iniciais) return;

    if (nomeSalvo) {
        const partes = nomeSalvo.trim().split(/\s+/).filter(Boolean);

        iniciais.textContent = partes
            .slice(0, 2)
            .map(parte => parte[0].toUpperCase())
            .join("") || "LM";
    }

    if (fotoSalva) {
        avatar.style.backgroundImage = `url("${fotoSalva}")`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";
        avatar.style.backgroundRepeat = "no-repeat";
        iniciais.style.display = "none";
    } else {
        avatar.style.backgroundImage = "";
        iniciais.style.display = "";
    }

    const avatarMenu = document.getElementById("avatar-menu-perfil");

    if (avatarMenu) {
        if (fotoSalva) {
            avatarMenu.style.backgroundImage = `url("${fotoSalva}")`;
            avatarMenu.style.backgroundSize = "cover";
            avatarMenu.style.backgroundPosition = "center";
            avatarMenu.style.backgroundRepeat = "no-repeat";
            avatarMenu.textContent = "";
        } else {
            avatarMenu.style.backgroundImage = "";
            avatarMenu.textContent = iniciais.textContent;
        }
    }
}

atualizarPerfilNoMenu();

// =========================================================================
// VERIFICAÇÃO DE ADMIN PARA EXIBIR OPÇÃO NO MENU DE PERFIL DA HOME (CORRIGIDA)
// =========================================================================
async function verificarVisibilidadeAdminHome() {
    const token = obterToken();
    const linkAdmin = document.getElementById("link-painel-admin");

    if (!token || !linkAdmin) return;

    try {
        const resposta = await fetch(`${API_BASE_URL}/auth/verificar-admin`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        // Se for 403 (Forbidden), é um usuário comum: oculta o painel silenciosamente
        if (resposta.status === 403 || !resposta.ok) {
            linkAdmin.style.display = "none";
            return;
        }

        linkAdmin.style.display = "flex"; // Revela apenas se for admin autorizado
    } catch (e) {
        if (linkAdmin) linkAdmin.style.display = "none";
    }
}

verificarVisibilidadeAdminHome();

/* ===== ALTERNAR TEMA DO LUDARYUM ===== */

const botaoTema = document.getElementById("alternar-tema");
const iconeTema = botaoTema?.querySelector("svg");

function aplicarTema(tema) {
    document.documentElement.setAttribute("data-tema", tema);
    localStorage.setItem("tema-ludaryum", tema);

    if (iconeTema) {
        iconeTema.innerHTML = tema === "claro"
            ? `
                <circle cx="12" cy="12" r="4"></circle>
                <path d="M12 2v2"></path>
                <path d="M12 20v2"></path>
                <path d="m4.93 4.93 1.42 1.42"></path>
                <path d="m17.65 17.65 1.42 1.42"></path>
                <path d="M2 12h2"></path>
                <path d="M20 12h2"></path>
                <path d="m4.93 19.07 1.42-1.42"></path>
                <path d="m17.65 6.35 1.42-1.42"></path>
            `
            : `
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
            `;
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
        botaoNotificacoes &&
        !painelNotificacoes.contains(evento.target) &&
        !botaoNotificacoes.contains(evento.target)
    ) {
        painelNotificacoes.classList.remove("aberto");
    }
});

/* ===== NOTIFICAÇÕES (INTEGRADO À SESSÃO) ===== */

function buscarNotificacoes() {
    const salvas = sessionStorage.getItem("ludaryum-notificacoes");
    return salvas ? JSON.parse(salvas) : [];
}

function mostrarNotificacoes() {
    const notificacoes = buscarNotificacoes();
    const lista = document.getElementById("lista-notificacoes");

    if (!lista) return;

    lista.replaceChildren();

    if (notificacoes.length === 0) {
        const mensagem = document.createElement("p");
        mensagem.className = "notificacoes-vazio";
        mensagem.textContent = "Você ainda não tem notificações.";
        lista.appendChild(mensagem);
        return;
    }

    notificacoes.forEach(function (notificacao) {
        const item = document.createElement("div");
        item.className = "item-notificacao";

        const texto = document.createElement("p");
        texto.textContent = notificacao.mensagem;

        const data = document.createElement("small");
        data.textContent = notificacao.data;

        item.append(texto, data);
        lista.appendChild(item);
    });
}

/* ===== SAIR DA LUDARYUM ===== */

const botaoSair = document.getElementById("desconectar");

if (botaoSair) {
    botaoSair.addEventListener("click", function () {
        // Limpa todos os dados da sessão e localStorage associados ao utilizador
        sessionStorage.clear();
        localStorage.removeItem("ludaryumToken");
        localStorage.removeItem("ludaryumNome");
        localStorage.removeItem("ludaryumFoto");
        localStorage.removeItem("ludaryum-notificacoes");
        localStorage.removeItem("tema-ludaryum");
        
        // Redireciona diretamente para a página de login através do Gateway central
        window.location.href = "/home-ui/login.html";
    });
}

async function verificarPermissaoAdminNaHome() {
    const token = obterToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/verificar-admin`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 403 || !response.ok) {
            return; // Silencia o 403 para usuários comuns
        }

        if (response.ok) {
            const navLinks = document.querySelector('.nav-links') || document.querySelector('nav');
            if (navLinks && !document.getElementById('btn-admin-nav')) {
                const adminLink = document.createElement('a');
                adminLink.id = 'btn-admin-nav';
                adminLink.href = `/admin-ui/admin.html?token=${encodeURIComponent(token)}`;
                adminLink.innerHTML = '🛡️ Painel Admin';
                adminLink.style.cssText = 'color: #f59e0b; font-weight: bold; margin-left: 10px; padding: 6px 12px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; text-decoration: none;';
                navLinks.appendChild(adminLink);
            }
        }
    } catch (e) {
        // Erro ignorado para não afetar o fluxo do usuário comum
    }
}

// Executar ao carregar a página
document.addEventListener('DOMContentLoaded', verificarPermissaoAdminNaHome);