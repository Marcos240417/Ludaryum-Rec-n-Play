const API_URL = "http://localhost:8004";

const tema = document.getElementById("tema-plataforma");
const seletorCorContainer = document.getElementById("seletor-cor-container");
const corPersonalizada = document.getElementById("cor-personalizada");
const notificacoesComunidade = document.getElementById("notificacoes-comunidade");
const notificacoesProjetos = document.getElementById("notificacoes-projetos");
const botaoSalvar = document.getElementById("salvar-configuracoes");
const botaoAlterarSenha = document.getElementById("botao-alterar-senha");
const senhaAtualInput = document.getElementById("senha-atual");
const novaSenhaInput = document.getElementById("nova-senha");
const mensagem = document.getElementById("mensagem-configuracoes");

function obterHeaders() {
    const token = localStorage.getItem("ludarium_token") || localStorage.getItem("token") || sessionStorage.getItem("ludaryumToken");
    return {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
    };
}

async function carregarConfiguracoesBackend() {
    try {
        const resposta = await fetch(`${API_URL}/configuracoes/eu`, {
            method: "GET",
            headers: obterHeaders()
        });

        if (!resposta.ok) throw new Error("Erro ao carregar configurações do servidor.");

        const config = await resposta.json();
        aplicarConfiguracoesNaTela(config);
    } catch (erro) {
        console.warn("Backend FastAPI indisponível na porta 8004. Usando armazenamento local.", erro);
        carregarModoLocalFallback();
    }
}

function aplicarConfiguracoesNaTela(config) {
    if (tema && config.tema) {
        tema.value = config.tema;
        aplicarTema(config.tema);
    }

    if (corPersonalizada && config.cor_personalizada) {
        corPersonalizada.value = config.cor_personalizada;
        if (config.tema === "personalizado") {
            document.documentElement.style.setProperty("--fundo-personalizado", config.cor_personalizada);
        }
    }

    if (notificacoesComunidade) notificacoesComunidade.checked = config.notificacoes_comunidade;
    if (notificacoesProjetos) notificacoesProjetos.checked = config.notificacoes_projetos;

    atualizarSeletorCor();
}

function aplicarTema(temaEscolhido) {
    document.documentElement.setAttribute("data-tema", temaEscolhido);

    if (temaEscolhido === "personalizado") {
        const corAtual = (corPersonalizada ? corPersonalizada.value : null) || "#a83bd1";
        document.documentElement.style.setProperty("--fundo-personalizado", corAtual);
    } else {
        document.documentElement.style.removeProperty("--fundo-personalizado");
    }
}

function atualizarSeletorCor() {
    if (seletorCorContainer && tema) {
        seletorCorContainer.style.display = tema.value === "personalizado" ? "block" : "none";
    }
}

if (tema) {
    tema.addEventListener("change", function () {
        aplicarTema(tema.value);
        atualizarSeletorCor();
    });
}

if (corPersonalizada) {
    corPersonalizada.addEventListener("input", function () {
        document.documentElement.style.setProperty("--fundo-personalizado", corPersonalizada.value);
    });
}

if (botaoSalvar) {
    botaoSalvar.addEventListener("click", async function () {
        const payload = {
            tema: tema ? tema.value : "escuro",
            cor_personalizada: corPersonalizada ? corPersonalizada.value : "#ffffff",
            notificacoes_comunidade: notificacoesComunidade ? notificacoesComunidade.checked : true,
            notificacoes_projetos: notificacoesProjetos ? notificacoesProjetos.checked : true,
            notificacoes_email: true,
            notificacoes_push: true,
            perfil_publico: true,
            mostrar_email: false
        };

        try {
            const resposta = await fetch(`${API_URL}/configuracoes/eu`, {
                method: "PUT",
                headers: obterHeaders(),
                body: JSON.stringify(payload)
            });

            if (!resposta.ok) throw new Error("Erro ao salvar no servidor.");

            if (mensagem) mensagem.textContent = "Configurações salvas com sucesso no servidor!";
        } catch (erro) {
            console.warn("Salvando localmente devido a falha no backend:", erro);
            localStorage.setItem("ludaryumTemaPerfil", payload.tema);
            localStorage.setItem("ludaryumCorPersonalizada", payload.cor_personalizada);
            if (mensagem) mensagem.textContent = "Configurações salvas localmente!";
        }
    });
}

if (botaoAlterarSenha) {
    botaoAlterarSenha.addEventListener("click", async function () {
        const senha_atual = senhaAtualInput ? senhaAtualInput.value : "";
        const nova_senha = novaSenhaInput ? novaSenhaInput.value : "";

        if (!senha_atual || !nova_senha) {
            if (mensagem) mensagem.textContent = "Preencha a senha atual e a nova senha.";
            return;
        }

        try {
            const resposta = await fetch(`${API_URL}/configuracoes/alterar-senha`, {
                method: "POST",
                headers: obterHeaders(),
                body: JSON.stringify({ senha_atual, nova_senha })
            });

            const resultado = await resposta.json();
            if (!resposta.ok) throw new Error(resultado.detail || "Erro ao alterar senha.");

            if (mensagem) mensagem.textContent = "Senha alterada com sucesso!";
            if (senhaAtualInput) senhaAtualInput.value = "";
            if (novaSenhaInput) novaSenhaInput.value = "";
        } catch (erro) {
            if (mensagem) mensagem.textContent = erro.message || "Erro ao comunicar com o servidor.";
        }
    });
}

function carregarModoLocalFallback() {
    const temaSalvo = localStorage.getItem("ludaryumTemaPerfil") || "escuro";
    const corSalva = localStorage.getItem("ludaryumCorPersonalizada") || "#ffffff";
    if (tema) {
        tema.value = temaSalvo;
        aplicarTema(temaSalvo);
    }
    if (corPersonalizada) corPersonalizada.value = corSalva;
    atualizarSeletorCor();
}

// Verificação de Admin para exibir o cartão de administração na página de configurações
async function verificarAdminNaConfig() {
    try {
        const resposta = await fetch(`${API_URL}/auth/verificar-admin`, {
            method: "GET",
            headers: obterHeaders()
        });

        const cartaoAdmin = document.getElementById("secao-painel-admin");
        if (resposta.ok && cartaoAdmin) {
            cartaoAdmin.style.display = "block";
        }
    } catch (e) {
        // Mantém oculto para utilizadores comuns
    }
}

// Inicializar carregamentos
carregarConfiguracoesBackend();
verificarAdminNaConfig();