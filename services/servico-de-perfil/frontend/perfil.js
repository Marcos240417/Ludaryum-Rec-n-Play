// ==========================================
// CONFIGURAÇÕES E TEMA
// ==========================================
const API_URL = "http://localhost:8004";

const temaSalvo = localStorage.getItem("ludaryumTemaPerfil") || "escuro";
document.documentElement.setAttribute("data-tema", temaSalvo);

if (temaSalvo === "personalizado") {
    const corSalva = localStorage.getItem("ludaryumCorPersonalizada") || "#ffffff";
    document.documentElement.style.setProperty("--fundo-personalizado", corSalva);
}

const botaoEditar = document.getElementById("botao-editar-perfil");
const formulario = document.getElementById("formulario-edicao");
const campoNome = document.getElementById("campo-nome");
const campoUsuario = document.getElementById("campo-usuario");
const campoLocalizacao = document.getElementById("campo-localizacao");
const campoBadge = document.getElementById("campo-badge");
const campoDescricao = document.getElementById("campo-descricao");

const nomePerfil = document.getElementById("nome-perfil");
const usuarioPerfil = document.getElementById("usuario-perfil");
const localizacaoPerfil = document.getElementById("localizacao-perfil");
const emailPerfil = document.getElementById("email-perfil");
const badgeFuncao = document.getElementById("badge-funcao");
const mensagem = document.getElementById("mensagem-perfil");
const sobreJogador = document.getElementById("sobre-jogador");
const containerLinksSociais = document.getElementById("container-links-sociais");

// FOTO DO PERFIL
const avatarPerfil = document.getElementById("avatar-perfil");
const campoFoto = document.getElementById("campo-foto-perfil");
const botaoFoto = document.getElementById("botao-foto-perfil");
const botaoExcluirFoto = document.getElementById("botao-excluir-foto");

// ==========================================
// COMUNICAÇÃO COM O BACKEND (PORTA 8004)
// ==========================================
function obterHeaders() {
    const token = localStorage.getItem("ludarium_token") || localStorage.getItem("token");
    return {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
    };
}

async function carregarPerfilBackend() {
    try {
        const resposta = await fetch(`${API_URL}/perfil/eu`, {
            method: "GET",
            headers: obterHeaders()
        });

        if (!resposta.ok) throw new Error("Erro ao buscar dados do perfil no servidor.");

        const perfil = await resposta.json();
        renderizarPerfilBackend(perfil);
    } catch (erro) {
        console.warn("Backend FastAPI indisponível na porta 8004 ou utilizador não autenticado. Usando modo local.", erro);
        carregarModoLocalFallback();
    }
}

function renderizarPerfilBackend(perfil) {
    if (nomePerfil) nomePerfil.textContent = perfil.nome || "Novo Membro";
    if (usuarioPerfil) usuarioPerfil.textContent = perfil.arroba || "@utilizador";
    if (emailPerfil) emailPerfil.textContent = perfil.utilizador_email || "";
    if (localizacaoPerfil) localizacaoPerfil.textContent = perfil.localizacao ? `📍 ${perfil.localizacao}` : "";
    if (badgeFuncao) badgeFuncao.textContent = perfil.badge_funcao || "NOVO MEMBRO";
    if (sobreJogador) sobreJogador.textContent = perfil.biografia || "Criatividade, jogos e novas ideias.";

    if (perfil.foto && avatarPerfil) {
        avatarPerfil.style.backgroundImage = `url("${perfil.foto}")`;
        avatarPerfil.style.backgroundSize = "cover";
        avatarPerfil.style.backgroundPosition = "center";
        avatarPerfil.style.backgroundRepeat = "no-repeat";
        avatarPerfil.textContent = "";
    } else {
        atualizarIniciais();
    }

    // Nível, XP e Estatísticas Completas
    const nivelJogador = document.getElementById("nivel-jogador");
    const xpJogador = document.getElementById("xp-jogador");
    const xpProximoNivel = document.getElementById("xp-proximo-nivel");
    const progressoXp = document.getElementById("progresso-xp");
    const totalProjetos = document.getElementById("total-projetos");
    const totalContribuicoes = document.getElementById("total-contribuicoes");
    const totalConquistas = document.getElementById("total-conquistas");
    const seguidoresQtd = document.getElementById("seguidores-qtd");
    const seguindoQtd = document.getElementById("seguindo-qtd");

    if (nivelJogador) nivelJogador.textContent = `NÍVEL ${perfil.nivel || 1}`;
    if (xpJogador) xpJogador.textContent = `${perfil.xp_atual || 0} XP`;
    if (totalProjetos) totalProjetos.textContent = perfil.projetos_qtd || 0;
    if (totalContribuicoes) totalContribuicoes.textContent = perfil.contribuicoes_anuais || 0;
    if (seguidoresQtd) seguidoresQtd.textContent = perfil.seguidores_qtd || 0;
    if (seguindoQtd) seguindoQtd.textContent = perfil.seguindo_qtd || 0;

    if (progressoXp && perfil.xp_proximo_nivel) {
        const pct = Math.min(100, ((perfil.xp_atual || 0) / perfil.xp_proximo_nivel) * 100);
        progressoXp.style.width = `${pct}%`;
    }
    if (xpProximoNivel && perfil.xp_proximo_nivel) {
        const falta = perfil.xp_proximo_nivel - (perfil.xp_atual || 0);
        xpProximoNivel.textContent = `${falta} XP para o próximo nível`;
    }

    // RENDERIZAR LINKS CLICÁVEIS (GitHub, LinkedIn, E-mail)
    if (containerLinksSociais) {
        containerLinksSociais.innerHTML = "";
        if (perfil.links && perfil.links.length > 0) {
            perfil.links.forEach(l => {
                let icone = "🔗";
                let rotuloLower = l.rotulo.toLowerCase();
                if (rotuloLower.includes("git")) icone = "💻";
                else if (rotuloLower.includes("in") || rotuloLower.includes("link")) icone = "💼";
                else if (rotuloLower.includes("mail") || rotuloLower.includes("@")) icone = "✉️";

                let hrefUrl = l.url;
                if (rotuloLower.includes("mail") && !hrefUrl.startsWith("mailto:")) {
                    hrefUrl = `mailto:${l.url}`;
                }

                containerLinksSociais.innerHTML += `
                    <a href="${hrefUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: rgba(147, 51, 234, 0.15); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 20px; color: #c084fc; font-size: 12px; font-weight: 700; text-decoration: none; transition: 0.2s;">
                        ${icone} ${l.rotulo}
                    </a>
                `;
            });
        }
    }

    // Projetos em Destaque e Completo
    const grade = document.getElementById("grade-projetos-perfil");
    const gradeCompleta = document.getElementById("grade-projetos-completa");
    if (perfil.projetos_destaque && perfil.projetos_destaque.length > 0) {
        const htmlProjetos = perfil.projetos_destaque.map(proj => `
            <article class="cartao-projeto">
                <div class="imagem-projeto"><span>🎮</span></div>
                <div class="informacoes-projeto">
                    <span class="categoria-projeto">${proj.status_badge || 'PROJETO'}</span>
                    <h4>${proj.titulo}</h4>
                    <p>Papel: ${proj.papel}</p>
                    <span class="status-projeto">● ${proj.progresso}% Concluído</span>
                </div>
            </article>
        `).join("");

        if (grade) grade.innerHTML = htmlProjetos;
        if (gradeCompleta) gradeCompleta.innerHTML = htmlProjetos;
    }

    // Atividades
    if (perfil.atividades && perfil.atividades.length > 0) {
        const lista = document.getElementById("lista-atividades");
        if (lista) {
            lista.innerHTML = "";
            perfil.atividades.forEach(ativ => {
                lista.innerHTML += `
                    <div class="item-atividade">
                        <div class="icone-atividade">⚡</div>
                        <div class="detalhes-atividade">
                            <h4>Atividade</h4>
                            <p>${ativ.descricao}</p>
                            <span>${ativ.tempo_atras}</span>
                        </div>
                    </div>
                `;
            });
        }
    }

    // Conquistas / Troféus do Banco
    if (perfil.trofeus && perfil.trofeus.length > 0) {
        const gradeTrofeus = document.getElementById("grade-trofeus-container");
        let concluidas = 0;
        if (gradeTrofeus) {
            gradeTrofeus.innerHTML = perfil.trofeus.map(t => {
                if (t.concluido) concluidas++;
                return `
                    <div class="cartao-conquista ${t.concluido ? '' : 'bloqueada'}">
                        <div class="icone-conquista">${t.concluido ? '🏆' : '🔒'}</div>
                        <h4>${t.titulo}</h4>
                        <p>${t.descricao}</p>
                        <span class="raridade ${t.concluido ? 'epica' : 'bloqueada-tag'}">${t.concluido ? 'DESBLOQUEADA' : 'BLOQUEADA'}</span>
                    </div>
                `;
            }).join("");
        }
        if (totalConquistas) totalConquistas.textContent = concluidas;
    }

    // Comunidades
    if (perfil.comunidades && perfil.comunidades.length > 0) {
        const divComunidades = document.getElementById("lista-comunidades-usuario");
        if (divComunidades) {
            divComunidades.innerHTML = "Comunidades: " + perfil.comunidades.map(c => c.nome).join(", ");
        }
    }
}

// ==========================================
// EVENTOS E INTERAÇÕES DA TELA
// ==========================================
if (botaoFoto) {
    botaoFoto.addEventListener("click", function () {
        if (campoFoto) campoFoto.click();
    });
}

if (campoFoto) {
    campoFoto.addEventListener("change", function () {
        const arquivo = campoFoto.files[0];
        if (!arquivo) return;

        if (!arquivo.type.startsWith("image/")) {
            alert("Selecione um arquivo de imagem válido.");
            return;
        }

        const leitor = new FileReader();
        leitor.onload = async function () {
            const fotoBase64 = leitor.result;

            if (avatarPerfil) {
                avatarPerfil.style.backgroundImage = `url("${fotoBase64}")`;
                avatarPerfil.style.backgroundSize = "cover";
                avatarPerfil.style.backgroundPosition = "center";
                avatarPerfil.style.backgroundRepeat = "no-repeat";
                avatarPerfil.textContent = "";
            }

            try {
                await fetch(`${API_URL}/perfil/eu`, {
                    method: "PUT",
                    headers: obterHeaders(),
                    body: JSON.stringify({ foto: fotoBase64 })
                });
            } catch (e) {
                console.warn("Não foi possível salvar a foto no servidor, mantendo local.");
            }

            localStorage.setItem("ludaryumFoto", fotoBase64);
            registrarAtividade("Foto de perfil atualizada", "Você alterou sua foto de perfil.", "📸");
        };
        leitor.readAsDataURL(arquivo);
    });
}

function atualizarIniciais() {
    if (!nomePerfil || !avatarPerfil) return;
    const nome = nomePerfil.textContent.trim();
    const iniciais = nome
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(palavra => palavra[0].toUpperCase())
        .join("");

    avatarPerfil.textContent = iniciais || "LM";
}

const descricaoPerfil = document.createElement("p");
descricaoPerfil.className = "descricao-perfil";
if (nomePerfil && nomePerfil.parentElement) {
    nomePerfil.parentElement.appendChild(descricaoPerfil);
}

if (botaoEditar) {
    botaoEditar.addEventListener("click", function () {
        if (campoNome && nomePerfil) campoNome.value = nomePerfil.textContent;
        if (campoUsuario && usuarioPerfil) campoUsuario.value = usuarioPerfil.textContent.replace("@", "");
        if (campoLocalizacao && localizacaoPerfil) campoLocalizacao.value = localizacaoPerfil.textContent.replace("📍 ", "");
        if (campoBadge && badgeFuncao) campoBadge.value = badgeFuncao.textContent;
        if (campoDescricao && sobreJogador) campoDescricao.value = sobreJogador.textContent;

        if (mensagem) mensagem.textContent = "";
        if (formulario) {
            formulario.hidden = false;
            formulario.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    });
}

const botaoSalvar = document.getElementById("botao-salvar");
if (botaoSalvar) {
    botaoSalvar.addEventListener("click", async function () {
        const nome = campoNome.value.trim();
        const usuario = campoUsuario.value.trim().replace(/^@+/, "");
        const localizacao = campoLocalizacao ? campoLocalizacao.value.trim() : "";
        const badge_funcao = campoBadge ? campoBadge.value.trim() : "";
        const descricao = campoDescricao.value.trim();

        // Coletar links do formulário dinâmico
        const links = [];
        document.querySelectorAll(".linha-link-input").forEach(linha => {
            const rotulo = linha.querySelector(".link-rotulo").value.trim();
            const url = linha.querySelector(".link-url").value.trim();
            if (rotulo && url) {
                links.push({ rotulo, url });
            }
        });

        if (!nome || !usuario) {
            if (mensagem) mensagem.textContent = "Preencha o nome e o nome de usuário.";
            return;
        }

        try {
            const resposta = await fetch(`${API_URL}/perfil/eu`, {
                method: "PUT",
                headers: obterHeaders(),
                body: JSON.stringify({
                    nome: nome,
                    arroba: `@${usuario}`,
                    localizacao: localizacao,
                    badge_funcao: badge_funcao,
                    biografia: descricao,
                    links: links
                })
            });

            if (!resposta.ok) throw new Error("Erro ao salvar no servidor.");

            const atualizado = await resposta.json();
            renderizarPerfilBackend(atualizado);

            if (mensagem) mensagem.textContent = "Perfil atualizado com sucesso!";
            if (formulario) formulario.hidden = true;
        } catch (erro) {
            console.warn("Salvando localmente devido a falha no backend:", erro);
            if (nomePerfil) nomePerfil.textContent = nome;
            if (usuarioPerfil) usuarioPerfil.textContent = "@" + usuario;
            if (localizacaoPerfil) localizacaoPerfil.textContent = localizacao ? `📍 ${localizacao}` : "";
            if (badgeFuncao) badgeFuncao.textContent = badge_funcao;
            if (sobreJogador) sobreJogador.textContent = descricao || "Criatividade, jogos e novas ideias.";
            
            localStorage.setItem("ludaryumNome", nome);
            localStorage.setItem("ludaryumUsuario", usuario);
            localStorage.setItem("ludaryumDescricao", descricao);

            if (mensagem) mensagem.textContent = "Perfil atualizado localmente!";
            if (formulario) formulario.hidden = true;
        }
    });
}

const botaoCancelar = document.getElementById("botao-cancelar");
if (botaoCancelar) {
    botaoCancelar.addEventListener("click", function () {
        if (formulario) formulario.hidden = true;
        if (mensagem) mensagem.textContent = "";
    });
}

// Adicionar mais campos de link no formulário
const botaoAdicionarLinkInput = document.getElementById("botao-adicionar-link-input");
if (botaoAdicionarLinkInput) {
    botaoAdicionarLinkInput.addEventListener("click", () => {
        const container = document.getElementById("container-inputs-links");
        if (container) {
            const novaLinha = document.createElement("div");
            novaLinha.className = "linha-link-input";
            novaLinha.style.cssText = "display: flex; gap: 10px; margin-bottom: 10px;";
            novaLinha.innerHTML = `
                <input type="text" placeholder="Rótulo (ex: GitHub)" class="link-rotulo" style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #a83bd1; background: #100a16; color: #faf7fc;">
                <input type="text" placeholder="URL ou mailto:..." class="link-url" style="flex: 2; padding: 10px; border-radius: 8px; border: 1px solid #a83bd1; background: #100a16; color: #faf7fc;">
            `;
            container.appendChild(novaLinha);
        }
    });
}

if (botaoExcluirFoto) {
    botaoExcluirFoto.addEventListener("click", async function () {
        localStorage.removeItem("ludaryumFoto");
        if (avatarPerfil) {
            avatarPerfil.style.backgroundImage = "";
            avatarPerfil.textContent = "";
        }
        if (campoFoto) campoFoto.value = "";
        atualizarIniciais();

        try {
            await fetch(`${API_URL}/perfil/eu`, {
                method: "PUT",
                headers: obterHeaders(),
                body: JSON.stringify({ foto: "" })
            });
        } catch (e) {}
    });
}

// Navegação entre as abas
const botoesAbas = document.querySelectorAll(".aba-perfil");
const conteudosAbas = document.querySelectorAll(".conteudo-aba");

botoesAbas.forEach(function (botao) {
    botao.addEventListener("click", function () {
        const abaSelecionada = botao.dataset.aba;

        botoesAbas.forEach(aba => aba.classList.remove("ativa"));
        conteudosAbas.forEach(conteudo => conteudo.classList.remove("ativa"));

        botao.classList.add("ativa");
        const conteudoSelecionado = document.getElementById(abaSelecionada);
        if (conteudoSelecionado) conteudoSelecionado.classList.add("ativa");
    });
});

// ==========================================
// FALLBACK / MODO LOCAL (CASO O BACKEND NÃO RESPONDA)
// ==========================================
function carregarModoLocalFallback() {
    const nomeSalvo = localStorage.getItem("ludaryumNome");
    const usuarioSalvo = localStorage.getItem("ludaryumUsuario");
    const descricaoSalva = localStorage.getItem("ludaryumDescricao");

    if (nomeSalvo && nomePerfil) nomePerfil.textContent = nomeSalvo;
    if (usuarioSalvo && usuarioPerfil) usuarioPerfil.textContent = "@" + usuarioSalvo;
    if (descricaoSalva && sobreJogador) sobreJogador.textContent = descricaoSalva;

    const fotoSalva = localStorage.getItem("ludaryumFoto");
    if (fotoSalva && avatarPerfil) {
        avatarPerfil.style.backgroundImage = `url("${fotoSalva}")`;
        avatarPerfil.style.backgroundSize = "cover";
        avatarPerfil.style.backgroundPosition = "center";
        avatarPerfil.textContent = "";
    } else {
        atualizarIniciais();
    }
}

function registrarAtividade(titulo, descricao, icone) {
    let atividades = [];
    try {
        atividades = JSON.parse(localStorage.getItem("ludaryum-atividades")) || [];
    } catch (e) {
        atividades = [];
    }
    atividades.unshift({ titulo, descricao, icone, data: new Date().toLocaleString("pt-BR") });
    localStorage.setItem("ludaryum-atividades", JSON.stringify(atividades));
}

// Inicialização
carregarPerfilBackend();