// ================= CONFIGURAÇÃO DE ROTA AUTOMÁTICA (LOCAL PORTA 8003 & CLOUDFLARE) =================
const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8003" 
    : `${window.location.protocol}//${window.location.host}`;

// Obter token JWT armazenado na sessão (isolado por aba para múltiplos logins)
function obterToken() {
    return sessionStorage.getItem("ludaryumToken") || localStorage.getItem("ludaryumToken") || "";
}

// ===== ATUALIZAÇÃO DO PERFIL NO MENU =====

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

// ===== PAINEL DE NOTIFICAÇÕES (INTEGRADO AO BANCO VIA API) =====

const botaoNotificacoes = document.getElementById("abrir-notificacoes");
const painelNotificacoes = document.getElementById("painel-notificacoes");
const fecharNotificacoes = document.getElementById("fechar-notificacoes");
const listaNotificacoes = document.getElementById("lista-notificacoes");

async function buscarNotificacoesAPI() {
    try {
        const resposta = await fetch(`${API_BASE_URL}/notifications`, {
            headers: { "Authorization": `Bearer ${obterToken()}` }
        });
        if (!resposta.ok) return [];
        return await resposta.json();
    } catch (erro) {
        console.error("Erro ao carregar notificações do servidor:", erro);
        return [];
    }
}

async function mostrarNotificacoes() {
    if (!listaNotificacoes) return;

    const notificacoes = await buscarNotificacoesAPI();

    listaNotificacoes.replaceChildren();

    if (notificacoes.length === 0) {
        const mensagem = document.createElement("p");
        mensagem.className = "notificacoes-vazio";
        mensagem.textContent = "Você ainda não tem notificações.";
        listaNotificacoes.appendChild(mensagem);
        return;
    }

    notificacoes.forEach(function (notificacao) {
        const item = document.createElement("div");
        item.className = "item-notificacao";

        const icone = document.createElement("div");
        icone.className = "icone-notificacao";
        icone.textContent = "✦";

        const conteudo = document.createElement("div");
        conteudo.className = "conteudo-notificacao";

        const texto = document.createElement("p");
        texto.textContent = notificacao.conteudo || notificacao.mensagem;

        const data = document.createElement("small");
        data.textContent = notificacao.created_at ? new Date(notificacao.created_at).toLocaleString("pt-BR") : (notificacao.data || "");

        conteudo.append(texto, data);
        item.append(icone, conteudo);

        listaNotificacoes.appendChild(item);
    });
}

if (botaoNotificacoes && painelNotificacoes) {
    botaoNotificacoes.addEventListener("click", function () {
        const estaFechado =
            getComputedStyle(painelNotificacoes).display === "none";

        painelNotificacoes.style.display = estaFechado ? "block" : "none";

        if (estaFechado) {
            mostrarNotificacoes();
        }
    });

    if (fecharNotificacoes) {
        fecharNotificacoes.addEventListener("click", function () {
            painelNotificacoes.style.display = "none";
        });
    }

    document.addEventListener("click", function (evento) {
        if (
            !painelNotificacoes.contains(evento.target) &&
            !botaoNotificacoes.contains(evento.target)
        ) {
            painelNotificacoes.style.display = "none";
        }
    });
}

// ===== MENU DO PERFIL =====

const botaoPerfil = document.getElementById("botao-perfil");
const menuPerfil = document.getElementById("menu-perfil");

if (botaoPerfil && menuPerfil) {
    const perfilContainer = botaoPerfil.closest(".perfil-container");

    if (perfilContainer) {
        perfilContainer.addEventListener("mouseenter", function () {
            menuPerfil.hidden = false;
        });

        perfilContainer.addEventListener("mouseleave", function () {
            menuPerfil.hidden = true;
        });
    }
}

// ===== ALTERNAR TEMA =====

const botaoTema = document.getElementById("alternar-tema");
const iconeTema = document.getElementById("icone-tema");

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

// Recupera o tema salvo
const temaSalvo = localStorage.getItem("tema-ludaryum") || "escuro";
aplicarTema(temaSalvo);

// Alterna o tema ao clicar
if (botaoTema) {
    botaoTema.addEventListener("click", function () {
        const temaAtual = document.documentElement.getAttribute("data-tema");

        aplicarTema(temaAtual === "claro" ? "escuro" : "claro");
    });
}

// BUSCA E FILTROS DE CAMPANHAS
const filterButtons = document.querySelectorAll(".filter-button");
const campaignItems = document.querySelectorAll(".campaign-item");
const emptyCampaignMessage = document.querySelector("#empty-campaign-message");

const campoBuscaCampanhas = document.getElementById("buscar-campanhas");

let categoriaSelecionada = "todos";

function normalizarTexto(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function atualizarCampanhas() {
    const pesquisa = normalizarTexto(campoBuscaCampanhas?.value || "");

    campaignItems.forEach(function (campanha) {
        const categoria = campanha.dataset.category;
        const texto = normalizarTexto(campanha.textContent);

        const correspondeCategoria =
            categoriaSelecionada === "todos" ||
            categoria === categoriaSelecionada;

        const correspondePesquisa = texto.includes(pesquisa);

        campanha.style.display =
            correspondeCategoria && correspondePesquisa ? "" : "none";
    });

    const campanhasVisiveis = Array.from(campaignItems).filter(
        campanha => campanha.style.display !== "none"
    );

    if (emptyCampaignMessage) {
        emptyCampaignMessage.hidden = campanhasVisiveis.length > 0;
    }
}

// CLIQUE NOS FILTROS
filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
        categoriaSelecionada = button.dataset.category;

        filterButtons.forEach(item => item.classList.remove("active"));
        button.classList.add("active");

        atualizarCampanhas();
    });
});

// CAMPO DE PESQUISA
if (campoBuscaCampanhas) {
    campoBuscaCampanhas.addEventListener("input", atualizarCampanhas);
}

// EXIBIÇÃO INICIAL
atualizarCampanhas();

// ===== PROGRESSO DOS OBJETIVOS POR CAMPANHA (INTEGRADO AO BANCO DE DADOS) =====

const objectiveCounter = document.querySelector(".details-heading > strong");
const objectiveProgress = document.querySelector(".details-progress-fill");
const achievementProgress = document.querySelector(".achievement-progress-fill");
const achievementCounter = document.querySelector(".achievement-info small");
const objectivesList = document.querySelector(".objectives-list");

function getCurrentCampaignId() {
    return document.querySelector(".campaign-details")?.dataset.campaignDetails || "solarpunk";
}

function updateObjectiveProgress() {
    const checkboxes = document.querySelectorAll(
        '.objectives-list input[type="checkbox"]'
    );

    const completed = Array.from(checkboxes).filter(
        (checkbox) => checkbox.checked
    ).length;

    const total = checkboxes.length;
    const percentage = total > 0 ? (completed / total) * 100 : 0;

    if (objectiveCounter) {
        objectiveCounter.textContent = `${completed} de ${total} concluídos`;
    }

    if (objectiveProgress) {
        objectiveProgress.style.width = `${percentage}%`;
    }

    if (achievementProgress) {
        achievementProgress.style.width = `${percentage}%`;
    }

    if (achievementCounter) {
        achievementCounter.textContent = `${completed} de ${total} objetivos concluídos`;
    }
}

async function loadCampaignObjectives(campaignId) {
    if (!objectivesList) return;

    try {
        const resposta = await fetch(`${API_BASE_URL}/campanhas/${campaignId}/objetivos`, {
            headers: { "Authorization": `Bearer ${obterToken()}` }
        });
        
        if (!resposta.ok) return;
        const objetivos = await resposta.json();

        objectivesList.innerHTML = objetivos
            .map((obj) => `
                <label>
                    <input type="checkbox" data-id="${obj.id}" ${obj.concluido ? "checked" : ""}>
                    ${obj.titulo}
                </label>
            `)
            .join("");

        objectivesList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
            checkbox.addEventListener("change", async (e) => {
                const objetivoId = e.target.dataset.id;
                try {
                    await fetch(`${API_BASE_URL}/objetivos/${objetivoId}/concluir`, {
                        method: "PATCH",
                        headers: { "Authorization": `Bearer ${obterToken()}` }
                    });
                    updateObjectiveProgress();
                } catch (erro) {
                    console.error("Erro ao atualizar objetivo no banco:", erro);
                }
            });
        });

        updateObjectiveProgress();
    } catch (erro) {
        console.error("Erro ao carregar objetivos do servidor:", erro);
    }
}

// NOTIFICAÇÃO PERSONALIZADA DE CONEXÕES
const findConnectionsButton = document.querySelector("#find-connections");
const connectionToast = document.querySelector("#connection-toast");
const closeConnectionToast = document.querySelector("#close-connection-toast");

if (findConnectionsButton && connectionToast) {
    findConnectionsButton.addEventListener("click", () => {
        connectionToast.style.display = "flex";
    });
}

if (closeConnectionToast && connectionToast) {
    closeConnectionToast.addEventListener("click", () => {
        connectionToast.style.display = "none";
    });
}

const viewMaterialsButton = document.querySelector("#view-materials");
const materialsToast = document.querySelector("#materials-toast");
const closeMaterialsToast = document.querySelector("#close-materials-toast");

if (viewMaterialsButton && materialsToast) {
    viewMaterialsButton.addEventListener("click", () => {
        materialsToast.style.display = "flex";
    });
}

if (closeMaterialsToast && materialsToast) {
    closeMaterialsToast.addEventListener("click", () => {
        materialsToast.style.display = "none";
    });
}

// ===== SELEÇÃO DE CAMPANHAS =====

const campaignCards = document.querySelectorAll(".campaign-item");
const campaignDetails = document.querySelector(".campaign-details");

const campaignData = {
    solarpunk: {
        title: "Horizontes Solarpunk",
        description: "Construa um futuro onde natureza, tecnologia e criatividade caminham juntas.",
        deadline: "14 DIAS RESTANTES"
    },
    acessibilidade: {
        title: "Acessibilidade em primeiro lugar",
        description: "Crie experiências de jogos acessíveis e inclusivas para todos.",
        deadline: "7 DIAS RESTANTES"
    },
    npcs: {
        title: "NPCs que parecem vivos",
        description: "Desenvolva personagens inteligentes, com comportamentos e diálogos envolventes.",
        deadline: "3 SEMANAS RESTANTES"
    }
};

campaignCards.forEach((card) => {
    card.addEventListener("click", () => {
        const selectedCampaign = campaignData[card.dataset.campaign];

        if (!selectedCampaign || !campaignDetails) return;

        campaignDetails.querySelector(".details-banner h2").textContent =
            selectedCampaign.title;

        campaignDetails.querySelector(".details-banner p").textContent =
            selectedCampaign.description;

        campaignDetails.querySelector(".details-deadline").textContent =
            selectedCampaign.deadline;

        campaignDetails.dataset.campaignDetails = card.dataset.campaign;
        loadCampaignObjectives(card.dataset.campaign);
        updateJoinCampaignButton();

        campaignCards.forEach((item) => item.classList.remove("active"));
        card.classList.add("active");
    });
});

loadCampaignObjectives(getCurrentCampaignId());

// ===== PARTICIPAÇÃO NAS CAMPANHAS (INTEGRADO AO BANCO) =====

const joinCampaignButton = document.getElementById("join-campaign");

async function updateJoinCampaignButton() {
    if (!joinCampaignButton) return;

    const campaignId = getCurrentCampaignId();
    try {
        const resposta = await fetch(`${API_BASE_URL}/campanhas/${campaignId}/participando`, {
            headers: { "Authorization": `Bearer ${obterToken()}` }
        });

        if (resposta.ok) {
            const dados = await resposta.json();
            joinCampaignButton.textContent = dados.participando
                ? "VOCÊ ESTÁ PARTICIPANDO"
                : "PARTICIPAR DA CAMPANHA";

            joinCampaignButton.classList.toggle(
                "participating",
                dados.participando
            );
        }
    } catch (erro) {
        console.error("Erro ao verificar status de participação:", erro);
    }
}

// EVENTO DE CLIQUE
if (joinCampaignButton) {
    joinCampaignButton.addEventListener("click", async function () {
        const campaignId = getCurrentCampaignId();

        try {
            const resposta = await fetch(`${API_BASE_URL}/campanhas/${campaignId}/participar`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${obterToken()}` }
            });

            if (resposta.ok) {
                updateJoinCampaignButton();
                const campaignToast = document.getElementById("campaign-toast");

                if (campaignToast) {
                    campaignToast.style.display = "flex";

                    setTimeout(() => {
                        campaignToast.style.display = "none";
                    }, 3500);
                }
            }
        } catch (erro) {
            console.error("Erro ao participar da campanha:", erro);
        }
    });
}

// ATUALIZA O BOTÃO AO ABRIR A PÁGINA
updateJoinCampaignButton();

/* ===== SAIR DA LUDARYUM ===== */

const botaoSair = document.getElementById("desconectar");

if (botaoSair) {
    botaoSair.addEventListener("click", function () {
        // Limpa todos os dados de sessão e localStorage associados ao utilizador
        sessionStorage.clear();
        localStorage.removeItem("ludaryumToken");
        localStorage.removeItem("ludaryumNome");
        localStorage.removeItem("ludaryumFoto");
        localStorage.removeItem("tema-ludaryum");
        
        // Redireciona diretamente para a página de login através do Gateway central
        window.location.href = "/home-ui/login.html";
    });
}